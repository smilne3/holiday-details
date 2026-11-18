import { copy } from '@/lib/copy'
import { isUuid } from '@/lib/data/ids'
import type { Db } from '@/lib/db/types'
import type { OrganizerData, PersonKind, Result, Viewer } from '@/lib/types'

// The organizer page's reads and writes. Only the organizer may use any of them: everyone else
// gets null from the read and copy.notAllowed from every write, checked here on the server before
// anything else, so a forged request is refused however it was made.
//
// An id that is malformed, or names no one, is refused with copy.notAllowed rather than sent to
// Postgres as is, which would answer a malformed uuid with an error.

// The schema's limits on names (db/migrations/001_init.sql), checked here first so a long one gets
// copy.tooLong rather than a database error.
const MAX_HOUSEHOLD_NAME = 80
const MAX_PERSON_NAME = 60

// Every household, and everyone in it with their personal link. Households come by name, and in
// each, adults come first and then kids, each by name, as on the home screen. A household no one
// is in yet is listed too, so people can be added to it.
export async function getOrganizerData(db: Db, viewer: Viewer): Promise<OrganizerData | null> {
  if (!viewer.isOrganizer) return null
  const rows = await db.query<{
    household_id: string
    household_name: string
    id: string | null
    name: string | null
    kind: PersonKind | null
    token: string | null
  }>(
    `select h.id as household_id, h.name as household_name, p.id, p.name, p.kind, p.token
       from households h left join people p on p.household_id = h.id
      order by h.name, h.id, p.kind = 'kid', p.name, p.id`,
  )

  const households: OrganizerData['households'] = []
  for (const r of rows) {
    let household = households.at(-1)
    if (household?.id !== r.household_id) {
      household = { id: r.household_id, name: r.household_name, people: [] }
      households.push(household)
    }
    if (r.id !== null && r.name !== null && r.kind !== null) {
      household.people.push({ id: r.id, name: r.name, kind: r.kind, token: r.token })
    }
  }
  return { households }
}

export async function createHousehold(db: Db, viewer: Viewer, name: string): Promise<Result> {
  if (!viewer.isOrganizer) return refused(copy.notAllowed)
  const checked = checkName(name, MAX_HOUSEHOLD_NAME)
  if (!checked.ok) return checked
  await db.query('insert into households (name) values ($1)', [checked.name])
  return { ok: true }
}

export async function renameHousehold(db: Db, viewer: Viewer, id: string, name: string): Promise<Result> {
  if (!viewer.isOrganizer) return refused(copy.notAllowed)
  const checked = checkName(name, MAX_HOUSEHOLD_NAME)
  if (!checked.ok) return checked
  if (!isUuid(id)) return refused(copy.notAllowed)
  const rows = await db.query('update households set name = $2 where id = $1 returning id', [id, checked.name])
  return rows.length > 0 ? { ok: true } : refused(copy.notAllowed)
}

// Adds an adult or a kid to a household. An adult gets a personal link straight away, made by
// Postgres's new_token(); a kid gets none, and the schema refuses one either way round.
export async function addPerson(
  db: Db,
  viewer: Viewer,
  person: { name: string; kind: PersonKind; householdId: string },
): Promise<Result> {
  if (!viewer.isOrganizer) return refused(copy.notAllowed)
  const checked = checkName(person.name, MAX_PERSON_NAME)
  if (!checked.ok) return checked
  if ((person.kind !== 'adult' && person.kind !== 'kid') || !isUuid(person.householdId)) {
    return refused(copy.notAllowed)
  }
  // Selecting from households puts no one in a household that isn't there.
  const rows = await db.query(
    person.kind === 'adult'
      ? `insert into people (household_id, name, kind, token)
         select id, $2::text, 'adult', new_token() from households where id = $1
         returning id`
      : `insert into people (household_id, name, kind)
         select id, $2::text, 'kid' from households where id = $1
         returning id`,
    [person.householdId, checked.name],
  )
  return rows.length > 0 ? { ok: true } : refused(copy.notAllowed)
}

// Renames someone and puts them in a household, which may be the one they're in. Moving a parent
// changes whose kids' lists they keep, since that follows the household.
export async function updatePerson(
  db: Db,
  viewer: Viewer,
  id: string,
  person: { name: string; householdId: string },
): Promise<Result> {
  if (!viewer.isOrganizer) return refused(copy.notAllowed)
  const checked = checkName(person.name, MAX_PERSON_NAME)
  if (!checked.ok) return checked
  if (!isUuid(id) || !isUuid(person.householdId)) return refused(copy.notAllowed)
  const rows = await db.query(
    `update people set name = $2, household_id = $3
      where id = $1 and exists (select 1 from households where id = $3)
      returning id`,
    [id, checked.name, person.householdId],
  )
  return rows.length > 0 ? { ok: true } : refused(copy.notAllowed)
}

// Removes someone set up by mistake. Anyone with anything on their list, even things since taken
// off it, or who is buying anything, stays: their items and claims are other people's plans. So
// does anyone an off-list gift is for, or who is buying one.
//
// The organizer can't remove herself. The organizer page would then turn her away, and there'd be
// no one left to set up the family.
export async function deletePerson(db: Db, viewer: Viewer, id: string): Promise<Result> {
  if (!viewer.isOrganizer || !isUuid(id)) return refused(copy.notAllowed)
  // Compared in SQL, where a uuid in capitals is the same person.
  const [person] = await db.query<{ busy: boolean }>(
    `select exists (select 1 from items where owner_id = p.id)
            or exists (select 1 from claims where buyer_id = p.id)
            or exists (select 1 from off_list_gifts where recipient_id = p.id or buyer_id = p.id) as busy
       from people p
      where p.id = $1 and p.id <> $2`,
    [id, viewer.id],
  )
  if (!person) return refused(copy.notAllowed)
  if (person.busy) return refused(copy.cantDelete)
  try {
    await db.query('delete from people where id = $1', [id])
  } catch (e) {
    // An item, a claim or an off-list gift that arrived since the check above: the foreign keys keep
    // the person.
    if (isForeignKeyViolation(e)) return refused(copy.cantDelete)
    throw e
  }
  return { ok: true }
}

// Gives an adult a new personal link, for when theirs has leaked. The old one stops working at
// once: whoever opens it, or still has it in a cookie, gets the page that says to tap the link in
// the email.
//
// Not the organizer's own, which would sign her out of this page with no way to see the new one.
export async function replaceLink(db: Db, viewer: Viewer, personId: string): Promise<Result> {
  if (!viewer.isOrganizer || !isUuid(personId)) return refused(copy.notAllowed)
  const rows = await db.query(
    `update people set token = new_token()
      where id = $1 and id <> $2 and kind = 'adult'
      returning id`,
    [personId, viewer.id],
  )
  return rows.length > 0 ? { ok: true } : refused(copy.notAllowed)
}

function refused(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

// A name trimmed and checked against its limit. Postgres answers a NUL in text with an error, and
// none belongs in a name, so any is dropped first; no one types one, but a forged request can send
// it.
function checkName(name: string, max: number): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = name.replaceAll('\u0000', '').trim()
  if (trimmed === '') return refused(copy.nameRequired)
  // Length as Postgres counts it, in characters: an emoji is one, where JavaScript's length says two.
  if ([...trimmed].length > max) return refused(copy.tooLong)
  return { ok: true, name: trimmed }
}

// Postgres's foreign_key_violation. Both drivers put the SQLSTATE on the error's `code`.
function isForeignKeyViolation(e: unknown): boolean {
  return (e as { code?: string } | null | undefined)?.code === '23503'
}
