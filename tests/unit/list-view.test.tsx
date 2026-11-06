import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ListView, type ListActions } from '@/components/ListView'
import { copy } from '@/lib/copy'
import type { ListItem, ListViewData } from '@/lib/types'
import { redirectTo, staleAction, watchReload } from '@/tests/helpers/leaving'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  sessionStorage.clear()
})

// Leo's list from the mockup, and Maya's own list, as getListView returns them. The ids and links
// are made up.
const leo = { id: '00000000-0000-4000-8000-0000000000a3', name: 'Leo', kind: 'kid' as const }
const maya = { id: '00000000-0000-4000-8000-0000000000a2', name: 'Maya', kind: 'adult' as const }
const sweaterUrl = 'https://www.asos.com/women/jumpers/green-sweater/prd/123?clr=green&utm_source=list'

const airpods = { id: '00000000-0000-4000-8000-0000000000c1', name: 'AirPods 5', details: null, url: 'https://www.apple.com/shop/buy-airpods/airpods-5' }
const sweater = { id: '00000000-0000-4000-8000-0000000000c2', name: 'Sweater', details: 'Green, size XS', url: sweaterUrl }
const yoyo = { id: '00000000-0000-4000-8000-0000000000c3', name: 'Yo-yo', details: null, url: null }
const lego = { id: '00000000-0000-4000-8000-0000000000c4', name: 'Any LEGO set', details: 'He likes the space ones', url: null }

// Leo's list as Maya, his parent, sees it: Priya and Grandma are buying two things.
const leoKept: ListViewData = {
  owner: leo,
  mode: 'kept',
  keptBy: 'Ben & Maya',
  canEdit: true,
  canClaim: true,
  items: [
    { ...airpods, claim: null },
    { ...sweater, claim: { buyerName: 'Priya', mine: false } },
    { ...yoyo, claim: { buyerName: 'Grandma', mine: false } },
    { ...lego, claim: null },
  ],
}

// Leo's list as Grandma sees it: the yo-yo is hers.
const leoOther: ListViewData = {
  ...leoKept,
  mode: 'other',
  canEdit: false,
  items: [
    { ...airpods, claim: null },
    { ...sweater, claim: { buyerName: 'Priya', mine: false } },
    { ...yoyo, claim: { buyerName: 'Grandma', mine: true } },
    { ...lego, claim: null },
  ],
}

// Maya's own list. Her items carry no claim key at all.
const mayaOwn: ListViewData = {
  owner: maya,
  mode: 'own',
  keptBy: null,
  canEdit: true,
  canClaim: false,
  items: [
    { id: '00000000-0000-4000-8000-0000000000d1', name: 'Gardening gloves', details: 'Size M', url: null },
    { id: '00000000-0000-4000-8000-0000000000d2', name: 'Bird feeder', details: null, url: null },
  ],
}

function fakeActions() {
  return {
    claim: vi.fn<ListActions['claim']>(async () => 'claimed'),
    unclaim: vi.fn<ListActions['unclaim']>(async () => {}),
    add: vi.fn<ListActions['add']>(async () => ({ ok: true })),
    update: vi.fn<ListActions['update']>(async () => ({ ok: true })),
    remove: vi.fn<ListActions['remove']>(async () => ({ ok: true })),
  }
}

function show(view: ListViewData, viewerName = 'Maya', actions = fakeActions()) {
  const homeHref = `/p/dev-${viewerName.toLowerCase()}`
  const rendered = render(<ListView view={view} viewerName={viewerName} homeHref={homeHref} actions={actions} />)
  return { actions, ...rendered }
}

// The card an item's name is on.
const row = (name: string) => screen.getByText(name).closest('li')!

it("own: shows the surprise note, Edit and Remove, Add to my wish list, and no I'll buy this", () => {
  show(mayaOwn)
  screen.getByText(copy.ownListNote)
  for (const item of mayaOwn.items) {
    within(row(item.name)).getByRole('button', { name: copy.edit })
    within(row(item.name)).getByRole('button', { name: copy.remove })
  }
  screen.getByRole('button', { name: copy.addToMyList })
  expect(screen.queryByText(copy.illBuyThis)).toBeNull()
  expect(screen.queryByText(/✓|is buying this/)).toBeNull()
})

