'use client'

import { useId, useState } from 'react'
import { cardClass, cardTone, EditTools, formValues, ItemLines } from '@/components/ItemCard'
import { ItemForm } from '@/components/ItemForm'
import { copy } from '@/lib/copy'
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
// Each gift is a card from components/ItemCard.tsx, as an item is in ListView, so the two read alike.
// Every button is disabled until the page's JavaScript runs (useHydrated).
//
// The add form passes a draftKey of its own, so what was typed survives a reload after a deploy
// (lib/stale-page.ts), and is put back when the form is next opened.
export function OffListGifts({
  recipient,
  gifts,
  add,
  update,
  deleteGift,
}: {
  recipient: { id: string; name: string }
  gifts: OffListGift[]
  add: (recipientId: string, prev: Result | null, form: FormData) => Promise<Result>
  update: (giftId: string, prev: Result | null, form: FormData) => Promise<Result>
  deleteGift: (giftId: string) => Promise<Result>
}) {
  const hydrated = useHydrated()
  const headingId = useId()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  // An edit to a gift its buyer deleted in another tab answers gone. The action's refresh takes the
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
              // The viewer's own, or someone else's: an off-list gift is never open.
              const whose = gift.mine
                ? { tone: cardTone.mine, line: copy.youreBuying, ink: 'text-mine-ink' }
                : { tone: cardTone.taken, line: copy.isBuying(gift.buyerName), ink: 'text-neutral-600' }
              return (
                <li key={gift.id} className={`${cardClass} ${whose.tone}`}>
                  <div className="min-w-0 md:col-start-1 md:row-start-1">
                    {editing === gift.id ? (
                      <ItemForm
                        action={save(gift.id)}
                        submitLabel={copy.save}
                        initial={formValues(gift)}
                        onSaved={() => setEditing(null)}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <ItemLines item={gift} taken={!gift.mine} />
                    )}
                  </div>

                  {/* Capped from md: up, as a claim's line is, so a long name can't take the gift's room. */}
                  <div className="md:col-start-2 md:row-span-2 md:row-start-1">
                    <p className={`mt-2 text-sm font-semibold md:mt-0 md:max-w-60 ${whose.ink}`}>{whose.line}</p>
                  </div>

                  {gift.mine && editing !== gift.id && (
                    <EditTools id={gift.id} onEdit={() => setEditing(gift.id)} remove={deleteGift} />
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
