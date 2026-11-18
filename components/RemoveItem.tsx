'use client'

import { useRef, useState } from 'react'
import { copy } from '@/lib/copy'
import { pageIsLeaving } from '@/lib/stale-page'
import type { Result } from '@/lib/types'
import { useHydrated } from '@/lib/use-hydrated'

// Remove, asked about first, right there on the item: "Remove this?  Yes, remove  Keep it". No
// browser dialog. One call per tap, as with "I'll buy this". Once the server says it's gone, the
// page's refresh takes the item, and this with it, off the list; until then it reads Saving…. It
// reads Saving… too while the page is on its way out (lib/stale-page.ts), and says nothing else.
// Like every button that writes, it's disabled until the page's JavaScript runs (useHydrated).
//
// Gifts I'm buying uses it as the Undo on an off-list gift, which deletes the gift, so it asks too:
// label is the button's word before it asks, and describedBy names the gift it's for, as each Undo
// there does.
export function RemoveItem({
  itemId,
  remove,
  label = copy.remove,
  describedBy,
}: {
  itemId: string
  remove: (itemId: string) => Promise<Result>
  label?: string
  describedBy?: string
}) {
  const [step, setStep] = useState<'idle' | 'asking' | 'removing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const hydrated = useHydrated()

  async function yes() {
    if (busy.current) return
    busy.current = true
    setStep('removing')
    setError(null)
    try {
      const result = await remove(itemId)
      if (!result.ok) {
        setError(result.error)
        setStep('idle')
      }
    } catch (e) {
      if (pageIsLeaving(e)) return
      setError(copy.saveFailed)
      setStep('idle')
    } finally {
      busy.current = false
    }
  }

  const link = 'inline-flex min-h-11 items-center px-1 text-sm font-medium text-link underline disabled:opacity-70'

  return (
    <>
      {step === 'idle' ? (
        <button
          type="button"
          onClick={() => setStep('asking')}
          disabled={!hydrated}
          aria-describedby={describedBy}
          className={link}
        >
          {label}
        </button>
      ) : (
        <span className="inline-flex flex-wrap items-center gap-x-2">
          <span className="text-sm font-semibold text-neutral-800">{copy.removeConfirm}</span>
          <button
            type="button"
            onClick={yes}
            disabled={!hydrated || step === 'removing'}
            className="min-h-11 rounded-lg bg-accent px-3 text-sm font-semibold text-white disabled:opacity-70"
          >
            {step === 'removing' ? copy.saving : copy.removeYes}
          </button>
          {step === 'asking' && (
            <button type="button" onClick={() => setStep('idle')} className={link}>
              {copy.removeNo}
            </button>
          )}
        </span>
      )}
      {error && (
        <p role="alert" className="basis-full text-sm font-semibold text-accent">
          {error}
        </p>
      )}
    </>
  )
}
