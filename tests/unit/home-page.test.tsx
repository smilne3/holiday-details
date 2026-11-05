// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import HomePage from '@/app/p/[token]/page'
import type { Family } from '@/db/dev-family'
import { copy } from '@/lib/copy'
import type { Db } from '@/lib/db/types'
import { claimRow, itemRow, testDb } from '@/tests/helpers/db'

// The page gets the made-up family in PGlite. Reading the cookie fails the test: on the first visit
// the browser hasn't stored it yet, so the page has to go by the token in the address.
const dbRef = vi.hoisted(() => ({ db: undefined as Db | undefined }))
vi.mock('@/lib/db', () => ({ getDb: async () => dbRef.db }))
vi.mock('next/headers', () => ({
  cookies: () => {
    throw new Error('the home page must read its token from the address, not the cookie')
  },
}))

let t: Awaited<ReturnType<typeof testDb>>
let f: Family

beforeAll(async () => {
  t = await testDb()
  dbRef.db = t.db
})
beforeEach(async () => {
  f = await t.reset()
})
afterAll(() => t.close())

const open = async (token: string) =>
  renderToStaticMarkup(await HomePage({ params: Promise.resolve({ token }) }))

// Text as it appears in the markup, with & and ' escaped.
const html = (s: string) => renderToStaticMarkup(<>{s}</>)

it("opens the personal link's owner's home page, with no cookie yet", async () => {
  await itemRow(t.db, f.maya.id, 'Bird feeder')
  await claimRow(t.db, await itemRow(t.db, f.leo.id, 'Yo-yo'), f.maya.id)

  const page = await open('dev-maya')
  expect(page).toContain(html(copy.hi('Maya')))
  expect(page).toContain(html(copy.signedInAs('Maya')))
  expect(page).toContain(html(copy.things(1)))
  expect(page).toContain(html(copy.gifts(1)))
  expect(page).toContain(`href="/list/${f.ben.id}"`)
  expect(page).toContain(html(copy.organizerPage))
  expect(page).not.toContain(html(copy.notSignedIn('Maya')))
})

it.each([
  ['a made-up token', 'not-a-real-token'],
  ['a kid-shaped token (kids have no link)', 'dev-leo'],
  ['a NUL character', '\u0000'],
])('shows the page that says to tap the link in the email for %s', async (_, token) => {
  const page = await open(token)
  expect(page).toContain(html(copy.notSignedIn('Maya')))
  expect(page).toContain(html(copy.cantFindEmail('Maya')))
  expect(page).not.toContain(html(copy.shopForFamily))
})
