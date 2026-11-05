// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import type { Family } from '@/db/dev-family'
import { copy } from '@/lib/copy'
import {
  addPerson,
  createHousehold,
  deletePerson,
  getOrganizerData,
  renameHousehold,
  replaceLink,
  updatePerson,
} from '@/lib/data/organizer'
import { findViewerByToken } from '@/lib/data/people'
import type { Db } from '@/lib/db/types'
import type { Person, Viewer } from '@/lib/types'
import { claimRow, itemRow, testDb } from '@/tests/helpers/db'

let t: Awaited<ReturnType<typeof testDb>>
let db: Db
let f: Family

beforeAll(async () => {
  t = await testDb()
  db = t.db
})
beforeEach(async () => {
  f = await t.reset()
})
afterAll(() => t.close())

const ok = { ok: true }
const notAllowed = { ok: false, error: copy.notAllowed }
const cantDelete = { ok: false, error: copy.cantDelete }
const nameRequired = { ok: false, error: copy.nameRequired }
const tooLong = { ok: false, error: copy.tooLong }

const HEX64 = /^[0-9a-f]{64}$/
const nobody = '00000000-0000-4000-8000-000000000000'

// Everyone and every household as stored, in a fixed order, so a test can say nothing changed.
async function snapshot() {
  return {
    households: await db.query('select id, name from households order by id'),
    people: await db.query('select id, household_id, name, kind, token, is_organizer from people order by id'),
  }
}

async function personRow(id: string) {
  const [r] = await db.query<{ household_id: string; name: string; kind: string; token: string | null }>(
    'select household_id, name, kind, token from people where id = $1',
    [id],
  )
  return r
}

async function personNamed(name: string) {
  const [r] = await db.query<{ id: string; household_id: string; kind: string; token: string | null }>(
    'select id, household_id, kind, token from people where name = $1',
    [name],
  )
  return r
}

async function householdNamed(name: string) {
  const [r] = await db.query<{ id: string }>('select id from households where name = $1', [name])
  return r?.id
}

// A person as the organizer page lists them.
const listed = (p: Person | Viewer) => ({
  id: p.id,
  name: p.name,
  kind: p.kind,
  token: 'token' in p ? p.token : null,
})

it("everything is refused for Ben, who isn't the organizer", async () => {
  const before = await snapshot()
  expect(await getOrganizerData(db, f.ben)).toBeNull()
  expect(await createHousehold(db, f.ben, 'Aunt Jo')).toEqual(notAllowed)
  expect(await renameHousehold(db, f.ben, f.households.benMaya, 'The Smiths')).toEqual(notAllowed)
  expect(await addPerson(db, f.ben, { name: 'Zed', kind: 'adult', householdId: f.households.benMaya })).toEqual(
    notAllowed,
  )
  expect(await updatePerson(db, f.ben, f.leo.id, { name: 'Leonard', householdId: f.households.samPriya })).toEqual(
    notAllowed,
  )
  expect(await deletePerson(db, f.ben, f.ivy.id)).toEqual(notAllowed)
  expect(await replaceLink(db, f.ben, f.priya.id)).toEqual(notAllowed)
  // Not even his own link.
  expect(await replaceLink(db, f.ben, f.ben.id)).toEqual(notAllowed)
  expect(await snapshot()).toEqual(before)
})

it("the organizer sees every household and everyone in it, with each adult's link", async () => {
  const { benMaya, grandparents, samPriya } = f.households
  // A household with no one in it yet still shows, so people can be added to it.
  const empty = (await db.query<{ id: string }>("insert into households (name) values ('Aunt Jo') returning id"))[0].id
  // Households by name; in each, adults first and then kids, each by name.
  expect(await getOrganizerData(db, f.maya)).toEqual({
    households: [
      { id: empty, name: 'Aunt Jo', people: [] },
      { id: benMaya, name: 'Ben & Maya', people: [f.ben, f.maya, f.ivy, f.leo].map(listed) },
      { id: grandparents, name: 'Grandma & Grandpa', people: [f.grandma, f.grandpa].map(listed) },
      { id: samPriya, name: 'Sam & Priya', people: [f.priya, f.sam, f.ollie].map(listed) },
    ],
  })
})

