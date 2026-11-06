// "Leo's", and "James's" too: every name gets 's.
export function possessive(name: string): string {
  return `${name}'s`
}

// "Ben", "Ben & Maya", "Ann, Bo & Cy".
export function keptBy(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

// An item's price as the list shows it. It's stored as typed, so a bare number such as "40" or
// "12.50" gets a dollar sign ("$40"), and anything else ("about $25", "$20–30") shows exactly as
// written.
export function shownPrice(price: string): string {
  const s = price.trim()
  return /^\d+(\.\d{1,2})?$/.test(s) ? `$${s}` : price
}

// The shop's domain, shown in place of the full link: "asos.com". null for a stored link that
// isn't a web address at all. The app never stores one, but a row typed into Supabase's SQL Editor
// can hold anything the database's ^https?:// check lets through, such as "https://", and a throw
// here would take the whole list down for everyone who opens it.
export function shopName(url: string): string | null {
  return parse(url)?.hostname.replace(/^www\./, '') || null
}

// The database refuses a longer link.
const MAX_LINK_LENGTH = 2000

// A pasted link, checked before it's stored. Blank means no link. A web address is kept as pasted,
// tracking parameters and all, with https:// added when the scheme is missing. Anything else is
// refused, so nothing but http(s) ever becomes a clickable link.
export function normalizeLink(input: string): { ok: true; url: string | null } | { ok: false } {
  const s = input.trim()
  if (s === '') return { ok: true, url: null }
  const url = webAddress(s)
  if (url === null || url.length > MAX_LINK_LENGTH) return { ok: false }
  return { ok: true, url }
}

function webAddress(s: string): string | null {
  // A real address has no spaces. One with them is prose, or a link broken across lines.
  if (/\s/.test(s)) return null
  const withScheme = parse(s)
  if (withScheme) {
    if (withScheme.protocol !== 'http:' && withScheme.protocol !== 'https:') return null
    // "Https://" or "https:shop.com" is still a web address, but the database's ^https?:// check
    // refuses it as typed, so store the parser's spelling of it instead.
    return /^https?:\/\//.test(s) ? s : withScheme.href
  }
  // No scheme, as in "amazon.com/dp/123". It has to name a host with a dot in it.
  const url = 'https://' + s
  return parse(url)?.hostname.includes('.') ? url : null
}

function parse(s: string): URL | null {
  try {
    return new URL(s)
  } catch {
    return null
  }
}
