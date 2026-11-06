// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { chooseDbMode, getDb } from '@/lib/db'

// For getDb: Supabase, the made-up family's seed, and PGlite itself are all spies, so the test can
// see which of them production touches.
const createPostgresDb = vi.hoisted(() => vi.fn(() => ({ query: vi.fn() })))
const seed = vi.hoisted(() => ({ family: vi.fn(), items: vi.fn() }))
const PGlite = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db/postgres', () => ({ createPostgresDb }))
vi.mock('@/db/dev-family', () => ({ seedDevFamily: seed.family, seedDevItems: seed.items }))
vi.mock('@electric-sql/pglite', () => ({ PGlite }))

const cache = globalThis as typeof globalThis & { wishListsDb?: unknown }

afterEach(() => {
  vi.unstubAllEnvs()
  cache.wishListsDb = undefined
})

it('DATABASE_URL means Postgres, even when DEMO_DATA is set too', () => {
  expect(chooseDbMode({ DATABASE_URL: 'x', NODE_ENV: 'production' })).toBe('postgres')
  expect(chooseDbMode({ DATABASE_URL: 'x', DEMO_DATA: '1', NODE_ENV: 'production' })).toBe('postgres')
})

it('local development uses the dev family in .pglite', () => {
  expect(chooseDbMode({ NODE_ENV: 'development' })).toBe('dev')
})

it('production without DATABASE_URL shows the demo family only when DEMO_DATA=1, and refuses otherwise', () => {
  expect(chooseDbMode({ NODE_ENV: 'production', DEMO_DATA: '1' })).toBe('demo')
  expect(() => chooseDbMode({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/)
})

// The seed's organizer link, dev-maya, is in this public repo. Seeded into the real database, it
// would hand anyone who reads the repo the Organizer page, and with it every relative's link.
it('production opens Supabase and nothing else: no seed, and no PGlite', async () => {
  const url = 'postgresql://postgres.example:secret@pooler.example.com:6543/postgres'
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('DATABASE_URL', url)
  vi.stubEnv('DEMO_DATA', '1')
  cache.wishListsDb = undefined

  const db = await getDb()

  expect(createPostgresDb).toHaveBeenCalledOnce()
  expect(createPostgresDb).toHaveBeenCalledWith(url)
  expect(db).toBe(createPostgresDb.mock.results[0].value)
  expect(seed.family).not.toHaveBeenCalled()
  expect(seed.items).not.toHaveBeenCalled()
  expect(PGlite).not.toHaveBeenCalled()
})
