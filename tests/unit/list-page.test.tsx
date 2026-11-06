// @vitest-environment node
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import ListPage from '@/app/list/[personId]/page'
import {
  addItemAction,
  claimAction,
  removeItemAction,
  unclaimAction,
  updateItemAction,
} from '@/app/list/actions'
import type { ListActions } from '@/components/ListView'
import type { Family } from '@/db/dev-family'
import { copy } from '@/lib/copy'
import type { Db } from '@/lib/db/types'
import type { ListViewData } from '@/lib/types'
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

const page = (personId: string) => ListPage({ params: Promise.resolve({ personId }) })

// Text as it appears in the markup, with & and ' escaped.
const html = (s: string) => renderToStaticMarkup(<>{s}</>)

it('without a working cookie, says to tap the link in the email', async () => {
  for (const token of [undefined, 'not-a-real-token']) {
    cookie.token = token
    const markup = renderToStaticMarkup(await page(f.leo.id))
    expect(markup).toContain(html(copy.notSignedIn('Maya')))
    expect(markup).not.toContain(html(copy.listTitle('Leo')))
  }
})

it.each([
  ['a malformed id', 'not-a-uuid'],
  ['an id that is no one', '00000000-0000-4000-8000-000000000000'],
])("answers not found for %s", async (_, personId) => {
  cookie.token = 'dev-grandma'
  await expect(page(personId)).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
})

it("Grandma sees Leo's list with its keepers and claims, and ‹ All lists goes to her home page", async () => {
  await claimRow(t.db, await itemRow(t.db, f.leo.id, 'Sweater'), f.priya.id)
  await itemRow(t.db, f.leo.id, 'Kite')
  cookie.token = 'dev-grandma'
  const markup = renderToStaticMarkup(await page(f.leo.id))
  expect(markup).toContain(html(copy.listTitle('Leo')))
  expect(markup).toContain(html(copy.keptByLine(['Ben', 'Maya'])))
  expect(markup).toContain(html(copy.isBuying('Priya')))
  expect(markup).toContain(html(copy.illBuyThis))
  expect(markup).toContain(html(copy.signedInAs('Grandma')))
  expect(markup).toContain('href="/p/dev-grandma"')
  expect(markup).not.toContain(html(copy.edit))
  // For a phone whose buttons never come to life, hidden until CSS shows it: ask the organizer.
  expect(markup).toContain(html(copy.ifNothingHappens('Maya')))
})

it("Maya's own list hands the page no claim at all, though Ben is buying one of her things", async () => {
  await claimRow(t.db, await itemRow(t.db, f.maya.id, 'Bird feeder'), f.ben.id)
  cookie.token = 'dev-maya'
  const element = (await page(f.maya.id)) as ReactElement<{ view: ListViewData }>
  const items = element.props.view.items
  expect(items.map(i => i.name)).toEqual(['Bird feeder'])
  expect(items.every(i => !('claim' in i))).toBe(true)

  const markup = renderToStaticMarkup(element)
  expect(markup).toContain(html(copy.myWishList))
  expect(markup).toContain(html(copy.ownListNote))
  expect(markup).not.toContain('Ben')
  expect(markup).not.toContain(html(copy.illBuyThis))
})

// Each control gets the Server Action it names, and the page hands over nothing else.
it('hands the list exactly the five list actions, each under its own name', async () => {
  cookie.token = 'dev-grandma'
  const element = (await page(f.leo.id)) as ReactElement<{ actions: ListActions }>
  const expected = {
    claim: claimAction,
    unclaim: unclaimAction,
    add: addItemAction,
    update: updateItemAction,
    remove: removeItemAction,
  }
  const actions = element.props.actions as unknown as Record<string, unknown>
  expect(Object.keys(actions).sort()).toEqual(Object.keys(expected).sort())
  for (const [name, action] of Object.entries(expected)) expect(actions[name], name).toBe(action)
})
