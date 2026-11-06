// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import type { Family } from '@/db/dev-family'
import { copy } from '@/lib/copy'
import { addItem, getListView, removeItem, updateItem } from '@/lib/data/lists'
import type { Db } from '@/lib/db/types'
import type { ItemInput, ListViewData, Viewer } from '@/lib/types'
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

// An item as stored, removed or not.
async function row(id: string) {
  const [r] = await db.query<{
    owner_id: string
    name: string
    details: string | null
    url: string | null
    price: string | null
    updated_at: Date
    removed_at: Date | null
  }>('select owner_id, name, details, url, price, updated_at, removed_at from items where id = $1', [id])
  return r
}

async function idOf(ownerId: string, name: string): Promise<string> {
  const [r] = await db.query<{ id: string }>('select id from items where owner_id = $1 and name = $2', [
    ownerId,
    name,
  ])
  return r.id
}

const remove = (id: string) => db.query('update items set removed_at = now() where id = $1', [id])

// Moves an item's timestamps a day back, so a write's now() is certainly later.
const backdate = (id: string) =>
  db.query(
    `update items set created_at = created_at - interval '1 day', updated_at = updated_at - interval '1 day'
      where id = $1`,
    [id],
  )

const claimOf = (view: ListViewData, itemId: string) => view.items.find(i => i.id === itemId)?.claim

// A Db that keeps the text of every query it runs.
function recording(inner: Db) {
  const sql: string[] = []
  const watched: Db = {
    query<T>(text: string, params?: unknown[]) {
      sql.push(text)
      return inner.query<T>(text, params)
    },
  }
  return { sql, db: watched }
}

it("the owner's own list carries no claim data at all", async () => {
  await addItem(db, f.maya, f.maya.id, { name: 'Bird feeder', price: '40', details: '', link: '' })
  const [item] = (await getListView(db, f.maya, f.maya.id))!.items
  await claimRow(db, item.id, f.priya.id) // direct insert helper in tests/helpers/db.ts
  const view = (await getListView(db, f.maya, f.maya.id))!
  expect(view.mode).toBe('own')
  expect('claim' in view.items[0]).toBe(false)
  expect(JSON.stringify(view)).not.toContain('Priya')

  expect(view).toStrictEqual({
    owner: { id: f.maya.id, name: 'Maya', kind: 'adult' },
    mode: 'own',
    keptBy: null,
    canEdit: true,
    canClaim: false,
    items: [{ id: item.id, name: 'Bird feeder', price: '40', details: null, url: null }],
  })
})

it("a claim changes nothing in the owner's view, which never reads claims", async () => {
  const feeder = await itemRow(db, f.maya.id, 'Bird feeder')
  await itemRow(db, f.maya.id, 'Gardening gloves', { details: 'Size M' })
  const before = await getListView(db, f.maya, f.maya.id)
  await claimRow(db, feeder, f.grandma.id)

  const own = recording(db)
  expect(await getListView(own.db, f.maya, f.maya.id)).toStrictEqual(before)
  expect(own.sql.length).toBeGreaterThan(0)
  expect(own.sql.filter(q => /claims/i.test(q))).toEqual([])

  // The same recorder does catch claims being read, for anyone else's view of her list.
  const spouse = recording(db)
  await getListView(spouse.db, f.ben, f.maya.id)
  expect(spouse.sql.some(q => /claims/i.test(q))).toBe(true)
})

// Postgres reads a uuid in any case, so /list/<Maya's id in capitals> opens her list. It must still
// be her own: the comparison is with her id as stored, not as typed. The made-up family's ids are
// all digits, so Maya gets one with letters in it first, as a real one has.
it('your own list opened with your id in capitals is still your own, and reads no claims', async () => {
  const maya = { ...f.maya, id: 'abcdef12-3456-4789-8abc-def123456789' }
  await db.query('update people set id = $2 where id = $1', [f.maya.id, maya.id])
  const feeder = await itemRow(db, maya.id, 'Bird feeder')
  await claimRow(db, feeder, f.grandma.id)

  const own = recording(db)
  const view = (await getListView(own.db, maya, maya.id.toUpperCase()))!
  expect(view.mode).toBe('own')
  expect(view.owner.id).toBe(maya.id)
  expect(view.items.map(i => i.id)).toEqual([feeder])
  expect('claim' in view.items[0]).toBe(false)
  expect(own.sql.filter(q => /claims/i.test(q))).toEqual([])
})