it('an added adult gets a 64-hex token; an added kid gets none', async () => {
  const { samPriya } = f.households
  expect(await addPerson(db, f.maya, { name: 'Zed', kind: 'adult', householdId: samPriya })).toEqual(ok)
  expect(await addPerson(db, f.maya, { name: 'Pip', kind: 'kid', householdId: samPriya })).toEqual(ok)

  const zed = await personNamed('Zed')
  expect(zed).toMatchObject({ household_id: samPriya, kind: 'adult' })
  expect(zed.token).toMatch(HEX64)
  expect(await findViewerByToken(db, zed.token!)).toMatchObject({ id: zed.id, name: 'Zed', isOrganizer: false })

  const pip = await personNamed('Pip')
  expect(pip).toMatchObject({ household_id: samPriya, kind: 'kid', token: null })

  // Two adults never share a link.
  expect(await addPerson(db, f.maya, { name: 'Zoe', kind: 'adult', householdId: samPriya })).toEqual(ok)
  expect((await personNamed('Zoe')).token).not.toBe(zed.token)
})

it('a household can be added and renamed, and people added to it', async () => {
  expect(await createHousehold(db, f.maya, '  Aunt Jo  ')).toEqual(ok)
  const jo = await householdNamed('Aunt Jo')
  expect(jo).toBeDefined()
  expect(await renameHousehold(db, f.maya, jo!, 'Aunt Jo & Uncle Tom')).toEqual(ok)
  expect(await householdNamed('Aunt Jo & Uncle Tom')).toBe(jo)
  expect(await addPerson(db, f.maya, { name: 'Jo', kind: 'adult', householdId: jo! })).toEqual(ok)

  const data = await getOrganizerData(db, f.maya)
  const card = data!.households.find(h => h.id === jo)
  expect(card).toMatchObject({ name: 'Aunt Jo & Uncle Tom', people: [{ name: 'Jo', kind: 'adult' }] })
})

it('rename and move a person between households', async () => {
  const { samPriya, grandparents } = f.households
  expect(await updatePerson(db, f.maya, f.ben.id, { name: ' Benjamin ', householdId: samPriya })).toEqual(ok)
  expect(await personRow(f.ben.id)).toEqual({ household_id: samPriya, name: 'Benjamin', kind: 'adult', token: 'dev-ben' })

  // A kid moves too, and keeps having no link.
  expect(await updatePerson(db, f.maya, f.leo.id, { name: 'Leo', householdId: grandparents })).toEqual(ok)
  expect(await personRow(f.leo.id)).toEqual({ household_id: grandparents, name: 'Leo', kind: 'kid', token: null })

  // Moving changes who keeps a kid's list: the organizer page shows Benjamin with Sam & Priya.
  const data = await getOrganizerData(db, f.maya)
  expect(data!.households.find(h => h.id === samPriya)!.people.map(p => p.name)).toEqual([
    'Benjamin',
    'Priya',
    'Sam',
    'Ollie',
  ])
})

it('delete is refused, with copy.cantDelete, for someone who has items or claims; allowed otherwise', async () => {
  // Ben has a thing on his list.
  await itemRow(db, f.ben.id, 'Hiking socks')
  expect(await deletePerson(db, f.maya, f.ben.id)).toEqual(cantDelete)

  // Leo's only item was taken off his list, but it still counts: a buyer may hold a claim on it.
  const kite = await itemRow(db, f.leo.id, 'Kite')
  await db.query('update items set removed_at = now() where id = $1', [kite])
  expect(await deletePerson(db, f.maya, f.leo.id)).toEqual(cantDelete)

  // Grandma has nothing on her list but is buying something.
  await claimRow(db, await itemRow(db, f.ollie.id, 'Drum'), f.grandma.id)
  expect(await deletePerson(db, f.maya, f.grandma.id)).toEqual(cantDelete)

  for (const id of [f.ben.id, f.leo.id, f.grandma.id]) expect(await personRow(id)).toBeDefined()

  // Ivy and Grandpa have neither.
  expect(await deletePerson(db, f.maya, f.ivy.id)).toEqual(ok)
  expect(await deletePerson(db, f.maya, f.grandpa.id)).toEqual(ok)
  expect(await personRow(f.ivy.id)).toBeUndefined()
  expect(await personRow(f.grandpa.id)).toBeUndefined()
  // Grandpa's link no longer finds anyone.
  expect(await findViewerByToken(db, 'dev-grandpa')).toBeNull()
})

it('an item or claim that arrives between the check and the delete still refuses it, in words', async () => {
  // The foreign keys are the last guard. A Db that fails the delete the way Postgres does then.
  const racing: Db = {
    query<T>(text: string, params?: unknown[]) {
      if (/^\s*delete from people/i.test(text)) {
        return Promise.reject(Object.assign(new Error('violates foreign key constraint'), { code: '23503' }))
      }
      return db.query<T>(text, params)
    },
  }
  expect(await deletePerson(racing, f.maya, f.ivy.id)).toEqual(cantDelete)

  // Any other failure is thrown, so it never reads as "has a wish list".
  const broken: Db = {
    query<T>(text: string, params?: unknown[]) {
      if (/^\s*delete from people/i.test(text)) return Promise.reject(new Error('connection lost'))
      return db.query<T>(text, params)
    },
  }
  await expect(deletePerson(broken, f.maya, f.ivy.id)).rejects.toThrow('connection lost')
})

