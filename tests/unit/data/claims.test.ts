// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import type { Family } from '@/db/dev-family'
import { claimItem, getBuying, unclaimItem } from '@/lib/data/claims'
import { removeItem, updateItem } from '@/lib/data/lists'
import { getHome } from '@/lib/data/people'
import type { Db } from '@/lib/db/types'
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

// Who holds the claim on an item, or null.
async function buyerOf(itemId: string): Promise<string | null> {
  const [r] = await db.query<{ buyer_id: string }>('select buyer_id from claims where item_id = $1', [itemId])
  return r?.buyer_id ?? null
}

async function claimCount(): Promise<number> {
  const [r] = await db.query<{ n: number }>('select count(*)::int as n from claims')
  return r.n
}

// An item added at a set time, so the order of a list is certain: PGlite's clock ticks in
// milliseconds, so items added one after another can share a created_at.
async function itemAt(
  ownerId: string,
  name: string,
  createdAt: string,
  extra: { details?: string; url?: string; price?: string } = {},
): Promise<string> {
  const id = await itemRow(db, ownerId, name, extra)
  await db.query('update items set created_at = $2, updated_at = $2 where id = $1', [id, createdAt])
  return id
}

// Puts an item's last edit two days back and its claim one day back. Any edit from here on is
// certainly later than the claim, and one from before it certainly earlier.
async function claimedYesterday(itemId: string) {
  await db.query("update items set updated_at = now() - interval '2 days' where id = $1", [itemId])
  await db.query("update claims set created_at = now() - interval '1 day' where item_id = $1", [itemId])
}

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

// A Db that runs `before` ahead of the claims insert, then runs it, or throws in its place.
function aroundInsert(inner: Db, before: () => Promise<unknown>, fail?: unknown): Db {
  return {
    async query<T>(text: string, params?: unknown[]) {
      if (/insert into claims/i.test(text)) {
        await before()
        if (fail !== undefined) throw fail
      }
      return inner.query<T>(text, params)
    },
  }
}

it("Grandma claims an item on Leo's list", async () => {
  const yoyo = await itemRow(db, f.leo.id, 'Yo-yo')
  expect(await claimItem(db, f.grandma, yoyo)).toBe('claimed')
  expect(await buyerOf(yoyo)).toBe(f.grandma.id)
})

it("parents claim from their kids' lists, and spouses from each other's", async () => {
  const lego = await itemRow(db, f.leo.id, 'Any LEGO set')
  const grinder = await itemRow(db, f.ben.id, 'Coffee grinder')
  const mug = await itemRow(db, f.ollie.id, 'Travel mug')
  expect(await claimItem(db, f.maya, lego)).toBe('claimed')
  expect(await claimItem(db, f.maya, grinder)).toBe('claimed')
  expect(await claimItem(db, f.priya, mug)).toBe('claimed')
  expect(await buyerOf(lego)).toBe(f.maya.id)
  expect(await buyerOf(grinder)).toBe(f.maya.id)
  expect(await buyerOf(mug)).toBe(f.priya.id)
})

it("a second claim on a taken item is 'taken'", async () => {
  const yoyo = await itemRow(db, f.leo.id, 'Yo-yo')
  expect(await claimItem(db, f.grandma, yoyo)).toBe('claimed')
  expect(await claimItem(db, f.priya, yoyo)).toBe('taken')
  expect(await buyerOf(yoyo)).toBe(f.grandma.id)
})

it('two claims at the same moment: exactly one wins', async () => {
  const id = await itemRow(db, f.leo.id, 'Sweater')
  const results = await Promise.all([claimItem(db, f.grandma, id), claimItem(db, f.priya, id)])
  expect([...results].sort()).toEqual(['claimed', 'taken'])
  // The one told 'claimed' is the one who holds it.
  expect(await buyerOf(id)).toBe(results[0] === 'claimed' ? f.grandma.id : f.priya.id)
  expect(await claimCount()).toBe(1)
})

it("claiming an item you already hold is still 'claimed', and changes nothing", async () => {
  const yoyo = await itemRow(db, f.leo.id, 'Yo-yo')
  expect(await claimItem(db, f.grandma, yoyo)).toBe('claimed')
  const [before] = await db.query('select * from claims where item_id = $1', [yoyo])
  // A second tab, or a retried tap: 'taken' would tell her someone else is buying it.
  expect(await claimItem(db, f.grandma, yoyo)).toBe('claimed')
  expect(await db.query('select * from claims where item_id = $1', [yoyo])).toStrictEqual([before])
})

