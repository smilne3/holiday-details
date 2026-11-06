// The one thing the app needs from a database. postgres.js (production) and PGlite (tests, local
// dev, preview demo) both sit behind it, so the same SQL runs in both. Parameters are $1, $2…, and
// counts are cast ::int, because the two parse bigint differently.
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>
}

// Postgres's unique_violation. Both drivers put the SQLSTATE on the error's `code`.
export function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null | undefined)?.code === '23505'
}
