import { act, cleanup, render, screen } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { PageNotices } from '@/components/PageNotices'
import { copy } from '@/lib/copy'
import { pageIsLeaving } from '@/lib/stale-page'
import { staleAction, watchReload } from '@/tests/helpers/leaving'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  sessionStorage.clear()
  document.body.innerHTML = ''
})

// A tap on a page loaded before a deploy reloads it (lib/stale-page.ts), and the page comes back as
// it was: the claim didn't happen, an edit is gone. Without a word, that looks like nothing at all.
it('after the reload that follows a deploy, says the last tap didn\'t go through, once', async () => {
  watchReload()
  pageIsLeaving(staleAction())

  // The reloaded page.
  render(<PageNotices organizerName="Maya" />)
  await act(async () => {})
  expect(screen.getByRole('status').textContent).toBe(copy.appUpdated)
  expect(copy.appUpdated).toBe("The app was just updated, so your last tap didn't go through. Please tap it again.")

  // The next page, or the next reload, says nothing more.
  cleanup()
  render(<PageNotices organizerName="Maya" />)
  await act(async () => {})
  expect(screen.queryByText(copy.appUpdated)).toBeNull()
})

it('an ordinary page load says nothing', async () => {
  render(<PageNotices organizerName="Maya" />)
  await act(async () => {})
  expect(screen.queryByText(copy.appUpdated)).toBeNull()
  expect(screen.queryByText(copy.ifNothingHappens('Maya'))).toBeNull()
})

// As it really happens: the reloaded page arrives as the server's HTML, with its hidden notice for a
// phone whose buttons never work, and React takes over from there.
it("the reloaded page's server HTML hydrates as it is, then says so", async () => {
  watchReload()
  pageIsLeaving(staleAction())
  const element = <PageNotices organizerName="Maya" />
  const container = document.createElement('div')
  container.innerHTML = renderToString(element)
  document.body.append(container)
  expect(container.textContent).toBe(copy.ifNothingHappens('Maya'))

  const mismatches: unknown[] = []
  const root = await act(async () => hydrateRoot(container, element, { onRecoverableError: e => mismatches.push(e) }))
  expect(mismatches).toEqual([])
  expect(container.textContent).toBe(copy.appUpdated)
  act(() => root.unmount())
})
