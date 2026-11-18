import { copy } from '@/lib/copy'
import { isUuid } from '@/lib/data/ids'
import type { Db } from '@/lib/db/types'
import { keptBy, normalizeLink } from '@/lib/format'
import { canClaim, canEdit, canSeeClaims } from '@/lib/rules'
import type {
  ItemInput,
  ListItem,
  ListViewData,
  OffListGift,
  OwnListItem,
  Person,
  PersonKind,
  Result,
  Viewer,
} from '@/lib/types'

// The schema's limits on an item (db/migrations/001_init.sql and 002_item_price.sql), checked here
// first so a long field gets copy.tooLong rather than a database error.
const MAX_NAME = 200
const MAX_DETAILS = 500
const MAX_PRICE = 40

// Someone's wish list as the viewer sees it, or null when the id names no one. Items come in the
// order they were added, so neither an edit nor a claim moves one.
//
// The surprise: the viewer's own list returns first, from a query that never reads claims or
// off-list gifts, so none can reach the page by any route. Its items have no claim key, rather than
// claim: null, and ListViewData's 'own' type has no room for one, or for an offList. owner.id is the
// id as stored, so an id typed in capitals is still the viewer's own.
export async function getListView(db: Db, viewer: Viewer, ownerId: string): Promise<ListViewData | null> {
  const found = await findPerson(db, ownerId)
  if (!found) return null
  const owner = { id: found.id, name: found.name, kind: found.kind }

  if (!canSeeClaims(viewer, found)) {
    const items = await itemsOnly(db, found.id)
    return { owner, mode: 'own', keptBy: null, canEdit: true, canClaim: false, items }
  }

  const [items, offList, keepers] = await Promise.all([
    itemsWithClaims(db, viewer, found.id),
    offListGifts(db, viewer, found.id),
    found.kind === 'kid' ? adultsIn(db, found.householdId) : [],
  ])
  // A kid's household with no adults would read "Kept by ", so it reads nothing.
  const kept = keepers.length > 0 ? keptBy(keepers) : null
  return canEdit(viewer, found)
    ? { owner, mode: 'kept', keptBy: kept, canEdit: true, canClaim: true, items, offList }
    : { owner, mode: 'other', keptBy: kept, canEdit: false, canClaim: true, items, offList }
}

// Adds an item to the owner's list, if the viewer keeps that list.
export async function addItem(db: Db, viewer: Viewer, ownerId: string, input: ItemInput): Promise<Result> {
  const owner = await findPerson(db, ownerId)
  if (!owner || !canEdit(viewer, owner)) return refused(copy.notAllowed)
  const item = checkInput(input)
  if (!item.ok) return item
  await db.query('insert into items (owner_id, name, details, url, price) values ($1, $2, $3, $4, $5)', [
    owner.id,
    item.name,
    item.details,
    item.url,
    item.price ?? null,
  ])
  return { ok: true }
}

// Adds an off-list gift for someone, bought by the viewer. Anyone who may claim from that person's
// list may add one, and no one may add one for themselves. The fields are checked as an item's are.
export async function addOffListGift(db: Db, viewer: Viewer, recipientId: string, input: ItemInput): Promise<Result> {
  const recipient = await findPerson(db, recipientId)
  if (!recipient || !canClaim(viewer, recipient)) return refused(copy.notAllowed)
  const gift = checkInput(input)
  if (!gift.ok) return gift
  await db.query(
    'insert into off_list_gifts (recipient_id, buyer_id, name, details, url, price) values ($1, $2, $3, $4, $5, $6)',
    [recipient.id, viewer.id, gift.name, gift.details, gift.url, gift.price ?? null],
  )
  return { ok: true }
}

// Saves an edit to an off-list gift. Only its buyer may edit it: not the person it's for, and not a
// kid's keepers, whatever they may do with the kid's own items. One that's no longer there was
// deleted by its buyer, in another tab, so it's gone. A field missing from the form leaves the
// stored value alone, as in updateItem.
//
// The person it's for hears gone too, just as for an id that names nothing, so even a forged
// request can't tell them one exists.
export async function updateOffListGift(db: Db, viewer: Viewer, giftId: string, input: ItemInput): Promise<Result> {
  if (!isUuid(giftId)) return refused(copy.notAllowed)
  const [found] = await db.query<{ buyer_id: string; recipient_id: string }>(
    'select buyer_id, recipient_id from off_list_gifts where id = $1',
    [giftId],
  )
  if (!found || found.recipient_id === viewer.id) return gone()
  if (found.buyer_id !== viewer.id) return refused(copy.notAllowed)
  const gift = checkInput(input)
  if (!gift.ok) return gift
  const rows = await db.query(
    `update off_list_gifts
        set name = $3, details = $4, url = $5, price = case when $7 then $6 else price end
      where id = $1 and buyer_id = $2
      returning id`,
    [giftId, viewer.id, gift.name, gift.details, gift.url, gift.price ?? null, gift.price !== undefined],
  )
  // No row: its buyer deleted it since the check above.
  return rows.length > 0 ? { ok: true } : gone()
}

