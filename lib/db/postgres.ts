import postgres from 'postgres'
import type { Db } from './types'

export function createPostgresDb(url: string): Db {
  const sql = postgres(url, {
    // Supabase's transaction pooler can run each query on a different server connection, where a
    // named prepared statement from an earlier query would not exist.
    prepare: false,
    max: 5,
    connect_timeout: 10,
    idle_timeout: 20,
    // PGlite sends an undefined parameter as null, and postgres.js would throw. Matching PGlite
    // keeps code that passes in tests from failing only in production.
    transform: { undefined: null },
  })
  return {
    // Awaited here because postgres.js only sends a query once something awaits it, and PGlite
    // sends it straight away.
    async query<T>(text: string, params: unknown[] = []) {
      return await sql.unsafe<T[]>(text, params as postgres.ParameterOrJSON<never>[])
    },
  }
}