it("a parent sees claims on their kid's list and can edit it", async () => {
  const yoyo = await itemRow(db, f.leo.id, 'Yo-yo')
  const kite = await itemRow(db, f.leo.id, 'Kite')
  await claimRow(db, yoyo, f.grandma.id)

  for (const parent of [f.maya, f.ben]) {
    const view = (await getListView(db, parent, f.leo.id))!
    expect(view).toMatchObject({ mode: 'kept', canEdit: true, canClaim: true, keptBy: 'Ben & Maya' })
    expect(view.owner).toStrictEqual({ id: f.leo.id, name: 'Leo', kind: 'kid' })
    expect(claimOf(view, yoyo)).toStrictEqual({ buyerName: 'Grandma', mine: false })
    expect(claimOf(view, kite)).toBeNull()
  }
})

it("others see who's buying; your own claim is marked mine", async () => {
  const sweater = await itemRow(db, f.leo.id, 'Sweater', {
    details: 'Green, size XS',
    url: 'https://www.asos.com/',
    price: 'about $25',
  })
  const yoyo = await itemRow(db, f.leo.id, 'Yo-yo')
  const lego = await itemRow(db, f.leo.id, 'Any LEGO set')
  await claimRow(db, sweater, f.priya.id)
  await claimRow(db, yoyo, f.grandma.id)

  const view = (await getListView(db, f.grandma, f.leo.id))!
  expect(view).toMatchObject({ mode: 'other', keptBy: 'Ben & Maya', canEdit: false, canClaim: true })
  expect(view.items.find(i => i.id === sweater)).toStrictEqual({
    id: sweater,
    name: 'Sweater',
    price: 'about $25',
    details: 'Green, size XS',
    url: 'https://www.asos.com/',
    claim: { buyerName: 'Priya', mine: false },
  })
  expect(claimOf(view, yoyo)).toStrictEqual({ buyerName: 'Grandma', mine: true })
  expect(claimOf(view, lego)).toBeNull()

  // A spouse is anyone else too: Ben sees the claim on Maya's list, and can claim but not edit.
  const feeder = await itemRow(db, f.maya.id, 'Bird feeder')
  await claimRow(db, feeder, f.grandma.id)
  const spouse = (await getListView(db, f.ben, f.maya.id))!
  expect(spouse).toMatchObject({ mode: 'other', keptBy: null, canEdit: false, canClaim: true })
  expect(claimOf(spouse, feeder)).toStrictEqual({ buyerName: 'Grandma', mine: false })
})

it('a kid whose household has no adults is kept by no one: null, never ""', async () => {
  const [{ id: household }] = await db.query<{ id: string }>(
    "insert into households (name) values ('Zed') returning id",
  )
  const [{ id: zed }] = await db.query<{ id: string }>(
    "insert into people (household_id, name, kind) values ($1, 'Zed', 'kid') returning id",
    [household],
  )
  expect(await getListView(db, f.grandma, zed)).toMatchObject({
    owner: { name: 'Zed' },
    mode: 'other',
    keptBy: null,
  })

  // With one adult, it's that one name.
  await db.query(
    "insert into people (household_id, name, kind, token) values ($1, 'Uma', 'adult', 'dev-uma')",
    [household],
  )
  expect((await getListView(db, f.grandma, zed))!.keptBy).toBe('Uma')
})

