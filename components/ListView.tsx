'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ItemClaim } from '@/components/ItemClaim'
import { ItemForm } from '@/components/ItemForm'
import { RemoveItem } from '@/components/RemoveItem'
import { ShopLink } from '@/components/ShopLink'
import { SignedInAs } from '@/components/SignedInAs'
import { copy } from '@/lib/copy'
import type { ClaimResult, ListItem, ListViewData, Result } from '@/lib/types'

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
// row, with the claim control on the right.
//
// The claim control always sits in the same place in its item, and items are keyed by id, so the
// ItemClaim that showed a ✓ is the same one after the page refreshes, and keeps its hint.
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
  const own = view.mode === 'own'

  function claimArea(item: ListItem) {
    if (item.claim && !item.claim.mine) {
      return <p className="mt-2 text-sm font-semibold text-neutral-600 md:mt-0">{copy.isBuying(item.claim.buyerName)}</p>
    }
    if (!view.canClaim) return null
    return (
      <ItemClaim
        key={item.id}
        itemId={item.id}
        initial={item.claim ? 'mine' : 'open'}
        claim={actions.claim}
        unclaim={actions.unclaim}
      />
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-4 md:px-8 md:py-6">
      <div className="flex items-center justify-between gap-3">
        <Link href={homeHref} className="inline-flex min-h-11 items-center text-sm text-link">
          {copy.allLists}
        </Link>
        <SignedInAs name={viewerName} />
      </div>

      <h1 className="mt-1 text-2xl font-bold text-neutral-900">
        {own ? copy.myWishList : copy.listTitle(view.owner.name)}
      </h1>
      {/* keptBy arrives already joined ("Ben & Maya"); keptByLine of one name adds only "Kept by". */}
      {view.keptBy && <p className="mt-1 text-sm text-neutral-600">{copy.keptByLine([view.keptBy])}</p>}
      {own && <p className="mt-3 rounded-xl bg-wish px-3.5 py-2.5 text-sm text-wish-ink">{copy.ownListNote}</p>}

      {view.items.length === 0 ? (
        <p className="mt-5 text-neutral-600">{copy.listEmpty}</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {view.items.map(item => {
            const mine = item.claim?.mine === true
            const taken = item.claim != null && !item.claim.mine
            const tone = mine ? 'border-mine-line bg-mine' : taken ? 'border-item-line bg-taken' : 'border-item-line bg-white'
            return (
              <li
                key={item.id}
                className={`rounded-xl border px-3.5 py-3 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-4 ${tone}`}
              >
                <div className="min-w-0 md:col-start-1 md:row-start-1">
                  {editing === item.id ? (
                    <ItemForm
                      action={actions.update.bind(null, item.id)}
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

                {!own && <div className="md:col-start-2 md:row-span-2 md:row-start-1">{claimArea(item)}</div>}

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
          />
        </section>
      )}
    </main>
  )
}
