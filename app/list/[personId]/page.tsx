import { notFound } from 'next/navigation'
import {
  addItemAction,
  addOffListAction,
  claimAction,
  removeItemAction,
  removeOffListAction,
  unclaimAction,
  updateItemAction,
  updateOffListAction,
} from '@/app/list/actions'
import { ListView } from '@/components/ListView'
import { NotSignedIn } from '@/components/NotSignedIn'
import { getListView } from '@/lib/data/lists'
import { getOrganizerName } from '@/lib/data/people'
import { getDb } from '@/lib/db'
import { getViewer } from '@/lib/session'

// Anyone's wish list, as the viewer the cookie names sees it. Someone without a working cookie is
// told to tap the link in their email; an id that names no one (removed, mistyped, made up) gets
// "That list isn't here any more".
//
// The organizer's name is for the notice a phone whose buttons never work shows (PageNotices).
//
// getListView decides what the viewer may see. On their own list it never reads claims or off-list
// gifts, so none can reach ListView's props, and so none can reach the browser.
//
// params is typed by hand rather than with PageProps, which exists only after `next build` or
// `next typegen`, and CI type-checks before it builds.
export default async function ListPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params
  const [viewer, db] = await Promise.all([getViewer(), getDb()])
  if (!viewer) return <NotSignedIn organizerName={await getOrganizerName(db)} />
  const [view, organizerName] = await Promise.all([getListView(db, viewer, personId), getOrganizerName(db)])
  if (!view) notFound()
  return (
    <ListView
      view={view}
      viewerName={viewer.name}
      homeHref={`/p/${encodeURIComponent(viewer.token)}`}
      organizerName={organizerName}
      actions={{
        claim: claimAction,
        unclaim: unclaimAction,
        add: addItemAction,
        update: updateItemAction,
        remove: removeItemAction,
        addOffList: addOffListAction,
        updateOffList: updateOffListAction,
        removeOffList: removeOffListAction,
      }}
    />
  )
}
