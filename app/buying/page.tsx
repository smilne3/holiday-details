import { unclaimAction } from '@/app/list/actions'
import { BuyingView } from '@/components/BuyingView'
import { NotSignedIn } from '@/components/NotSignedIn'
import { getBuying } from '@/lib/data/claims'
import { getOrganizerName } from '@/lib/data/people'
import { getDb } from '@/lib/db'
import { getViewer } from '@/lib/session'

// Gifts I'm buying, for the viewer the cookie names. Someone without a working cookie is told to tap
// the link in their email.
//
// getBuying reads only the viewer's own claims, so no one else's can reach BuyingView's props, and
// so none can reach the browser. Undo is the wish-list page's own action: it looks the viewer up
// again and clears only their claim, then refreshes this page.
export default async function BuyingPage() {
  const [viewer, db] = await Promise.all([getViewer(), getDb()])
  if (!viewer) return <NotSignedIn organizerName={await getOrganizerName(db)} />
  const [groups, organizerName] = await Promise.all([getBuying(db, viewer), getOrganizerName(db)])
  return (
    <BuyingView
      groups={groups}
      viewerName={viewer.name}
      homeHref={`/p/${encodeURIComponent(viewer.token)}`}
      organizerName={organizerName}
      unclaim={unclaimAction}
    />
  )
}
