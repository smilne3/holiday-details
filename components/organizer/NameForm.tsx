'use client'

import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { copy } from '@/lib/copy'
import { pageIsLeaving, restoreDraft } from '@/lib/stale-page'
import type { Result } from '@/lib/types'
import { useHydrated } from '@/lib/use-hydrated'

// The organizer page's forms: a name, any other fields passed as children (a person's household),
// and one or more buttons. A button with a name and value sends them too, so "Add an adult" and
// "Add a kid" can share one name field.
//
// With one button, Enter saves, as anywhere. With more than one, Enter in the name field (or Go on
// a phone's keyboard) does nothing, and the organizer taps the one they mean: a browser would press
// the first, and a kid typed and entered would become an adult with a live link. Keyboards differ,
// so there are two guards. Enter is cancelled where the keyboard reports it. And the first submit
// button, which is the one a browser presses for Enter, is a hidden, disabled one, so it presses
// nothing.
//
// As in ItemForm, it submits from onSubmit rather than <form action>, so a refused save keeps what
// was typed; the fields clear only once the server says it saved. One save at a time: a second tap
// or Enter while saving sends nothing, so a slow network can't add someone twice. And as there,
// when the page is on its way out (lib/stale-page.ts) it says nothing and stays as Saving…, and an
// add form's draftKey keeps what was typed across a reload after a deploy. And as there, the buttons
// are disabled until the page's JavaScript runs, and the form is method="post", so a form the
// browser sent itself would put nothing typed in the address.
export function NameForm({
  action,
  label,
  initial,
  buttons,
  draftKey,
  onSaved,
  onCancel,
  children,
}: {
  action: (prev: Result | null, form: FormData) => Promise<Result>
  label: string
  initial?: string
  buttons: { label: string; name?: string; value?: string }[]
  draftKey?: string
  onSaved?: () => void
  onCancel?: () => void
  children?: ReactNode
}) {
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const busy = useRef(false)
  const [pressed, setPressed] = useState(0)
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

  const several = buttons.length > 1

  function noEnter(e: KeyboardEvent<HTMLFormElement>) {
    if (several && e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault()
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy.current) return
    busy.current = true
    const submitter = (e.nativeEvent as SubmitEvent).submitter
    setPressed(Number(submitter?.dataset.index ?? 0))
    const form = new FormData(e.currentTarget, submitter)
    startTransition(() => dispatch(form))
  }

  return (
    <form ref={formRef} method="post" onSubmit={submit} onKeyDown={noEnter} className="space-y-3">
      {several && <button type="submit" disabled hidden />}
      <div>
        <label htmlFor={`${id}-name`} className="block text-sm font-medium text-neutral-700">
          {label}
        </label>
        <input
          id={`${id}-name`}
          name="name"
          type="text"
          autoComplete="off"
          defaultValue={initial}
          className="mt-1 block min-h-11 w-full rounded-lg border border-card-line bg-white px-3 text-base text-neutral-900"
        />
      </div>
      {children}

      {state && !state.ok && (
        <p role="alert" className="text-sm font-semibold text-accent">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {buttons.map((b, i) => (
          <button
            key={b.label}
            type="submit"
            name={b.name}
            value={b.value}
            data-index={i}
            disabled={!hydrated || saving}
            className="min-h-11 flex-1 rounded-lg bg-accent px-5 font-semibold text-white disabled:opacity-70 md:flex-none"
          >
            {saving && pressed === i ? copy.saving : b.label}
          </button>
        ))}
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-11 px-2 font-medium text-link underline">
            {copy.cancel}
          </button>
        )}
      </div>
    </form>
  )
}
