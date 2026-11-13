import { act, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { BuyingView } from '@/components/BuyingView'
import { ListView } from '@/components/ListView'
import { HouseholdCard } from '@/components/organizer/HouseholdCard'
import { NameForm } from '@/components/organizer/NameForm'
import { copy } from '@/lib/copy'
import type { ListViewData } from '@/lib/types'

// Before the page's JavaScript runs, and on a phone too old to run it at all, the server's HTML is
// all there is. A tap on a button then does nothing, and a form would be sent by the browser itself,
// by GET, with what was typed in the address. So in that HTML:
//   - every button is disabled, which in current browsers also stops Enter from sending a form
//     (Safari 16.3 and older still sends a one-field form: #14)
//   - every form is method="post", so even a form the browser sends puts nothing in the address
//   - a notice says what to do if nothing happens, hidden until CSS alone shows it after about 8s
// and hydration undoes all three.

let roots: Root[] = []
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots = []
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

// Made-up ids. The actions are never called.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const never = () => new Promise<never>(() => {})
const listActions = {
  claim: never,
  unclaim: never,
  add: never,
  update: never,
  remove: never,
  addOffList: never,
  updateOffList: never,
  removeOffList: never,
}
const organizerActions = {
  renameHousehold: never,
  addPerson: never,
  updatePerson: never,
  deletePerson: never,
  replaceLink: never,
}

// Leo's list as Maya, his parent, sees it: one open item, one Maya is buying, one Priya is.
const leoKept: ListViewData = {
  owner: { id: id(1), name: 'Leo', kind: 'kid' },
  mode: 'kept',
  keptBy: 'Ben & Maya',
  canEdit: true,
  canClaim: true,
  items: [
    { id: id(11), name: 'Kite', price: null, details: null, url: 'https://shop.example/kite', claim: null },
    { id: id(12), name: 'Yo-yo', price: null, details: null, url: null, claim: { buyerName: 'Maya', mine: true } },
    { id: id(13), name: 'Sweater', price: null, details: null, url: null, claim: { buyerName: 'Priya', mine: false } },
  ],
  // An off-list gift of Maya's, with its Edit and Remove, and one of Sam's, with neither.
  offList: [
    { id: id(21), name: 'Bike', price: null, details: null, url: null, buyerName: 'Maya', mine: true },
    { id: id(22), name: 'Kite', price: null, details: null, url: null, buyerName: 'Sam', mine: false },
  ],
}

// Every page with buttons, as its parts.
const pages: [string, ReactElement][] = [
  [
    "a kid's list, with claims, the add form and off-list gifts",
    <ListView key="l" view={leoKept} viewerName="Maya" homeHref="/p/dev-maya" organizerName="Maya" actions={listActions} />,
  ],
  [
    "Gifts I'm buying, with an off-list gift",
    <BuyingView
      key="b"
      groups={[
        {
          recipient: { id: id(1), name: 'Leo' },
          items: [{ id: id(12), name: 'Yo-yo', price: null, details: null, url: null, note: null }],
          offList: [{ id: id(21), name: 'Bike', price: null, details: null, url: null }],
        },
      ]}
      viewerName="Maya"
      homeHref="/p/dev-maya"
      organizerName="Maya"
      unclaim={never}
      removeOffList={never}
    />,
  ],
  [
    'an organizer card, with an adult, a kid and the add-person form',
    <HouseholdCard
      key="h"
      household={{
        id: id(2),
        name: 'Ben & Maya',
        people: [
          { id: id(3), name: 'Ben', kind: 'adult', token: 'a'.repeat(64) },
          { id: id(1), name: 'Leo', kind: 'kid', token: null },
        ],
      }}
      households={[{ id: id(2), name: 'Ben & Maya' }]}
      viewerId={id(4)}
      actions={organizerActions}
    />,
  ],
  ['the Add a household form', <NameForm key="n" action={never} label={copy.fieldHouseholdName} buttons={[{ label: copy.addHousehold }]} />],
]

// The server's HTML for it, in the page.
function serverHtml(element: ReactElement): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = renderToString(element)
  document.body.append(container)
  return container
}

const buttons = (container: HTMLElement) => [...container.querySelectorAll('button')]

it.each(pages)("%s: the server's HTML has every button disabled, and every form method=post", (_, element) => {
  const html = serverHtml(element)
  expect(buttons(html).length).toBeGreaterThan(0)
  for (const button of buttons(html)) expect(button.disabled, button.outerHTML).toBe(true)
  for (const form of html.querySelectorAll('form')) {
    expect(form.getAttribute('method')).toBe('post')
    expect(form.hasAttribute('action')).toBe(false)
  }
})

it.each(pages)('%s: once the page is running, every button works and the notice is gone', async (_, element) => {
  const errors = vi.spyOn(console, 'error')
  const mismatches: unknown[] = []
  const html = serverHtml(element)
  await act(async () => {
    roots.push(hydrateRoot(html, element, { onRecoverableError: e => mismatches.push(e) }))
  })
  // The hidden button that stands in for Enter on a form with two buttons stays disabled.
  const shown = buttons(html).filter(b => !b.hidden)
  expect(shown.length).toBeGreaterThan(0)
  for (const button of shown) expect(button.disabled, button.outerHTML).toBe(false)
  expect(html.textContent).not.toContain(copy.ifNothingHappens('Maya'))
  // The first render in the browser matched the server's HTML, so React kept it.
  expect(mismatches).toEqual([])
  expect(errors).not.toHaveBeenCalled()
})

it("the lists and Gifts I'm buying carry the notice in the server's HTML, hidden until CSS shows it", () => {
  for (const [, element] of pages.slice(0, 2)) {
    const notice = [...serverHtml(element).querySelectorAll('p')].find(p => p.textContent === copy.ifNothingHappens('Maya'))
    expect(notice?.className).toContain('show-late')
    expect(notice?.className).toContain('wrap-anywhere')
  }
  // show-late is hidden at first, and an animation with no JavaScript shows it after 8 seconds.
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
  expect(css).toMatch(/\.show-late\s*\{[^}]*visibility:\s*hidden;[^}]*animation:\s*show-late 0s linear 8s forwards;/)
  expect(css).toMatch(/@keyframes show-late\s*\{\s*to\s*\{\s*visibility:\s*visible;?\s*\}\s*\}/)
})

// The spec: nothing in the app may depend on knowing which browser, app or device you're on.
it('the notice names no browser and no setting, only what to do and who to ask', () => {
  expect(copy.ifNothingHappens('Maya')).toBe(
    'If nothing happens when you tap, try another phone, tablet or computer, or ask Maya.',
  )
  expect(copy.ifNothingHappens('Maya')).not.toMatch(/browser|safari|chrome|setting|javascript|update/i)
})
