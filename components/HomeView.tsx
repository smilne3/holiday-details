import Link from 'next/link'
import { SignedInAs } from '@/components/SignedInAs'
import { copy } from '@/lib/copy'
import type { HomeData } from '@/lib/types'

// The home screen the owner chose (mockup B, with the computer's small buttons along the top): two
// buttons for the viewer's own things, then everyone else, one card per household. Nothing collapses
// or waits behind a tap. On a phone the two buttons share the row; from md: up they keep a button's
// width instead of stretching, and the cards sit side by side. The two emoji are the mockup's
// decoration, hidden from screen readers like the row chevrons; the words all come from copy. Names
// are wrap-anywhere, so a long one with no spaces wraps instead of pushing the page sideways.
export function HomeView({
  viewer,
  home,
}: {
  viewer: { id: string; name: string; isOrganizer: boolean }
  home: HomeData
}) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-4 md:px-8 md:py-6">
      <SignedInAs name={viewer.name} />
      <h1 className="mt-1 mb-4 text-2xl font-bold text-neutral-900 wrap-anywhere">{copy.hi(viewer.name)}</h1>

      <div className="mb-6 flex gap-3">
        <Link
          href={`/list/${viewer.id}`}
          className="min-h-11 flex-1 rounded-2xl bg-wish px-3 py-3 font-bold text-wish-ink md:w-56 md:flex-none md:px-4 md:text-lg"
        >
          <span aria-hidden="true" className="mr-1.5">
            📝
          </span>
          {copy.myWishList}
          <span className="mt-1 block text-sm font-normal opacity-80">{copy.things(home.myItemCount)}</span>
        </Link>
        <Link
          href="/buying"
          className="min-h-11 flex-1 rounded-2xl bg-buying px-3 py-3 font-bold text-buying-ink md:w-56 md:flex-none md:px-4 md:text-lg"
        >
          <span aria-hidden="true" className="mr-1.5">
            🎁
          </span>
          {copy.giftsImBuying}
          <span className="mt-1 block text-sm font-normal opacity-80">{copy.gifts(home.buyingCount)}</span>
        </Link>
      </div>

      <h2 className="mb-2 text-sm font-bold tracking-wider text-family uppercase">{copy.shopForFamily}</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {home.households.map(household => (
          <section
            key={household.id}
            aria-labelledby={`household-${household.id}`}
            className="rounded-2xl border border-card-line bg-white px-3 py-2"
          >
            <h3
              id={`household-${household.id}`}
              className="px-1 pt-1 pb-1.5 text-sm font-bold text-neutral-600 wrap-anywhere"
            >
              {household.name}
            </h3>
            <ul>
              {household.members.map(member => (
                <li key={member.id} className="border-t border-row-line">
                  <Link
                    href={`/list/${member.id}`}
                    className="flex min-h-11 items-center justify-between gap-2 px-1 text-neutral-900"
                  >
                    <span className="min-w-0 wrap-anywhere">
                      {member.name}
                      {member.kind === 'kid' && (
                        <span className="ml-1.5 rounded-lg bg-kid px-1.5 py-px text-xs text-kid-ink">{copy.kid}</span>
                      )}
                    </span>
                    <span aria-hidden="true" className="text-neutral-400">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {viewer.isOrganizer && (
        <p className="mt-8">
          <Link href="/organizer" className="inline-flex min-h-11 items-center text-sm text-wish-ink underline">
            {copy.organizerPage}
          </Link>
        </p>
      )}
    </main>
  )
}
