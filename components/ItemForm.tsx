'use client'

import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { copy } from '@/lib/copy'
import { pageIsLeaving, restoreDraft } from '@/lib/stale-page'
import type { Result } from '@/lib/types'
import { useHydrated } from '@/lib/use-hydrated'

// The add form, and the same four fields for editing an item. `action` is a Server Action with
// the owner's or the item's id already bound.
//
// It submits from onSubmit rather than <form action>, because React clears a form action's fields
// whenever it finishes, and a refused save (a link that doesn't look right) must keep what was
// typed so it can be fixed. The fields clear only once the server says the item saved. One save at
// a time: a second tap or Enter while saving sends nothing, so a slow network can't add an item
// twice.
//
// Before the page's JavaScript runs, the button is disabled, which also stops Enter from sending the
// form. A form the browser sent itself would go by GET, with what was typed in the address and in
// the server's logs, so it's method="post": even then nothing typed reaches the address, and with
// no Server Action named, nothing is saved.
//
// When the page is on its way out (lib/stale-page.ts), it says nothing and stays as Saving… until
// the page goes. The add form passes a draftKey, so what was typed survives a reload after a deploy
// and is put back as the form mounts. The edit form passes none, and reloads without its edit.
//
// The inputs are 16px (text-base) so a phone doesn't zoom in on them, and the link field is plain
// text: the browser's own url check would refuse "amazon.com/…", which the server accepts. The price
// is plain text too, with the ordinary keyboard: it's "about $25" as often as "40", and a number
// keypad would hide the "$".
export function ItemForm({
  action,
  submitLabel,
  initial,
  draftKey,
  onSaved,
  onCancel,
}: {
  action: (prev: Result | null, form: FormData) => Promise<Result>
  submitLabel: string
  initial?: { name: string; price: string; details: string; link: string }
  draftKey?: string
  onSaved?: () => void
  onCancel?: () => void
}) {
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const busy = useRef(false)
  const [leaving, setLeaving] = useState(false)
  const hydrated = useHydrated()

  useEffect(() => {
    if (draftKey) restoreDraft(draftKey, formRef.current)
  }, [draftKey])

  const [state, dispatch, pending] = useActionState(
    async (prev: Result | null, form: FormData): Promise<Result | null> => {
      try {
        const result = await action(prev, form)
        if (result.ok) {
          formRef.current?.reset()
          onSaved?.()
        }
        busy.current = false
        return result
      } catch (e) {
        if (pageIsLeaving(e, draftKey ? { key: draftKey, form: formRef.current } : undefined)) {
          setLeaving(true) // and busy stays set: nothing more is sent from this page
          return prev
        }
        busy.current = false
        return { ok: false, error: copy.saveFailed }
      }
    },
    null,
  )
  const saving = pending || leaving

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy.current) return
    busy.current = true
    const form = new FormData(e.currentTarget)
    startTransition(() => dispatch(form))
  }

  const fields = [
    { name: 'name', label: copy.fieldName, value: initial?.name },
    { name: 'price', label: copy.fieldPrice, value: initial?.price },
    { name: 'details', label: copy.fieldDetails, value: initial?.details },
    { name: 'link', label: copy.fieldLink, value: initial?.link },
  ]

  return (
    <form ref={formRef} method="post" onSubmit={submit} className="space-y-3">
      {fields.map(f => (
        <div key={f.name}>
          <label htmlFor={`${id}-${f.name}`} className="block text-sm font-medium text-neutral-700">
            {f.label}
          </label>
          <input
            id={`${id}-${f.name}`}
            name={f.name}
            type="text"
            inputMode={f.name === 'link' ? 'url' : undefined}
            autoComplete="off"
            defaultValue={f.value}
            className="mt-1 block min-h-11 w-full rounded-lg border border-card-line bg-white px-3 text-base text-neutral-900"
          />
        </div>
      ))}

      {state && !state.ok && (
        <p role="alert" className="text-sm font-semibold text-accent">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!hydrated || saving}
          className="min-h-11 w-full rounded-lg bg-accent px-5 py-2 font-semibold text-white wrap-anywhere disabled:opacity-70 md:w-auto"
        >
          {saving ? copy.saving : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-11 px-2 font-medium text-link underline">
            {copy.cancel}
          </button>
        )}
      </div>
    </form>
  )
}
