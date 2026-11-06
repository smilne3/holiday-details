// A made-up family for tests, local dev and the preview demo. The repo is public, so this is the
// only family it names. Tests and comments may add an obvious placeholder for someone outside it
// (Zed, "The Smiths"), and no real name or item ever appears. Each adult's personal link is
// /p/dev-<lowercase name>, e.g. /p/dev-maya for the organizer.
import type { Db } from '@/lib/db/types'
import type { Person, Viewer } from '@/lib/types'

export interface Family {
  households: { benMaya: string; samPriya: string; grandparents: string }
  ben: Viewer
  maya: Viewer
  sam: Viewer
  priya: Viewer
  grandma: Viewer
  grandpa: Viewer
  leo: Person
  ivy: Person
  ollie: Person
}

export async function seedDevFamily(db: Db): Promise<Family> {
  const hid = fixedIds(1)
  const pid = fixedIds(2)
  const benMaya = await household(db, hid(), 'Ben & Maya')
  const samPriya = await household(db, hid(), 'Sam & Priya')
  const grandparents = await household(db, hid(), 'Grandma & Grandpa')
  return {
    households: { benMaya, samPriya, grandparents },
    ben: await adult(db, pid(), benMaya, 'Ben'),
    maya: await adult(db, pid(), benMaya, 'Maya', true),
    leo: await kid(db, pid(), benMaya, 'Leo'),
    ivy: await kid(db, pid(), benMaya, 'Ivy'),
    sam: await adult(db, pid(), samPriya, 'Sam'),
    priya: await adult(db, pid(), samPriya, 'Priya'),
    ollie: await kid(db, pid(), samPriya, 'Ollie'),
    grandma: await adult(db, pid(), grandparents, 'Grandma'),
    grandpa: await adult(db, pid(), grandparents, 'Grandpa'),
  }
}

// Leo's list is the one in the mockups. Everyone else gets two things, so no list starts empty and a
// preview shows every kind of list with something on it. Ivy's and Ollie's come last, so adding them
// moved no one else's ids.
export async function seedDevItems(db: Db, f: Family): Promise<void> {
  const iid = fixedIds(3)
  const item = (owner: Person, name: string, extra?: { details?: string; url?: string }) =>
    addItem(db, iid(), owner, name, extra)
  await item(f.leo, 'AirPods 5', { url: 'https://www.apple.com/shop/buy-airpods/airpods-5' })
  const sweater = await item(f.leo, 'Sweater', { details: 'Green, size XS', url: 'https://www.asos.com/' })
  await claim(db, sweater, f.priya)
  const yoyo = await item(f.leo, 'Yo-yo')
  await claim(db, yoyo, f.grandma)
  await item(f.leo, 'Any LEGO set', { details: 'He likes the space ones' })

  await item(f.ben, 'Hiking socks', { details: 'Wool, size L' })
  await item(f.ben, 'Coffee grinder')
  await item(f.maya, 'Gardening gloves', { details: 'Size M' })
  await item(f.maya, 'Bird feeder')
  await item(f.sam, 'Board game', { details: 'Something for four players' })
  await item(f.sam, 'Travel mug')
  await item(f.priya, 'Scarf', { details: 'Not wool' })
  await item(f.priya, 'Cookbook')
  await item(f.grandma, 'Jigsaw puzzle', { details: '1000 pieces' })
  await item(f.grandma, 'Reading lamp')
  await item(f.grandpa, 'Crossword book')
  await item(f.grandpa, 'Slippers', { details: 'Size 10' })
  await item(f.ivy, 'Paint set', { details: 'Watercolours' })
  await item(f.ivy, 'Sticker book')
  await item(f.ollie, 'Rain boots', { details: 'Kids size 12' })
  await item(f.ollie, 'Dinosaur book')
}

// Fixed ids, the same in every copy of the family. A Vercel preview can run several server
// instances, each seeding its own in-memory copy, and a link written by one (Leo's list, an item's
// "I'll buy this") is often answered by another. With random ids, that other copy had never heard
// of the list. Each kind of row gets its own range: households 1xxx, people 2xxx, items 3xxx.
function fixedIds(kind: number): () => string {
  let n = 0
  return () => `00000000-0000-4000-8000-${String(kind * 1000 + ++n).padStart(12, '0')}`
}

async function household(db: Db, id: string, name: string): Promise<string> {
  await db.query('insert into households (id, name) values ($1, $2)', [id, name])
  return id
}

async function adult(db: Db, id: string, householdId: string, name: string, isOrganizer = false): Promise<Viewer> {
  const token = `dev-${name.toLowerCase()}`
  await db.query(
    `insert into people (id, household_id, name, kind, token, is_organizer)
     values ($1, $2, $3, 'adult', $4, $5)`,
    [id, householdId, name, token, isOrganizer],
  )
  return { id, name, kind: 'adult', householdId, token, isOrganizer }
}

async function kid(db: Db, id: string, householdId: string, name: string): Promise<Person> {
  await db.query(`insert into people (id, household_id, name, kind) values ($1, $2, $3, 'kid')`, [
    id,
    householdId,
    name,
  ])
  return { id, name, kind: 'kid', householdId }
}

async function addItem(
  db: Db,
  id: string,
  owner: Person,
  name: string,
  extra: { details?: string; url?: string } = {},
): Promise<string> {
  await db.query('insert into items (id, owner_id, name, details, url) values ($1, $2, $3, $4, $5)', [
    id,
    owner.id,
    name,
    extra.details ?? null,
    extra.url ?? null,
  ])
  return id
}

async function claim(db: Db, itemId: string, buyer: Person): Promise<void> {
  await db.query('insert into claims (item_id, buyer_id) values ($1, $2)', [itemId, buyer.id])
}
