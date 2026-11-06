// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { createPostgresDb } from '@/lib/db/postgres'

// postgres.js itself is a spy: this checks the options production connects with, which PGlite, having
// no network, can't show. The address is made up.
const postgres = vi.hoisted(() => vi.fn(() => ({ unsafe: vi.fn() })))
vi.mock('postgres', () => ({ default: postgres }))

it('connects over TLS, with no prepared statements for the transaction pooler', () => {
  const url = 'postgresql://postgres.example:secret@pooler.example.com:6543/postgres'
  createPostgresDb(url)
  expect(postgres).toHaveBeenCalledOnce()
  expect(postgres).toHaveBeenCalledWith(url, {
    ssl: 'require',
    prepare: false,
    max: 5,
    connect_timeout: 10,
    idle_timeout: 20,
    transform: { undefined: null },
  })
})