it('removed items are hidden from every view', async () => {
  const kite = await itemRow(db, f.leo.id, 'Kite')
  const yoyo = await itemRow(db, f.leo.id, 'Yo-yo')
  await claimRow(db, yoyo, f.grandma.id)
  await remove(yoyo)
  const feeder = await itemRow(db, f.maya.id, 'Bird feeder')
  await remove(await itemRow(db, f.maya.id, 'Scarf'))

  const ids = async (viewer: Viewer, ownerId: string) =>
    (await getListView(db, viewer, ownerId))!.items.map(i => i.id)
  expect(await ids(f.maya, f.leo.id)).toEqual([kite]) // kept
  expect(await ids(f.grandma, f.leo.id)).toEqual([kite]) // other, and her own claim's item too
  expect(await ids(f.maya, f.maya.id)).toEqual([feeder]) // own
  expect(await ids(f.ben, f.maya.id)).toEqual([feeder]) // other
})

it('items come back in the order they were added', async () => {
  // PGlite's clock ticks in milliseconds, so two adds inside one share a created_at and the random
  // id breaks the tie. Postgres's clock ticks in microseconds. A short wait gives each add its own.
  const tick = () => new Promise(resolve => setTimeout(resolve, 5))
  const names = ['Yo-yo', 'Any LEGO set', 'Sweater', 'Kite', 'AirPods 5', 'Bird feeder']
  for (const name of names) {
    expect(await addItem(db, f.maya, f.maya.id, input(name))).toEqual(ok)
    await tick()
  }

  const order = async (viewer: Viewer) => (await getListView(db, viewer, f.maya.id))!.items.map(i => i.name)
  expect(await order(f.maya)).toEqual(names) // own
  expect(await order(f.ben)).toEqual(names) // other

  // An edit or a claim doesn't move an item.
  const first = await idOf(f.maya.id, 'Yo-yo')
  expect(await updateItem(db, f.maya, first, input('Yo-yo', { details: 'A red one' }))).toEqual(ok)
  await claimRow(db, first, f.grandma.id)
  expect(await order(f.maya)).toEqual(names)
  expect(await order(f.ben)).toEqual(names)
})

it('unknown or malformed owner id gives null', async () => {
  const item = await itemRow(db, f.leo.id, 'Kite')
  for (const id of [
    'not-a-uuid',
    crypto.randomUUID(),
    '',
    `${f.leo.id}\n`,
    ` ${f.leo.id}`,
    f.households.benMaya, // a household, not a person
    item, // an item, not a person
  ]) {
    expect(await getListView(db, f.maya, id), JSON.stringify(id)).toBeNull()
  }
})

it("addItem: a parent adds to their kid's list, and anyone else is refused", async () => {
  expect(await addItem(db, f.maya, f.leo.id, input('Kite'))).toEqual(ok)
  expect(await addItem(db, f.ben, f.ben.id, input('Coffee grinder'))).toEqual(ok)

  // Forged: Grandma on Leo's list, Maya on her spouse's, Maya on another household's kid, and on no
  // one at all.
  for (const [viewer, ownerId] of [
    [f.grandma, f.leo.id],
    [f.maya, f.ben.id],
    [f.maya, f.ollie.id],
    [f.maya, crypto.randomUUID()],
    [f.maya, 'not-a-uuid'],
  ] as const) {
    expect(await addItem(db, viewer, ownerId, input('Pony'))).toEqual(notAllowed)
  }
  // A refusal says nothing about the form, even when the form is wrong too.
  expect(await addItem(db, f.grandma, f.leo.id, input(''))).toEqual(notAllowed)

  expect(await db.query('select owner_id, name, details, url from items order by name')).toEqual([
    { owner_id: f.ben.id, name: 'Coffee grinder', details: null, url: null },
    { owner_id: f.leo.id, name: 'Kite', details: null, url: null },
  ])
})

