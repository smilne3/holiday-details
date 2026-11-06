// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { seedDevItems, type Family } from '@/db/dev-family'
import { createPgliteDb } from '@/lib/db/pglite'
import { isUniqueViolation, type Db } from '@/lib/db/types'
import { claimRow, itemRow, testDb } from '@/tests/helpers/db'

// SQLSTATEs, so each rejection is the constraint under test and not, say, a typo in the insert.
const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'

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

const addPerson = (kind: string, token: string | null) =>
  db.query(
    "insert into people (household_id, name, kind, token) values ($1, 'Zed', $2, $3)",
    [f.households.benMaya, kind, token],
  )

it('a second claim on the same item is a unique violation', async () => {
  const id = await itemRow(db, f.leo.id, 'Yo-yo')
  await claimRow(db, id, f.grandma.id)
  const err = await claimRow(db, id, f.priya.id).then(() => null, (e: unknown) => e)
  expect(err).not.toBeNull()
  expect(isUniqueViolation(err)).toBe(true)
  expect(isUniqueViolation(new Error('something else'))).toBe(false)
  expect(isUniqueViolation(null)).toBe(false)
})

it('an adult needs a token and a kid cannot have one', async () => {
  await expect(addPerson('adult', null)).rejects.toMatchObject({ code: CHECK_VIOLATION })
  await expect(addPerson('kid', 'dev-zed')).rejects.toMatchObject({ code: CHECK_VIOLATION })
  // The same inserts go through once the token matches the kind.
  await addPerson('adult', 'dev-zed')
  await addPerson('kid', null)
})

it('two people cannot share a token', async () => {
  await expect(addPerson('adult', 'dev-maya')).rejects.toMatchObject({ code: UNIQUE_VIOLATION })
})

it('only http(s) links are stored', async () => {
  await expect(itemRow(db, f.leo.id, 'Kite', { url: 'javascript:alert(1)' })).rejects.toMatchObject({
    code: CHECK_VIOLATION,
  })
  const id = await itemRow(db, f.leo.id, 'Kite', { url: 'https://x.com' })
  expect(await db.query('select url from items where id = $1', [id])).toEqual([{ url: 'https://x.com' }])
})

// db/migrations/002_item_price.sql. The price is optional text, so an item without one is null.
it('a price is optional text of up to 40 characters', async () => {
  const none = await itemRow(db, f.leo.id, 'Kite')
  const ok = await itemRow(db, f.leo.id, 'Kite', { price: '💵'.repeat(40) })
  await expect(itemRow(db, f.leo.id, 'Kite', { price: 'x'.repeat(41) })).rejects.toMatchObject({
    code: CHECK_VIOLATION,
  })
  expect(await db.query('select id, price from items order by price nulls first')).toEqual([
    { id: none, price: null },
    { id: ok, price: '💵'.repeat(40) },
  ])
})

it('new_token() is 64 lowercase hex characters and different each call', async () => {
  const [{ a, b }] = await db.query<{ a: string; b: string }>('select new_token() as a, new_token() as b')
  expect(a).toMatch(/^[0-9a-f]{64}$/)
  expect(b).toMatch(/^[0-9a-f]{64}$/)
  expect(a).not.toBe(b)
})

it('the dev family is three households, six adults, three kids, and Maya is the only organizer', async () => {
  expect(
    await db.query(
      `select h.name as household,
              string_agg(p.name || ':' || p.kind, ', ' order by p.name) as members
         from households h join people p on p.household_id = h.id
        group by h.name order by h.name`,
    ),
  ).toEqual([
    { household: 'Ben & Maya', members: 'Ben:adult, Ivy:kid, Leo:kid, Maya:adult' },
    { household: 'Grandma & Grandpa', members: 'Grandma:adult, Grandpa:adult' },
    { household: 'Sam & Priya', members: 'Ollie:kid, Priya:adult, Sam:adult' },
  ])
  expect(await db.query('select name from people where is_organizer')).toEqual([{ name: 'Maya' }])
  expect(await db.query("select name from people where kind = 'adult' and token <> 'dev-' || lower(name)")).toEqual([])

  // The Family object later tests use is the rows just written.
  expect(f.maya).toEqual({
    id: expect.any(String),
    name: 'Maya',
    kind: 'adult',
    householdId: f.households.benMaya,
    token: 'dev-maya',
    isOrganizer: true,
  })
  expect(f.leo).toEqual({ id: expect.any(String), name: 'Leo', kind: 'kid', householdId: f.households.benMaya })
  for (const p of [f.ben, f.maya, f.sam, f.priya, f.grandma, f.grandpa, f.leo, f.ivy, f.ollie]) {
    const [row] = await db.query<{ name: string; household_id: string }>(
      'select name, household_id from people where id = $1',
      [p.id],
    )
    expect(row).toEqual({ name: p.name, household_id: p.householdId })
  }
  const { benMaya, samPriya, grandparents } = f.households
  expect(await db.query('select id, name from households order by name')).toEqual([
    { id: benMaya, name: 'Ben & Maya' },
    { id: grandparents, name: 'Grandma & Grandpa' },
    { id: samPriya, name: 'Sam & Priya' },
  ])
})

// Leo's list shows each way a price can look: a bare number (shown as "$179"), one typed with a $,
// one in words, and none. Maya's own list has one, so the organizer sees a price on her own list.
it("the dev items: four on Leo's list, two of them claimed, and two on every adult's list", async () => {
  await seedDevItems(db, f)
  expect(
    await db.query(
      `select i.name, i.price, i.details, i.url, b.name as buyer
         from items i left join claims c on c.item_id = i.id left join people b on b.id = c.buyer_id
        where i.owner_id = $1 order by i.name`,
      [f.leo.id],
    ),
  ).toEqual([
    {
      name: 'AirPods 5',
      price: '179',
      details: null,
      url: 'https://www.apple.com/shop/buy-airpods/airpods-5',
      buyer: null,
    },
    { name: 'Any LEGO set', price: 'about $25', details: 'He likes the space ones', url: null, buyer: null },
    { name: 'Sweater', price: '$30', details: 'Green, size XS', url: 'https://www.asos.com/', buyer: 'Priya' },
    { name: 'Yo-yo', price: null, details: null, url: null, buyer: 'Grandma' },
  ])
  expect(
    await db.query('select name, price from items where owner_id = $1 order by name', [f.maya.id]),
  ).toEqual([
    { name: 'Bird feeder', price: null },
    { name: 'Gardening gloves', price: '$15-20' },
  ])
  expect(
    await db.query(
      `select p.name, count(i.id)::int as items
         from people p left join items i on i.owner_id = p.id
        where p.kind = 'adult' group by p.name order by p.name`,
    ),
  ).toEqual(['Ben', 'Grandma', 'Grandpa', 'Maya', 'Priya', 'Sam'].map(name => ({ name, items: 2 })))
})

it('a saved database opens again with its rows, without rerunning the schema', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'pglite-'))
  try {
    const first = await createPgliteDb({ dataDir })
    await first.query("insert into households (name) values ('Ben & Maya')")
    await first.close()

    const second = await createPgliteDb({ dataDir })
    expect(await second.query('select name from households')).toEqual([{ name: 'Ben & Maya' }])
    await second.close()
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
}, 20_000)
