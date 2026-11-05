import { copy } from '@/lib/copy'

// The page for anyone without a working personal link. It says the one thing to do, tap the link
// in the organizer's email, and only then, smaller, who to ask if the email is lost. It never asks
// anyone to know which app or machine they're on.
export function NotSignedIn({ organizerName }: { organizerName: string | null }) {
  const org = organizerName ?? copy.organizerFallback
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="max-w-md rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-neutral-200">
        <p className="text-lg text-neutral-800">{copy.notSignedIn(org)}</p>
        <p className="mt-4 text-sm text-neutral-600">{copy.cantFindEmail(org)}</p>
      </div>
    </main>
  )
}