it("an owner claiming their own item is 'not-allowed', even when it is taken", async () => {
  const feeder = await itemRow(db, f.maya.id, 'Bird feeder')
  const gloves = await itemRow(db, f.maya.id, 'Gardening gloves')
  await claimRow(db, feeder, f.priya.id)

  const own = recording(db)
  expect(await claimItem(own.db, f.maya, gloves)).toBe('not-allowed')
  expect(await claimItem(own.db, f.maya, feeder)).toBe('not-allowed')
  // The answer is settled before claims are read or written, so it can't depend on one.
  expect(own.sql.length).toBeGreaterThan(0)
  expect(own.sql.filter(q => /claims/i.test(q))).toEqual([])
  expect(await buyerOf(feeder)).toBe(f.priya.id)
  expect(await buyerOf(gloves)).toBeNull()
})

// Postgres reads a uuid in any case. The item's id has letters in it, so capitals change it.
it("an owner's own item is 'not-allowed' with its id in capitals too", async () => {
  const feeder = 'abcdef12-3456-4789-8abc-def123456789'
  await db.query("insert into items (id, owner_id, name) values ($1, $2, 'Bird feeder')", [feeder, f.maya.id])
  expect(await claimItem(db, f.maya, feeder.toUpperCase())).toBe('not-allowed')
  expect(await claimCount()).toBe(0)
})

it("a removed item, an unknown id, or 'not-a-uuid' is 'gone'", async () => {
  const kite = await itemRow(db, f.leo.id, 'Kite')
  await removeItem(db, f.maya, kite)
  expect(await claimItem(db, f.grandma, kite)).toBe('gone')
  expect(await claimItem(db, f.grandma, crypto.randomUUID())).toBe('gone')
  expect(await claimItem(db, f.grandma, 'not-a-uuid')).toBe('gone')
  expect(await claimCount()).toBe(0)

  // The owner's own removed items, one claimed before it went and one not: both are 'gone', so the
  // answer can't say whether anyone was buying it.
  const scarf = await itemRow(db, f.priya.id, 'Scarf')
  const cookbook = await itemRow(db, f.priya.id, 'Cookbook')
  await claimRow(db, scarf, f.sam.id)
  await removeItem(db, f.priya, scarf)
  await removeItem(db, f.priya, cookbook)
  expect(await claimItem(db, f.priya, cookbook)).toBe('gone')
  expect(await claimItem(db, f.priya, scarf)).toBe('gone')
})

it("an item removed between the check and the insert is 'gone', and isn't claimed", async () => {
  const kite = await itemRow(db, f.leo.id, 'Kite')
  const racing = aroundInsert(db, () => removeItem(db, f.maya, kite))
  expect(await claimItem(racing, f.grandma, kite)).toBe('gone')
  expect(await buyerOf(kite)).toBeNull()
})

it("a unique violation on the insert reads as 'taken'; any other failure is thrown", async () => {
  const yoyo = await itemRow(db, f.leo.id, 'Yo-yo')
  // As if Priya's claim landed first and the driver answered with the primary key's violation.
  const lost = aroundInsert(db, () => claimRow(db, yoyo, f.priya.id), { code: '23505' })
  expect(await claimItem(lost, f.grandma, yoyo)).toBe('taken')
  expect(await buyerOf(yoyo)).toBe(f.priya.id)

  // Never a false 'claimed', and never 'taken' for what was really a failure.
  const kite = await itemRow(db, f.leo.id, 'Kite')
  const broken = aroundInsert(db, async () => {}, new Error('connection lost'))
  await expect(claimItem(broken, f.grandma, kite)).rejects.toThrow('connection lost')
  expect(await buyerOf(kite)).toBeNull()
})

it('unclaim removes only your own claim', async () => {
  const sweater = await itemRow(db, f.leo.id, 'Sweater')
  const yoyo = await itemRow(db, f.leo.id, 'Yo-yo')
  await claimRow(db, sweater, f.priya.id)
  await claimRow(db, yoyo, f.grandma.id)

  await unclaimItem(db, f.grandma, sweater)
  expect(await buyerOf(sweater)).toBe(f.priya.id)
  // Not even a parent can clear someone else's claim on their kid's list.
  await unclaimItem(db, f.maya, sweater)
  expect(await buyerOf(sweater)).toBe(f.priya.id)

  await unclaimItem(db, f.grandma, yoyo)
  expect(await buyerOf(yoyo)).toBeNull()
  // Once undone, it's free for anyone.
  expect(await claimItem(db, f.priya, yoyo)).toBe('claimed')

  // A malformed or unknown id does nothing, quietly.
  await expect(unclaimItem(db, f.grandma, 'not-a-uuid')).resolves.toBeUndefined()
  await expect(unclaimItem(db, f.grandma, crypto.randomUUID())).resolves.toBeUndefined()
  expect(await claimCount()).toBe(2)
})

