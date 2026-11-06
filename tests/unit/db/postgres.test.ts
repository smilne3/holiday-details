// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { createPostgresDb } from '@/lib/db/postgres'

// postgres.js itself is a spy: this checks the options production connects with, which PGlite, having
// no network, can't show. The address is made up.
const postgres = vi.hoisted(() => vi.fn(() => ({ unsafe: vi.fn() })))
vi.mock('postgres', () => ({ default: postgres }))

// Only the options that matter for safety and correctness are pinned, so tuning the pool's size or
// timeouts doesn't fail a test about TLS.
it('connects over TLS, with no prepared statements for the transaction pooler', () => {
  const url = 'postgresql://postgres.example:secret@pooler.example.com:6543/postgres'
  createPostgresDb(url)
  expect(postgres).toHaveBeenCalledOnce()
  expect(postgres).toHaveBeenCalledWith(
    url,
    expect.objectContaining({ ssl: 'require', prepare: false, transform: { undefined: null } }),
  )
})
