'use client'

import { copy } from '@/lib/copy'
import { useHydrated } from '@/lib/use-hydrated'

// Notices about the page itself rather than the lists, at the foot of every page with buttons that
// write: a wish list, Gifts I'm buying and the Organizer page.
//
// Until the page's JavaScript runs, its buttons are disabled and a tap does nothing. On a phone too
// old for the app's JavaScript it never runs. So the server's HTML carries "If nothing happens when
// you tap…", hidden, and CSS alone shows it after about 8 seconds (show-late in app/globals.css). A
// page that works takes it away as soon as React runs, long before then. It sticks to the bottom
// of the screen, so it's seen wherever the tap was, and at the very end of the page it sits below
// everything else rather than over it.
export function PageNotices({ organizerName }: { organizerName: string | null }) {
  const hydrated = useHydrated()
  if (hydrated) return null
  return (
    <p className="show-late sticky bottom-2 mt-6 rounded-xl border border-card-line bg-white px-3.5 py-2.5 text-sm font-semibold text-neutral-800 shadow-md wrap-anywhere">
      {copy.ifNothingHappens(organizerName ?? copy.organizerFallback)}
    </p>
  )
}
