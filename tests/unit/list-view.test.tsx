import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ListView, type ListActions } from '@/components/ListView'
import { copy } from '@/lib/copy'
import type { ListItem, ListViewData } from '@/lib/types'
import { redirectTo, staleAction, storedText, watchReload } from '@/tests/helpers/leaving'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  sessionStorage.clear()
})

// Leo's list from the mockup, and Maya's own list, as getListView returns them. The ids, links and
// prices are made up.
const leo = { id: '00000000-0000-4000-8000-0000000000a3', name: 'Leo', kind: 'kid' as const }
const maya = { id: '00000000-0000-4000-8000-0000000000a2', name: 'Maya', kind: 'adult' as const }
const sweaterUrl = 'https://www.asos.com/women/jumpers/green-sweater/prd/123?clr=green&utm_source=list'

const airpods = { id: '00000000-0000-4000-8000-0000000000c1', name: 'AirPods 5', price: '179', details: null, url: 'https://www.apple.com/shop/buy-airpods/airpods-5' }
const sweater = { id: '00000000-0000-4000-8000-0000000000c2', name: 'Sweater', price: 'about $25', details: 'Green, size XS', url: sweaterUrl }
const yoyo = { id: '00000000-0000-4000-8000-0000000000c3', name: 'Yo-yo', price: null, details: null, url: null }
const lego = { id: '00000000-0000-4000-8000-0000000000c4', name: 'Any LEGO set', price: '$20–30', details: 'He likes the space ones', url: null }

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
  offList: [],
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

// Grandma's list as Maya sees it: one item of her own, and an off-list gift Ben is buying her.
const grandma = { id: '00000000-0000-4000-8000-0000000000a7', name: 'Grandma', kind: 'adult' as const }
const jigsaw = { id: '00000000-0000-4000-8000-0000000000c5', name: 'Jigsaw puzzle', price: null, details: '1000 pieces', url: null }
const cooking = { id: '00000000-0000-4000-8000-0000000000e1', name: 'Cooking class', price: '80', details: 'Saturday mornings', url: 'https://cooking.example.com/class' }
const grandmaOther: ListViewData = {
  owner: grandma,
  mode: 'other',
  keptBy: null,
  canEdit: false,
  canClaim: true,
  items: [{ ...jigsaw, claim: null }],
  offList: [{ ...cooking, buyerName: 'Ben', mine: false }],
}
// The same list as Ben sees it: the off-list gift is his.
const grandmaAsBen: ListViewData = { ...grandmaOther, offList: [{ ...cooking, buyerName: 'Ben', mine: true }] }

// Maya's own list. Her items carry no claim key at all.
const mayaOwn: ListViewData = {
  owner: maya,
  mode: 'own',
  keptBy: null,
  canEdit: true,
  canClaim: false,
  items: [
    { id: '00000000-0000-4000-8000-0000000000d1', name: 'Gardening gloves', price: '15', details: 'Size M', url: null },
    { id: '00000000-0000-4000-8000-0000000000d2', name: 'Bird feeder', price: null, details: null, url: null },
  ],
}

function fakeActions() {
  return {
    claim: vi.fn<ListActions['claim']>(async () => 'claimed'),
    unclaim: vi.fn<ListActions['unclaim']>(async () => {}),
    add: vi.fn<ListActions['add']>(async () => ({ ok: true })),
    update: vi.fn<ListActions['update']>(async () => ({ ok: true })),
    remove: vi.fn<ListActions['remove']>(async () => ({ ok: true })),
    addOffList: vi.fn<ListActions['addOffList']>(async () => ({ ok: true })),
    updateOffList: vi.fn<ListActions['updateOffList']>(async () => ({ ok: true })),
    removeOffList: vi.fn<ListActions['removeOffList']>(async () => ({ ok: true })),
  }
}

function show(view: ListViewData, viewerName = 'Maya', actions = fakeActions()) {
  const homeHref = `/p/dev-${viewerName.toLowerCase()}`
  const rendered = render(
    <ListView view={view} viewerName={viewerName} homeHref={homeHref} organizerName="Maya" actions={actions} />,
  )
  return { actions, ...rendered }
}

// The card an item's name is on, and the lines that describe the item in it, top to bottom.
const row = (name: string) => screen.getByText(name).closest('li')!
const lines = (name: string) => [...row(name).querySelector('div')!.children].map(el => el.textContent)

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

