'use server'

import { refresh } from 'next/cache'
import { copy } from '@/lib/copy'
import { claimItem, unclaimItem } from '@/lib/data/claims'
import { addItem, removeItem, updateItem } from '@/lib/data/lists'
import { getOrganizerName } from '@/lib/data/people'
import { getDb } from '@/lib/db'
import { getViewer } from '@/lib/session'
import type { ClaimResult, ItemInput, Result } from '@/lib/types'

// The wish-list page's writes. Anyone can POST to a Server Action with any arguments, so each one
// looks up the viewer from the cookie itself and hands it to lib/data, where every permission rule
// is checked against what's stored. Nothing here trusts the page that called it.
//
// After a write that went in, refresh() re-renders the page in the same response, so the list
// shows what the database now holds. A write that went nowhere doesn't refresh: the control that
// made it is showing why, and a re-render could take that control off the page before it's read
// (a claim someone else got first turns the item into "Priya is buying this", with no room for
// "Someone just took this one.").

// "I'll buy this". Signed out, it's 'not-allowed', which the button shows as a failed save.
export async function claimAction(itemId: string): Promise<ClaimResult> {
  const viewer = await getViewer()
  if (!viewer) return 'not-allowed'
  const result = await claimItem(await getDb(), viewer, itemId)
  if (result === 'claimed') refresh()
  return result
}

// Undo. With no viewer there's nothing to answer with, so it throws: Undo then says the save
// failed and keeps the ✓, rather than show the claim gone while it's still there.
export async function unclaimAction(itemId: string): Promise<void> {
  const viewer = await getViewer()
  if (!viewer) throw new Error('Undo needs a signed-in viewer')
  await unclaimItem(await getDb(), viewer, itemId)
  refresh()
}

export async function addItemAction(ownerId: string, _prev: Result | null, form: FormData): Promise<Result> {
  const viewer = await getViewer()
  if (!viewer) return signedOut()
  return refreshed(await addItem(await getDb(), viewer, ownerId, itemInput(form)))
}

export async function updateItemAction(itemId: string, _prev: Result | null, form: FormData): Promise<Result> {
  const viewer = await getViewer()
  if (!viewer) return signedOut()
  return refreshed(await updateItem(await getDb(), viewer, itemId, itemInput(form)))
}

export async function removeItemAction(itemId: string): Promise<Result> {
  const viewer = await getViewer()
  if (!viewer) return signedOut()
  return refreshed(await removeItem(await getDb(), viewer, itemId))
}

function refreshed(result: Result): Result {
  if (result.ok) refresh()
  return result
}

// A signed-out write gets the not-signed-in page's own words, which say what to do.
async function signedOut(): Promise<Result> {
  const organizer = await getOrganizerName(await getDb())
  return { ok: false, error: copy.notSignedIn(organizer ?? copy.organizerFallback) }
}

// The form's three fields as text. lib/data trims them, so each must be a string: a forged request
// can leave a field out, send a file in its place, or send no form at all, and each of those reads
// as blank (a blank name is then refused in words) rather than throw.
function itemInput(form: FormData): ItemInput {
  return { name: field(form, 'name'), details: field(form, 'details'), link: field(form, 'link') }
}

function field(form: FormData, key: string): string {
  const value = typeof form?.get === 'function' ? form.get(key) : null
  return typeof value === 'string' ? value : ''
}
