import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BuyingView } from '@/components/BuyingView'
import { copy } from '@/lib/copy'
import type { BuyingGroup } from '@/lib/types'
import { redirectTo, staleAction, watchReload } from '@/tests/helpers/leaving'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Grandma's Gifts I'm buying, as getBuying returns it: Leo's sweater and yo-yo (the yo-yo since
// taken off his list), and Priya's scarf, edited after Grandma claimed it. The ids and links are
// made up.
const leo = { id: '00000000-0000-4000-8000-0000000000a3', name: 'Leo' }
const priya = { id: '00000000-0000-4000-8000-0000000000a5', name: 'Priya' }
const sweaterUrl = 'https://www.asos.com/women/jumpers/green-sweater/prd/123?clr=green&utm_source=list'
const sweater = { id: '00000000-0000-4000-8000-0000000000c2', name: 'Sweater', details: 'Green, size XS', url: sweaterUrl, note: null }
const yoyo = { id: '00000000-0000-4000-8000-0000000000c3', name: 'Yo-yo', details: null, url: null, note: 'removed' as const }
const scarf = { id: '00000000-0000-4000-8000-0000000000c5', name: 'Scarf', details: 'Not wool', url: null, note: 'changed' as const }

const grandmas: BuyingGroup[] = [
  { recipient: leo, items: [sweater, yoyo] },
  { recipient: priya, items: [scarf] },
]

// The unclaim fake answers only when the test says so, the way a slow network would.
function show(groups: BuyingGroup[] = grandmas, viewerName = 'Grandma') {
  const undone = Promise.withResolvers<void>()
  const unclaim = vi.fn<(itemId: string) => Promise<void>>(() => undone.promise)
  const homeHref = `/p/dev-${viewerName.toLowerCase()}`
  const view = (g: BuyingGroup[]) => (
    <BuyingView groups={g} viewerName={viewerName} homeHref={homeHref} unclaim={unclaim} />
  )
  const rendered = render(view(groups))
  return { unclaim, undone, rerender: (g: BuyingGroup[]) => rendered.rerender(view(g)) }
}

// The section under a person's heading, and the card an item's name is on.
const section = (name: string) => screen.getByRole('region', { name: copy.forRecipient(name) })
const row = (name: string) => screen.getByText(name).closest('li')!
const undoIn = (name: string) => within(row(name)).getByRole('button', { name: copy.undo })

it('groups under For Leo, with details and the shop link', () => {
  show()
  expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
    copy.forRecipient('Leo'),
    copy.forRecipient('Priya'),
  ])
  within(section('Leo')).getByText('Sweater')
  within(section('Leo')).getByText('Green, size XS')
  within(section('Leo')).getByText('Yo-yo')
  within(section('Priya')).getByText('Scarf')
  expect(within(section('Priya')).queryByText('Sweater')).toBeNull()

  // The link reads asos.com ↗, opens in a new tab, and keeps the whole address.
  const link = within(row('Sweater')).getByRole('link')
  expect(link.textContent).toBe('asos.com ↗')
  expect(link.getAttribute('href')).toBe(sweaterUrl)
  expect(link.getAttribute('target')).toBe('_blank')
  expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  expect(within(row('Yo-yo')).queryByRole('link')).toBeNull()
})

it("notes read Removed from Leo's list and Changed after you claimed it", () => {
  show()
  within(row('Yo-yo')).getByText(copy.removedFrom('Leo'))
  within(row('Scarf')).getByText(copy.changedAfterClaim)
  expect(within(row('Sweater')).queryByText(copy.removedFrom('Leo'))).toBeNull()
  expect(within(row('Sweater')).queryByText(copy.changedAfterClaim)).toBeNull()
})

it('Undo calls unclaim with the item id', async () => {
  const { unclaim, undone } = show()
  fireEvent.click(undoIn('Yo-yo'))
  expect(unclaim).toHaveBeenCalledOnce()
  expect(unclaim).toHaveBeenCalledWith(yoyo.id)

  // Still there until the server says so; a second tap while it saves does nothing.
  const saving = within(row('Yo-yo')).getByRole('button', { name: copy.saving })
  expect(saving).toHaveProperty('disabled', true)
  fireEvent.click(saving)
  expect(unclaim).toHaveBeenCalledOnce()
  // The other rows' Undo still work on their own.
  expect(undoIn('Sweater')).toHaveProperty('disabled', false)

  await act(async () => undone.resolve())
  expect(screen.queryByText('Yo-yo')).toBeNull()
  screen.getByText('Sweater')
})

