import { copy } from '@/lib/copy'
import { isUuid } from '@/lib/data/ids'
import type { Db } from '@/lib/db/types'
import { keptBy, normalizeLink } from '@/lib/format'
import { canClaim, canEdit, canSeeClaims } from '@/lib/rules'
import type { ItemInput, ListItem, ListViewData, Person, PersonKind, Result, Viewer } from '@/lib/types'

// The schema's limits on an item (db/migrations/001_init.sql), checked here first so a long field
// gets copy.tooLong rather than a database error.
const MAX_NAME = 200
const MAX_DETAILS = 500

// Someone's wish list as the viewer sees it, or null when the id names no one. Items come in the
// order they were added, so neither an edit nor a claim moves one.
//
// The surprise: on the viewer's own list, claims aren't read at all, so they can't reach the page
// by any route. Those items have no claim key, rather than claim: null.
export async function getListView(db: Db, viewer: Viewer, ownerId: string): Promise<ListViewData | null> {
  const owner = await findPerson(db, ownerId)
  if (!owner) return null
  const seesClaims = canSeeClaims(viewer, owner)
  const [items, keepers] = await Promise.all([
    seesClaims ? itemsWithClaims(db, viewer, owner.id) : itemsOnly(db, owner.id),
    owner.kind === 'kid' ? adultsIn(db, owner.householdId) : [],
  ])
  return {
    owner: { id: owner.id, name: owner.name, kind: owner.kind },
    mode: !seesClaims ? 'own' : canEdit(viewer, owner) ? 'kept' : 'other',
    // A kid's household with no adults would read "Kept by ", so it reads nothing.
    keptBy: keepers.length > 0 ? keptBy(keepers) : null,
    canEdit: canEdit(viewer, owner),
    canClaim: canClaim(viewer, owner),
    items,
  }
}

// Adds an item to the owner's list, if the viewer keeps that list.
export async function addItem(db: Db, viewer: Viewer, ownerId: string, input: ItemInput): Promise<Result> {
  const owner = await findPerson(db, ownerId)
  if (!owner || !canEdit(viewer, owner)) return refused(copy.notAllowed)
  const item = checkInput(input)
  if (!item.ok) return item
  await db.query('insert into items (owner_id, name, details, url) values ($1, $2, $3, $4)', [
    owner.id,
    item.name,
    item.details,
    item.url,
  ])
  return { ok: true }
}

// Saves an edit. The permission check is against the item's owner as stored, never one the
// request names. A removed item can't be edited.
//
// updated_at moves only when something changed: Gifts I'm buying marks an item changed after its
// claim by comparing it, and a save that changed nothing would tell the buyer otherwise.
export async function updateItem(db: Db, viewer: Viewer, itemId: string, input: ItemInput): Promise<Result> {
  const found = await findItem(db, itemId)
  if (!found || found.removed || !canEdit(viewer, found.owner)) return refused(copy.notAllowed)
  const item = checkInput(input)
  if (!item.ok) return item
  const rows = await db.query(
    `update items
        set name = $2, details = $3, url = $4,
            updated_at = case when (name, details, url) is distinct from ($2, $3, $4) then now()
                              else updated_at end
      where id = $1 and removed_at is null
      returning id`,
    [itemId, item.name, item.details, item.url],
  )
  // No row: it was removed since the check above.
  return rows.length > 0 ? { ok: true } : refused(copy.notAllowed)
}

// Takes an item off the list. Any claim on it stays, so the buyer's Gifts I'm buying can say it
// was removed. Removing it again (a second tap) is still done, and keeps the first time.
export async function removeItem(db: Db, viewer: Viewer, itemId: string): Promise<Result> {
  const found = await findItem(db, itemId)
  if (!found || !canEdit(viewer, found.owner)) return refused(copy.notAllowed)
  await db.query('update items set removed_at = now() where id = $1 and removed_at is null', [itemId])
  return { ok: true }
}

function refused(error: string): { ok: false; error: string } {
  return { ok: false, error }
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

// An item's owner as stored, and whether it's been removed.
async function findItem(db: Db, itemId: string): Promise<{ owner: Person; removed: boolean } | null> {
  if (!isUuid(itemId)) return null
  const [row] = await db.query<PersonRow & { removed: boolean }>(
    `select p.id, p.name, p.kind, p.household_id, i.removed_at is not null as removed
       from items i join people p on p.id = i.owner_id
      where i.id = $1`,
    [itemId],
  )
  return row ? { owner: toPerson(row), removed: row.removed } : null
}

type ItemRow = { id: string; name: string; details: string | null; url: string | null }

// The viewer's own list. This query must never touch claims.
async function itemsOnly(db: Db, ownerId: string): Promise<ListItem[]> {
  const rows = await db.query<ItemRow>(
    `select id, name, details, url from items
      where owner_id = $1 and removed_at is null
      order by created_at, id`,
    [ownerId],
  )
  return rows.map(r => ({ id: r.id, name: r.name, details: r.details, url: r.url }))
}

// Anyone else's list, with who's buying each item.
async function itemsWithClaims(db: Db, viewer: Viewer, ownerId: string): Promise<ListItem[]> {
  const rows = await db.query<ItemRow & { buyer_id: string | null; buyer_name: string | null }>(
    `select i.id, i.name, i.details, i.url, c.buyer_id, b.name as buyer_name
       from items i
       left join (claims c join people b on b.id = c.buyer_id) on c.item_id = i.id
      where i.owner_id = $1 and i.removed_at is null
      order by i.created_at, i.id`,
    [ownerId],
  )
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    details: r.details,
    url: r.url,
    claim:
      r.buyer_id === null || r.buyer_name === null
        ? null
        : { buyerName: r.buyer_name, mine: r.buyer_id === viewer.id },
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

// The form's fields, trimmed and checked against the schema's limits. Blank details or link is
// stored as null.
function checkInput(
  input: ItemInput,
): { ok: true; name: string; details: string | null; url: string | null } | { ok: false; error: string } {
  const name = input.name.trim()
  const details = input.details.trim()
  if (name === '') return refused(copy.nameRequired)
  if (chars(name) > MAX_NAME || chars(details) > MAX_DETAILS) return refused(copy.tooLong)
  const link = normalizeLink(input.link)
  if (!link.ok) return refused(copy.badLink)
  return { ok: true, name, details: details === '' ? null : details, url: link.url }
}

// Length as Postgres counts it, in characters: an emoji is one, where JavaScript's length says two.
function chars(s: string): number {
  return [...s].length
}
