// @vitest-environment node
import { expect, it } from 'vitest'
import { copy } from '@/lib/copy'
import { keptBy, normalizeLink, possessive, shopName } from '@/lib/format'

it("adds 's to every name, including one ending in s", () => {
  expect(possessive('Leo')).toBe("Leo's")
  expect(possessive('James')).toBe("James's")
})

it('joins the people who keep a list with commas and a final &', () => {
  expect(keptBy(['Ben'])).toBe('Ben')
  expect(keptBy(['Ben', 'Maya'])).toBe('Ben & Maya')
  expect(keptBy(['Ann', 'Bo', 'Cy'])).toBe('Ann, Bo & Cy')
})

it("names a link by the shop's domain, without www.", () => {
  expect(shopName('https://www.asos.com/us/x?gclid=1')).toBe('asos.com')
  expect(shopName('https://apple.com/shop')).toBe('apple.com')
})

it('treats a blank link as no link', () => {
  expect(normalizeLink('  ')).toEqual({ ok: true, url: null })
})

it('keeps a web address as pasted, adding https:// when the scheme is missing', () => {
  expect(normalizeLink(' amazon.com/dp/123 ')).toEqual({ ok: true, url: 'https://amazon.com/dp/123' })
  expect(normalizeLink('http://x.com/a')).toEqual({ ok: true, url: 'http://x.com/a' })
  expect(normalizeLink('https://www.asos.com/us/x?gclid=1&a=b')).toEqual({ ok: true, url: 'https://www.asos.com/us/x?gclid=1&a=b' })
  expect(normalizeLink('www.x.com')).toEqual({ ok: true, url: 'https://www.x.com' })
})

it("writes a capitalised or slashless scheme the way the database's ^https?:// check expects", () => {
  expect(normalizeLink('Https://x.com/a')).toEqual({ ok: true, url: 'https://x.com/a' })
  expect(normalizeLink('https:x.com/a')).toEqual({ ok: true, url: 'https://x.com/a' })
})

it('refuses anything that is not a plain web address', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'not a link', 'https://' + 'a'.repeat(2000)])
    expect(normalizeLink(bad)).toEqual({ ok: false })
})

it('refuses other schemes, hosts without a dot, and addresses with spaces in them', () => {
  for (const bad of ['mailto:ben@x.com', 'ftp://x.com/a', 'localhost:3000', 'shop', 'https://x.com/a pair of socks'])
    expect(normalizeLink(bad)).toEqual({ ok: false })
})

it('allows up to 2000 characters, counting the https:// it adds', () => {
  const longest = 'https://x.com/' + 'a'.repeat(2000 - 'https://x.com/'.length)
  expect(normalizeLink(longest)).toEqual({ ok: true, url: longest })
  expect(normalizeLink(longest + 'a')).toEqual({ ok: false })
  const bare = longest.slice('https://'.length)
  expect(normalizeLink(bare)).toEqual({ ok: true, url: longest })
  expect(normalizeLink(bare + 'a')).toEqual({ ok: false })
})

it('builds titles and counts from the helpers', () => {
  expect(copy.listTitle('James')).toBe("James's wish list")
  expect(copy.addToList('Leo')).toBe("Add to Leo's wish list")
  expect(copy.removedFrom('Leo')).toBe("Removed from Leo's list")
  expect(copy.keptByLine(['Ben', 'Maya'])).toBe('Kept by Ben & Maya')
  expect([copy.things(1), copy.things(2), copy.gifts(1), copy.gifts(0)]).toEqual(['1 thing', '2 things', '1 gift', '0 gifts'])
})

it('uses the owner-confirmed wording', () => {
  expect(copy.myWishList).toBe('My wish list')
  expect(copy.giftsImBuying).toBe("Gifts I'm buying")
  expect(copy.illBuyThis).toBe("I'll buy this")
  expect(copy.isBuying('Priya')).toBe('Priya is buying this')
  expect(`${copy.youreBuying} · ${copy.undo}`).toBe("✓ You're buying this · Undo")
})