it('two taps that land before the page redraws still make one call', async () => {
  const { unclaim, undone } = show()
  const button = undoIn('Sweater')
  act(() => {
    button.click()
    button.click()
  })
  expect(unclaim).toHaveBeenCalledOnce()
  await act(async () => undone.resolve())
})

it("an Undo that fails says That didn't save. Please try again. and keeps the gift", async () => {
  const { unclaim, undone } = show()
  fireEvent.click(undoIn('Yo-yo'))
  await act(async () => undone.reject(new Error('the network dropped')))
  within(row('Yo-yo')).getByText(copy.saveFailed)
  within(row('Yo-yo')).getByText(copy.removedFrom('Leo'))
  expect(undoIn('Yo-yo')).toHaveProperty('disabled', false)
  // Only that row says so.
  expect(screen.getAllByText(copy.saveFailed)).toHaveLength(1)

  // Trying again works, and the failure note goes with the row.
  unclaim.mockResolvedValueOnce()
  fireEvent.click(undoIn('Yo-yo'))
  await act(async () => {})
  expect(screen.queryByText('Yo-yo')).toBeNull()
  expect(screen.queryByText(copy.saveFailed)).toBeNull()
  expect(unclaim).toHaveBeenCalledTimes(2)
})

it("undoing someone's last gift takes their heading too, and the last of all shows the empty message", async () => {
  const { unclaim } = show()
  unclaim.mockResolvedValue()
  fireEvent.click(undoIn('Scarf'))
  await act(async () => {})
  expect(screen.queryByRole('heading', { name: copy.forRecipient('Priya') })).toBeNull()
  screen.getByRole('heading', { name: copy.forRecipient('Leo') })

  fireEvent.click(undoIn('Sweater'))
  await act(async () => {})
  fireEvent.click(undoIn('Yo-yo'))
  await act(async () => {})
  expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  screen.getByText(copy.buyingEmpty)
})

it('follows the page when a refresh brings a gift back, so nothing it holds is hidden', async () => {
  const { unclaim, rerender } = show()
  unclaim.mockResolvedValue()
  fireEvent.click(undoIn('Yo-yo'))
  await act(async () => {})
  expect(screen.queryByText('Yo-yo')).toBeNull()

  // Claimed again in another tab, then this page refreshed.
  rerender([{ recipient: leo, items: [sweater, { ...yoyo, note: null }] }])
  screen.getByText('Yo-yo')
  undoIn('Yo-yo')
})

it('empty shows the empty message', () => {
  show([])
  screen.getByText(copy.buyingEmpty)
  expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
})

it('shows Signed in as Maya and ‹ All lists', () => {
  show(grandmas, 'Maya')
  screen.getByRole('heading', { level: 1, name: copy.giftsImBuying })
  screen.getByText(copy.signedInAs('Maya'))
  expect(screen.getByRole('link', { name: copy.allLists }).getAttribute('href')).toBe('/p/dev-maya')
})

it("an Undo on a page loaded before a deploy reloads it, and the gift stays until then, with no 'try again'", async () => {
  const reload = watchReload()
  const { undone } = show()
  expect(reload).not.toHaveBeenCalled()
  fireEvent.click(undoIn('Yo-yo'))
  await act(async () => undone.reject(staleAction()))
  expect(reload).toHaveBeenCalledOnce()
  within(row('Yo-yo')).getByText(copy.removedFrom('Leo'))
  expect(screen.queryByText(copy.saveFailed)).toBeNull()
  expect(within(row('Yo-yo')).getByRole('button', { name: copy.saving })).toHaveProperty('disabled', true)
})

it('signed out, an Undo says nothing of its own while the server sends the page to the tap-the-link page', async () => {
  const reload = watchReload()
  const { undone } = show()
  fireEvent.click(undoIn('Yo-yo'))
  await act(async () => undone.reject(redirectTo('/')))
  screen.getByText('Yo-yo')
  expect(screen.queryByText(copy.saveFailed)).toBeNull()
  within(row('Yo-yo')).getByRole('button', { name: copy.saving })
  expect(reload).not.toHaveBeenCalled()
})