// A removed item stays in Gifts I'm buying until the buyer undoes it, so Undo has to work on it.
it('Undo on a gift whose item was taken off the list clears it, from Gifts I\'m buying and its count', async () => {
  const yoyo = await itemRow(db, f.leo.id, 'Yo-yo')
  expect(await claimItem(db, f.grandma, yoyo)).toBe('claimed')
  await removeItem(db, f.maya, yoyo)
  expect((await getBuying(db, f.grandma))[0].items[0].note).toBe('removed')

  await unclaimItem(db, f.grandma, yoyo)
  expect(await buyerOf(yoyo)).toBeNull()
  expect(await getBuying(db, f.grandma)).toStrictEqual([])
  expect((await getHome(db, f.grandma)).buyingCount).toBe(0)
})

it('getBuying groups my claims by recipient name, with prices, links and details', async () => {
  const sweater = await itemAt(f.leo.id, 'Sweater', '2026-11-01T10:00:00Z', {
    details: 'Green, size XS',
    url: 'https://www.asos.com/',
    price: 'about $25',
  })
  const yoyo = await itemAt(f.leo.id, 'Yo-yo', '2026-11-01T10:01:00Z')
  const paints = await itemAt(f.ivy.id, 'Paint set', '2026-11-01T10:02:00Z', { details: 'Watercolour' })
  const feeder = await itemAt(f.maya.id, 'Bird feeder', '2026-11-01T10:03:00Z')
  const boots = await itemAt(f.ollie.id, 'Rain boots', '2026-11-01T10:04:00Z', {
    url: 'https://example.com/boots',
  })
  // Claimed out of order: the groups go by name, and each group in the order of that person's list.
  for (const id of [boots, yoyo, feeder, sweater, paints]) {
    expect(await claimItem(db, f.grandma, id)).toBe('claimed')
  }

  expect(await getBuying(db, f.grandma)).toStrictEqual([
    {
      recipient: { id: f.ivy.id, name: 'Ivy' },
      items: [{ id: paints, name: 'Paint set', price: null, details: 'Watercolour', url: null, note: null }],
      offList: [],
    },
    {
      recipient: { id: f.leo.id, name: 'Leo' },
      items: [
        {
          id: sweater,
          name: 'Sweater',
          price: 'about $25',
          details: 'Green, size XS',
          url: 'https://www.asos.com/',
          note: null,
        },
        { id: yoyo, name: 'Yo-yo', price: null, details: null, url: null, note: null },
      ],
      offList: [],
    },
    {
      recipient: { id: f.maya.id, name: 'Maya' },
      items: [{ id: feeder, name: 'Bird feeder', price: null, details: null, url: null, note: null }],
      offList: [],
    },
    {
      recipient: { id: f.ollie.id, name: 'Ollie' },
      items: [{ id: boots, name: 'Rain boots', price: null, details: null, url: 'https://example.com/boots', note: null }],
      offList: [],
    },
  ])
  expect(await getBuying(db, f.grandpa)).toStrictEqual([])
})

it("a claimed item edited afterwards is noted 'changed'; one removed afterwards stays, noted 'removed'", async () => {
  const sweater = await itemAt(f.leo.id, 'Sweater', '2026-11-01T10:00:00Z', { details: 'Green, size XS' })
  const yoyo = await itemAt(f.leo.id, 'Yo-yo', '2026-11-01T10:01:00Z')
  const lego = await itemAt(f.leo.id, 'Any LEGO set', '2026-11-01T10:02:00Z')
  const kite = await itemAt(f.leo.id, 'Kite', '2026-11-01T10:03:00Z')
  const scarf = await itemAt(f.leo.id, 'Scarf', '2026-11-01T10:04:00Z')
  for (const id of [sweater, yoyo, lego, kite, scarf]) {
    expect(await claimItem(db, f.grandma, id)).toBe('claimed')
    await claimedYesterday(id)
  }

  const ok = { ok: true }
  // A real edit is a change.
  expect(
    await updateItem(db, f.maya, sweater, { name: 'Sweater', price: '', details: 'Green, size S', link: '' }),
  ).toStrictEqual(ok)
  // Removal keeps the claim, and the item stays in Gifts I'm buying.
  expect(await removeItem(db, f.ben, yoyo)).toStrictEqual(ok)
  // A save that changed nothing isn't a change.
  expect(
    await updateItem(db, f.maya, lego, { name: 'Any LEGO set', price: '', details: '', link: '' }),
  ).toStrictEqual(ok)
  // Edited, then removed: removed says more.
  await updateItem(db, f.maya, kite, { name: 'Red kite', price: '', details: '', link: '' })
  await removeItem(db, f.maya, kite)

  const [leo] = await getBuying(db, f.grandma)
  expect(leo.recipient).toStrictEqual({ id: f.leo.id, name: 'Leo' })
  expect(leo.items).toStrictEqual([
    { id: sweater, name: 'Sweater', price: null, details: 'Green, size S', url: null, note: 'changed' },
    { id: yoyo, name: 'Yo-yo', price: null, details: null, url: null, note: 'removed' },
    { id: lego, name: 'Any LEGO set', price: null, details: null, url: null, note: null },
    { id: kite, name: 'Red kite', price: null, details: null, url: null, note: 'removed' },
    { id: scarf, name: 'Scarf', price: null, details: null, url: null, note: null },
  ])
  // The home screen's count agrees, removed items included.
  expect((await getHome(db, f.grandma)).buyingCount).toBe(5)
})

