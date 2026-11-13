'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ItemClaim } from '@/components/ItemClaim'
import { cardClass, cardTone, EditTools, formValues, ItemLines } from '@/components/ItemCard'
import { ItemForm } from '@/components/ItemForm'
import { OffListGifts } from '@/components/OffListGifts'
import { PageNotices } from '@/components/PageNotices'
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
  addOffList: (recipientId: string, prev: Result | null, form: FormData) => Promise<Result>
  updateOffList: (giftId: string, prev: Result | null, form: FormData) => Promise<Result>
  deleteOffList: (giftId: string) => Promise<Result>
}

// One wish list, as the owner chose from the mockups (the spec's Screens section):
//   - someone else's list: "I'll buy this" on each open item, and anyone else's claim greyed and
//     struck through, reading "Priya is buying this"
//   - your own list: the surprise note, Edit and Remove, and the add form; no claim of any kind,
//     and no off-list gift
//   - your kid's list: both of the above
//   - every list but your own ends with its off-list gifts (OffListGifts), after the add form on a
//     kid's list
//
// Each item is a card from components/ItemCard.tsx, which off-list gifts share: its text top to
// bottom, then on a phone the button full width under it, and from md: up the claim control on the
// right.
//
// Until the page's JavaScript runs, every button is disabled, Edit included, and PageNotices waits
// at the foot of the page to say what to do if they never come to life.
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
  organizerName,
  actions,
}: {
  view: ListViewData
  viewerName: string
  homeHref: string
  organizerName: string | null
  actions: ListActions
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [gone, setGone] = useState<{ id: string; at: number } | null>(null)
  const own = view.mode === 'own'

  // The items, with the one whose edit found it gone shown as a note in its place, whether or not
  // the refresh has taken it out of view.items yet.
  const rows: (OwnListItem | ListItem | { goneId: string })[] = view.items.filter(item => item.id !== gone?.id)
  if (gone) rows.splice(Math.min(gone.at, rows.length), 0, { goneId: gone.id })

  function update(itemId: string) {
    return async (prev: Result | null, form: FormData): Promise<Result> => {
      const result = await actions.update(itemId, prev, form)
      if (!result.ok && result.gone) {
        setEditing(null)
        setGone({ id: itemId, at: view.items.findIndex(item => item.id === itemId) })
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
          {rows.map(item => {
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
            const tone = cardTone[mine ? 'mine' : taken ? 'taken' : 'open']
            return (
              <li key={item.id} className={`${cardClass} ${tone}`}>
                <div className="min-w-0 md:col-start-1 md:row-start-1">
                  {editing === item.id ? (
                    <ItemForm
                      action={update(item.id)}
                      submitLabel={copy.save}
                      initial={formValues(item)}
                      onSaved={() => setEditing(null)}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <ItemLines item={item} taken={taken} />
                  )}
                </div>

                {!own && (
                  <div className="md:col-start-2 md:row-span-2 md:row-start-1">{claimArea(item.id, claim)}</div>
                )}

                {view.canEdit && editing !== item.id && (
                  <EditTools id={item.id} onEdit={() => setEditing(item.id)} remove={actions.remove} />
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
      {view.mode !== 'own' && (
        <OffListGifts
          recipient={view.owner}
          gifts={view.offList}
          add={actions.addOffList}
          update={actions.updateOffList}
          deleteGift={actions.deleteOffList}
        />
      )}
      <PageNotices organizerName={organizerName} />
    </main>
  )
}