it("kept: shows Kept by Ben & Maya, the claim controls, the edit tools, and Add to Leo's wish list", () => {
  show(leoKept)
  screen.getByText(copy.keptByLine(['Ben', 'Maya']))
  within(row('AirPods 5')).getByRole('button', { name: copy.illBuyThis })
  within(row('Any LEGO set')).getByRole('button', { name: copy.illBuyThis })
  within(row('Sweater')).getByText(copy.isBuying('Priya'))
  within(row('Yo-yo')).getByText(copy.isBuying('Grandma'))
  for (const item of leoKept.items) {
    within(row(item.name)).getByRole('button', { name: copy.edit })
    within(row(item.name)).getByRole('button', { name: copy.remove })
  }
  screen.getByRole('button', { name: copy.addToList('Leo') })
  expect(screen.queryByText(copy.ownListNote)).toBeNull()
})

it('other: an item someone else claimed is struck through and says Priya is buying this; no edit tools', () => {
  show(leoOther, 'Grandma')
  expect(screen.getByText('Sweater').tagName).toBe('S')
  within(row('Sweater')).getByText(copy.isBuying('Priya'))
  expect(within(row('Sweater')).queryByRole('button')).toBeNull()
  // The open items aren't struck through, and the viewer's own claim has its ✓ and Undo.
  expect(screen.getByText('AirPods 5').tagName).not.toBe('S')
  within(row('AirPods 5')).getByRole('button', { name: copy.illBuyThis })
  within(row('Yo-yo')).getByText(copy.youreBuying)
  within(row('Yo-yo')).getByRole('button', { name: copy.undo })

  expect(screen.queryByRole('button', { name: copy.edit })).toBeNull()
  expect(screen.queryByRole('button', { name: copy.remove })).toBeNull()
  expect(screen.queryByLabelText(copy.fieldName)).toBeNull()
  expect(screen.queryByText(copy.keptByLine(['Ben', 'Maya']))).not.toBeNull()
})

it('a link shows asos.com ↗, opens in a new tab with rel="noopener noreferrer", and keeps the full URL', () => {
  show(leoOther, 'Grandma')
  const link = within(row('Sweater')).getByRole('link')
  expect(link.textContent).toBe('asos.com ↗')
  expect(link.getAttribute('href')).toBe(sweaterUrl)
  expect(link.getAttribute('target')).toBe('_blank')
  expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  expect(within(row('AirPods 5')).getByRole('link').textContent).toBe('apple.com ↗')
  // An item without a link has none.
  expect(within(row('Yo-yo')).queryByRole('link')).toBeNull()
})

it.each(['https://', 'https://shop .com'])("a stored link that isn't a web address (%s) shows no link, and the list still shows", url => {
  show({ ...leoOther, items: leoOther.items.map(i => (i.id === sweater.id ? { ...i, url } : i)) }, 'Grandma')
  within(row('Sweater')).getByText(copy.isBuying('Priya'))
  expect(within(row('Sweater')).queryByRole('link')).toBeNull()
  expect(within(row('AirPods 5')).getByRole('link').textContent).toBe('apple.com ↗')
})

it("title is Leo's wish list (My wish list for your own); ‹ All lists links to the home href; Signed in as Maya shows", () => {
  show(leoKept)
  screen.getByRole('heading', { level: 1, name: copy.listTitle('Leo') })
  expect(screen.getByRole('link', { name: copy.allLists }).getAttribute('href')).toBe('/p/dev-maya')
  screen.getByText(copy.signedInAs('Maya'))
  cleanup()

  show(mayaOwn)
  screen.getByRole('heading', { level: 1, name: copy.myWishList })
  expect(screen.queryByText(/Kept by/)).toBeNull()
})

it('the claim button sends the item id, and the ✓ and its hint stay through the refresh that follows', async () => {
  const actions = fakeActions()
  const { rerender } = show(leoOther, 'Grandma', actions)
  fireEvent.click(within(row('AirPods 5')).getByRole('button', { name: copy.illBuyThis }))
  expect(actions.claim).toHaveBeenCalledWith(airpods.id)
  await within(row('AirPods 5')).findByText(copy.addedToBuying)

  // refresh() re-renders the page: the AirPods are now the viewer's.
  const refreshed: ListViewData = {
    ...leoOther,
    items: leoOther.items.map(i => (i.id === airpods.id ? { ...i, claim: { buyerName: 'Grandma', mine: true } } : i)),
  }
  rerender(<ListView view={refreshed} viewerName="Grandma" homeHref="/p/dev-grandma" actions={actions} />)
  within(row('AirPods 5')).getByText(copy.youreBuying)
  within(row('AirPods 5')).getByText(copy.addedToBuying)
})

