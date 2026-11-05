'use client'

import { useRef, useState } from 'react'
import { copy } from '@/lib/copy'
import type { ClaimResult } from '@/lib/types'

type Status = 'open' | 'claiming' | 'mine' | 'undoing' | 'taken' | 'gone'

// "I'll buy this", and once it's the viewer's, "✓ You're buying this · Undo". This is where a
// duplicate gift or a false ✓ would happen, so:
//   - one call per tap: a second tap while the first is saving does nothing, even one that lands
//     before the button redraws as disabled
//   - the ✓ shows only after the server says 'claimed'; until then the button reads Saving…
//   - a save that fails says so, and the button comes back to try again
//
// The page refreshes after a claim or an Undo, and ListView keys this by item id, so this instance
// carries on through it: the "Added to Gifts I'm buying" hint, which only this tap earned, lives
// here and survives. When a refresh says the claim changed some other way (another tab), `initial`
// changes and the control follows it, so a ✓ is never left standing for a claim that's gone.
//
// The outer element stays put whatever the state, so screen readers announce each change in it.
export function ItemClaim({
  itemId,
  initial,
  claim,
  unclaim,
}: {
  itemId: string
  initial: 'open' | 'mine'
  claim: (itemId: string) => Promise<ClaimResult>
  unclaim: (itemId: string) => Promise<void>
}) {
  const [status, setStatus] = useState<Status>(initial)
  const [justClaimed, setJustClaimed] = useState(false)
  const [failed, setFailed] = useState(false)
  const busy = useRef(false)

  const [shown, setShown] = useState(initial)
  if (initial !== shown) {
    setShown(initial)
    setStatus(initial)
    setFailed(false)
    if (initial === 'open') setJustClaimed(false)
  }

  async function buy() {
    if (busy.current) return
    busy.current = true
    setStatus('claiming')
    setFailed(false)
    try {
      const result = await claim(itemId)
      if (result === 'claimed') {
        setStatus('mine')
        setJustClaimed(true)
      } else if (result === 'taken' || result === 'gone') {
        setStatus(result)
      } else {
        // 'not-allowed': the viewer's link stopped working since the page loaded. It didn't save.
        setStatus('open')
        setFailed(true)
      }
    } catch {
      setStatus('open')
      setFailed(true)
    } finally {
      busy.current = false
    }
  }

  async function undo() {
    if (busy.current) return
    busy.current = true
    setStatus('undoing')
    setFailed(false)
    try {
      await unclaim(itemId)
      setStatus('open')
      setJustClaimed(false)
    } catch {
      // The claim is still there, so the ✓ stays.
      setStatus('mine')
      setFailed(true)
    } finally {
      busy.current = false
    }
  }

  const mine = status === 'mine' || status === 'undoing'
  const open = status === 'open' || status === 'claiming'

  return (
    <div aria-live="polite" className={`md:mt-0 md:shrink-0 ${open ? 'mt-2.5' : 'mt-2 md:max-w-60'}`}>
      {open && (
        <button
          type="button"
          onClick={buy}
          disabled={status === 'claiming'}
          className="min-h-11 w-full rounded-lg bg-accent px-[18px] font-semibold whitespace-nowrap text-white disabled:opacity-70 md:w-auto"
        >
          {status === 'claiming' ? copy.saving : copy.illBuyThis}
        </button>
      )}

      {mine && (
        <>
          <p className="flex flex-wrap items-center text-sm font-semibold text-mine-ink">
            <span>{copy.youreBuying}</span>
            <span aria-hidden="true" className="mx-1.5 text-neutral-400">
              ·
            </span>
            <button
              type="button"
              onClick={undo}
              disabled={status === 'undoing'}
              className="inline-flex min-h-11 items-center px-1 font-normal text-link underline disabled:no-underline disabled:opacity-70"
            >
              {status === 'undoing' ? copy.saving : copy.undo}
            </button>
          </p>
          {justClaimed && <p className="text-xs text-mine-ink">{copy.addedToBuying}</p>}
        </>
      )}

      {status === 'taken' && <p className="text-sm font-semibold text-neutral-700">{copy.justTaken}</p>}
      {status === 'gone' && <p className="text-sm font-semibold text-neutral-700">{copy.gone}</p>}

      {failed && <p className="mt-1 text-sm font-semibold text-accent">{copy.saveFailed}</p>}
    </div>
  )
}
