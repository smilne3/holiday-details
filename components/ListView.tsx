'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ItemClaim } from '@/components/ItemClaim'
import { ItemForm } from '@/components/ItemForm'
import { RemoveItem } from '@/components/RemoveItem'
import { ShopLink } from '@/components/ShopLink'
import { SignedInAs } from '@/components/SignedInAs'
import { copy } from '@/lib/copy'
import type { ClaimResult, ListItem, ListViewData, OwnListItem, Result } from '@/lib/types'

// The Server Actions in app/list/actions.ts. Tests pass fakes.
export interface ListActions {
  claim: (itemId: string) => Promise<ClaimResult>
  unclaim: (itemId: string) => Promise<void>
  add: (ownerId: string, prev: Result | null, form: FormData) => Promise<Result>
  update: (itemId: string, prev: Result | null, form: FormData) => Promise<Result>
  remove: (itemId: string) => Promise<Result>
}

// One wish list, as the owner chose from the mockups (b-computer-and-list.html):
//   - someone else's list: "I'll buy this" on each open item, and anyone else's claim greyed and
//     struck through, reading "Priya is buying this"
//   - your own list: the surprise note, Edit and Remove, and the add form; no claim of any kind
//   - your kid's list: both of the above
//
// On a phone each item stacks, with the button full width under it. From md: up each item is one
// row, with the claim control on the right. Typed text is wrap-anywhere, so a link pasted into
// "What is it?", with no spaces to break at, wraps instead of pushing the page sideways.
//
// The claim control always sits in the same place in its item, and items are keyed by id, so the
// ItemClaim that showed a ✓ is the same one after the page refreshes, and keeps its hint.
//
// An edit saved to an item someone else took off the list meanwhile (a spouse, on a kid's list)
// answers gone, and the action's refresh takes the item away. Its card then says so, in the place
// it had, for as long as this page is open, so the item doesn't just vanish.
export function ListView({
  view,
  viewerName,
  homeHref,
  actions,
}: {
  view: ListViewData
  viewerName: string
  homeHref: string
  actions: ListActions
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [gone, setGone] = useState<{ id: string; at: number } | null>(null)
  const own = view.mode === 'own'

  // The items, with the one whose edit found it gone shown as a note in its place, whether or not
  // the refresh has taken it out of view.items yet.
  const rows: (OwnListItem | ListItem | { goneId: string })[] = view.items.filter(item => item.id !== gone?.id)
  if (gone) rows.splice(Math.min(gone.at, rows.length), 0, { goneId: gone.id })

  function update(itemId: string, at: number) {
    return async (prev: Result | null, form: FormData): Promise<Result> => {
      const result = await actions.update(itemId, prev, form)
      if (!result.ok && result.gone) {
        setEditing(null)
        setGone({ id: itemId, at })
      }
      return result
    }
  }

  function claimArea(itemId: string, claim: ListItem['claim']) {
    if (claim && !claim.mine) {
      // Capped from md: up, as ItemClaim's ✓ line is, so a long name can't take the item's room.
      return (
        <p className="mt-2 text-sm font-semibold text-neutral-600 md:mt-0 md:max-w-60">
          {copy.isBuying(claim.buyerName)}
        </p>
      )
    }
    if (!view.canClaim) return null
    return (
      <ItemClaim
        key={itemId}
        itemId={itemId}
        initial={claim ? 'mine' : 'open'}
        claim={actions.claim}
        unclaim={actions.unclaim}
      />
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-4 md:px-8 md:py-6">
      <div className="flex items-center justify-between gap-3">
        <Link href={homeHref} className="inline-flex min-h-11 shrink-0 items-center text-sm text-link">
          {copy.allLists}
        </Link>
        <SignedInAs name={viewerName} />
      </div>

      <h1 className="mt-1 text-2xl font-bold text-neutral-900 wrap-anywhere">
        {own ? copy.myWishList : copy.listTitle(view.owner.name)}
      </h1>
      {/* keptBy arrives already joined ("Ben & Maya"); keptByLine of one name adds only "Kept by". */}
      {view.keptBy && <p className="mt-1 text-sm text-neutral-600 wrap-anywhere">{copy.keptByLine([view.keptBy])}</p>}
      {own && <p className="mt-3 rounded-xl bg-wish px-3.5 py-2.5 text-sm text-wish-ink">{copy.ownListNote}</p>}

      {rows.length === 0 ? (
        <p className="mt-5 text-neutral-600">{copy.listEmpty}</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {rows.map((item, at) => {
            if ('goneId' in item) {
              return (
                <li key={item.goneId} className="rounded-xl border border-item-line bg-taken px-3.5 py-3">
                  <p className="text-sm font-semibold text-neutral-700">{copy.gone}</p>
                </li>
              )
            }
            // On the viewer's own list nothing is styled as claimed, whatever an item holds.
            const claim = own ? null : (item.claim ?? null)
            const mine = claim?.mine === true
            const taken = claim !== null && !claim.mine
            const tone = mine ? 'border-mine-line bg-mine' : taken ? 'border-item-line bg-taken' : 'border-item-line bg-white'
            return (
              <li
                key={item.id}
                className={`rounded-xl border px-3.5 py-3 wrap-anywhere md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-4 ${tone}`}
              >
                <div className="min-w-0 md:col-start-1 md:row-start-1">
                  {editing === item.id ? (
                    <ItemForm
                      action={update(item.id, at)}
                      submitLabel={copy.save}
                      initial={{ name: item.name, details: item.details ?? '', link: item.url ?? '' }}
                      onSaved={() => setEditing(null)}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <>
                      <p className={`font-semibold ${taken ? 'text-neutral-500' : 'text-neutral-900'}`}>
                        {taken ? <s>{item.name}</s> : item.name}
                      </p>
                      {item.details && (
                        <p className={`mt-0.5 text-sm ${taken ? 'text-neutral-500' : 'text-neutral-600'}`}>
                          {item.details}
                        </p>
                      )}
                      {item.url && <ShopLink url={item.url} />}
                    </>
                  )}
                </div>

                {!own && (
                  <div className="md:col-start-2 md:row-span-2 md:row-start-1">{claimArea(item.id, claim)}</div>
                )}

                {view.canEdit && editing !== item.id && (
                  <div className="-ml-1 flex flex-wrap items-center gap-x-3 md:col-start-1 md:row-start-2">
                    <button
                      type="button"
                      onClick={() => setEditing(item.id)}
                      className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-link underline"
                    >
                      {copy.edit}
                    </button>
                    <RemoveItem itemId={item.id} remove={actions.remove} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {view.canEdit && (
        <section className="mt-6 rounded-xl border border-item-line bg-white p-4">
          <ItemForm
            action={actions.add.bind(null, view.owner.id)}
            submitLabel={own ? copy.addToMyList : copy.addToList(view.owner.name)}
            draftKey={`add-item:${view.owner.id}`}
          />
        </section>
      )}
    </main>
  )
}
