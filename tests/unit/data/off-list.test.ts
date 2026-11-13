// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import type { Family } from '@/db/dev-family'
import { copy } from '@/lib/copy'
import { addOffListGift, getListView, removeOffListGift, updateOffListGift } from '@/lib/data/lists'
import type { Db } from '@/lib/db/types'
import type { ItemInput, ListViewData, OffListGift } from '@/lib/types'
import { itemRow, offListRow, testDb } from '@/tests/helpers/db'

// Off-list gifts (#21, docs/adr/0001-off-list-gifts-in-their-own-table.md): a buyer adds a gift to
// someone's list that isn't one of their wishes. Everyone but that person sees it, and who's buying.

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
const gone = { ok: false, error: copy.gone, gone: true }
const nameRequired = { ok: false, error: copy.nameRequired }
const tooLong = { ok: false, error: copy.tooLong }
const badLink = { ok: false, error: copy.badLink }

// The form as filled in: a name, and nothing else unless given.
const input = (name: string, more: Partial<ItemInput> = {}): ItemInput => ({
  name,
  price: '',
  details: '',
  link: '',
  ...more,
})

// Someone else's list as the viewer sees it, with its off-list gifts.
async function view(
  viewer: Family['ben'],
  ownerId: string,
): Promise<Exclude<ListViewData, { mode: 'own' }> & { offList: OffListGift[] }> {
  const v = await getListView(db, viewer, ownerId)
  if (!v || v.mode === 'own') throw new Error('not someone else\'s list')
  return v
}

// The viewer's own list.
async function ownView(viewer: Family['ben']): Promise<ListViewData> {
  const v = await getListView(db, viewer, viewer.id)
  if (v?.mode !== 'own') throw new Error('not their own list')
  return v
}

it("everyone but Grandma sees Ben's off-list gift for her, and who's buying it", async () => {
  await itemRow(db, f.grandma.id, 'Jigsaw puzzle')
  const id = await offListRow(db, f.grandma.id, f.ben.id, 'Cooking class', {
    price: '80',
    details: 'Saturday mornings',
    url: 'https://cooking.example.com/class',
  })
  const gift = { id, name: 'Cooking class', price: '80', details: 'Saturday mornings', url: 'https://cooking.example.com/class' }

  expect((await view(f.maya, f.grandma.id)).offList).toEqual([{ ...gift, buyerName: 'Ben', mine: false }])
  expect((await view(f.grandpa, f.grandma.id)).offList).toEqual([{ ...gift, buyerName: 'Ben', mine: false }])
  expect((await view(f.ben, f.grandma.id)).offList).toEqual([{ ...gift, buyerName: 'Ben', mine: true }])
})

it("Grandma's own list is exactly the same with an off-list gift for her as without", async () => {
  await itemRow(db, f.grandma.id, 'Jigsaw puzzle')
  const before = await ownView(f.grandma)

  await offListRow(db, f.grandma.id, f.ben.id, 'Cooking class')
  const after = await ownView(f.grandma)
  expect(after).toStrictEqual(before)
  expect('offList' in after).toBe(false)
  expect(JSON.stringify(after)).not.toMatch(/Cooking|Ben/)
})

it("a keeper sees off-list gifts on their kid's list, and every list but the viewer's own has the section", async () => {
  const kite = await offListRow(db, f.leo.id, f.sam.id, 'Kite')
  expect((await view(f.maya, f.leo.id)).offList).toEqual([
    { id: kite, name: 'Kite', price: null, details: null, url: null, buyerName: 'Sam', mine: false },
  ])
  // No off-list gifts yet: an empty list, so the page still offers to add one.
  expect((await view(f.maya, f.priya.id)).offList).toEqual([])
})

it('off-list gifts come back in the order they were added', async () => {
  const ids = []
  for (const name of ['Kite', 'Atlas', 'Model rocket']) {
    ids.push(await offListRow(db, f.leo.id, f.grandma.id, name))
    await db.query("update off_list_gifts set created_at = now() + $2::interval where id = $1", [
      ids.at(-1),
      `${ids.length} minutes`,
    ])
  }
  expect((await view(f.maya, f.leo.id)).offList.map(g => g.name)).toEqual(['Kite', 'Atlas', 'Model rocket'])
})

it('Ben adds an off-list gift for Grandma, and Maya sees it, checked and trimmed as an item is', async () => {
  expect(
    await addOffListGift(db, f.ben, f.grandma.id, {
      name: '  Cooking class ',
      price: ' 80 ',
      details: '',
      link: 'cooking.example.com/class',
    }),
  ).toEqual(ok)
  expect((await view(f.maya, f.grandma.id)).offList).toEqual([
    {
      id: expect.any(String),
      name: 'Cooking class',
      price: '80',
      details: null,
      url: 'https://cooking.example.com/class',
      buyerName: 'Ben',
      mine: false,
    },
  ])

  expect(await addOffListGift(db, f.ben, f.grandma.id, input('  '))).toEqual(nameRequired)
  expect(await addOffListGift(db, f.ben, f.grandma.id, input('c'.repeat(201)))).toEqual(tooLong)
  expect(await addOffListGift(db, f.ben, f.grandma.id, input('Kite', { price: 'x'.repeat(41) }))).toEqual(tooLong)
  expect(await addOffListGift(db, f.ben, f.grandma.id, input('Kite', { link: 'not a link' }))).toEqual(badLink)
  // A form with no price field at all adds no price.
  expect(await addOffListGift(db, f.ben, f.grandma.id, { name: 'Atlas', details: '', link: '' })).toEqual(ok)
  const prices = (await view(f.maya, f.grandma.id)).offList.map(g => [g.name, g.price])
  expect(prices.sort()).toEqual([
    ['Atlas', null],
    ['Cooking class', '80'],
  ])
})

