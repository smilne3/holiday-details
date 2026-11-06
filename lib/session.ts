import 'server-only'
import { cookies } from 'next/headers'
import { findViewerByToken } from '@/lib/data/people'
import { getDb } from '@/lib/db'
import { SESSION_COOKIE } from '@/lib/session-cookie'
import type { Viewer } from '@/lib/types'

export { SESSION_COOKIE }

// Whoever this browser's cookie names, or null when there's no cookie or its token is no one's any
// more (replaced by the organizer, or never real). Pages and Server Actions call this themselves;
// the proxy only stores the token.
export async function getViewer(): Promise<Viewer | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  return findViewerByToken(await getDb(), token)
}
