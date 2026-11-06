'use client'

import { useState } from 'react'
import { NameForm } from '@/components/organizer/NameForm'
import { PersonRow, type PersonActions } from '@/components/organizer/PersonRow'
import { copy } from '@/lib/copy'
import type { OrganizerData, Result } from '@/lib/types'

// The organizer page's Server Actions (app/organizer/actions.ts). Tests pass fakes.
export interface OrganizerActions extends PersonActions {
  renameHousehold: (householdId: string, prev: Result | null, form: FormData) => Promise<Result>
  addPerson: (householdId: string, prev: Result | null, form: FormData) => Promise<Result>
}

// One household on the organizer page: its name with Rename, everyone in it, and a name field with
// "Add an adult" and "Add a kid".
export function HouseholdCard({
  household,
  households,
  viewerId,
  actions,
}: {
  household: OrganizerData['households'][number]
  households: { id: string; name: string }[]
  viewerId: string
  actions: OrganizerActions
}) {
  const [renaming, setRenaming] = useState(false)
  const headingId = `household-${household.id}`

  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-card-line bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <h2 id={headingId} className="text-lg font-bold text-family">
          {household.name}
        </h2>
        {!renaming && (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-link underline"
          >
            {copy.rename}
          </button>
        )}
      </div>
      {renaming && (
        <div className="mb-3">
          <NameForm
            action={actions.renameHousehold.bind(null, household.id)}
            label={copy.fieldHouseholdName}
            initial={household.name}
            buttons={[{ label: copy.save }]}
            onSaved={() => setRenaming(false)}
            onCancel={() => setRenaming(false)}
          />
        </div>
      )}

      {household.people.length === 0 ? (
        <p className="border-t border-row-line py-3 text-sm text-neutral-600">{copy.householdEmpty}</p>
      ) : (
        <ul>
          {household.people.map(person => (
            <PersonRow
              key={person.id}
              person={person}
              householdId={household.id}
              households={households}
              you={person.id === viewerId}
              actions={actions}
            />
          ))}
        </ul>
      )}

      <div className="mt-1 border-t border-row-line pt-3 pb-1">
        <NameForm
          action={actions.addPerson.bind(null, household.id)}
          label={copy.fieldNewPerson}
          draftKey={`add-person:${household.id}`}
          buttons={[
            { label: copy.addAdult, name: 'kind', value: 'adult' },
            { label: copy.addKid, name: 'kind', value: 'kid' },
          ]}
        />
      </div>
    </section>
  )
}
