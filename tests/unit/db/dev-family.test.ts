// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedDevFamily, seedDevItems } from '@/db/dev-family'
import { createPgliteDb } from '@/lib/db/pglite'
import type { Db } from '@/lib/db/types'

// A Vercel preview can run several server instances at once, and each seeds its own in-memory copy
// of the made-up family. A link one instance writes (Leo's list, an item's "I'll buy this") is often
// answered by another, so every copy has to give the same row the same id.
describe('the made-up family', () => {
  let a: Db & { close(): Promise<void> }
  let b: Db & { close(): Promise<void> }

  beforeAll(async () => {
    a = await createPgliteDb()
    b = await createPgliteDb()
    await seedDevItems(a, await seedDevFamily(a))
    await seedDevItems(b, await seedDevFamily(b))
  })

  afterAll(async () => {
    await a.close()
    await b.close()
  })

  async function ids(db: Db) {
    return {
      households: await db.query('select id, name from households order by name'),
      people: await db.query('select id, name, household_id from people order by name'),
      items: await db.query('select i.id, i.name, i.owner_id from items i order by i.name'),
      claims: await db.query('select item_id, buyer_id from claims order by item_id'),
    }
  }

  it('gets the same ids in every separately seeded copy', async () => {
    const first = await ids(a)
    expect(first.people).toHaveLength(9)
    expect(first.items).toHaveLength(16)
    expect(await ids(b)).toEqual(first)
  })
})