// The price is part of what the buyer agreed to buy, so a new one, or none, is news to them. The same
// price saved again isn't.
it("a price-only edit after a claim is noted 'changed'; the same price saved again is not", async () => {
  const kite = await itemAt(f.leo.id, 'Kite', '2026-11-01T10:00:00Z', { price: '40' })
  const drum = await itemAt(f.leo.id, 'Drum', '2026-11-01T10:01:00Z', { price: '$30' })
  const yoyo = await itemAt(f.leo.id, 'Yo-yo', '2026-11-01T10:02:00Z', { price: '$5' })
  for (const id of [kite, drum, yoyo]) {
    expect(await claimItem(db, f.grandma, id)).toBe('claimed')
    await claimedYesterday(id)
  }

  const ok = { ok: true }
  const edit = (id: string, name: string, price: string) =>
    updateItem(db, f.maya, id, { name, price, details: '', link: '' })
  expect(await edit(kite, 'Kite', 'about $25')).toStrictEqual(ok) // a new price
  expect(await edit(drum, 'Drum', '')).toStrictEqual(ok) // no price any more
  expect(await edit(yoyo, 'Yo-yo', ' $5 ')).toStrictEqual(ok) // the same, as typed with spaces

  const [leo] = await getBuying(db, f.grandma)
  expect(leo.items.map(i => [i.name, i.price, i.note])).toStrictEqual([
    ['Kite', 'about $25', 'changed'],
    ['Drum', null, 'changed'],
    ['Yo-yo', '$5', null],
  ])
})

it("an edit made before the claim isn't a change", async () => {
  const sweater = await itemRow(db, f.leo.id, 'Sweater')
  await updateItem(db, f.maya, sweater, { name: 'Sweater', price: '', details: 'Size S', link: '' })
  await db.query("update items set updated_at = now() - interval '1 day' where id = $1", [sweater])
  expect(await claimItem(db, f.grandma, sweater)).toBe('claimed')
  expect((await getBuying(db, f.grandma))[0].items[0].note).toBeNull()

  // Claimed in the same tick as its last edit (PGlite's clock is in milliseconds): not a change.
  const yoyo = await itemRow(db, f.leo.id, 'Yo-yo')
  expect(await claimItem(db, f.grandma, yoyo)).toBe('claimed')
  await db.query(
    'update claims set created_at = (select updated_at from items where id = $1) where item_id = $1',
    [yoyo],
  )
  const notes = (await getBuying(db, f.grandma))[0].items.map(i => i.note)
  expect(notes).toStrictEqual([null, null])
})

it("getBuying never includes anyone else's claims", async () => {
  const sweater = await itemRow(db, f.leo.id, 'Sweater')
  const yoyo = await itemRow(db, f.leo.id, 'Yo-yo')
  const feeder = await itemRow(db, f.maya.id, 'Bird feeder')
  const gloves = await itemRow(db, f.maya.id, 'Gardening gloves')
  await claimRow(db, sweater, f.priya.id)
  await claimRow(db, yoyo, f.grandma.id)
  await claimRow(db, feeder, f.priya.id)
  await claimRow(db, gloves, f.ben.id)

  const grandmas = await getBuying(db, f.grandma)
  expect(grandmas.flatMap(g => g.items.map(i => i.id))).toStrictEqual([yoyo])
  // A spouse's claims aren't yours.
  expect(await getBuying(db, f.grandpa)).toStrictEqual([])
  // Maya's own list has two claims on it, and neither reaches her.
  const mayas = await getBuying(db, f.maya)
  expect(mayas).toStrictEqual([])
  expect(JSON.stringify(mayas)).not.toContain('Bird feeder')
  // Ben sees only his own.
  expect((await getBuying(db, f.ben)).flatMap(g => g.items.map(i => i.id))).toStrictEqual([gloves])
})
