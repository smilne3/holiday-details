import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ItemClaim } from '@/components/ItemClaim'
import { copy } from '@/lib/copy'
import type { ClaimResult } from '@/lib/types'
import { redirectTo, staleAction, watchReload } from '@/tests/helpers/leaving'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// A made-up item id. The claim and unclaim fakes answer only when the test says so, the way a
// slow network would.
const id = '00000000-0000-4000-8000-0000000000c1'

function setup(initial: 'open' | 'mine' = 'open') {
  const claimed = Promise.withResolvers<ClaimResult>()
  const undone = Promise.withResolvers<void>()
  const claim = vi.fn<(itemId: string) => Promise<ClaimResult>>(() => claimed.promise)
  const unclaim = vi.fn<(itemId: string) => Promise<void>>(() => undone.promise)
  const view = render(<ItemClaim itemId={id} initial={initial} claim={claim} unclaim={unclaim} />)
  return { claim, unclaim, claimed, undone, ...view }
}

const buyButton = () => screen.getByRole('button', { name: copy.illBuyThis })

it('while saving, the button is disabled, says Saving…, and a second click does not claim again', async () => {
  const { claim, claimed } = setup()
  fireEvent.click(buyButton())
  const saving = screen.getByRole('button', { name: copy.saving })
  expect(saving).toHaveProperty('disabled', true)
  fireEvent.click(saving)
  expect(claim).toHaveBeenCalledOnce()
  expect(claim).toHaveBeenCalledWith(id)
  await act(async () => claimed.resolve('claimed'))
  expect(claim).toHaveBeenCalledOnce()
})

it('two taps that land before the page redraws still make one call', async () => {
  const { claim, claimed } = setup()
  const button = buyButton()
  act(() => {
    button.click()
    button.click()
  })
  expect(claim).toHaveBeenCalledOnce()
  await act(async () => claimed.resolve('claimed'))
})

it("once the server says claimed, shows ✓ You're buying this, Added to Gifts I'm buying, and Undo", async () => {
  const { claimed } = setup()
  fireEvent.click(buyButton())
  // Nothing claims success before the server answers.
  expect(screen.queryByText(/✓/)).toBeNull()
  expect(screen.queryByText(copy.addedToBuying)).toBeNull()

  await act(async () => claimed.resolve('claimed'))
  screen.getByText(copy.youreBuying)
  screen.getByText(copy.addedToBuying)
  // Undo is a button of its own. The dot before it is only a divider, so it isn't read out, and
  // being no word, it doesn't come from copy.
  expect(screen.getByRole('button', { name: copy.undo }).textContent).toBe(copy.undo)
  expect(screen.getByText('·').getAttribute('aria-hidden')).toBe('true')
  expect(screen.queryByRole('button', { name: copy.illBuyThis })).toBeNull()
})

it.each([
  ['taken', copy.justTaken],
  ['gone', copy.gone],
] as const)("'%s' shows %s, with no ✓ and no button", async (result, message) => {
  const { claimed } = setup()
  fireEvent.click(buyButton())
  await act(async () => claimed.resolve(result))
  screen.getByText(message)
  expect(screen.queryByText(/✓/)).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
})

it("a failed save says That didn't save. Please try again. and offers the button again", async () => {
  const { claim, claimed } = setup()
  fireEvent.click(buyButton())
  await act(async () => claimed.reject(new Error('the network dropped')))
  screen.getByText(copy.saveFailed)
  expect(screen.queryByText(/✓/)).toBeNull()
  expect(buyButton()).toHaveProperty('disabled', false)

  // Trying again works, and the failure note goes.
  claim.mockResolvedValueOnce('claimed')
  fireEvent.click(buyButton())
  await screen.findByText(copy.youreBuying)
  expect(screen.queryByText(copy.saveFailed)).toBeNull()
  expect(claim).toHaveBeenCalledTimes(2)
})

it("'not-allowed' (the viewer's own item, which the page never offers) is a failed save, not a ✓", async () => {
  const { claimed } = setup()
  fireEvent.click(buyButton())
  await act(async () => claimed.resolve('not-allowed'))
  screen.getByText(copy.saveFailed)
  expect(screen.queryByText(/✓/)).toBeNull()
  buyButton()
})

