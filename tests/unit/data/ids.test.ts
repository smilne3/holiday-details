// @vitest-environment node
import { expect, it } from 'vitest'
import { isUuid } from '@/lib/data/ids'

const id = '0b9e4c1e-5f7a-4d2b-9c3e-8a1f2b3c4d5e'

it('accepts a uuid as Postgres writes it, in either case', () => {
  expect(isUuid(id)).toBe(true)
  expect(isUuid(id.toUpperCase())).toBe(true)
  expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true)
})

it('refuses anything else, so a mistyped address never reaches Postgres', () => {
  for (const s of [
    'not-a-uuid',
    '',
    id.replaceAll('-', ''),
    `{${id}}`,
    `${id}\n`,
    ` ${id}`,
    id.slice(0, -1),
    `${id}0`,
    'g' + id.slice(1),
    `${id}' or '1'='1`,
  ]) {
    expect(isUuid(s), JSON.stringify(s)).toBe(false)
  }
})

// A Server Action's arguments come from the browser, so a forged request can send any value. An
// array of one uuid would pass a bare regex test, since it converts to that string.
it('refuses a value that is not a string', () => {
  for (const v of [123, null, undefined, {}, [id]]) {
    expect(isUuid(v as unknown as string), JSON.stringify(v)).toBe(false)
  }
})
