// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedDevFamily, seedDevItems, type Family } from '@/db/dev-family'
import { createPgliteDb } from '@/lib/db/pglite'
import type { Db } from '@/lib/db/types'

// A Vercel preview can run several server instances at once, and each seeds its own in-memory copy
// of the made-up family. A link one instance writes (Leo's list, an item's "I'll buy this") is often
// answered by another, so every copy has to give the same row the same id.
describe('the made-up family', () => {
  let a: Db & { close(): Promise<void> }
  let b: Db & { close(): Promise<void> }
  let family: Family

  beforeAll(async () => {
    a = await createPgliteDb()
    b = await createPgliteDb()
    family = await seedDevFamily(a)
    await seedDevItems(a, family)
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
    expect(first.items).toHaveLength(20)
    expect(await ids(b)).toEqual(first)
  })

  // A preview should show every kind of list with something on it, a kid's included.
  it('starts no one with an empty list', async () => {
    const empty = await a.query('select name from people p where not exists (select 1 from items where owner_id = p.id)')
    expect(empty).toEqual([])
  })

  // Both copies above come from one loaded module, so ids random per server process would pass
  // there. These literals are what every server instance's copy must hold.
  it('gives each row the same literal id, whichever process seeds it', async () => {
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
    expect(family.households).toStrictEqual({ benMaya: id(1001), samPriya: id(1002), grandparents: id(1003) })
    const people = await a.query<{ name: string; id: string }>('select name, id from people order by id')
    expect(Object.fromEntries(people.map(p => [p.name, p.id]))).toStrictEqual({
      Ben: id(2001),
      Maya: '00000000-0000-4000-8000-000000002002',
      Leo: id(2003),
      Ivy: id(2004),
      Sam: id(2005),
      Priya: id(2006),
      Ollie: id(2007),
      Grandma: id(2008),
      Grandpa: id(2009),
    })
    expect(family.maya.id).toBe('00000000-0000-4000-8000-000000002002')
    const [sweater] = await a.query<{ id: string }>("select id from items where name = 'Sweater'")
    expect(sweater.id).toBe('00000000-0000-4000-8000-000000003002')
  })
})
