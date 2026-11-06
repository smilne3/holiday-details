// A uuid as Postgres writes it: 8-4-4-4-12 hex digits, in either case.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Whether an id from an address or a Server Action can go to Postgres. Postgres answers a
// malformed uuid with an error, not a non-match, so check first and treat a bad one as unknown.
// The typeof check is for forged requests, which can send any value: an array holding one uuid
// would otherwise pass, since the regex converts it to that string.
export function isUuid(s: string): boolean {
  return typeof s === 'string' && UUID.test(s)
}