it('own: nothing on your own list ever looks claimed, even if an item carried a claim', () => {
  // Only a bug in getListView could send this, and the type forbids it (below). The page still
  // mustn't strike through, grey or colour anything on the viewer's own list.
  const leaked = {
    ...mayaOwn,
    items: [
      { ...mayaOwn.items[0], claim: { buyerName: 'Priya', mine: false } },
      { ...mayaOwn.items[1], claim: { buyerName: 'Maya', mine: true } },
    ],
  } as unknown as ListViewData
  const { container } = show(leaked)
  expect(container.querySelector('s')).toBeNull()
  expect(container.querySelector('.bg-taken, .bg-mine')).toBeNull()
  for (const item of mayaOwn.items) expect(screen.getByText(item.name).className).toContain('text-neutral-900')
  expect(screen.queryByText(/Priya|✓/)).toBeNull()
})

it("own: the type has no room for a claim on your own list, or for claiming from it", () => {
  const item = { id: '00000000-0000-4000-8000-0000000000d3', name: 'Scarf', price: null, details: null, url: null }
  // @ts-expect-error: an item on your own list can't carry a claim key, not even null
  const withClaim: ListViewData = { owner: maya, mode: 'own', keptBy: null, canEdit: true, canClaim: false, items: [{ ...item, claim: null }] }
  // @ts-expect-error: and your own list is never one you can claim from
  const claimable: ListViewData = { owner: maya, mode: 'own', keptBy: null, canEdit: true, canClaim: true, items: [item] }
  expect([withClaim, claimable]).toHaveLength(2)
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

// The price is its own line, under the name and above the details, on every kind of list: a bare
// number gets a $, anything else shows as typed, and an item with no price has no line for it.
it('own: a price shows under the name, with $ added to a bare number; no price, no line', () => {
  show(mayaOwn)
  expect(lines('Gardening gloves')).toEqual(['Gardening gloves', '$15', 'Size M'])
  expect(lines('Bird feeder')).toEqual(['Bird feeder'])
})

it.each([
  ['kept', 'Maya', leoKept],
  ['other', 'Grandma', leoOther],
])("%s: a price shows under the name, as typed or with $ added; no price, no line", (_, viewer, view) => {
  show(view, viewer)
  expect(lines('AirPods 5')).toEqual(['AirPods 5', '$179', 'apple.com ↗'])
  expect(lines('Sweater')).toEqual(['Sweater', 'about $25', 'Green, size XS', 'asos.com ↗'])
  expect(lines('Any LEGO set')).toEqual(['Any LEGO set', '$20–30', 'He likes the space ones'])
  expect(lines('Yo-yo')).toEqual(['Yo-yo'])
})

// Muted like the details, and greyed with the rest of an item someone else is buying.
it('the price line looks like the details line, open or claimed by someone else', () => {
  show(leoOther, 'Grandma')
  const [, openPrice, openDetails] = row('Any LEGO set').querySelector('div')!.children
  expect(openPrice.className).toBe(openDetails.className)
  expect(openPrice.className).toContain('text-neutral-600')
  const [, takenPrice, takenDetails] = row('Sweater').querySelector('div')!.children
  expect(takenPrice.className).toBe(takenDetails.className)
  expect(takenPrice.className).toContain('text-neutral-500')
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
  rerender(<ListView view={refreshed} viewerName="Grandma" homeHref="/p/dev-grandma" organizerName="Maya" actions={actions} />)
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
  expect((within(card).getByLabelText(copy.fieldPrice) as HTMLInputElement).value).toBe('15')
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
      organizerName="Maya"
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

const typed = () =>
  [copy.fieldName, copy.fieldPrice, copy.fieldDetails, copy.fieldLink].map(
    l => (screen.getByLabelText(l) as HTMLInputElement).value,
  )

it('on a page loaded before a deploy, the add form keeps what was typed across the reload, under its owner', async () => {
  const reload = watchReload()
  const actions = fakeActions()
  actions.add.mockRejectedValueOnce(staleAction())
  show(leoKept, 'Maya', actions)
  fireEvent.change(screen.getByLabelText(copy.fieldName), { target: { value: 'Kite' } })
  fireEvent.change(screen.getByLabelText(copy.fieldPrice), { target: { value: 'about $25' } })
  fireEvent.change(screen.getByLabelText(copy.fieldDetails), { target: { value: 'Red' } })
  fireEvent.change(screen.getByLabelText(copy.fieldLink), { target: { value: 'shop.example/kite' } })
  fireEvent.click(screen.getByRole('button', { name: copy.addToList('Leo') }))
  await act(async () => {})
  expect(reload).toHaveBeenCalledOnce()
  expect(screen.queryByText(copy.saveFailed)).toBeNull()

  // The reloaded page puts it back, once.
  cleanup()
  show(leoKept, 'Maya')
  expect(typed()).toEqual(['Kite', 'about $25', 'Red', 'shop.example/kite'])
  cleanup()
  show(leoKept, 'Maya')
  expect(typed()).toEqual(['', '', '', ''])
  // Another list's add form keeps nothing of Leo's.
  cleanup()
  show(mayaOwn, 'Maya')
  expect(typed()).toEqual(['', '', '', ''])
})

// The reloaded page shows the item as it is now. An edit on a page left open across a deploy is
// rare, so it isn't kept: at worst it's typed again.
it('an edit on a page loaded before a deploy reloads it, and the edit is not kept', async () => {
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
  expect(storedText()).not.toContain('Two bird feeders')
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

// Off-list gifts (#21): a gift a buyer adds to someone's list, which everyone but that person sees.

it('other: off-list gifts sit under their own heading after the list, struck through, reading Ben is buying this', () => {
  show(grandmaOther, 'Maya')
  const heading = screen.getByRole('heading', { name: copy.offListHeading('Grandma') })
  expect(row('Jigsaw puzzle').compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(heading.compareDocumentPosition(row('Cooking class')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

  expect(screen.getByText('Cooking class').tagName).toBe('S')
  expect(lines('Cooking class')).toEqual(['Cooking class', '$80', 'Saturday mornings', 'cooking.example.com ↗'])
  within(row('Cooking class')).getByText(copy.isBuying('Ben'))
  expect(row('Cooking class').className).toContain('bg-taken')
  // Only Ben can change it, so Maya has no button on it at all.
  expect(within(row('Cooking class')).queryByRole('button')).toBeNull()
  screen.getByRole('button', { name: copy.addOffList('Grandma') })
})

it("the buyer's own off-list gift reads ✓ You're buying this, with Edit and Remove", () => {
  show(grandmaAsBen, 'Ben')
  expect(screen.getByText('Cooking class').tagName).not.toBe('S')
  expect(row('Cooking class').className).toContain('bg-mine')
  within(row('Cooking class')).getByText(copy.youreBuying)
  within(row('Cooking class')).getByRole('button', { name: copy.edit })
  within(row('Cooking class')).getByRole('button', { name: copy.remove })
  expect(within(row('Cooking class')).queryByRole('button', { name: copy.undo })).toBeNull()
})

it('with no off-list gifts the section is only its button, which opens the form with its note', async () => {
  const { actions } = show({ ...grandmaOther, offList: [] }, 'Maya')
  expect(screen.queryByRole('heading', { name: copy.offListHeading('Grandma') })).toBeNull()
  expect(screen.queryByLabelText(copy.fieldName)).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: copy.addOffList('Grandma') }))
  screen.getByText(copy.offListFormNote('Grandma'))
  fireEvent.change(screen.getByLabelText(copy.fieldName), { target: { value: 'Cooking class' } })
  fireEvent.change(screen.getByLabelText(copy.fieldPrice), { target: { value: '80' } })
  fireEvent.click(screen.getByRole('button', { name: copy.addGift }))
  expect(actions.addOffList).toHaveBeenCalledOnce()
  const [recipientId, , form] = actions.addOffList.mock.calls[0]
  expect(recipientId).toBe(grandma.id)
  expect([form.get('name'), form.get('price')]).toEqual(['Cooking class', '80'])

  // Once saved, the form closes and the button comes back.
  await act(async () => {})
  expect(screen.queryByLabelText(copy.fieldName)).toBeNull()
  screen.getByRole('button', { name: copy.addOffList('Grandma') })
})

it('a refused off-list gift says why and keeps the form open with what was typed', async () => {
  const actions = fakeActions()
  actions.addOffList.mockResolvedValueOnce({ ok: false, error: copy.badLink })
  show(grandmaOther, 'Maya', actions)
  fireEvent.click(screen.getByRole('button', { name: copy.addOffList('Grandma') }))
  fireEvent.change(screen.getByLabelText(copy.fieldName), { target: { value: 'Cooking class' } })
  fireEvent.click(screen.getByRole('button', { name: copy.addGift }))
  await screen.findByText(copy.badLink)
  expect((screen.getByLabelText(copy.fieldName) as HTMLInputElement).value).toBe('Cooking class')
})

it('Cancel closes the off-list form without adding anything', () => {
  const { actions } = show(grandmaOther, 'Maya')
  fireEvent.click(screen.getByRole('button', { name: copy.addOffList('Grandma') }))
  fireEvent.click(screen.getByRole('button', { name: copy.cancel }))
  expect(actions.addOffList).not.toHaveBeenCalled()
  expect(screen.queryByLabelText(copy.fieldName)).toBeNull()
})

it("Edit opens the buyer's off-list gift, filled in; Save sends its id; the form closes once saved", async () => {
  const { actions } = show(grandmaAsBen, 'Ben')
  fireEvent.click(within(row('Cooking class')).getByRole('button', { name: copy.edit }))
  expect(typed()).toEqual(['Cooking class', '80', 'Saturday mornings', 'https://cooking.example.com/class'])
  fireEvent.change(screen.getByLabelText(copy.fieldName), { target: { value: 'Pasta class' } })
  fireEvent.click(screen.getByRole('button', { name: copy.save }))
  expect(actions.updateOffList).toHaveBeenCalledOnce()
  const [giftId, , form] = actions.updateOffList.mock.calls[0]
  expect(giftId).toBe(cooking.id)
  expect(form.get('name')).toBe('Pasta class')
  expect(actions.update).not.toHaveBeenCalled()
  await act(async () => {})
  expect(screen.queryByRole('button', { name: copy.save })).toBeNull()
})

it('an edit to an off-list gift its buyer removed in another tab closes the form', async () => {
  const actions = fakeActions()
  actions.updateOffList.mockResolvedValueOnce({ ok: false, error: copy.gone, gone: true })
  show(grandmaAsBen, 'Ben', actions)
  fireEvent.click(within(row('Cooking class')).getByRole('button', { name: copy.edit }))
  fireEvent.click(screen.getByRole('button', { name: copy.save }))
  await act(async () => {})
  expect(screen.queryByRole('button', { name: copy.save })).toBeNull()
})

it("Remove on the buyer's off-list gift asks first, then sends its id", async () => {
  const { actions } = show(grandmaAsBen, 'Ben')
  fireEvent.click(within(row('Cooking class')).getByRole('button', { name: copy.remove }))
  within(row('Cooking class')).getByText(copy.removeConfirm)
  fireEvent.click(within(row('Cooking class')).getByRole('button', { name: copy.removeNo }))
  expect(actions.removeOffList).not.toHaveBeenCalled()

  fireEvent.click(within(row('Cooking class')).getByRole('button', { name: copy.remove }))
  fireEvent.click(within(row('Cooking class')).getByRole('button', { name: copy.removeYes }))
  expect(actions.removeOffList).toHaveBeenCalledWith(cooking.id)
  expect(actions.remove).not.toHaveBeenCalled()
  await act(async () => {})
})

it('own: no off-list section, and no way to add one', () => {
  show(mayaOwn)
  expect(screen.queryByRole('button', { name: copy.addOffList('Maya') })).toBeNull()
  expect(screen.queryByRole('heading', { name: copy.offListHeading('Maya') })).toBeNull()
  expect(document.body.textContent).not.toMatch(/off-list/i)
})

it("kept: Leo's own add form comes first, then the off-list section", () => {
  show({ ...leoKept, offList: [{ ...cooking, buyerName: 'Sam', mine: false }] })
  const addToLeo = screen.getByRole('button', { name: copy.addToList('Leo') })
  const heading = screen.getByRole('heading', { name: copy.offListHeading('Leo') })
  expect(addToLeo.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  // Sam's off-list gift for Leo is his alone to change, though Maya keeps Leo's list.
  expect(within(row('Cooking class')).queryByRole('button')).toBeNull()
})

it('on a page loaded before a deploy, the off-list form keeps what was typed, for when it opens again', async () => {
  const reload = watchReload()
  const actions = fakeActions()
  actions.addOffList.mockRejectedValueOnce(staleAction())
  show(grandmaOther, 'Maya', actions)
  fireEvent.click(screen.getByRole('button', { name: copy.addOffList('Grandma') }))
  fireEvent.change(screen.getByLabelText(copy.fieldName), { target: { value: 'Cooking class' } })
  fireEvent.click(screen.getByRole('button', { name: copy.addGift }))
  await act(async () => {})
  expect(reload).toHaveBeenCalledOnce()

  cleanup()
  show(grandmaOther, 'Maya')
  fireEvent.click(screen.getByRole('button', { name: copy.addOffList('Grandma') }))
  expect(typed()).toEqual(['Cooking class', '', '', ''])
})
