// @vitest-environment node
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import BuyingPage from '@/app/buying/page'
import type { Family } from '@/db/dev-family'
import { copy } from '@/lib/copy'
import type { Db } from '@/lib/db/types'
import type { BuyingGroup } from '@/lib/types'
import { claimRow, itemRow, testDb } from '@/tests/helpers/db'

// The page gets the made-up family in PGlite, and the cookie holds whichever token the test sets.
const dbRef = vi.hoisted(() => ({ db: undefined as Db | undefined }))
const cookie = vi.hoisted(() => ({ token: undefined as string | undefined }))
vi.mock('@/lib/db', () => ({ getDb: async () => dbRef.db }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'hd_person' && cookie.token ? { name, value: cookie.token } : undefined),
  }),
}))

let t: Awaited<ReturnType<typeof testDb>>
let f: Family

beforeAll(async () => {
  t = await testDb()
  dbRef.db = t.db
})
beforeEach(async () => {
  f = await t.reset()
  cookie.token = undefined
})
afterAll(() => t.close())

// Text as it appears in the markup, with & and ' escaped.
const html = (s: string) => renderToStaticMarkup(<>{s}</>)

it('without a working cookie, says to tap the link in the email', async () => {
  for (const token of [undefined, 'not-a-real-token']) {
    cookie.token = token
    const markup = renderToStaticMarkup(await BuyingPage())
    expect(markup).toContain(html(copy.notSignedIn('Maya')))
    expect(markup).not.toContain(html(copy.giftsImBuying))
  }
})

it("Grandma sees her own gifts and no one else's, with the note, and ‹ All lists goes to her home page", async () => {
  const yoyo = await itemRow(t.db, f.leo.id, 'Yo-yo')
  await claimRow(t.db, yoyo, f.grandma.id)
  await claimRow(t.db, await itemRow(t.db, f.leo.id, 'Sweater'), f.priya.id)
  await t.db.query('update items set removed_at = now() where id = $1', [yoyo])

  cookie.token = 'dev-grandma'
  const element = (await BuyingPage()) as ReactElement<{ groups: BuyingGroup[] }>
  expect(element.props.groups.flatMap(g => g.items.map(i => i.name))).toEqual(['Yo-yo'])

  const markup = renderToStaticMarkup(element)
  expect(markup).toContain(html(copy.giftsImBuying))
  expect(markup).toContain(html(copy.forRecipient('Leo')))
  expect(markup).toContain(html(copy.removedFrom('Leo')))
  expect(markup).toContain(html(copy.signedInAs('Grandma')))
  expect(markup).toContain('href="/p/dev-grandma"')
  expect(markup).not.toContain('Sweater')
  expect(markup).not.toContain('Priya')
})

it('someone who is buying nothing sees the empty message', async () => {
  cookie.token = 'dev-ben'
  const markup = renderToStaticMarkup(await BuyingPage())
  expect(markup).toContain(html(copy.buyingEmpty))
  expect(markup).toContain(html(copy.signedInAs('Ben')))
})