it('addItem checks the name, details and link', async () => {
  const add = (i: ItemInput) => addItem(db, f.maya, f.leo.id, i)
  expect(await add(input(''))).toEqual(nameRequired)
  expect(await add(input('   '))).toEqual(nameRequired)
  expect(await add(input('x'.repeat(201)))).toEqual(tooLong)
  expect(await add(input('Kite', { details: 'x'.repeat(501) }))).toEqual(tooLong)
  expect(await add(input('Kite', { link: 'javascript:x' }))).toEqual(badLink)
  expect(await add(input('Kite', { link: 'data:text/html,hi' }))).toEqual(badLink)
  expect(await db.query('select id from items')).toEqual([])

  // Right at the limits, counted in characters as Postgres counts them: an emoji is one.
  expect(await add(input('x'.repeat(200)))).toEqual(ok)
  expect(await add(input('🪁'.repeat(200)))).toEqual(ok)
  expect(await add(input(` ${'y'.repeat(200)} `))).toEqual(ok)
  expect(await add(input('Kite', { details: 'x'.repeat(500) }))).toEqual(ok)
  expect(await add(input('Kite', { details: '🪁'.repeat(500) }))).toEqual(ok)
  expect(await add(input('🪁'.repeat(201)))).toEqual(tooLong)
  expect(await db.query('select count(*)::int as n from items')).toEqual([{ n: 5 }])
})

it('addItem trims, stores blanks as null, adds https:// to a bare link, keeps emoji as typed', async () => {
  const add = (i: ItemInput) => addItem(db, f.maya, f.leo.id, i)
  expect(await add({ name: '  Kite  ', price: ' ', details: '   ', link: '  ' })).toEqual(ok)
  const rocket = { name: 'Rocket 🚀 LEGO ✨', price: '', details: ' Green, size XS ', link: 'amazon.com/dp/1' }
  expect(await add(rocket)).toEqual(ok)
  const long = 'https://www.asos.com/p/123?clr=green&utm_source=x&utm_medium=y'
  expect(await add(input('Sweater', { link: long }))).toEqual(ok)

  const rows = await db.query('select name, details, url from items where owner_id = $1 order by name', [
    f.leo.id,
  ])
  expect(rows).toEqual([
    { name: 'Kite', details: null, url: null },
    { name: 'Rocket 🚀 LEGO ✨', details: 'Green, size XS', url: 'https://amazon.com/dp/1' },
    { name: 'Sweater', details: null, url: long },
  ])
})

// The price is text, as typed: "about $25" and "$20–30" are as good as "40". It's never a number.
it('addItem stores the price trimmed and as typed, and a blank one as null', async () => {
  const add = (i: ItemInput) => addItem(db, f.maya, f.leo.id, i)
  expect(await add(input('Kite', { price: '  about $25 ' }))).toEqual(ok)
  expect(await add(input('Sweater', { price: '$20–30' }))).toEqual(ok)
  expect(await add(input('Yo-yo', { price: '40' }))).toEqual(ok)
  expect(await add(input('Drum', { price: '   ' }))).toEqual(ok)
  expect(await add(input('Paint set'))).toEqual(ok)
  expect(await add({ name: 'Ball', details: '', link: '' })).toEqual(ok) // a form with no price field

  const rows = await db.query('select name, price from items where owner_id = $1 order by name', [f.leo.id])
  expect(rows).toEqual([
    { name: 'Ball', price: null },
    { name: 'Drum', price: null },
    { name: 'Kite', price: 'about $25' },
    { name: 'Paint set', price: null },
    { name: 'Sweater', price: '$20–30' },
    { name: 'Yo-yo', price: '40' },
  ])
})

it('a price of 41 characters is refused with the same words as any long field, and 40 is fine', async () => {
  const add = (i: ItemInput) => addItem(db, f.maya, f.leo.id, i)
  expect(await add(input('Kite', { price: 'x'.repeat(41) }))).toEqual(tooLong)
  expect(await add(input('Kite', { price: '💵'.repeat(41) }))).toEqual(tooLong)
  expect(await db.query('select id from items')).toEqual([])

  // Counted in characters as Postgres counts them, after trimming.
  expect(await add(input('Kite', { price: 'x'.repeat(40) }))).toEqual(ok)
  expect(await add(input('Kite', { price: '💵'.repeat(40) }))).toEqual(ok)
  expect(await add(input('Kite', { price: ` ${'y'.repeat(40)} ` }))).toEqual(ok)
  expect(await db.query('select count(*)::int as n from items')).toEqual([{ n: 3 }])
})