it("Add sends the owner's id with the form", async () => {
  const { actions } = show(leoKept)
  fireEvent.change(screen.getByLabelText(copy.fieldName), { target: { value: 'Kite' } })
  fireEvent.click(screen.getByRole('button', { name: copy.addToList('Leo') }))
  expect(actions.add).toHaveBeenCalledOnce()
  const [ownerId, , form] = actions.add.mock.calls[0]
  expect(ownerId).toBe(leo.id)
  expect(form.get('name')).toBe('Kite')
  await act(async () => {})
})

it("Edit opens the item's form, filled in; Save sends its id; the form closes once saved", async () => {
  const { actions } = show(mayaOwn)
  fireEvent.click(within(row('Gardening gloves')).getByRole('button', { name: copy.edit }))
  const card = screen.getByDisplayValue('Gardening gloves').closest('li')!
  expect((within(card).getByLabelText(copy.fieldDetails) as HTMLInputElement).value).toBe('Size M')
  expect((within(card).getByLabelText(copy.fieldLink) as HTMLInputElement).value).toBe('')
  fireEvent.change(within(card).getByLabelText(copy.fieldName), { target: { value: 'Garden gloves' } })
  fireEvent.click(within(card).getByRole('button', { name: copy.save }))

  expect(actions.update).toHaveBeenCalledOnce()
  const [itemId, , form] = actions.update.mock.calls[0]
  expect(itemId).toBe(mayaOwn.items[0].id)
  expect(form.get('name')).toBe('Garden gloves')
  await act(async () => {})
  expect(screen.queryByRole('button', { name: copy.save })).toBeNull()
  within(row('Gardening gloves')).getByRole('button', { name: copy.edit })
})

it('an edit to an item taken off the list elsewhere says so in its place, and the refresh takes the item away', async () => {
  const actions = fakeActions()
  actions.update.mockResolvedValueOnce({ ok: false, error: copy.gone, gone: true })
  const { rerender } = show(leoKept, 'Maya', actions)
  fireEvent.click(within(row('Sweater')).getByRole('button', { name: copy.edit }))
  fireEvent.change(screen.getByDisplayValue('Sweater'), { target: { value: 'Red sweater' } })
  fireEvent.click(screen.getByRole('button', { name: copy.save }))
  await act(async () => {})
  expect(actions.update).toHaveBeenCalledWith(sweater.id, null, expect.any(FormData))
  expect(screen.queryByRole('button', { name: copy.save })).toBeNull()
  const cards = () => screen.getAllByRole('listitem').map(li => li.firstElementChild?.textContent)
  expect(cards()[1]).toBe(copy.gone)
  expect(screen.queryByText(copy.notAllowed)).toBeNull()

  // The action's refresh hands over the list without it, and the note stays where it was.
  rerender(
    <ListView
      view={{ ...leoKept, items: leoKept.items.filter(i => i.id !== sweater.id) }}
      viewerName="Maya"
      homeHref="/p/dev-maya"
      actions={actions}
    />,
  )
  expect(screen.queryByText('Sweater')).toBeNull()
  expect(screen.getAllByRole('listitem')).toHaveLength(4)
  expect(cards()[1]).toBe(copy.gone)
  within(row('AirPods 5')).getByRole('button', { name: copy.edit })
})

it('Cancel closes the edit form without saving', () => {
  const { actions } = show(mayaOwn)
  fireEvent.click(within(row('Bird feeder')).getByRole('button', { name: copy.edit }))
  fireEvent.click(screen.getByRole('button', { name: copy.cancel }))
  expect(actions.update).not.toHaveBeenCalled()
  within(row('Bird feeder')).getByRole('button', { name: copy.edit })
})

it('Remove asks first, on the page: Keep it backs out, and Yes, remove removes it once', async () => {
  const confirm = vi.spyOn(window, 'confirm')
  const { actions } = show(mayaOwn)
  fireEvent.click(within(row('Bird feeder')).getByRole('button', { name: copy.remove }))
  within(row('Bird feeder')).getByText(copy.removeConfirm)
  fireEvent.click(within(row('Bird feeder')).getByRole('button', { name: copy.removeNo }))
  expect(within(row('Bird feeder')).queryByText(copy.removeConfirm)).toBeNull()
  expect(actions.remove).not.toHaveBeenCalled()

  fireEvent.click(within(row('Bird feeder')).getByRole('button', { name: copy.remove }))
  const yes = within(row('Bird feeder')).getByRole('button', { name: copy.removeYes })
  act(() => {
    yes.click()
    yes.click()
  })
  expect(actions.remove).toHaveBeenCalledOnce()
  expect(actions.remove).toHaveBeenCalledWith(mayaOwn.items[1].id)
  await act(async () => {})
  expect(confirm).not.toHaveBeenCalled()
})

