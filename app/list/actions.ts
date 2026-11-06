'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { claimItem, unclaimItem } from '@/lib/data/claims'
import { addItem, removeItem, updateItem } from '@/lib/data/lists'
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
// "Someone just took this one."). The exception is an edit to an item someone took off the list
// meanwhile: it refreshes, so the item leaves the page, and ListView says so where it was.
//
// Signed out (no cookie, or a link the organizer replaced), every action sends the browser to /,
// which says to tap the link in the email. "Try again" couldn't work, and that page says what will.
// redirect() throws, so nothing after it runs.

// "I'll buy this".
export async function claimAction(itemId: string): Promise<ClaimResult> {
  const viewer = await getViewer()
  if (!viewer) redirect('/')
  const result = await claimItem(await getDb(), viewer, itemId)
  if (result === 'claimed') refresh()
  return result
}

// Undo.
export async function unclaimAction(itemId: string): Promise<void> {
  const viewer = await getViewer()
  if (!viewer) redirect('/')
  await unclaimItem(await getDb(), viewer, itemId)
  refresh()
}

export async function addItemAction(ownerId: string, _prev: Result | null, form: FormData): Promise<Result> {
  const viewer = await getViewer()
  if (!viewer) redirect('/')
  return refreshed(await addItem(await getDb(), viewer, ownerId, itemInput(form)))
}

export async function updateItemAction(itemId: string, _prev: Result | null, form: FormData): Promise<Result> {
  const viewer = await getViewer()
  if (!viewer) redirect('/')
  return refreshed(await updateItem(await getDb(), viewer, itemId, itemInput(form)))
}

export async function removeItemAction(itemId: string): Promise<Result> {
  const viewer = await getViewer()
  if (!viewer) redirect('/')
  return refreshed(await removeItem(await getDb(), viewer, itemId))
}

function refreshed(result: Result): Result {
  if (result.ok || result.gone) refresh()
  return result
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
