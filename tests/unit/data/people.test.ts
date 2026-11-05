// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import type { Family } from '@/db/dev-family'
import { findViewerByToken, getHome, getOrganizerName } from '@/lib/data/people'
import type { Db } from '@/lib/db/types'
import type { Person } from '@/lib/types'
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

// A person as the home screen lists them: no household id, and never a token.
const member = ({ id, name, kind }: Person) => ({ id, name, kind })

const removeItem = (id: string) => db.query('update items set removed_at = now() where id = $1', [id])

// A new adult, Zed, in a household of their own.
async function addZed(opts: { organizer?: boolean } = {}) {
  const [{ id: householdId }] = await db.query<{ id: string }>(
    "insert into households (name) values ('Zed') returning id",
  )
  const [{ id }] = await db.query<{ id: string }>(
    `insert into people (household_id, name, kind, token, is_organizer)
     values ($1, 'Zed', 'adult', 'dev-zed', $2) returning id`,
    [householdId, opts.organizer ?? false],
  )
  return { householdId, id }
}

it('finds Maya by her token, as the organizer', async () => {
  expect(await findViewerByToken(db, 'dev-maya')).toEqual(f.maya)
  expect(f.maya).toMatchObject({ name: 'Maya', isOrganizer: true })
  expect(await findViewerByToken(db, 'dev-ben')).toEqual(f.ben)
  expect(f.ben.isOrganizer).toBe(false)
})

it('an unknown, empty or odd token finds no one', async () => {
  for (const token of ['nope', '', "'; drop table people;--", 'DEV-MAYA', 'dev-maya ', 'dev-maya\u0000']) {
    expect(await findViewerByToken(db, token)).toBeNull()
  }
  // The quote in the odd one went in as a value, not as SQL.
  expect(await db.query('select count(*)::int as n from people')).toEqual([{ n: 9 }])
})

it('home lists households by name, without the viewer', async () => {
  const { benMaya, grandparents, samPriya } = f.households
  // Adults first, then kids, each group by name.
  expect(await getHome(db, f.maya)).toEqual({
    myItemCount: 0,
    buyingCount: 0,
    households: [
      { id: benMaya, name: 'Ben & Maya', members: [f.ben, f.ivy, f.leo].map(member) },
      { id: grandparents, name: 'Grandma & Grandpa', members: [f.grandma, f.grandpa].map(member) },
      { id: samPriya, name: 'Sam & Priya', members: [f.priya, f.sam, f.ollie].map(member) },
    ],
  })
  // Ben's home has Maya in it, and not Ben.
  const [ours] = (await getHome(db, f.ben)).households
  expect(ours.members.map(m => m.name)).toEqual(['Maya', 'Ivy', 'Leo'])
})

it('a household left empty without the viewer is omitted', async () => {
  const zed = await addZed()
  await db.query("insert into households (name) values ('Nobody yet')")
  const viewer = await findViewerByToken(db, 'dev-zed')
  expect(viewer).toMatchObject({ id: zed.id, householdId: zed.householdId })

  const home = await getHome(db, viewer!)
  expect(home.households.map(h => h.name)).toEqual(['Ben & Maya', 'Grandma & Grandpa', 'Sam & Priya'])
  expect(home.households[0].members.map(m => m.name)).toEqual(['Ben', 'Maya', 'Ivy', 'Leo'])
})

it('counts: my live items, and my claims including removed items', async () => {
  const gloves = await itemRow(db, f.maya.id, 'Gardening gloves')
  await itemRow(db, f.maya.id, 'Bird feeder')
  expect(await getHome(db, f.maya)).toMatchObject({ myItemCount: 2, buyingCount: 0 })

  await removeItem(gloves)
  expect((await getHome(db, f.maya)).myItemCount).toBe(1)

  // Grandma's claim stays in her Gifts I'm buying after Leo's list drops the item.
  const yoyo = await itemRow(db, f.leo.id, 'Yo-yo')
  await claimRow(db, yoyo, f.grandma.id)
  await removeItem(yoyo)
  expect(await getHome(db, f.grandma)).toMatchObject({ myItemCount: 0, buyingCount: 1 })
})

it("a claim on my list changes nothing on my home (the surprise)", async () => {
  const feeder = await itemRow(db, f.maya.id, 'Bird feeder')
  await itemRow(db, f.maya.id, 'Scarf')
  const before = await getHome(db, f.maya)

  await claimRow(db, feeder, f.grandma.id)
  expect(await getHome(db, f.maya)).toEqual(before)
  expect(before).toMatchObject({ myItemCount: 2, buyingCount: 0 })
})

it("organizer name is Maya; null when there's no organizer", async () => {
  expect(await getOrganizerName(db)).toBe('Maya')

  // With two organizers, it's the one set up first. The dates are set a day apart, so the order
  // doesn't rest on two inserts landing on different clock ticks.
  const zed = await addZed({ organizer: true })
  const setUp = (offset: string) =>
    db.query('update people set created_at = now() + $2::interval where id = $1', [zed.id, offset])
  await setUp('1 day')
  expect(await getOrganizerName(db)).toBe('Maya')
  await setUp('-1 day')
  expect(await getOrganizerName(db)).toBe('Zed')

  await db.query('update people set is_organizer = false')
  expect(await getOrganizerName(db)).toBeNull()
})