it('updateItem sets, changes and clears the price', async () => {
  const kite = await itemRow(db, f.leo.id, 'Kite')
  const edit = (price: string) => updateItem(db, f.maya, kite, input('Kite', { price }))
  expect(await edit(' 40 ')).toEqual(ok)
  expect((await row(kite)).price).toBe('40')
  expect(await edit('about $25')).toEqual(ok)
  expect((await row(kite)).price).toBe('about $25')
  expect(await edit('  ')).toEqual(ok)
  expect((await row(kite)).price).toBeNull()
})

// A page loaded before the price existed can still call this code after a deploy (lib/stale-page.ts),
// and its edit form has no price field. That edit must leave the price alone, not wipe it, and must
// not tell a buyer the item changed when nothing did.
it('updateItem with no price at all keeps the stored price, and a save that changes nothing else keeps updated_at', async () => {
  const kite = await itemRow(db, f.leo.id, 'Kite', { details: 'Red', price: '$30' })
  await backdate(kite)
  const before = (await row(kite)).updated_at
  const oldForm = { name: 'Kite', details: 'Red', link: '' }
  expect(await updateItem(db, f.maya, kite, oldForm)).toEqual(ok)
  expect(await row(kite)).toMatchObject({ name: 'Kite', details: 'Red', price: '$30' })
  expect((await row(kite)).updated_at).toEqual(before)
})

it('updateItem with no price and a new details keeps the stored price, and moves updated_at', async () => {
  const kite = await itemRow(db, f.leo.id, 'Kite', { details: 'Red', price: '$30' })
  await backdate(kite)
  const before = (await row(kite)).updated_at
  expect(await updateItem(db, f.maya, kite, { name: 'Kite', details: 'Blue', link: '' })).toEqual(ok)
  expect(await row(kite)).toMatchObject({ name: 'Kite', details: 'Blue', price: '$30' })
  expect((await row(kite)).updated_at.getTime()).toBeGreaterThan(before.getTime())

  // An item with no price, edited the same way, still has none.
  const yoyo = await itemRow(db, f.leo.id, 'Yo-yo')
  expect(await updateItem(db, f.maya, yoyo, { name: 'Red yo-yo', details: '', link: '' })).toEqual(ok)
  expect(await row(yoyo)).toMatchObject({ name: 'Red yo-yo', price: null })
})

// Postgres answers a NUL in text with an error. No one types one, but a forged request can send it.
it('a NUL character is dropped, so the save is not an error', async () => {
  const withNuls = { name: 'Ki\u0000te', price: '\u000040', details: 'Red\u0000', link: 'example.com/\u0000k' }
  expect(await addItem(db, f.maya, f.leo.id, withNuls)).toEqual(ok)
  const kite = await idOf(f.leo.id, 'Kite')
  expect(await row(kite)).toMatchObject({ name: 'Kite', price: '40', details: 'Red', url: 'https://example.com/k' })

  const onlyNuls = { name: '\u0000Box kite', price: '\u0000', details: '\u0000', link: '\u0000' }
  expect(await updateItem(db, f.maya, kite, onlyNuls)).toEqual(ok)
  expect(await row(kite)).toMatchObject({ name: 'Box kite', price: null, details: null, url: null })
})

