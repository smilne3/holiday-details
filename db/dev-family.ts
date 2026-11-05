// A made-up family for tests, local dev and the preview demo. The repo is public, so these names
// and items are the only ones that ever appear in it. Each adult's personal link is
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
  const benMaya = await household(db, 'Ben & Maya')
  const samPriya = await household(db, 'Sam & Priya')
  const grandparents = await household(db, 'Grandma & Grandpa')
  return {
    households: { benMaya, samPriya, grandparents },
    ben: await adult(db, benMaya, 'Ben'),
    maya: await adult(db, benMaya, 'Maya', true),
    leo: await kid(db, benMaya, 'Leo'),
    ivy: await kid(db, benMaya, 'Ivy'),
    sam: await adult(db, samPriya, 'Sam'),
    priya: await adult(db, samPriya, 'Priya'),
    ollie: await kid(db, samPriya, 'Ollie'),
    grandma: await adult(db, grandparents, 'Grandma'),
    grandpa: await adult(db, grandparents, 'Grandpa'),
  }
}

// Leo's list is the one in the mockups. Every adult also gets two things, so no list starts empty.
export async function seedDevItems(db: Db, f: Family): Promise<void> {
  await item(db, f.leo, 'AirPods 5', { url: 'https://www.apple.com/shop/buy-airpods/airpods-5' })
  const sweater = await item(db, f.leo, 'Sweater', { details: 'Green, size XS', url: 'https://www.asos.com/' })
  await claim(db, sweater, f.priya)
  const yoyo = await item(db, f.leo, 'Yo-yo')
  await claim(db, yoyo, f.grandma)
  await item(db, f.leo, 'Any LEGO set', { details: 'He likes the space ones' })

  await item(db, f.ben, 'Hiking socks', { details: 'Wool, size L' })
  await item(db, f.ben, 'Coffee grinder')
  await item(db, f.maya, 'Gardening gloves', { details: 'Size M' })
  await item(db, f.maya, 'Bird feeder')
  await item(db, f.sam, 'Board game', { details: 'Something for four players' })
  await item(db, f.sam, 'Travel mug')
  await item(db, f.priya, 'Scarf', { details: 'Not wool' })
  await item(db, f.priya, 'Cookbook')
  await item(db, f.grandma, 'Jigsaw puzzle', { details: '1000 pieces' })
  await item(db, f.grandma, 'Reading lamp')
  await item(db, f.grandpa, 'Crossword book')
  await item(db, f.grandpa, 'Slippers', { details: 'Size 10' })
}

async function household(db: Db, name: string): Promise<string> {
  const [row] = await db.query<{ id: string }>('insert into households (name) values ($1) returning id', [name])
  return row.id
}

async function adult(db: Db, householdId: string, name: string, isOrganizer = false): Promise<Viewer> {
  const token = `dev-${name.toLowerCase()}`
  const [row] = await db.query<{ id: string }>(
    `insert into people (household_id, name, kind, token, is_organizer)
     values ($1, $2, 'adult', $3, $4) returning id`,
    [householdId, name, token, isOrganizer],
  )
  return { id: row.id, name, kind: 'adult', householdId, token, isOrganizer }
}

async function kid(db: Db, householdId: string, name: string): Promise<Person> {
  const [row] = await db.query<{ id: string }>(
    `insert into people (household_id, name, kind) values ($1, $2, 'kid') returning id`,
    [householdId, name],
  )
  return { id: row.id, name, kind: 'kid', householdId }
}

async function item(
  db: Db,
  owner: Person,
  name: string,
  extra: { details?: string; url?: string } = {},
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    'insert into items (owner_id, name, details, url) values ($1, $2, $3, $4) returning id',
    [owner.id, name, extra.details ?? null, extra.url ?? null],
  )
  return row.id
}

async function claim(db: Db, itemId: string, buyer: Person): Promise<void> {
  await db.query('insert into claims (item_id, buyer_id) values ($1, $2)', [itemId, buyer.id])
}
