import { isUuid } from '@/lib/data/ids'
import { findItem } from '@/lib/data/lists'
import { isUniqueViolation, type Db } from '@/lib/db/types'
import { canClaim } from '@/lib/rules'
import type { BuyingGroup, ClaimResult, Viewer } from '@/lib/types'

// "I'll buy this". The claims table's primary key allows one buyer per item, so when two people
// claim at once exactly one is told 'claimed' and the other 'taken'.
//
// The checks run in this order:
//   1. a malformed or unknown id, or a removed item: 'gone'
//   2. the viewer's own item: 'not-allowed', claimed or not. It's settled before claims are read or
//      written, so the answer can't give a claim on their own list away.
//   3. the insert: 'claimed' if it went in, otherwise see whyNotClaimed.
export async function claimItem(db: Db, viewer: Viewer, itemId: string): Promise<ClaimResult> {
  const found = await findItem(db, itemId)
  if (!found || found.removed) return 'gone'
  if (!canClaim(viewer, found.owner)) return 'not-allowed'
  return (await insertClaim(db, viewer, itemId)) ? 'claimed' : whyNotClaimed(db, viewer, itemId)
}

// Undo. Only the viewer's own claim goes, so a forged request can't clear anyone else's, and a
// parent can't clear one on their kid's list. A claim on a removed item can be undone too: that's
// how it leaves Gifts I'm buying.
export async function unclaimItem(db: Db, viewer: Viewer, itemId: string): Promise<void> {
  if (!isUuid(itemId)) return
  await db.query('delete from claims where item_id = $1 and buyer_id = $2', [itemId, viewer.id])
}

// Gifts I'm buying: the viewer's own claims and no one else's, grouped by recipient in name order,
// and each group in the order of that person's list. Items removed since they were claimed stay,
// noted, so the buyer finds out.
export async function getBuying(db: Db, viewer: Viewer): Promise<BuyingGroup[]> {
  const rows = await db.query<{
    recipient_id: string
    recipient_name: string
    id: string
    name: string
    price: string | null
    details: string | null
    url: string | null
    removed: boolean
    changed: boolean
  }>(
    `select p.id as recipient_id, p.name as recipient_name, i.id, i.name, i.price, i.details, i.url,
            i.removed_at is not null as removed, i.updated_at > c.created_at as changed
       from claims c
       join items i on i.id = c.item_id
       join people p on p.id = i.owner_id
      where c.buyer_id = $1
      order by p.name, p.id, i.created_at, i.id`,
    [viewer.id],
  )

  const groups: BuyingGroup[] = []
  for (const r of rows) {
    let group = groups.at(-1)
    if (group?.recipient.id !== r.recipient_id) {
      group = { recipient: { id: r.recipient_id, name: r.recipient_name }, items: [] }
      groups.push(group)
    }
    group.items.push({
      id: r.id,
      name: r.name,
      price: r.price,
      details: r.details,
      url: r.url,
      // Edited and then removed reads as removed: that's the one the buyer must act on.
      note: r.removed ? 'removed' : r.changed ? 'changed' : null,
    })
  }
  return groups
}

// Whether the viewer's claim went in. The insert selects the item again, so one removed since the
// check in claimItem gets no claim.
async function insertClaim(db: Db, viewer: Viewer, itemId: string): Promise<boolean> {
  try {
    const rows = await db.query(
      `insert into claims (item_id, buyer_id)
       select id, $2 from items where id = $1 and removed_at is null
       on conflict (item_id) do nothing
       returning item_id`,
      [itemId, viewer.id],
    )
    return rows.length > 0
  } catch (e) {
    // on conflict settles a race inside Postgres, so this shouldn't arise. If a driver ever reports
    // the primary key's violation instead, it means the same thing: someone got there first. Any
    // other error is thrown, so a failure never reads as 'taken'.
    if (isUniqueViolation(e)) return false
    throw e
  }
}

// The insert put nothing in: either the item was removed in the meantime, or someone holds it.
// When that someone is the viewer (a second tab, a retried tap) the answer is still 'claimed',
// because it's true, and 'taken' would tell them someone else is buying it.
async function whyNotClaimed(db: Db, viewer: Viewer, itemId: string): Promise<ClaimResult> {
  const [row] = await db.query<{ removed: boolean; buyer_id: string | null }>(
    `select i.removed_at is not null as removed, c.buyer_id
       from items i left join claims c on c.item_id = i.id
      where i.id = $1`,
    [itemId],
  )
  if (!row || row.removed) return 'gone'
  return row.buyer_id === viewer.id ? 'claimed' : 'taken'
}