// Deletes an off-list gift, from its list and from Gifts I'm buying. Unlike a removed item it
// leaves nothing behind: it has no claim to keep, so taking it back is deleting it (GLOSSARY.md).
// On screen that's Remove on the list and Undo in Gifts I'm buying. Only its buyer may. Deleting one
// that's already gone (a second tap, or another tab) is still done, and so is one for the viewer, so
// they hear what an id that names nothing gets.
export async function deleteOffListGift(db: Db, viewer: Viewer, giftId: string): Promise<Result> {
  if (!isUuid(giftId)) return refused(copy.notAllowed)
  const deleted = await db.query('delete from off_list_gifts where id = $1 and buyer_id = $2 returning id', [
    giftId,
    viewer.id,
  ])
  if (deleted.length > 0) return { ok: true }
  const [someoneElses] = await db.query<{ recipient_id: string }>(
    'select recipient_id from off_list_gifts where id = $1',
    [giftId],
  )
  return someoneElses && someoneElses.recipient_id !== viewer.id ? refused(copy.notAllowed) : { ok: true }
}

// Saves an edit. The permission check is against the item's owner as stored, never one the
// request names. A removed item can't be edited: someone who could edit it hears it's gone (a
// spouse took it off a kid's list while this page was open), and anyone else that they can't.
//
// updated_at moves only when something changed, the price included: Gifts I'm buying marks an item
// changed after its claim by comparing it, and a save that changed nothing would tell the buyer
// otherwise.
//
// The rule for edit fields: one missing from the form leaves the stored value alone. A deploy doesn't
// always retire the Server Actions a page already has (lib/stale-page.ts), so a page loaded before a
// field existed can still send its old form here, without that field. Blanking the field instead
// would wipe what someone else typed since, and mark the item changed for its buyer. The price is
// the first field added since the app went live, and $6 says whether the form had one. Any field
// added later must work the same way. Name, details and link have been on every form ever served, so
// only a forged request leaves one out, and app/list/actions.ts reads that as blank.
export async function updateItem(db: Db, viewer: Viewer, itemId: string, input: ItemInput): Promise<Result> {
  const found = await findItem(db, itemId)
  if (!found || !canEdit(viewer, found.owner)) return refused(copy.notAllowed)
  if (found.removed) return gone()
  const item = checkInput(input)
  if (!item.ok) return item
  // One statement, so the price kept is the one stored when the edit lands, with nothing read first.
  const rows = await db.query(
    `update items
        set name = $2, details = $3, url = $4, price = case when $6 then $5 else price end,
            updated_at = case when (name, details, url, price)
                                   is distinct from ($2, $3, $4, case when $6 then $5 else price end) then now()
                              else updated_at end
      where id = $1 and removed_at is null
      returning id`,
    [itemId, item.name, item.details, item.url, item.price ?? null, item.price !== undefined],
  )
  // No row: it was removed since the check above.
  return rows.length > 0 ? { ok: true } : gone()
}

// Takes an item off the list. Any claim on it stays, so the buyer's Gifts I'm buying can say it
// was removed. Removing it again (a second tap, or after someone else did) is still done, and keeps
// the first time.
export async function removeItem(db: Db, viewer: Viewer, itemId: string): Promise<Result> {
  const found = await findItem(db, itemId)
  if (!found || !canEdit(viewer, found.owner)) return refused(copy.notAllowed)
  await db.query('update items set removed_at = now() where id = $1 and removed_at is null', [itemId])
  return { ok: true }
}

function refused(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

// The item was taken off the list since the page loaded. The action refreshes, so it leaves the page.
function gone(): Result {
  return { ok: false, error: copy.gone, gone: true }
}

type PersonRow = { id: string; name: string; kind: PersonKind; household_id: string }

const toPerson = (r: PersonRow): Person => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  householdId: r.household_id,
})

async function findPerson(db: Db, id: string): Promise<Person | null> {
  if (!isUuid(id)) return null
  const [row] = await db.query<PersonRow>('select id, name, kind, household_id from people where id = $1', [
    id,
  ])
  return row ? toPerson(row) : null
}

