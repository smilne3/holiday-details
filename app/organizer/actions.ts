'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  addPerson,
  createHousehold,
  deletePerson,
  renameHousehold,
  replaceLink,
  updatePerson,
} from '@/lib/data/organizer'
import { getDb } from '@/lib/db'
import { getViewer } from '@/lib/session'
import type { PersonKind, Result } from '@/lib/types'

// The organizer page's writes. Anyone can POST to a Server Action with any arguments, so each one
// looks up the viewer from the cookie itself and hands it to lib/data/organizer, which refuses
// everyone but the organizer. Nothing here trusts the page that called it.
//
// After a write that went in, refresh() re-renders the page in the same response, so it shows
// what the database now holds. A refused write doesn't refresh: the form that sent it is showing
// why, with what was typed still in it.
//
// Signed out (no cookie, or a replaced link), every action sends the browser to /, which says to
// tap the link in the email. redirect() throws, so nothing after it runs.

export async function createHouseholdAction(_prev: Result | null, form: FormData): Promise<Result> {
  const viewer = await getViewer()
  if (!viewer) redirect('/')
  return refreshed(await createHousehold(await getDb(), viewer, field(form, 'name')))
}

export async function renameHouseholdAction(
  householdId: string,
  _prev: Result | null,
  form: FormData,
): Promise<Result> {
  const viewer = await getViewer()
  if (!viewer) redirect('/')
  return refreshed(await renameHousehold(await getDb(), viewer, householdId, field(form, 'name')))
}

// kind comes from whichever button was pressed, "Add an adult" or "Add a kid". lib/data refuses
// anything else.
export async function addPersonAction(householdId: string, _prev: Result | null, form: FormData): Promise<Result> {
  const viewer = await getViewer()
  if (!viewer) redirect('/')
  return refreshed(
    await addPerson(await getDb(), viewer, {
      name: field(form, 'name'),
      kind: field(form, 'kind') as PersonKind,
      householdId,
    }),
  )
}

export async function updatePersonAction(personId: string, _prev: Result | null, form: FormData): Promise<Result> {
  const viewer = await getViewer()
  if (!viewer) redirect('/')
  return refreshed(
    await updatePerson(await getDb(), viewer, personId, {
      name: field(form, 'name'),
      householdId: field(form, 'householdId'),
    }),
  )
}

export async function deletePersonAction(personId: string): Promise<Result> {
  const viewer = await getViewer()
  if (!viewer) redirect('/')
  return refreshed(await deletePerson(await getDb(), viewer, personId))
}

export async function replaceLinkAction(personId: string): Promise<Result> {
  const viewer = await getViewer()
  if (!viewer) redirect('/')
  return refreshed(await replaceLink(await getDb(), viewer, personId))
}

function refreshed(result: Result): Result {
  if (result.ok) refresh()
  return result
}

// A form field as text. lib/data trims it, so it must be a string: a forged request can leave a
// field out, send a file in its place, or send no form at all, and each of those reads as blank (a
// blank name is then refused in words) rather than throw.
function field(form: FormData, key: string): string {
  const value = typeof form?.get === 'function' ? form.get(key) : null
  return typeof value === 'string' ? value : ''
}
