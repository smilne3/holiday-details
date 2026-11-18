'use client'

import { RemoveItem } from '@/components/RemoveItem'
import { ShopLink } from '@/components/ShopLink'
import { copy } from '@/lib/copy'
import { shownPrice } from '@/lib/format'
import type { Result } from '@/lib/types'
import { useHydrated } from '@/lib/use-hydrated'

// The parts of a card on a wish list that an item (ListView) and an off-list gift (OffListGifts)
// share, so the two read alike and change together.

type Shown = { name: string; price: string | null; details: string | null; url: string | null }

// The card. On a phone it stacks. From md: up it's a grid: the text on the left, who's buying it or
// the claim control on the right, and Edit and Remove under the text. Typed text is wrap-anywhere, so
// a link pasted into "What is it?", with no spaces to break at, wraps instead of pushing the page
// sideways. The tone says whose it is: no one's yet, the viewer's, or someone else's.
export const cardClass =
  'rounded-xl border px-3.5 py-3 wrap-anywhere md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-4'
export const cardTone = {
  open: 'border-item-line bg-white',
  mine: 'border-mine-line bg-mine',
  taken: 'border-item-line bg-taken',
} as const

// The text, top to bottom: the name, then the price on a line of its own, then the details and the
// shop's link. A price is shown as typed, except that a bare number gets a $ (lib/format.ts).
// Someone else's is greyed, with its name struck through.
export function ItemLines({ item, taken }: { item: Shown; taken: boolean }) {
  const muted = taken ? 'text-neutral-500' : 'text-neutral-600'
  return (
    <>
      <p className={`font-semibold ${taken ? 'text-neutral-500' : 'text-neutral-900'}`}>
        {taken ? <s>{item.name}</s> : item.name}
      </p>
      {item.price && <p className={`mt-0.5 text-sm ${muted}`}>{shownPrice(item.price)}</p>}
      {item.details && <p className={`mt-0.5 text-sm ${muted}`}>{item.details}</p>}
      {item.url && <ShopLink url={item.url} />}
    </>
  )
}

// The edit form's fields, filled in from what's stored.
export function formValues(item: Shown) {
  return { name: item.name, price: item.price ?? '', details: item.details ?? '', link: item.url ?? '' }
}

// Edit and Remove, under the text. Edit is disabled until the page's JavaScript runs, as every
// button is; Remove asks first (RemoveItem).
export function EditTools({
  id,
  onEdit,
  remove,
}: {
  id: string
  onEdit: () => void
  remove: (id: string) => Promise<Result>
}) {
  const hydrated = useHydrated()
  return (
    <div className="-ml-1 flex flex-wrap items-center gap-x-3 md:col-start-1 md:row-start-2">
      <button
        type="button"
        onClick={onEdit}
        disabled={!hydrated}
        className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-link underline disabled:opacity-70"
      >
        {copy.edit}
      </button>
      <RemoveItem itemId={id} remove={remove} />
    </div>
  )
}
