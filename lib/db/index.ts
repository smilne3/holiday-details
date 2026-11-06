import { seedDevFamily, seedDevItems } from '@/db/dev-family'
import { createPostgresDb } from './postgres'
import type { Db } from './types'

export type DbMode = 'postgres' | 'dev' | 'demo'

// DATABASE_URL wins whenever it's set: that's the real family, in Supabase. DEMO_DATA=1 matters only
// when DATABASE_URL isn't set, in a production build such as a Vercel preview, and then shows the
// made-up family. So what keeps real data out of previews is DATABASE_URL being set for Vercel's
// Production environment only (docs/go-live.md step 3.5), not DEMO_DATA. Local dev keeps the
// made-up family in .pglite.
export function chooseDbMode(env: Record<string, string | undefined>): DbMode {
  if (env.DATABASE_URL) return 'postgres'
  if (env.NODE_ENV !== 'production') return 'dev'
  if (env.DEMO_DATA === '1') return 'demo'
  throw new Error('DATABASE_URL is not set. Set it for production, or DEMO_DATA=1 for the made-up family.')
}

// Kept on globalThis, which survives Next's dev hot reloads, so .pglite is opened only once.
const cache = globalThis as typeof globalThis & { wishListsDb?: Promise<Db> }

export function getDb(): Promise<Db> {
  cache.wishListsDb ??= openDb().catch(e => {
    cache.wishListsDb = undefined // let the next request try again
    throw e
  })
  return cache.wishListsDb
}

async function openDb(): Promise<Db> {
  const mode = chooseDbMode(process.env)
  if (mode === 'postgres') return createPostgresDb(process.env.DATABASE_URL!)

  // Imported only here, so production never loads PGlite.
  const { createPgliteDb } = await import('./pglite')
  const db = await createPgliteDb(mode === 'dev' ? { dataDir: '.pglite' } : {})
  const [{ households }] = await db.query<{ households: number }>(
    'select count(*)::int as households from households',
  )
  if (mode === 'demo' || households === 0) await seedDevItems(db, await seedDevFamily(db))
  return db
}
