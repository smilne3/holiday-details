import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { Db } from './types'

// In memory without a dataDir; saved to that folder with one (local dev keeps .pglite).
export async function createPgliteDb(
  opts: { dataDir?: string } = {},
): Promise<Db & { close(): Promise<void> }> {
  const pg = new PGlite(opts.dataDir)
  await migrate(pg)
  return {
    async query<T>(text: string, params?: unknown[]) {
      return (await pg.query<T>(text, params)).rows
    },
    close: () => pg.close(),
  }
}

// Runs each db/migrations/*.sql file in name order, once. A saved database has run some already,
// and rerunning 001 would fail on "already exists", so each one's name is recorded as it runs.
// Supabase never sees this table: its schema is pasted into the SQL Editor by hand.
async function migrate(pg: PGlite): Promise<void> {
  await pg.exec('create table if not exists pglite_migrations (name text primary key)')
  const done = new Set(
    (await pg.query<{ name: string }>('select name from pglite_migrations')).rows.map(r => r.name),
  )
  const dir = path.join(process.cwd(), 'db/migrations')
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()
  for (const name of files.filter(f => !done.has(f))) {
    const sql = await readFile(path.join(dir, name), 'utf8')
    await pg.transaction(async tx => {
      await tx.exec(sql)
      await tx.query('insert into pglite_migrations (name) values ($1)', [name])
    })
  }
}
