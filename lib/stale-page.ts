import { unstable_isUnrecognizedActionError, unstable_rethrow } from 'next/navigation'

// For the buttons and forms that call Server Actions: when a call fails, whether the page is on its
// way out, so the control should show nothing of its own (no ✓, no "removed", no "try again") and
// stay as Saving… until the page goes.
//
//   - A page loaded before a deploy calls Server Actions the new build doesn't have, and every retry
//     fails the same way until the page reloads. So it reloads now, in answer to this tap, and comes
//     back with the new build and with what the database holds, so the next tap works. Nothing
//     reloads on its own, so this can't loop.
//   - Signed out (no cookie, or a link the organizer replaced), every action redirect()s to /, which
//     says to tap the link in the email. The router is already on its way there, and the call's
//     promise rejects with Next's redirect error. Rethrowing it would make Next navigate a second
//     time, so it's only recognised here.
//
// An add form passes a draft, and what was typed is saved for the reloaded page to put back. Edit
// forms don't, and their edit is lost (ruling R21): the reloaded page shows the item as it is.
//
// Anything else is an ordinary failure, for the control to report.
export function pageIsLeaving(error: unknown, draft?: Draft): boolean {
  if (unstable_isUnrecognizedActionError(error)) {
    if (draft) keepDraft(draft)
    markReloaded()
    browserPage.reload()
    return true
  }
  return isNextRedirect(error)
}

// The reloaded page comes back as it was: the claim didn't happen, an edit is gone. So the reload
// leaves word for it, and PageNotices says "The app was just updated…". The page that says so then
// forgets it, so the next one doesn't.
const RELOADED = 'reloaded-after-deploy'

export function reloadedAfterDeploy(): boolean {
  try {
    return sessionStorage.getItem(RELOADED) !== null
  } catch {
    return false // storage refused: the page just doesn't say
  }
}

export function forgetReload(): void {
  try {
    sessionStorage.removeItem(RELOADED)
  } catch {
    // Storage refused, so there's nothing to forget.
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOADED, '1')
  } catch {
    // Storage refused. The page still reloads; only the word is lost.
  }
}

// The browser's reload, behind an object so tests can watch it.
export const browserPage = {
  reload: () => window.location.reload(),
}

// An add form's text fields, under a key that names that form, such as `add-item:<owner id>`.
export interface Draft {
  key: string
  form: HTMLFormElement | null
}

// Puts back what this form held when its page reloaded, once, then forgets it. Called as the form
// mounts.
export function restoreDraft(key: string, form: HTMLFormElement | null): void {
  if (!form) return
  let typed: unknown
  try {
    const saved = sessionStorage.getItem(key)
    if (saved === null) return
    sessionStorage.removeItem(key)
    typed = JSON.parse(saved)
  } catch {
    return // storage refused (a private window can), or held something unreadable
  }
  if (typeof typed !== 'object' || typed === null) return
  for (const [name, value] of Object.entries(typed)) {
    const field = form.elements.namedItem(name)
    if (isTextField(field) && typeof value === 'string') field.value = value
  }
}

function keepDraft({ key, form }: Draft): void {
  if (!form) return
  const typed: Record<string, string> = {}
  for (const field of form.elements) if (isTextField(field) && field.name) typed[field.name] = field.value
  try {
    sessionStorage.setItem(key, JSON.stringify(typed))
  } catch {
    // Storage refused. The page still reloads, so the next tap works; only the typing is lost.
  }
}

function isTextField(el: unknown): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === 'text'
}

// unstable_rethrow throws only Next's own errors, redirect's among them, so whether it throws says
// whether this is one.
function isNextRedirect(error: unknown): boolean {
  try {
    unstable_rethrow(error)
    return false
  } catch {
    return true
  }
}
