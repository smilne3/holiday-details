// @vitest-environment node
import { expect, it } from 'vitest'
import { chooseDbMode } from '@/lib/db'

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
