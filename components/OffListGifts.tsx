'use client'

import { useId, useState } from 'react'
import { ItemForm } from '@/components/ItemForm'
import { RemoveItem } from '@/components/RemoveItem'
import { ShopLink } from '@/components/ShopLink'
import { copy } from '@/lib/copy'
import { shownPrice } from '@/lib/format'
import type { OffListGift, Result } from '@/lib/types'
import { useHydrated } from '@/lib/use-hydrated'

// The off-list gifts on someone else's list (GLOSSARY.md), at the foot of ListView: after the list's
// items, and on a kid's list after "Add to Leo's wish list" too. Never on the viewer's own list.
//
//   - Everyone else's off-list gift looks like an item someone else claimed: greyed, struck through,
//     "Ben is buying this", and no buttons, since only its buyer can change it, even on a kid's list.
//   - The viewer's own reads "✓ You're buying this", with Edit and Remove. There's no Undo: taking
//     it back deletes it, so Remove asks first (RemoveItem).
//   - "Add an off-list gift for Grandma" opens the add form, with a note saying who'll see it. The
//     form starts closed, so someone else's list never opens with a form that looks like it adds to
//     their wishes. With no off-list gifts yet, the button is all the section shows.
//
// Each gift's card is laid out as an item's is in ListView, so the two read alike. Typed text is
// wrap-anywhere. Every button is disabled until the page's JavaScript runs (useHydrated).
//
// The add form passes a draftKey of its own, so what was typed survives a reload after a deploy
// (lib/stale-page.ts), and is put back when the form is next opened.
export function OffListGifts({
  recipient,
  gifts,
  add,
  update,
  remove,
}: {
  recipient: { id: string; name: string }
  gifts: OffListGift[]
  add: (recipientId: string, prev: Result | null, form: FormData) => Promise<Result>
  update: (giftId: string, prev: Result | null, form: FormData) => Promise<Result>
  remove: (giftId: string) => Promise<Result>
}) {
  const hydrated = useHydrated()
  const headingId = useId()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  // An edit to a gift its buyer removed in another tab answers gone. The action's refresh takes the
  // gift off the page, so the form just closes.
  function save(giftId: string) {
    return async (prev: Result | null, form: FormData): Promise<Result> => {
      const result = await update(giftId, prev, form)
      if (!result.ok && result.gone) setEditing(null)
      return result
    }
  }

  return (
    <section aria-labelledby={gifts.length > 0 ? headingId : undefined} className="mt-6">
      {gifts.length > 0 && (
        <>
          <h2 id={headingId} className="text-lg font-bold text-neutral-900 wrap-anywhere">
            {copy.offListHeading(recipient.name)}
          </h2>
          <ul className="mt-3 space-y-2.5">
            {gifts.map(gift => {
              const muted = gift.mine ? 'text-neutral-600' : 'text-neutral-500'
              return (
                <li
                  key={gift.id}
                  className={`rounded-xl border px-3.5 py-3 wrap-anywhere md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-4 ${
                    gift.mine ? 'border-mine-line bg-mine' : 'border-item-line bg-taken'
                  }`}
                >
                  <div className="min-w-0 md:col-start-1 md:row-start-1">
                    {editing === gift.id ? (
                      <ItemForm
                        action={save(gift.id)}
                        submitLabel={copy.save}
                        initial={{
                          name: gift.name,
                          price: gift.price ?? '',
                          details: gift.details ?? '',
                          link: gift.url ?? '',
                        }}
                        onSaved={() => setEditing(null)}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <>
                        <p className={`font-semibold ${gift.mine ? 'text-neutral-900' : 'text-neutral-500'}`}>
                          {gift.mine ? gift.name : <s>{gift.name}</s>}
                        </p>
                        {gift.price && <p className={`mt-0.5 text-sm ${muted}`}>{shownPrice(gift.price)}</p>}
                        {gift.details && <p className={`mt-0.5 text-sm ${muted}`}>{gift.details}</p>}
                        {gift.url && <ShopLink url={gift.url} />}
                      </>
                    )}
                  </div>

                  {/* Capped from md: up, as a claim's line is, so a long name can't take the gift's room. */}
                  <p
                    className={`mt-2 text-sm font-semibold md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0 md:max-w-60 ${
                      gift.mine ? 'text-mine-ink' : 'text-neutral-600'
                    }`}
                  >
                    {gift.mine ? copy.youreBuying : copy.isBuying(gift.buyerName)}
                  </p>

                  {gift.mine && editing !== gift.id && (
                    <div className="-ml-1 flex flex-wrap items-center gap-x-3 md:col-start-1 md:row-start-2">
                      <button
                        type="button"
                        onClick={() => setEditing(gift.id)}
                        disabled={!hydrated}
                        className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-link underline disabled:opacity-70"
                      >
                        {copy.edit}
                      </button>
                      <RemoveItem itemId={gift.id} remove={remove} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {adding ? (
        <div className="mt-4 rounded-xl border border-item-line bg-white p-4">
          <p className="mb-3 text-sm text-neutral-600 wrap-anywhere">{copy.offListFormNote(recipient.name)}</p>
          <ItemForm
            action={add.bind(null, recipient.id)}
            submitLabel={copy.addGift}
            draftKey={`add-off-list:${recipient.id}`}
            onSaved={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={!hydrated}
          className="mt-4 min-h-11 w-full rounded-lg border border-accent bg-white px-[18px] py-2 font-semibold text-accent wrap-anywhere disabled:opacity-70 md:w-auto"
        >
          {copy.addOffList(recipient.name)}
        </button>
      )}
    </section>
  )
}