it("anyone who can claim from a list can add to it: a keeper on their kid's list, a spouse on theirs", async () => {
  expect(await addOffListGift(db, f.maya, f.leo.id, input('Bike'))).toEqual(ok)
  expect(await addOffListGift(db, f.grandpa, f.grandma.id, input('Atlas'))).toEqual(ok)
  expect((await view(f.ben, f.leo.id)).offList.map(g => [g.name, g.buyerName])).toEqual([['Bike', 'Maya']])
  expect((await view(f.ben, f.grandma.id)).offList.map(g => [g.name, g.buyerName])).toEqual([['Atlas', 'Grandpa']])
})

it('no one adds an off-list gift for themselves, or for someone who is not there', async () => {
  for (const id of [f.grandma.id, f.grandma.id.toUpperCase(), '00000000-0000-4000-8000-000000009999', 'not-a-uuid']) {
    expect(await addOffListGift(db, f.grandma, id, input('Cooking class'))).toEqual(notAllowed)
  }
  expect(await db.query('select count(*)::int as n from off_list_gifts')).toEqual([{ n: 0 }])
})

// An off-list gift as stored.
async function stored(id: string) {
  const [row] = await db.query('select name, price, details, url, buyer_id from off_list_gifts where id = $1', [id])
  return row ?? null
}

it('Ben edits his off-list gift: every field, checked as an item is', async () => {
  const id = await offListRow(db, f.grandma.id, f.ben.id, 'Cooking class', { price: '80' })
  expect(
    await updateOffListGift(db, f.ben, id, {
      name: ' Pasta class ',
      price: '',
      details: 'Saturday',
      link: 'cooking.example.com',
    }),
  ).toEqual(ok)
  expect(await stored(id)).toEqual({
    name: 'Pasta class',
    price: null,
    details: 'Saturday',
    url: 'https://cooking.example.com',
    buyer_id: f.ben.id,
  })

  expect(await updateOffListGift(db, f.ben, id, input(''))).toEqual(nameRequired)
  expect(await updateOffListGift(db, f.ben, id, input('Pasta class', { link: 'not a link' }))).toEqual(badLink)
  // A form with no price field leaves the price as it is; a blank one clears it.
  await updateOffListGift(db, f.ben, id, input('Pasta class', { price: '90' }))
  expect(await updateOffListGift(db, f.ben, id, { name: 'Pasta class', details: '', link: '' })).toEqual(ok)
  expect(await stored(id)).toMatchObject({ name: 'Pasta class', price: '90', details: null, url: null })
})

it("only the buyer edits an off-list gift: not its recipient, a spouse, or the kid's keepers", async () => {
  const forGrandma = await offListRow(db, f.grandma.id, f.ben.id, 'Cooking class')
  const forLeo = await offListRow(db, f.leo.id, f.grandma.id, 'Drum kit')
  for (const [viewer, id] of [
    [f.grandma, forGrandma],
    [f.grandpa, forGrandma],
    [f.maya, forGrandma],
    [f.maya, forLeo],
    [f.ben, forLeo],
  ] as const) {
    expect(await updateOffListGift(db, viewer, id, input('Changed'))).toEqual(notAllowed)
  }
  expect(await stored(forGrandma)).toMatchObject({ name: 'Cooking class' })
  expect(await stored(forLeo)).toMatchObject({ name: 'Drum kit' })
  expect(await updateOffListGift(db, f.ben, 'not-a-uuid', input('Changed'))).toEqual(notAllowed)
})

it('an edit to an off-list gift its buyer removed in another tab is gone', async () => {
  const id = await offListRow(db, f.grandma.id, f.ben.id, 'Cooking class')
  await db.query('delete from off_list_gifts where id = $1', [id])
  expect(await updateOffListGift(db, f.ben, id, input('Pasta class'))).toEqual(gone)
  expect(await stored(id)).toBeNull()
})

it('Ben removes his off-list gift, and it is gone for everyone; removing it again is still done', async () => {
  const id = await offListRow(db, f.grandma.id, f.ben.id, 'Cooking class')
  expect(await removeOffListGift(db, f.ben, id)).toEqual(ok)
  expect(await stored(id)).toBeNull()
  expect((await view(f.maya, f.grandma.id)).offList).toEqual([])
  expect(await removeOffListGift(db, f.ben, id)).toEqual(ok)
})

it("only the buyer removes an off-list gift: not its recipient, a spouse, or the kid's keepers", async () => {
  const forGrandma = await offListRow(db, f.grandma.id, f.ben.id, 'Cooking class')
  const forLeo = await offListRow(db, f.leo.id, f.grandma.id, 'Drum kit')
  for (const [viewer, id] of [
    [f.grandma, forGrandma],
    [f.grandpa, forGrandma],
    [f.maya, forLeo],
    [f.ben, forLeo],
  ] as const) {
    expect(await removeOffListGift(db, viewer, id)).toEqual(notAllowed)
  }
  expect(await stored(forGrandma)).not.toBeNull()
  expect(await stored(forLeo)).not.toBeNull()
  expect(await removeOffListGift(db, f.ben, 'not-a-uuid')).toEqual(notAllowed)
})
