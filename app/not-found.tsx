import Link from 'next/link'
import { copy } from '@/lib/copy'

// A list that was never there, or a person the organizer has since removed. A signed-in viewer who
// isn't the organizer gets this for /organizer too, as if there were no such page. Next also shows
// it for any address that matches no page. The link goes to /, which takes a signed-in viewer to
// their home page.
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="max-w-md rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-neutral-200">
        <p className="text-lg text-neutral-800">{copy.listMissing}</p>
        <Link
          href="/"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-wish-ink underline"
        >
          {copy.allLists}
        </Link>
      </div>
    </main>
  )
}
