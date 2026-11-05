import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  addPersonAction,
  createHouseholdAction,
  deletePersonAction,
  renameHouseholdAction,
  replaceLinkAction,
  updatePersonAction,
} from '@/app/organizer/actions'
import { NotSignedIn } from '@/components/NotSignedIn'
import { HouseholdCard } from '@/components/organizer/HouseholdCard'
import { NameForm } from '@/components/organizer/NameForm'
import { SignedInAs } from '@/components/SignedInAs'
import { copy } from '@/lib/copy'
import { getOrganizerData } from '@/lib/data/organizer'
import { getOrganizerName } from '@/lib/data/people'
import { getDb } from '@/lib/db'
import { getViewer } from '@/lib/session'

// Where the organizer sets up the family, once: households, then the adults and kids in each, and
// hands out each adult's personal link. Someone without a working cookie is told to tap the link in
// their email. Anyone else signed in gets "not found", as if there were no such page: getOrganizerData
// gives everyone but the organizer nothing, so no one else's links can reach their browser.
export default async function OrganizerPage() {
  const [viewer, db] = await Promise.all([getViewer(), getDb()])
  if (!viewer) return <NotSignedIn organizerName={await getOrganizerName(db)} />
  const data = await getOrganizerData(db, viewer)
  if (!data) notFound()

  const households = data.households.map(({ id, name }) => ({ id, name }))
  const actions = {
    renameHousehold: renameHouseholdAction,
    addPerson: addPersonAction,
    updatePerson: updatePersonAction,
    deletePerson: deletePersonAction,
    replaceLink: replaceLinkAction,
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-4 md:px-8 md:py-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/p/${encodeURIComponent(viewer.token)}`}
          className="inline-flex min-h-11 items-center text-sm text-link"
        >
          {copy.allLists}
        </Link>
        <SignedInAs name={viewer.name} />
      </div>

      <h1 className="mt-1 text-2xl font-bold text-neutral-900">{copy.organizerPage}</h1>

      <div className="mt-4 space-y-4">
        {data.households.map(household => (
          <HouseholdCard
            key={household.id}
            household={household}
            households={households}
            viewerId={viewer.id}
            actions={actions}
          />
        ))}
      </div>

      <section className="mt-6 rounded-xl border border-item-line bg-white p-4">
        <NameForm action={createHouseholdAction} label={copy.fieldHouseholdName} buttons={[{ label: copy.addHousehold }]} />
      </section>
    </main>
  )
}
