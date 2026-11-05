'use client'

import { startTransition, useActionState, useId, useRef, type FormEvent } from 'react'
import { copy } from '@/lib/copy'
import type { Result } from '@/lib/types'

// The add form, and the same three fields for editing an item. `action` is a Server Action with
// the owner's or the item's id already bound.
//
// It submits from onSubmit rather than <form action>, because React clears a form action's fields
// whenever it finishes, and a refused save (a link that doesn't look right) must keep what was
// typed so it can be fixed. The fields clear only once the server says the item saved. One save at
// a time: a second tap or Enter while saving sends nothing, so a slow network can't add an item
// twice.
//
// The inputs are 16px (text-base) so a phone doesn't zoom in on them, and the link field is plain
// text: the browser's own url check would refuse "amazon.com/…", which the server accepts.
export function ItemForm({
  action,
  submitLabel,
  initial,
  onSaved,
  onCancel,
}: {
  action: (prev: Result | null, form: FormData) => Promise<Result>
  submitLabel: string
  initial?: { name: string; details: string; link: string }
  onSaved?: () => void
  onCancel?: () => void
}) {
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const busy = useRef(false)

  const [state, dispatch, pending] = useActionState(
    async (prev: Result | null, form: FormData): Promise<Result> => {
      try {
        const result = await action(prev, form)
        if (result.ok) {
          formRef.current?.reset()
          onSaved?.()
        }
        return result
      } catch {
        return { ok: false, error: copy.saveFailed }
      } finally {
        busy.current = false
      }
    },
    null,
  )

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy.current) return
    busy.current = true
    const form = new FormData(e.currentTarget)
    startTransition(() => dispatch(form))
  }

  const fields = [
    { name: 'name', label: copy.fieldName, value: initial?.name },
    { name: 'details', label: copy.fieldDetails, value: initial?.details },
    { name: 'link', label: copy.fieldLink, value: initial?.link },
  ]

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-3">
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
          disabled={pending}
          className="min-h-11 w-full rounded-lg bg-accent px-5 font-semibold text-white disabled:opacity-70 md:w-auto"
        >
          {pending ? copy.saving : submitLabel}
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
