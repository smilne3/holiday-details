import { copy } from '@/lib/copy'

// What shows while a page loads, so a slow tap visibly does something. Every page sits under it, so
// none of them links to a #fragment (tests/unit/invariants.test.ts says why).
export default function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <p role="status" className="text-neutral-500">
        {copy.loading}
      </p>
    </main>
  )
}