it('updateItem: the owner saves, and updated_at moves forward', async () => {
  const feeder = await itemRow(db, f.maya.id, 'Bird feeder')
  await backdate(feeder)
  const before = (await row(feeder)).updated_at

  const edit = { name: ' Bird bath ', price: '', details: 'Stone', link: 'example.com/bath' }
  expect(await updateItem(db, f.maya, feeder, edit)).toEqual(ok)
  const after = await row(feeder)
  expect(after).toMatchObject({
    owner_id: f.maya.id,
    name: 'Bird bath',
    details: 'Stone',
    url: 'https://example.com/bath',
    removed_at: null,
  })
  expect(after.updated_at.getTime()).toBeGreaterThan(before.getTime())

  // A parent edits their kid's item. Blank details and link clear them.
  const kite = await itemRow(db, f.leo.id, 'Kite', { details: 'Red', url: 'https://example.com/kite' })
  expect(await updateItem(db, f.ben, kite, input('Box kite'))).toEqual(ok)
  expect(await row(kite)).toMatchObject({ owner_id: f.leo.id, name: 'Box kite', details: null, url: null })
})

// Gifts I'm buying notes an item changed after it was claimed by comparing updated_at, so a save
// that changes nothing mustn't look like a change.
it('updateItem: a save that changes nothing leaves updated_at alone', async () => {
  const sweater = await itemRow(db, f.leo.id, 'Sweater', {
    details: 'Green, size XS',
    url: 'https://www.asos.com/',
    price: '$30',
  })
  await backdate(sweater)
  const before = (await row(sweater)).updated_at

  const same = { name: 'Sweater ', price: ' $30 ', details: ' Green, size XS', link: 'https://www.asos.com/' }
  expect(await updateItem(db, f.maya, sweater, same)).toEqual(ok)
  expect((await row(sweater)).updated_at).toEqual(before)

  expect(await updateItem(db, f.maya, sweater, { ...same, details: 'Green, size S' })).toEqual(ok)
  expect((await row(sweater)).updated_at.getTime()).toBeGreaterThan(before.getTime())
})

// A new price is a change like any other: a buyer who claimed the item should hear of it.
it('updateItem: a change to the price alone moves updated_at, and so does clearing it', async () => {
  const sweater = await itemRow(db, f.leo.id, 'Sweater', { price: '$30' })
  const edit = async (price: string) => {
    await backdate(sweater)
    const before = (await row(sweater)).updated_at
    expect(await updateItem(db, f.maya, sweater, input('Sweater', { price }))).toEqual(ok)
    return (await row(sweater)).updated_at.getTime() > before.getTime()
  }
  expect(await edit('about $25')).toBe(true)
  expect(await edit('')).toBe(true)
  expect(await edit('  ')).toBe(false) // still none
  expect(await edit('40')).toBe(true)
})

it("updateItem: someone else's item or an unknown id is notAllowed", async () => {
  // Forged: Ben edits Grandma's item by its id, and so does her spouse; Maya edits another
  // household's kid's item.
  const puzzle = await itemRow(db, f.grandma.id, 'Jigsaw puzzle')
  const drum = await itemRow(db, f.ollie.id, 'Drum')
  expect(await updateItem(db, f.ben, puzzle, input('Mine now'))).toStrictEqual(notAllowed)
  expect(await updateItem(db, f.grandpa, puzzle, input('Mine now'))).toStrictEqual(notAllowed)
  expect(await updateItem(db, f.maya, drum, input('Mine now'))).toStrictEqual(notAllowed)
  expect((await row(puzzle)).name).toBe('Jigsaw puzzle')
  expect((await row(drum)).name).toBe('Drum')

  // Someone who couldn't edit it hears nothing of its removal either.
  await remove(puzzle)
  expect(await updateItem(db, f.ben, puzzle, input('Mine now'))).toStrictEqual(notAllowed)

  for (const id of ['not-a-uuid', crypto.randomUUID(), f.maya.id]) {
    expect(await updateItem(db, f.maya, id, input('Bird bath')), id).toStrictEqual(notAllowed)
  }
})

// Ben took Leo's kite off the list while Maya had it open to edit. She can still change Leo's list,
// so "You can't change this list" would be wrong: the item is gone.
it('updateItem: an item taken off the list since the page loaded is gone, for anyone who could edit it', async () => {
  const kite = await itemRow(db, f.leo.id, 'Kite')
  await removeItem(db, f.ben, kite)
  expect(await updateItem(db, f.maya, kite, input('Box kite'))).toStrictEqual(gone)
  expect(await updateItem(db, f.maya, kite, input(''))).toStrictEqual(gone) // not nameRequired
  expect((await row(kite)).name).toBe('Kite')

  const feeder = await itemRow(db, f.maya.id, 'Bird feeder')
  await remove(feeder)
  expect(await updateItem(db, f.maya, feeder, input('Bird bath'))).toStrictEqual(gone)
  expect((await row(feeder)).name).toBe('Bird feeder')
})

