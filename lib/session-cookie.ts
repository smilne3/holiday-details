// The cookie that remembers whose personal link this browser opened. proxy.ts writes it and
// lib/session.ts reads it. It lives in a file of its own, with no imports, so the proxy doesn't
// load the database code.
export const SESSION_COOKIE = 'hd_person'
