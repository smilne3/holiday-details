import type { Db } from '@/lib/db/types'
import type { HomeData, PersonKind, Viewer } from '@/lib/types'

// Whoever holds this personal-link token, or null for a stale, mistyped or made-up one. Only adults
// have tokens (the schema checks it).
export async function findViewerByToken(db: Db, token: string): Promise<Viewer | null> {
  // Postgres answers a NUL in text with an error, not a non-match, and no token has one.
  if (token.includes('\u0000')) return null
  const [row] = await db.query<{
    id: string
    name: string
    kind: PersonKind
    household_id: string
    token: string
    is_organizer: boolean
  }>(
    'select id, name, kind, household_id, token, is_organizer from people where token = $1',
    [token],
  )
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    householdId: row.household_id,
    token: row.token,
    isOrganizer: row.is_organizer,
  }
}

// The home screen. Each household lists its members without the viewer, adults first and then
// kids, each by name; a household with no one else in it isn't shown.
export async function getHome(db: Db, viewer: Viewer): Promise<HomeData> {
  const [[counts], rows] = await Promise.all([
    // Live items on the viewer's own list, claimed or not, so the count can't give a claim away.
    // The viewer's claims include ones on items since removed: those stay in Gifts I'm buying.
    db.query<{ my_item_count: number; buying_count: number }>(
      `select (select count(*)::int from items where owner_id = $1 and removed_at is null) as my_item_count,
              (select count(*)::int from claims where buyer_id = $1) as buying_count`,
      [viewer.id],
    ),
    db.query<{ household_id: string; household_name: string; id: string; name: string; kind: PersonKind }>(
      `select h.id as household_id, h.name as household_name, p.id, p.name, p.kind
         from households h join people p on p.household_id = h.id
        where p.id <> $1
        order by h.name, h.id, p.kind = 'kid', p.name, p.id`,
      [viewer.id],
    ),
  ])

  const households: HomeData['households'] = []
  for (const r of rows) {
    let household = households.at(-1)
    if (household?.id !== r.household_id) {
      household = { id: r.household_id, name: r.household_name, members: [] }
      households.push(household)
    }
    household.members.push({ id: r.id, name: r.name, kind: r.kind })
  }
  return { myItemCount: counts.my_item_count, buyingCount: counts.buying_count, households }
}

// The name the not-signed-in page tells people to ask. If there's ever more than one organizer,
// it's the first one set up.
export async function getOrganizerName(db: Db): Promise<string | null> {
  const [row] = await db.query<{ name: string }>(
    'select name from people where is_organizer order by created_at, id limit 1',
  )
  return row?.name ?? null
}
