import { copy } from '@/lib/copy'

// "Signed in as Maya", small, at the top right of every page, so a wrong identity is obvious.
export function SignedInAs({ name }: { name: string }) {
  return <p className="min-w-0 text-right text-sm text-neutral-600 wrap-anywhere">{copy.signedInAs(name)}</p>
}