it("a refused Remove says why, and the item's Remove button comes back", async () => {
  const actions = fakeActions()
  actions.remove.mockResolvedValueOnce({ ok: false, error: copy.notAllowed })
  show(mayaOwn, 'Maya', actions)
  fireEvent.click(within(row('Bird feeder')).getByRole('button', { name: copy.remove }))
  fireEvent.click(within(row('Bird feeder')).getByRole('button', { name: copy.removeYes }))
  await within(row('Bird feeder')).findByText(copy.notAllowed)
  within(row('Bird feeder')).getByRole('button', { name: copy.remove })
})

it('an empty list says so', () => {
  show({ ...leoOther, items: [] as ListItem[] }, 'Grandma')
  screen.getByText(copy.listEmpty)
})

const typed = () => [copy.fieldName, copy.fieldDetails, copy.fieldLink].map(l => (screen.getByLabelText(l) as HTMLInputElement).value)

it('on a page loaded before a deploy, the add form keeps what was typed across the reload, under its owner', async () => {
  const reload = watchReload()
  const actions = fakeActions()
  actions.add.mockRejectedValueOnce(staleAction())
  show(leoKept, 'Maya', actions)
  fireEvent.change(screen.getByLabelText(copy.fieldName), { target: { value: 'Kite' } })
  fireEvent.change(screen.getByLabelText(copy.fieldDetails), { target: { value: 'Red' } })
  fireEvent.change(screen.getByLabelText(copy.fieldLink), { target: { value: 'shop.example/kite' } })
  fireEvent.click(screen.getByRole('button', { name: copy.addToList('Leo') }))
  await act(async () => {})
  expect(reload).toHaveBeenCalledOnce()
  expect(screen.queryByText(copy.saveFailed)).toBeNull()

  // The reloaded page puts it back, once.
  cleanup()
  show(leoKept, 'Maya')
  expect(typed()).toEqual(['Kite', 'Red', 'shop.example/kite'])
  cleanup()
  show(leoKept, 'Maya')
  expect(typed()).toEqual(['', '', ''])
  // Another list's add form keeps nothing of Leo's.
  cleanup()
  show(mayaOwn, 'Maya')
  expect(typed()).toEqual(['', '', ''])
})

it('an edit on a page loaded before a deploy reloads it, and the edit is not kept (ruling R21)', async () => {
  const reload = watchReload()
  const actions = fakeActions()
  actions.update.mockRejectedValueOnce(staleAction())
  show(mayaOwn, 'Maya', actions)
  fireEvent.click(within(row('Bird feeder')).getByRole('button', { name: copy.edit }))
  const card = screen.getByDisplayValue('Bird feeder').closest('li')!
  fireEvent.change(within(card).getByLabelText(copy.fieldName), { target: { value: 'Two bird feeders' } })
  fireEvent.click(within(card).getByRole('button', { name: copy.save }))
  await act(async () => {})
  expect(reload).toHaveBeenCalledOnce()
  expect(sessionStorage.length).toBe(0)
  expect(screen.queryByText(copy.saveFailed)).toBeNull()
})

it('a Remove on a page loaded before a deploy reloads it, and the item stays until then', async () => {
  const reload = watchReload()
  const actions = fakeActions()
  actions.remove.mockRejectedValueOnce(staleAction())
  show(mayaOwn, 'Maya', actions)
  fireEvent.click(within(row('Bird feeder')).getByRole('button', { name: copy.remove }))
  fireEvent.click(within(row('Bird feeder')).getByRole('button', { name: copy.removeYes }))
  await act(async () => {})
  expect(reload).toHaveBeenCalledOnce()
  expect(screen.queryByText(copy.saveFailed)).toBeNull()
  expect(within(row('Bird feeder')).getByRole('button', { name: copy.saving })).toHaveProperty('disabled', true)
})

it('signed out, a Remove says nothing of its own while the server sends the page to the tap-the-link page', async () => {
  const reload = watchReload()
  const actions = fakeActions()
  actions.remove.mockRejectedValueOnce(redirectTo('/'))
  show(mayaOwn, 'Maya', actions)
  fireEvent.click(within(row('Bird feeder')).getByRole('button', { name: copy.remove }))
  fireEvent.click(within(row('Bird feeder')).getByRole('button', { name: copy.removeYes }))
  await act(async () => {})
  expect(screen.queryByText(copy.saveFailed)).toBeNull()
  within(row('Bird feeder')).getByRole('button', { name: copy.saving })
  expect(reload).not.toHaveBeenCalled()
})
