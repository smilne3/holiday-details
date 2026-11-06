import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BuyingView } from '@/components/BuyingView'
import { HomeView } from '@/components/HomeView'
import { ListView } from '@/components/ListView'
import { NotSignedIn } from '@/components/NotSignedIn'
import { HouseholdCard } from '@/components/organizer/HouseholdCard'
import { copy } from '@/lib/copy'
import type { ListViewData } from '@/lib/types'

afterEach(cleanup)

// Text with no spaces in it, as long as each field allows: a shop link pasted into "What is it?"
// (200), a run of sizes and colors in "Size, color, details" (500), a long name for a person (60) or
// a household (80), and a link whose shop name is long. All made up.
const item = `https://shop.example/p/${'x'.repeat(200)}`.slice(0, 200)
const details = 'size-small-color-green-'.repeat(25).slice(0, 500)
const person = 'Grandma'.repeat(9).slice(0, 60)
const household = 'TheGrandparentsHouse'.repeat(4).slice(0, 80)
const url = `https://${'a'.repeat(60)}.${'b'.repeat(60)}.example/`
const words = [item, details, person, household, 'a'.repeat(60)]

// Every bit of text holding one of them sits in an element that wraps a long word (overflow-wrap is
// inherited). jsdom can't lay a page out, so the real check is a browser at 390px; this one keeps a
// new place for typed text from forgetting to wrap it.
function unwrapped(): string[] {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const found: string[] = []
  let seen = 0
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? ''
    if (!words.some(w => text.includes(w.slice(0, 40)))) continue
    seen++
    if (!node.parentElement?.closest('.wrap-anywhere')) found.push(`${node.parentElement?.tagName}: ${text.slice(0, 50)}…`)
  }
  expect(seen).toBeGreaterThan(0)
  return found
}

const ids = {
  owner: '00000000-0000-4000-8000-0000000000a3',
  household: '00000000-0000-4000-8000-0000000000b1',
  item: '00000000-0000-4000-8000-0000000000c1',
}
const actions = {
  claim: vi.fn(async () => 'claimed' as const),
  unclaim: vi.fn(async () => {}),
  add: vi.fn(async () => ({ ok: true as const })),
  update: vi.fn(async () => ({ ok: true as const })),
  remove: vi.fn(async () => ({ ok: true as const })),
}

it('the home page wraps a long name and a long household name', () => {
  render(
    <HomeView
      viewer={{ id: ids.owner, name: person, isOrganizer: true }}
      home={{
        myItemCount: 1,
        buyingCount: 0,
        households: [{ id: ids.household, name: household, members: [{ id: ids.item, name: person, kind: 'kid' }] }],
      }}
    />,
  )
  expect(unwrapped()).toEqual([])
})

it("someone else's list wraps a long item, its details and link, the owner's name, and a buyer's", () => {
  const view: ListViewData = {
    owner: { id: ids.owner, name: person, kind: 'kid' },
    mode: 'kept',
    keptBy: person,
    canEdit: true,
    canClaim: true,
    items: [
      { id: ids.item, name: item, details, url, claim: { buyerName: person, mine: false } },
      { id: '00000000-0000-4000-8000-0000000000c2', name: item, details, url, claim: { buyerName: person, mine: true } },
      { id: '00000000-0000-4000-8000-0000000000c3', name: item, details, url, claim: null },
    ],
  }
  render(<ListView view={view} viewerName={person} homeHref="/p/dev-maya" organizerName={person} actions={actions} />)
  expect(unwrapped()).toEqual([])
  // From md: up the claim sits in a column as wide as its text. Capped, as the ✓ line is, so a long
  // buyer's name can't take the item's room. (The browser check at 1280px measures it.)
  expect(screen.getByText(copy.isBuying(person)).className).toContain('md:max-w-60')
})

it('My wish list wraps a long item and its details', () => {
  const view: ListViewData = {
    owner: { id: ids.owner, name: person, kind: 'adult' },
    mode: 'own',
    keptBy: null,
    canEdit: true,
    canClaim: false,
    items: [{ id: ids.item, name: item, details, url }],
  }
  render(<ListView view={view} viewerName={person} homeHref="/p/dev-maya" organizerName={person} actions={actions} />)
  expect(unwrapped()).toEqual([])
})

it("Gifts I'm buying wraps a long item, its details and link, and who it's for", () => {
  render(
    <BuyingView
      groups={[{ recipient: { id: ids.owner, name: person }, items: [{ id: ids.item, name: item, details, url, note: 'removed' }] }]}
      viewerName={person}
      homeHref="/p/dev-maya"
      organizerName={person}
      unclaim={actions.unclaim}
    />,
  )
  expect(unwrapped()).toEqual([])
})

it('the organizer page wraps a long household name and a long person name, even when asking to remove them', () => {
  const organizerActions = {
    renameHousehold: vi.fn(async () => ({ ok: true as const })),
    addPerson: vi.fn(async () => ({ ok: true as const })),
    updatePerson: vi.fn(async () => ({ ok: true as const })),
    deletePerson: vi.fn(async () => ({ ok: true as const })),
    replaceLink: vi.fn(async () => ({ ok: true as const })),
  }
  render(
    <HouseholdCard
      household={{ id: ids.household, name: household, people: [{ id: ids.item, name: person, kind: 'kid', token: null }] }}
      households={[{ id: ids.household, name: household }]}
      viewerId={ids.owner}
      actions={organizerActions}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: copy.remove }))
  screen.getByText(copy.removePerson(person))
  expect(unwrapped()).toEqual([])
})

it("the tap-the-link page wraps a long organizer's name", () => {
  render(<NotSignedIn organizerName={person} />)
  expect(unwrapped()).toEqual([])
})