it("Undo calls unclaim and shows I'll buy this again", async () => {
  const { unclaim, undone } = setup('mine')
  fireEvent.click(screen.getByRole('button', { name: copy.undo }))
  expect(unclaim).toHaveBeenCalledWith(id)
  // Still the viewer's until the server says otherwise, and a second tap doesn't undo twice.
  screen.getByText(copy.youreBuying)
  fireEvent.click(screen.getByRole('button', { name: copy.saving }))
  expect(unclaim).toHaveBeenCalledOnce()

  await act(async () => undone.resolve())
  buyButton()
  expect(screen.queryByText(/✓/)).toBeNull()
})

it('an Undo that fails says so and keeps the ✓, since the claim is still there', async () => {
  const { undone } = setup('mine')
  fireEvent.click(screen.getByRole('button', { name: copy.undo }))
  await act(async () => undone.reject(new Error('the network dropped')))
  screen.getByText(copy.saveFailed)
  screen.getByText(copy.youreBuying)
  expect(screen.getByRole('button', { name: copy.undo })).toHaveProperty('disabled', false)
})

it("initial 'mine' shows ✓ You're buying this and Undo, without the Added hint", () => {
  setup('mine')
  screen.getByText(copy.youreBuying)
  screen.getByRole('button', { name: copy.undo })
  expect(screen.queryByText(copy.addedToBuying)).toBeNull()
  expect(screen.queryByRole('button', { name: copy.illBuyThis })).toBeNull()
})

it("the Added hint survives the refresh that follows, which passes initial 'mine'", async () => {
  const { claim, unclaim, claimed, rerender } = setup()
  fireEvent.click(buyButton())
  await act(async () => claimed.resolve('claimed'))
  rerender(<ItemClaim itemId={id} initial="mine" claim={claim} unclaim={unclaim} />)
  screen.getByText(copy.youreBuying)
  screen.getByText(copy.addedToBuying)
})

it('follows the page when a refresh says the claim changed elsewhere, so a ✓ is never left stale', () => {
  const { claim, unclaim, rerender } = setup('mine')
  // Undone in another tab, then this page refreshed.
  rerender(<ItemClaim itemId={id} initial="open" claim={claim} unclaim={unclaim} />)
  buyButton()
  expect(screen.queryByText(/✓/)).toBeNull()
  // Claimed in another tab: the ✓, but no "just added" hint.
  rerender(<ItemClaim itemId={id} initial="mine" claim={claim} unclaim={unclaim} />)
  screen.getByText(copy.youreBuying)
  expect(screen.queryByText(copy.addedToBuying)).toBeNull()
})

it("on a page loaded before a deploy, the tap reloads it, with no ✓ and no 'try again'", async () => {
  const reload = watchReload()
  const { claim, claimed } = setup()
  // Nothing reloads on its own, only in answer to a tap.
  expect(reload).not.toHaveBeenCalled()
  fireEvent.click(buyButton())
  await act(async () => claimed.reject(staleAction()))
  expect(reload).toHaveBeenCalledOnce()
  expect(screen.queryByText(/✓/)).toBeNull()
  expect(screen.queryByText(copy.saveFailed)).toBeNull()
  // Saving… until the page goes, with nothing more sent.
  expect(screen.getByRole('button', { name: copy.saving })).toHaveProperty('disabled', true)
  expect(claim).toHaveBeenCalledOnce()
})

it('an Undo on a page loaded before a deploy reloads it too, and the ✓ stays until then', async () => {
  const reload = watchReload()
  const { undone } = setup('mine')
  fireEvent.click(screen.getByRole('button', { name: copy.undo }))
  await act(async () => undone.reject(staleAction()))
  expect(reload).toHaveBeenCalledOnce()
  screen.getByText(copy.youreBuying)
  expect(screen.queryByText(copy.saveFailed)).toBeNull()
  expect(screen.getByRole('button', { name: copy.saving })).toHaveProperty('disabled', true)
})

it('signed out, a tap says nothing of its own while the server sends the page to the tap-the-link page', async () => {
  const reload = watchReload()
  const buying = setup()
  fireEvent.click(buyButton())
  await act(async () => buying.claimed.reject(redirectTo('/')))
  expect(screen.queryByText(/✓/)).toBeNull()
  expect(screen.queryByText(copy.saveFailed)).toBeNull()
  screen.getByRole('button', { name: copy.saving })
  cleanup()

  const undoing = setup('mine')
  fireEvent.click(screen.getByRole('button', { name: copy.undo }))
  await act(async () => undoing.undone.reject(redirectTo('/')))
  expect(screen.queryByText(copy.saveFailed)).toBeNull()
  screen.getByRole('button', { name: copy.saving })
  expect(reload).not.toHaveBeenCalled()
})
