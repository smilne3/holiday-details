import { seedDevFamily, type Family } from '@/db/dev-family'
import { createPgliteDb } from '@/lib/db/pglite'
import type { Db } from '@/lib/db/types'

// One in-memory PGlite per test file, since start-up takes about a second. Open it in beforeAll,
// call reset() in beforeEach for a fresh family (new ids each time), and close it in afterAll.
export async function testDb(): Promise<{
  db: Db
  family: Family
  reset(): Promise<Family>
  close(): Promise<void>
}> {
  const pg = await createPgliteDb()
  return {
    db: pg,
    family: await seedDevFamily(pg),
    async reset() {
      await pg.query('truncate claims, items, people, households restart identity cascade')
      return seedDevFamily(pg)
    },
    close: () => pg.close(),
  }
}

// Raw inserts, for tests that come before the data layer.
export async function itemRow(
  db: Db,
  ownerId: string,
  name: string,
  extra: { details?: string; url?: string } = {},
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    'insert into items (owner_id, name, details, url) values ($1, $2, $3, $4) returning id',
    [ownerId, name, extra.details ?? null, extra.url ?? null],
  )
  return row.id
}

export async function claimRow(db: Db, itemId: string, buyerId: string): Promise<void> {
  await db.query('insert into claims (item_id, buyer_id) values ($1, $2)', [itemId, buyerId])
}