it('an item removed while an edit is saving is gone, and stays as it was', async () => {
  const kite = await itemRow(db, f.leo.id, 'Kite')
  // Ben removes it after Maya's edit has passed its checks, just before her save.
  const racing: Db = {
    async query<T>(text: string, params?: unknown[]) {
      if (/^\s*update items\s+set name/.test(text)) await remove(kite)
      return db.query<T>(text, params)
    },
  }
  expect(await updateItem(racing, f.maya, kite, input('Box kite'))).toStrictEqual(gone)
  const after = await row(kite)
  expect(after.name).toBe('Kite')
  expect(after.removed_at).toBeInstanceOf(Date)
})

it('updateItem checks the input as addItem does, and changes nothing when it fails', async () => {
  const kite = await itemRow(db, f.leo.id, 'Kite')
  const update = (i: ItemInput) => updateItem(db, f.maya, kite, i)
  expect(await update(input(' '))).toEqual(nameRequired)
  expect(await update(input('x'.repeat(201)))).toEqual(tooLong)
  expect(await update(input('Kite', { details: 'x'.repeat(501) }))).toEqual(tooLong)
  expect(await update(input('Kite', { price: 'x'.repeat(41) }))).toEqual(tooLong)
  expect(await update(input('Kite', { link: 'javascript:x' }))).toEqual(badLink)
  expect(await row(kite)).toMatchObject({ name: 'Kite', price: null, details: null, url: null })
})

it('removeItem sets removed_at and keeps any claim; a non-editor gets notAllowed', async () => {
  const yoyo = await itemRow(db, f.leo.id, 'Yo-yo')
  await claimRow(db, yoyo, f.grandma.id)
  expect(await removeItem(db, f.grandma, yoyo)).toEqual(notAllowed)
  expect(await removeItem(db, f.sam, yoyo)).toEqual(notAllowed)
  expect((await row(yoyo)).removed_at).toBeNull()

  expect(await removeItem(db, f.ben, yoyo)).toEqual(ok)
  expect((await row(yoyo)).removed_at).toBeInstanceOf(Date)
  // Grandma's claim stays, for her Gifts I'm buying.
  expect(await db.query('select buyer_id from claims where item_id = $1', [yoyo])).toEqual([
    { buyer_id: f.grandma.id },
  ])

  // A second tap is still done, and keeps the first time. A non-editor is still refused.
  await db.query("update items set removed_at = removed_at - interval '1 day' where id = $1", [yoyo])
  const removedAt = (await row(yoyo)).removed_at
  expect(await removeItem(db, f.maya, yoyo)).toEqual(ok)
  expect((await row(yoyo)).removed_at).toEqual(removedAt)
  expect(await removeItem(db, f.grandma, yoyo)).toEqual(notAllowed)

  for (const id of ['not-a-uuid', crypto.randomUUID(), f.leo.id]) {
    expect(await removeItem(db, f.maya, id), id).toEqual(notAllowed)
  }
})

it("the owner's edits and removals answer the same whether or not the item is claimed", async () => {
  const claimed = await itemRow(db, f.maya.id, 'Bird feeder')
  const open = await itemRow(db, f.maya.id, 'Scarf')
  await claimRow(db, claimed, f.priya.id)
  for (const id of [claimed, open]) {
    expect(await updateItem(db, f.maya, id, input('Something else'))).toStrictEqual(ok)
    expect(await removeItem(db, f.maya, id)).toStrictEqual(ok)
    expect(await updateItem(db, f.maya, id, input('Again'))).toStrictEqual(gone)
  }
})
