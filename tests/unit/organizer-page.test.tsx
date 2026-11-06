// @vitest-environment node
import { isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import {
  addPersonAction,
  createHouseholdAction,
  deletePersonAction,
  renameHouseholdAction,
  replaceLinkAction,
  updatePersonAction,
} from '@/app/organizer/actions'
import OrganizerPage from '@/app/organizer/page'
import { HouseholdCard } from '@/components/organizer/HouseholdCard'
import { NameForm } from '@/components/organizer/NameForm'
import { copy } from '@/lib/copy'
import type { Db } from '@/lib/db/types'
import { testDb } from '@/tests/helpers/db'

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

beforeAll(async () => {
  t = await testDb()
  dbRef.db = t.db
})
beforeEach(async () => {
  await t.reset()
  cookie.token = undefined
})
afterAll(() => t.close())

// Text as it appears in the markup, with & and ' escaped.
const html = (s: string) => renderToStaticMarkup(<>{s}</>)

it('without a working cookie, says to tap the link in the email', async () => {
  for (const token of [undefined, 'not-a-real-token']) {
    cookie.token = token
    const markup = renderToStaticMarkup(await OrganizerPage())
    expect(markup).toContain(html(copy.notSignedIn('Maya')))
    expect(markup).not.toContain(html(copy.organizerPage))
    expect(markup).not.toContain('dev-ben')
  }
})

it('answers not found for Ben, who is signed in but not the organizer', async () => {
  cookie.token = 'dev-ben'
  await expect(OrganizerPage()).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
})

it('Maya sees every household, Signed in as Maya, and ‹ All lists goes to her home page', async () => {
  cookie.token = 'dev-maya'
  const markup = renderToStaticMarkup(await OrganizerPage())
  expect(markup).toContain(html(copy.organizerPage))
  expect(markup).toContain(html(copy.signedInAs('Maya')))
  expect(markup).toContain('href="/p/dev-maya"')
  for (const name of ['Ben & Maya', 'Sam & Priya', 'Grandma & Grandpa', 'Ben', 'Leo', 'Ollie', 'Grandpa']) {
    expect(markup).toContain(html(name))
  }
  expect(markup).toContain(html(copy.copyLink))
  expect(markup).toContain(html(copy.addHousehold))
  expect(markup).toContain(html(copy.addAdult))
  expect(markup).toContain(html(copy.addKid))
  // Five adults' rows can have their link replaced; Maya's own can't.
  expect(markup.split(html(copy.replaceLink)).length - 1).toBe(5)
  expect(markup).toContain(html(copy.ifNothingHappens('Maya')))
})

// The elements the page itself puts together, without rendering what's inside each component.
function elements(node: ReactNode): { type: unknown; props: Record<string, unknown> }[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<{ children?: ReactNode }>(node)) return []
  return [node as never, ...elements(node.props.children)]
}

it("Add a household keeps what was typed across a reload after a deploy, under the key 'add-household'", async () => {
  cookie.token = 'dev-maya'
  const form = elements(await OrganizerPage()).find(e => e.type === NameForm && e.props.action === createHouseholdAction)
  expect(form?.props.draftKey).toBe('add-household')
})

// Each control gets the Server Action it names. Swapping two of the same shape, deletePerson and
// replaceLink, would still type-check, and Remove would replace a link.
it("hands every household card exactly the five organizer actions, each under its own name", async () => {
  cookie.token = 'dev-maya'
  const cards = elements(await OrganizerPage()).filter(e => e.type === HouseholdCard)
  expect(cards).toHaveLength(3)
  const expected = {
    renameHousehold: renameHouseholdAction,
    addPerson: addPersonAction,
    updatePerson: updatePersonAction,
    deletePerson: deletePersonAction,
    replaceLink: replaceLinkAction,
  }
  for (const card of cards) {
    const actions = card.props.actions as Record<string, unknown>
    expect(Object.keys(actions).sort()).toEqual(Object.keys(expected).sort())
    for (const [name, action] of Object.entries(expected)) expect(actions[name], name).toBe(action)
  }
})