// An item's owner as stored, and whether it's been removed. It never reads claims, so a check
// that refuses an owner (lib/data/claims.ts) is settled without touching one.
export async function findItem(db: Db, itemId: string): Promise<{ owner: Person; removed: boolean } | null> {
  if (!isUuid(itemId)) return null
  const [row] = await db.query<PersonRow & { removed: boolean }>(
    `select p.id, p.name, p.kind, p.household_id, i.removed_at is not null as removed
       from items i join people p on p.id = i.owner_id
      where i.id = $1`,
    [itemId],
  )
  return row ? { owner: toPerson(row), removed: row.removed } : null
}

type ItemRow = { id: string; name: string; price: string | null; details: string | null; url: string | null }

// The viewer's own list. This query must never touch claims.
async function itemsOnly(db: Db, ownerId: string): Promise<OwnListItem[]> {
  const rows = await db.query<ItemRow>(
    `select id, name, price, details, url from items
      where owner_id = $1 and removed_at is null
      order by created_at, id`,
    [ownerId],
  )
  return rows.map(r => ({ id: r.id, name: r.name, price: r.price, details: r.details, url: r.url }))
}

// Anyone else's list, with who's buying each item.
async function itemsWithClaims(db: Db, viewer: Viewer, ownerId: string): Promise<ListItem[]> {
  const rows = await db.query<ItemRow & { buyer_id: string | null; buyer_name: string | null }>(
    `select i.id, i.name, i.price, i.details, i.url, c.buyer_id, b.name as buyer_name
       from items i
       left join (claims c join people b on b.id = c.buyer_id) on c.item_id = i.id
      where i.owner_id = $1 and i.removed_at is null
      order by i.created_at, i.id`,
    [ownerId],
  )
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    price: r.price,
    details: r.details,
    url: r.url,
    claim:
      r.buyer_id === null || r.buyer_name === null
        ? null
        : { buyerName: r.buyer_name, mine: r.buyer_id === viewer.id },
  }))
}

// The off-list gifts for someone, with who's buying each. Only getListView calls this, and only
// for a list that isn't the viewer's own.
async function offListGifts(db: Db, viewer: Viewer, recipientId: string): Promise<OffListGift[]> {
  const rows = await db.query<ItemRow & { buyer_id: string; buyer_name: string }>(
    `select g.id, g.name, g.price, g.details, g.url, g.buyer_id, b.name as buyer_name
       from off_list_gifts g join people b on b.id = g.buyer_id
      where g.recipient_id = $1
      order by g.created_at, g.id`,
    [recipientId],
  )
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    price: r.price,
    details: r.details,
    url: r.url,
    buyerName: r.buyer_name,
    mine: r.buyer_id === viewer.id,
  }))
}

// The adults who keep a kid's list, by name.
async function adultsIn(db: Db, householdId: string): Promise<string[]> {
  const rows = await db.query<{ name: string }>(
    "select name from people where household_id = $1 and kind = 'adult' order by name, id",
    [householdId],
  )
  return rows.map(r => r.name)
}

// The form's fields, trimmed and checked against the schema's limits. Blank price, details or link is
// stored as null. The price is kept as typed, not read as a number: "about $25" and "$20–30" are
// what people write. A price the form didn't have at all stays undefined, which updateItem reads as
// "leave it as it is".
function checkInput(input: ItemInput):
  | { ok: true; name: string; price: string | null | undefined; details: string | null; url: string | null }
  | { ok: false; error: string } {
  const name = withoutNul(input.name).trim()
  const price = input.price === undefined ? undefined : withoutNul(input.price).trim()
  const details = withoutNul(input.details).trim()
  if (name === '') return refused(copy.nameRequired)
  if (chars(name) > MAX_NAME || chars(price ?? '') > MAX_PRICE || chars(details) > MAX_DETAILS) {
    return refused(copy.tooLong)
  }
  const link = normalizeLink(withoutNul(input.link))
  if (!link.ok) return refused(copy.badLink)
  return {
    ok: true,
    name,
    price: price === '' ? null : price,
    details: details === '' ? null : details,
    url: link.url,
  }
}

// Postgres answers a NUL in text with an error, and none belongs in a name, price, details or a link.
// No one types one, but a forged request can send it.
function withoutNul(s: string): string {
  return s.replaceAll('\u0000', '')
}

// Length as Postgres counts it, in characters: an emoji is one, where JavaScript's length says two.
function chars(s: string): number {
  return [...s].length
}
