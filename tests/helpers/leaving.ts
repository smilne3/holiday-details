import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import { redirect } from 'next/navigation'
import { vi } from 'vitest'
import { browserPage } from '@/lib/stale-page'

// What a Server Action call rejects with in the browser when the page was loaded before a deploy:
// the server has no action with the id the page holds. The id is made up.
export const staleAction = () =>
  new UnrecognizedActionError('Server Action "00c0ffee" was not found on the server.')

// What a Server Action call rejects with in the browser when the action calls redirect(url), as
// every action does for someone signed out. Next's router follows it on its own.
export function redirectTo(url: string): unknown {
  try {
    redirect(url)
  } catch (e) {
    return e
  }
}

// The page's reload, as a spy that leaves jsdom where it is.
export const watchReload = () => vi.spyOn(browserPage, 'reload').mockImplementation(() => {})