it('replaceLink: the old token no longer finds anyone, the new one finds the same person', async () => {
  const before = await findViewerByToken(db, 'dev-ben')
  expect(before).toEqual(f.ben)
  expect(await replaceLink(db, f.maya, f.ben.id)).toEqual(ok)

  expect(await findViewerByToken(db, 'dev-ben')).toBeNull()
  const { token } = await personRow(f.ben.id)
  expect(token).toMatch(HEX64)
  expect(await findViewerByToken(db, token!)).toEqual({ ...f.ben, token })

  // Replacing it again makes yet another one.
  expect(await replaceLink(db, f.maya, f.ben.id)).toEqual(ok)
  expect((await personRow(f.ben.id)).token).not.toBe(token)
})

it("the organizer can't replace her own link or remove herself, which would lock her out", async () => {
  expect(await replaceLink(db, f.maya, f.maya.id)).toEqual(notAllowed)
  // The same id in capitals is the same person to Postgres.
  expect(await replaceLink(db, f.maya, f.maya.id.toUpperCase())).toEqual(notAllowed)
  expect(await deletePerson(db, f.maya, f.maya.id)).toEqual(notAllowed)
  expect(await deletePerson(db, f.maya, f.maya.id.toUpperCase())).toEqual(notAllowed)
  expect(await findViewerByToken(db, 'dev-maya')).toEqual(f.maya)
})

it('a kid has no link to replace', async () => {
  expect(await replaceLink(db, f.maya, f.leo.id)).toEqual(notAllowed)
  expect((await personRow(f.leo.id)).token).toBeNull()
})

it('names: blank is refused, and too long gets copy.tooLong, counted as Postgres counts', async () => {
  const before = await snapshot()
  const { benMaya } = f.households
  for (const blank of ['', '   ', '\u0000', ' \u0000 ']) {
    expect(await createHousehold(db, f.maya, blank)).toEqual(nameRequired)
    expect(await renameHousehold(db, f.maya, benMaya, blank)).toEqual(nameRequired)
    expect(await addPerson(db, f.maya, { name: blank, kind: 'kid', householdId: benMaya })).toEqual(nameRequired)
    expect(await updatePerson(db, f.maya, f.leo.id, { name: blank, householdId: benMaya })).toEqual(nameRequired)
  }
  // A household name holds 80 characters and a person's 60.
  expect(await createHousehold(db, f.maya, 'h'.repeat(81))).toEqual(tooLong)
  expect(await renameHousehold(db, f.maya, benMaya, 'h'.repeat(81))).toEqual(tooLong)
  expect(await addPerson(db, f.maya, { name: 'p'.repeat(61), kind: 'kid', householdId: benMaya })).toEqual(tooLong)
  expect(await updatePerson(db, f.maya, f.leo.id, { name: 'p'.repeat(61), householdId: benMaya })).toEqual(tooLong)
  expect(await snapshot()).toEqual(before)

  // At the limit it saves, and an emoji counts as one character, as in Postgres. A NUL is dropped.
  expect(await createHousehold(db, f.maya, '🎄'.repeat(80))).toEqual(ok)
  expect(await addPerson(db, f.maya, { name: '🎄'.repeat(59) + '\u0000x', kind: 'kid', householdId: benMaya })).toEqual(ok)
  expect(await personNamed('🎄'.repeat(59) + 'x')).toBeDefined()
})

it('a malformed or unknown id, or a kind that is neither adult nor kid, is refused without a database error', async () => {
  const before = await snapshot()
  const { benMaya } = f.households
  for (const bad of ['not-a-uuid', nobody, '']) {
    expect(await renameHousehold(db, f.maya, bad, 'Aunt Jo')).toEqual(notAllowed)
    expect(await addPerson(db, f.maya, { name: 'Zed', kind: 'adult', householdId: bad })).toEqual(notAllowed)
    expect(await updatePerson(db, f.maya, bad, { name: 'Zed', householdId: benMaya })).toEqual(notAllowed)
    expect(await updatePerson(db, f.maya, f.leo.id, { name: 'Leo', householdId: bad })).toEqual(notAllowed)
    expect(await deletePerson(db, f.maya, bad)).toEqual(notAllowed)
    expect(await replaceLink(db, f.maya, bad)).toEqual(notAllowed)
  }
  for (const kind of ['', 'grown-up', 'ADULT']) {
    expect(
      await addPerson(db, f.maya, { name: 'Zed', kind: kind as 'adult', householdId: benMaya }),
    ).toEqual(notAllowed)
  }
  expect(await snapshot()).toEqual(before)
})
