'use client'

import { useId, useRef, useState } from 'react'
import { CopyButton } from '@/components/organizer/CopyButton'
import { NameForm } from '@/components/organizer/NameForm'
import { copy } from '@/lib/copy'
import { pageIsLeaving } from '@/lib/stale-page'
import type { OrganizerData, Result } from '@/lib/types'

// The organizer page's Server Actions for one person (app/organizer/actions.ts). Tests pass fakes.
export interface PersonActions {
  updatePerson: (personId: string, prev: Result | null, form: FormData) => Promise<Result>
  deletePerson: (personId: string) => Promise<Result>
  replaceLink: (personId: string) => Promise<Result>
}

type Step = 'idle' | 'editing' | 'askReplace' | 'replacing' | 'askRemove' | 'removing'

// One person on the organizer page. An adult has Copy link, Copy invitation and Replace link; a kid
// has no link, so none of them. Anyone can be renamed or moved to another household (Edit), and
// removed if they have no list and are buying nothing, which the server decides.
//
// The organizer's own row has no Replace link and no Remove: either would turn her away from this
// page, and the server refuses both anyway.
//
// Replace link and Remove ask first, right there in the row, with no browser dialog. One call per
// tap, as with "I'll buy this". When the page is on its way out (lib/stale-page.ts), they say
// nothing and stay as Saving… until it goes. The Copy buttons are keyed by the link, so once it's
// replaced, a Copied that was about the old one goes.
export function PersonRow({
  person,
  householdId,
  households,
  you,
  actions,
}: {
  person: OrganizerData['households'][number]['people'][number]
  householdId: string
  households: { id: string; name: string }[]
  you: boolean
  actions: PersonActions
}) {
  const [step, setStep] = useState<Step>('idle')
  const [message, setMessage] = useState<{ replaced: true } | { error: string } | null>(null)
  const busy = useRef(false)
  const selectId = useId()

  const writing = step === 'replacing' || step === 'removing'
  const link = () => `${window.location.origin}/p/${person.token}`

  function go(next: Step) {
    setMessage(null)
    setStep(next)
  }

  async function write(what: 'replace' | 'remove') {
    if (busy.current) return
    busy.current = true
    setStep(what === 'replace' ? 'replacing' : 'removing')
    setMessage(null)
    try {
      const result = await (what === 'replace' ? actions.replaceLink : actions.deletePerson)(person.id)
      if (!result.ok) {
        setMessage({ error: result.error })
        setStep('idle')
      } else if (what === 'replace') {
        setMessage({ replaced: true })
        setStep('idle')
      }
      // Removed: the page's refresh takes this row away. Until then it reads Saving….
    } catch (e) {
      if (pageIsLeaving(e)) return
      setMessage({ error: copy.saveFailed })
      setStep('idle')
    } finally {
      busy.current = false
    }
  }

  const linkButton = 'inline-flex min-h-11 items-center px-1 text-sm font-medium text-link underline disabled:opacity-70'
  const yesButton = 'min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-white disabled:opacity-70'

  function confirm(question: string, what: 'replace' | 'remove', saving: boolean) {
    return (
      <p className="flex flex-wrap items-center gap-x-2">
        <span className="text-sm font-semibold text-neutral-800">{question}</span>
        <button type="button" onClick={() => write(what)} disabled={saving} className={yesButton}>
          {saving ? copy.saving : copy.yes}
        </button>
        {!saving && (
          <button type="button" onClick={() => go('idle')} className={linkButton}>
            {copy.no}
          </button>
        )}
      </p>
    )
  }

  return (
    <li className="border-t border-row-line py-2 wrap-anywhere">
      <p className="flex flex-wrap items-center gap-x-1.5 font-semibold text-neutral-900">
        {person.name}
        {person.kind === 'kid' && (
          <span className="rounded-lg bg-kid px-1.5 py-px text-xs font-normal text-kid-ink">{copy.kid}</span>
        )}
        {you && <span className="rounded-lg bg-wish px-1.5 py-px text-xs font-normal text-wish-ink">{copy.you}</span>}
      </p>

      {step === 'editing' ? (
        <div className="mt-2">
          <NameForm
            action={actions.updatePerson.bind(null, person.id)}
            label={copy.fieldPersonName}
            initial={person.name}
            buttons={[{ label: copy.save }]}
            onSaved={() => go('idle')}
            onCancel={() => go('idle')}
          >
            <div>
              <label htmlFor={selectId} className="block text-sm font-medium text-neutral-700">
                {copy.fieldHousehold}
              </label>
              <select
                id={selectId}
                name="householdId"
                defaultValue={householdId}
                className="mt-1 block min-h-11 w-full rounded-lg border border-card-line bg-white px-3 text-base text-neutral-900"
              >
                {households.map(h => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          </NameForm>
        </div>
      ) : (
        <div className="-ml-1 flex flex-wrap items-center gap-x-3">
          {person.kind === 'adult' && person.token && (
            <>
              <CopyButton key={`link-${person.token}`} label={copy.copyLink} text={link} />
              <CopyButton
                key={`invitation-${person.token}`}
                label={copy.copyInvitation}
                text={() => copy.invitation(person.name, link())}
              />
            </>
          )}
          {person.kind === 'adult' && !you && (
            <button type="button" onClick={() => go('askReplace')} disabled={writing} className={linkButton}>
              {copy.replaceLink}
            </button>
          )}
          <button type="button" onClick={() => go('editing')} disabled={writing} className={linkButton}>
            {copy.edit}
          </button>
          {!you && (
            <button type="button" onClick={() => go('askRemove')} disabled={writing} className={linkButton}>
              {copy.remove}
            </button>
          )}
        </div>
      )}

      {(step === 'askReplace' || step === 'replacing') && confirm(copy.replaceConfirm, 'replace', step === 'replacing')}
      {(step === 'askRemove' || step === 'removing') &&
        confirm(copy.removePerson(person.name), 'remove', step === 'removing')}

      {message && 'replaced' in message && (
        <p role="status" className="text-sm font-semibold text-mine-ink">
          {copy.linkReplaced}
        </p>
      )}
      {message && 'error' in message && (
        <p role="alert" className="text-sm font-semibold text-accent">
          {message.error}
        </p>
      )}
    </li>
  )
}
