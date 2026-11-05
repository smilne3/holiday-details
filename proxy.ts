import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/session-cookie'

// What a token in a personal link may look like. Real ones are 64 hex characters; anything outside
// this shape is no one's, so it isn't stored.
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/

const NINETY_DAYS = 60 * 60 * 24 * 90 // seconds: lasts from November into January

// Opening a personal link, /p/<token>, stores its token in a cookie so every other page knows who
// this is. The request then carries on to the home page at that same address, with no redirect, so
// the personal link stays in the address bar and bookmarks as itself.
//
// This is not a security boundary. A token that is well formed but no one's is stored all the same,
// and every page and Server Action looks the viewer up for itself.
export function proxy(request: NextRequest): NextResponse {
  const response = NextResponse.next()
  const token = request.nextUrl.pathname.replace(/^\/p\//, '')
  if (TOKEN.test(token)) {
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: NINETY_DAYS,
      secure: process.env.NODE_ENV === 'production',
    })
  }
  return response
}

export const config = { matcher: '/p/:token' }
