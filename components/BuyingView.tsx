'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { PageNotices } from '@/components/PageNotices'
import { ShopLink } from '@/components/ShopLink'
import { SignedInAs } from '@/components/SignedInAs'
import { copy } from '@/lib/copy'
import { shownPrice } from '@/lib/format'
import { pageIsLeaving } from '@/lib/stale-page'
import type { BuyingGroup } from '@/lib/types'
import { useHydrated } from '@/lib/use-hydrated'

// Gifts I'm buying: everything the viewer tapped "I'll buy this" on, under a heading for each person
// it's for, with its price, details and link, and Undo. The price sits under the name, as on a wish
// list. getBuying hands over the viewer's own claims and no one else's.
//
// An item its owner took off their list, or edited, after it was claimed stays here with a note
// ("Removed from Leo's list", "Changed after you claimed it"), so the buyer isn't left holding a
// gift nobody wants. Only the buyer ever sees the note.
//
// An Undo the server confirmed takes the gift off this page straight away; the action's refresh()
// then re-renders the page without it. When a refresh hands over new groups the page follows them,
// so a gift claimed again in another tab is never left hidden.
//
// PageNotices waits at the foot of the page, for a phone where the buttons never come to life.
//
// On a phone each card stacks, with Undo under the item. From md: up Undo sits on the right. As on
// a wish list, typed text is wrap-anywhere, so a long word wraps instead of pushing the page sideways.
export function BuyingView({
  groups,
  viewerName,
  homeHref,
  organizerName,
  unclaim,
}: {
  groups: BuyingGroup[]
  viewerName: string
  homeHref: string
  organizerName: string | null
  unclaim: (itemId: string) => Promise<void>
}) {
  const [undone, setUndone] = useState<ReadonlySet<string>>(new Set())
  const [shownGroups, setShownGroups] = useState(groups)
  if (groups !== shownGroups) {
    setShownGroups(groups)
    setUndone(new Set())
  }

  const left = groups
    .map(group => ({ ...group, items: group.items.filter(item => !undone.has(item.id)) }))
    .filter(group => group.items.length > 0)

  const onUndone = (itemId: string) => setUndone(prev => new Set(prev).add(itemId))

  return (
    <main className="mx-auto max-w-2xl px-4 py-4 md:px-8 md:py-6">
      <div className="flex items-center justify-between gap-3">
        <Link href={homeHref} className="inline-flex min-h-11 shrink-0 items-center text-sm text-link">
          {copy.allLists}
        </Link>
        <SignedInAs name={viewerName} />
      </div>

      <h1 className="mt-1 text-2xl font-bold text-neutral-900">{copy.giftsImBuying}</h1>

      {left.length === 0 ? (
        <p className="mt-5 text-neutral-600">{copy.buyingEmpty}</p>
      ) : (
        left.map(({ recipient, items }) => (
          <section key={recipient.id} aria-labelledby={`for-${recipient.id}`} className="mt-5">
            <h2 id={`for-${recipient.id}`} className="mb-2 text-lg font-bold text-buying-ink wrap-anywhere">
              {copy.forRecipient(recipient.name)}
            </h2>
            <ul className="space-y-2.5">
              {items.map(item => (
                <li
                  key={item.id}
                  className="rounded-xl border border-item-line bg-white px-3.5 py-3 wrap-anywhere md:flex md:items-center md:justify-between md:gap-x-4"
                >
                  <div className="min-w-0">
                    <p id={`gift-${item.id}`} className="font-semibold text-neutral-900">
                      {item.name}
                    </p>
                    {item.price && <p className="mt-0.5 text-sm text-neutral-600">{shownPrice(item.price)}</p>}
                    {item.note && (
                      <p className="mt-1 w-fit rounded-md bg-buying px-2 py-0.5 text-sm font-semibold text-buying-ink">
                        {item.note === 'removed' ? copy.removedFrom(recipient.name) : copy.changedAfterClaim}
                      </p>
                    )}
                    {item.details && <p className="mt-0.5 text-sm text-neutral-600">{item.details}</p>}
                    {item.url && <ShopLink url={item.url} />}
                  </div>
                  <Undo itemId={item.id} unclaim={unclaim} onUndone={onUndone} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <PageNotices organizerName={organizerName} />
    </main>
  )
}

// Undo, as on a wish list: one call per tap, even two taps that land before the button redraws as
// disabled; Saving… while it saves; and a failure that says so and leaves the gift where it is,
// since the claim is still there. When the page is on its way out (lib/stale-page.ts) it says
// nothing and stays as Saving… until the page goes. It's disabled until the page's JavaScript runs.
// The button is described by the item's name, so a screen reader says which gift each Undo is for.
//
// The outer element stays put whatever the state, so screen readers announce each change in it.
function Undo({
  itemId,
  unclaim,
  onUndone,
}: {
  itemId: string
  unclaim: (itemId: string) => Promise<void>
  onUndone: (itemId: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const busy = useRef(false)
  const hydrated = useHydrated()

  async function undo() {
    if (busy.current) return
    busy.current = true
    setSaving(true)
    setFailed(false)
    try {
      await unclaim(itemId)
      onUndone(itemId)
    } catch (e) {
      if (pageIsLeaving(e)) return
      setFailed(true)
    } finally {
      busy.current = false
    }
    setSaving(false)
  }

  return (
    <div aria-live="polite" className="-ml-1 md:ml-0 md:shrink-0 md:text-right">
      <button
        type="button"
        onClick={undo}
        disabled={!hydrated || saving}
        aria-describedby={`gift-${itemId}`}
        className="inline-flex min-h-11 items-center px-1 text-sm text-link underline disabled:no-underline disabled:opacity-70"
      >
        {saving ? copy.saving : copy.undo}
      </button>
      {failed && <p className="px-1 text-sm font-semibold text-accent">{copy.saveFailed}</p>}
    </div>
  )
}
