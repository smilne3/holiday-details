// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import {
  addPersonAction,
  createHouseholdAction,
  deletePersonAction,
  renameHouseholdAction,
  replaceLinkAction,
  updatePersonAction,
} from '@/app/organizer/actions'
import type { Family } from '@/db/dev-family'
import { copy } from '@/lib/copy'
import type { Db } from '@/lib/db/types'
import { itemRow, testDb } from '@/tests/helpers/db'

// The actions run against the made-up family in PGlite. The cookie holds whichever token the test
// sets, and refresh() is a spy: it can only run inside a real Server Action request.
const dbRef = vi.hoisted(() => ({ db: undefined as Db | undefined }))
const cookie = vi.hoisted(() => ({ token: undefined as string | undefined }))
const refresh = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ getDb: async () => dbRef.db }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'hd_person' && cookie.token ? { name, value: cookie.token } : undefined),
  }),
}))
vi.mock('next/cache', () => ({ refresh }))

let t: Awaited<ReturnType<typeof testDb>>
let f: Family

beforeAll(async () => {
  t = await testDb()
  dbRef.db = t.db
})
beforeEach(async () => {
  f = await t.reset()
  cookie.token = undefined
  refresh.mockClear()
})
afterAll(() => t.close())

const as = (token: string | undefined) => {
  cookie.token = token
}

function form(fields: Record<string, string | Blob>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

async function snapshot() {
  return {
    households: await t.db.query('select id, name from households order by id'),
    people: await t.db.query('select id, household_id, name, kind, token from people order by id'),
  }
}

const personNamed = async (name: string) =>
  (
    await t.db.query<{ id: string; household_id: string; kind: string; token: string | null }>(
      'select id, household_id, kind, token from people where name = $1',
      [name],
    )
  )[0]

// Every organizer action, called as a forged request would: with real ids and real-looking forms.
function everyAction() {
  const { benMaya } = f.households
  return [
    createHouseholdAction(null, form({ name: 'Aunt Jo' })),
    renameHouseholdAction(benMaya, null, form({ name: 'The Smiths' })),
    addPersonAction(benMaya, null, form({ name: 'Zed', kind: 'adult' })),
    updatePersonAction(f.leo.id, null, form({ name: 'Leonard', householdId: benMaya })),
    deletePersonAction(f.ivy.id),
    replaceLinkAction(f.priya.id),
  ]
}

it('every action refuses a signed-out request, writes nothing, and refreshes nothing', async () => {
  const before = await snapshot()
  const signedOut = { ok: false, error: copy.notSignedIn('Maya') }
  for (const token of [undefined, 'not-a-real-token']) {
    as(token)
    for (const result of await Promise.all(everyAction())) expect(result).toEqual(signedOut)
  }
  expect(await snapshot()).toEqual(before)
  expect(refresh).not.toHaveBeenCalled()
})

it('every action refuses Ben, who is signed in but not the organizer', async () => {
  const before = await snapshot()
  as('dev-ben')
  for (const result of await Promise.all(everyAction())) expect(result).toEqual({ ok: false, error: copy.notAllowed })
  expect(await snapshot()).toEqual(before)
  expect(refresh).not.toHaveBeenCalled()
})

it('Maya sets up a household with an adult and a kid, and each write refreshes the page', async () => {
  as('dev-maya')
  expect(await createHouseholdAction(null, form({ name: 'Aunt Jo' }))).toEqual({ ok: true })
  const [{ id: jo }] = await t.db.query<{ id: string }>("select id from households where name = 'Aunt Jo'")
  expect(await renameHouseholdAction(jo, null, form({ name: 'Aunt Jo & Uncle Tom' }))).toEqual({ ok: true })
  expect(await addPersonAction(jo, null, form({ name: 'Jo', kind: 'adult' }))).toEqual({ ok: true })
  expect(await addPersonAction(jo, null, form({ name: 'Pip', kind: 'kid' }))).toEqual({ ok: true })
  expect(refresh).toHaveBeenCalledTimes(4)

  expect(await personNamed('Jo')).toMatchObject({ household_id: jo, kind: 'adult' })
  expect((await personNamed('Jo')).token).toMatch(/^[0-9a-f]{64}$/)
  expect(await personNamed('Pip')).toMatchObject({ household_id: jo, kind: 'kid', token: null })

  const pip = (await personNamed('Pip')).id
  expect(await updatePersonAction(pip, null, form({ name: 'Pippa', householdId: f.households.benMaya }))).toEqual({
    ok: true,
  })
  expect(await personNamed('Pippa')).toMatchObject({ household_id: f.households.benMaya })
  expect(await deletePersonAction(pip)).toEqual({ ok: true })
  expect(await personNamed('Pippa')).toBeUndefined()
  expect(refresh).toHaveBeenCalledTimes(6)
})

it("replaceLinkAction gives Ben a new link, and the old one stops working", async () => {
  as('dev-maya')
  expect(await replaceLinkAction(f.ben.id)).toEqual({ ok: true })
  expect(refresh).toHaveBeenCalledOnce()
  const { token } = await personNamed('Ben')
  expect(token).toMatch(/^[0-9a-f]{64}$/)

  // The old link now signs no one in, so it can't write anything either.
  as('dev-ben')
  expect(await createHouseholdAction(null, form({ name: 'Aunt Jo' }))).toEqual({
    ok: false,
    error: copy.notSignedIn('Maya'),
  })
})

it('a refused write says why and refreshes nothing', async () => {
  as('dev-maya')
  await itemRow(t.db, f.ben.id, 'Hiking socks')
  expect(await deletePersonAction(f.ben.id)).toEqual({ ok: false, error: copy.cantDelete })
  expect(await createHouseholdAction(null, form({ name: '   ' }))).toEqual({ ok: false, error: copy.nameRequired })
  expect(await replaceLinkAction(f.leo.id)).toEqual({ ok: false, error: copy.notAllowed })
  expect(refresh).not.toHaveBeenCalled()
})

it('a forged form with missing fields, a file, or no form at all gets words back, not an error', async () => {
  const before = await snapshot()
  as('dev-maya')
  const nameRequired = { ok: false, error: copy.nameRequired }
  const { benMaya } = f.households
  expect(await createHouseholdAction(null, new FormData())).toEqual(nameRequired)
  expect(await createHouseholdAction(null, form({ name: new Blob(['Aunt Jo']) }))).toEqual(nameRequired)
  expect(await createHouseholdAction(null, undefined as unknown as FormData)).toEqual(nameRequired)
  expect(await renameHouseholdAction(benMaya, null, 'name=x' as unknown as FormData)).toEqual(nameRequired)
  expect(await addPersonAction(benMaya, null, form({ kind: 'adult' }))).toEqual(nameRequired)
  // A name with no kind, or no household, is refused rather than guessed.
  expect(await addPersonAction(benMaya, null, form({ name: 'Zed' }))).toEqual({ ok: false, error: copy.notAllowed })
  expect(await updatePersonAction(f.leo.id, null, form({ name: 'Leo' }))).toEqual({ ok: false, error: copy.notAllowed })
  // Ids that aren't strings, as only a forged request could send.
  expect(await deletePersonAction([f.ivy.id] as unknown as string)).toEqual({ ok: false, error: copy.notAllowed })
  expect(await replaceLinkAction({ id: f.ben.id } as unknown as string)).toEqual({ ok: false, error: copy.notAllowed })
  expect(await snapshot()).toEqual(before)
  expect(refresh).not.toHaveBeenCalled()
})
