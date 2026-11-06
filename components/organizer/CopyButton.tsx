'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { copy } from '@/lib/copy'
import { useHydrated } from '@/lib/use-hydrated'

// Copies a personal link, or the invitation with it, for the organizer to paste into an email.
// `text` is asked for on the tap, since the link starts with this page's own address, which only
// the browser knows.
//
// It says Copied only once the clipboard has taken it. When there's no clipboard (an address that
// isn't https) or it refuses, the whole text shows in a read-only field, selected, to copy by hand,
// so a tap never does nothing. Until the page's JavaScript runs it's disabled, since then it would.
export function CopyButton({ label, text }: { label: string; text: () => string }) {
  const [status, setStatus] = useState<{ copied: true } | { byHand: string } | null>(null)
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const id = useId()
  const hydrated = useHydrated()

  async function copyIt() {
    const value = text()
    try {
      if (!navigator.clipboard) throw new Error('No clipboard here')
      await navigator.clipboard.writeText(value)
      setStatus({ copied: true })
    } catch {
      setStatus({ byHand: value })
    }
  }

  const byHand = status && 'byHand' in status ? status.byHand : null
  useEffect(() => {
    if (byHand === null) return
    field.current?.focus()
    field.current?.select()
  }, [byHand])

  const fieldClass = 'mt-1 block w-full rounded-lg border border-card-line bg-white px-3 text-base text-neutral-900'

  return (
    <>
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={copyIt}
          disabled={!hydrated}
          className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-link underline disabled:opacity-70"
        >
          {label}
        </button>
        <span role="status" className="text-sm font-semibold text-mine-ink">
          {status && 'copied' in status ? copy.copied : ''}
        </span>
      </span>
      {byHand !== null && (
        <div className="basis-full px-1 py-1">
          <label htmlFor={id} className="block text-sm font-medium text-neutral-700">
            {copy.copyByHand}
          </label>
          {byHand.includes('\n') ? (
            <textarea
              id={id}
              ref={field}
              readOnly
              value={byHand}
              rows={12}
              onFocus={e => e.currentTarget.select()}
              className={`${fieldClass} py-2`}
            />
          ) : (
            <input
              id={id}
              ref={field}
              readOnly
              value={byHand}
              onFocus={e => e.currentTarget.select()}
              className={`${fieldClass} min-h-11`}
            />
          )}
        </div>
      )}
    </>
  )
}
