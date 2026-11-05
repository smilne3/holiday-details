import { redirect } from 'next/navigation'
import { NotSignedIn } from '@/components/NotSignedIn'
import { getOrganizerName } from '@/lib/data/people'
import { getDb } from '@/lib/db'
import { getViewer } from '@/lib/session'

// The bare address. Someone this browser remembers goes to their personal link, which is their
// home page; anyone else is told to tap the link in their email.
export default async function Root() {
  const viewer = await getViewer()
  if (viewer) redirect(`/p/${encodeURIComponent(viewer.token)}`)
  return <NotSignedIn organizerName={await getOrganizerName(await getDb())} />
}
