import postgres from 'postgres'
import type { Db } from './types'

export function createPostgresDb(url: string): Db {
  const sql = postgres(url, {
    // Encrypted, because every query carries a personal link's token, which is the whole sign-in, or
    // the family's names and lists. postgres.js otherwise connects in plain text, and it reads
    // sslmode only from the URL, which the URI copied from Supabase doesn't have. 'require' encrypts
    // without checking the server's certificate; checking it would need Supabase's CA certificate.
    ssl: 'require',
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
