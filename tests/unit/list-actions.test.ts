// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import {
  addItemAction,
  claimAction,
  removeItemAction,
  unclaimAction,
  updateItemAction,
} from '@/app/list/actions'
import type { Family } from '@/db/dev-family'
import { copy } from '@/lib/copy'
import type { Db } from '@/lib/db/types'
import { claimRow, itemRow, testDb } from '@/tests/helpers/db'

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

const as = (token: string) => {
  cookie.token = token
}

function form(fields: Record<string, string | Blob>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

const itemNames = async (ownerId: string) =>
  (
    await t.db.query<{ name: string }>(
      'select name from items where owner_id = $1 and removed_at is null order by created_at, id',
      [ownerId],
    )
  ).map(r => r.name)

const buyerOf = async (itemId: string) =>
  (await t.db.query<{ buyer_id: string }>('select buyer_id from claims where item_id = $1', [itemId]))[0]?.buyer_id

it('every action refuses a signed-out request, writes nothing, and refreshes nothing', async () => {
  const kite = await itemRow(t.db, f.leo.id, 'Kite')
  await claimRow(t.db, kite, f.grandma.id)
  const signedOut = { ok: false, error: copy.notSignedIn('Maya') }

  for (const token of [undefined, 'not-a-real-token']) {
    cookie.token = token
    expect(await claimAction(kite)).toBe('not-allowed')
    // Undo has nothing to answer with, so it fails, rather than seem to have worked.
    await expect(unclaimAction(kite)).rejects.toThrow()
    expect(await addItemAction(f.leo.id, null, form({ name: 'Drum', details: '', link: '' }))).toEqual(signedOut)
    expect(await updateItemAction(kite, null, form({ name: 'Red kite', details: '', link: '' }))).toEqual(signedOut)
    expect(await removeItemAction(kite)).toEqual(signedOut)
  }

  expect(await itemNames(f.leo.id)).toEqual(['Kite'])
  expect(await buyerOf(kite)).toBe(f.grandma.id)
  expect(refresh).not.toHaveBeenCalled()
})

it('claimAction claims as the viewer and refreshes the page', async () => {
  const kite = await itemRow(t.db, f.leo.id, 'Kite')
  as('dev-grandma')
  expect(await claimAction(kite)).toBe('claimed')
  expect(await buyerOf(kite)).toBe(f.grandma.id)
  expect(refresh).toHaveBeenCalledOnce()
})

it("'taken' and 'gone' answer without a refresh, which would take the row's message away", async () => {
  const kite = await itemRow(t.db, f.leo.id, 'Kite')
  await claimRow(t.db, kite, f.priya.id)
  const drum = await itemRow(t.db, f.leo.id, 'Drum')
  await t.db.query('update items set removed_at = now() where id = $1', [drum])
  as('dev-grandma')
  expect(await claimAction(kite)).toBe('taken')
  expect(await claimAction(drum)).toBe('gone')
  expect(await claimAction('not-a-uuid')).toBe('gone')
  expect(await buyerOf(kite)).toBe(f.priya.id)
  expect(refresh).not.toHaveBeenCalled()
})

it("an owner's claim on their own item is refused, and the answer is the same whether or not it's claimed", async () => {
  const feeder = await itemRow(t.db, f.maya.id, 'Bird feeder')
  const gloves = await itemRow(t.db, f.maya.id, 'Gloves')
  await claimRow(t.db, gloves, f.ben.id)
  as('dev-maya')
  expect(await claimAction(feeder)).toBe('not-allowed')
  expect(await claimAction(gloves)).toBe('not-allowed')
  expect(await buyerOf(feeder)).toBeUndefined()
  expect(await buyerOf(gloves)).toBe(f.ben.id)
})

it("unclaimAction undoes the viewer's own claim, and only theirs", async () => {
  const kite = await itemRow(t.db, f.leo.id, 'Kite')
  const drum = await itemRow(t.db, f.leo.id, 'Drum')
  await claimRow(t.db, kite, f.grandma.id)
  await claimRow(t.db, drum, f.priya.id)
  as('dev-grandma')
  await unclaimAction(kite)
  await unclaimAction(drum)
  expect(await buyerOf(kite)).toBeUndefined()
  expect(await buyerOf(drum)).toBe(f.priya.id)
  expect(refresh).toHaveBeenCalled()
})

it("addItemAction: a parent adds to their kid's list, and the page refreshes", async () => {
  as('dev-maya')
  const result = await addItemAction(f.leo.id, null, form({ name: 'Kite', details: 'Red', link: 'shop.example/kite' }))
  expect(result).toEqual({ ok: true })
  const [row] = await t.db.query<{ name: string; details: string; url: string }>(
    'select name, details, url from items where owner_id = $1',
    [f.leo.id],
  )
  expect(row).toEqual({ name: 'Kite', details: 'Red', url: 'https://shop.example/kite' })
  expect(refresh).toHaveBeenCalledOnce()
})

it('a refused write says why and refreshes nothing', async () => {
  as('dev-grandma')
  expect(await addItemAction(f.leo.id, null, form({ name: 'Kite', details: '', link: '' }))).toEqual({
    ok: false,
    error: copy.notAllowed,
  })
  as('dev-maya')
  expect(await addItemAction(f.leo.id, null, form({ name: 'Kite', details: '', link: 'javascript:alert(1)' }))).toEqual({
    ok: false,
    error: copy.badLink,
  })
  expect(await itemNames(f.leo.id)).toEqual([])
  expect(refresh).not.toHaveBeenCalled()
})

it('a forged form with missing fields, a file, or no form at all gets words back, not an error', async () => {
  as('dev-maya')
  const nameRequired = { ok: false, error: copy.nameRequired }
  expect(await addItemAction(f.maya.id, null, new FormData())).toEqual(nameRequired)
  expect(await addItemAction(f.maya.id, null, form({ name: new Blob(['Kite']) }))).toEqual(nameRequired)
  expect(await addItemAction(f.maya.id, null, undefined as unknown as FormData)).toEqual(nameRequired)
  expect(await addItemAction(f.maya.id, null, 'name=Kite' as unknown as FormData)).toEqual(nameRequired)

  const feeder = await itemRow(t.db, f.maya.id, 'Bird feeder')
  expect(await updateItemAction(feeder, null, new FormData())).toEqual(nameRequired)
  // Only the name is required: missing details and link save as blank.
  expect(await addItemAction(f.maya.id, null, form({ name: 'Kite' }))).toEqual({ ok: true })
  expect(await itemNames(f.maya.id)).toEqual(['Bird feeder', 'Kite'])
})

it('updateItemAction and removeItemAction go through the permission rules, by the stored owner', async () => {
  const kite = await itemRow(t.db, f.leo.id, 'Kite')
  as('dev-grandma')
  expect(await updateItemAction(kite, null, form({ name: 'Red kite', details: '', link: '' }))).toEqual({
    ok: false,
    error: copy.notAllowed,
  })
  expect(await removeItemAction(kite)).toEqual({ ok: false, error: copy.notAllowed })
  expect(await itemNames(f.leo.id)).toEqual(['Kite'])
  expect(refresh).not.toHaveBeenCalled()

  as('dev-ben')
  expect(await updateItemAction(kite, null, form({ name: 'Red kite', details: '', link: '' }))).toEqual({ ok: true })
  expect(await itemNames(f.leo.id)).toEqual(['Red kite'])
  expect(await removeItemAction(kite)).toEqual({ ok: true })
  expect(await itemNames(f.leo.id)).toEqual([])
  expect(refresh).toHaveBeenCalledTimes(2)
})
