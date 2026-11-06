'use client' // error boundaries must be Client Components

import { copy } from '@/lib/copy'

// A page that failed to load. Next logs the error itself, so this only says so and offers to try
// again, which fetches and renders the page afresh.
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="max-w-md rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-neutral-200">
        <h1 className="text-lg font-semibold text-neutral-800">{copy.errorTitle}</h1>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-4 min-h-11 rounded-lg bg-accent px-5 font-medium text-white"
        >
          {copy.tryAgain}
        </button>
      </div>
    </main>
  )
}
