import { HomeView } from '@/components/HomeView'
import { NotSignedIn } from '@/components/NotSignedIn'
import { findViewerByToken, getHome, getOrganizerName } from '@/lib/data/people'
import { getDb } from '@/lib/db'

// The home page, at the personal link itself, so a bookmark of it works on any device. It goes by
// the token in the address, never the cookie: on someone's first visit the proxy is setting the
// cookie on this very response, so the request doesn't carry it yet. A token that is no one's gets
// the page that says to tap the link in the email.
//
// params is typed by hand rather than with PageProps, which exists only after `next build` or
// `next typegen`, and CI type-checks before it builds.
export default async function Home({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const db = await getDb()
  const viewer = await findViewerByToken(db, token)
  if (!viewer) return <NotSignedIn organizerName={await getOrganizerName(db)} />
  return (
    <HomeView
      viewer={{ id: viewer.id, name: viewer.name, isOrganizer: viewer.isOrganizer }}
      home={await getHome(db, viewer)}
    />
  )
}
