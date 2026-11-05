// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, expect, it, vi } from 'vitest'
import { config, proxy } from '@/proxy'

afterEach(() => {
  vi.unstubAllEnvs()
})

it('remembers the personal link in a 90-day cookie, without redirecting', () => {
  const res = proxy(new NextRequest('http://localhost/p/abc123'))
  const c = res.headers.get('set-cookie')!
  expect(c).toMatch(/^hd_person=abc123;/)
  expect(c).toMatch(/HttpOnly/i)
  expect(c).toMatch(/Path=\//)
  expect(c).toMatch(/Max-Age=7776000/)
  expect(c).toMatch(/SameSite=lax/i)
  expect(c).not.toMatch(/Secure/i)
  expect(res.status).toBe(200) // no redirect: the personal link stays in the address bar
})

it('sets no cookie for a token that could never be real', () => {
  expect(proxy(new NextRequest('http://localhost/p/%3Cx%3E')).headers.get('set-cookie')).toBeNull()
  expect(proxy(new NextRequest(`http://localhost/p/${'a'.repeat(129)}`)).headers.get('set-cookie')).toBeNull()
})

it('marks the cookie Secure in production only', () => {
  vi.stubEnv('NODE_ENV', 'production')
  expect(proxy(new NextRequest('https://localhost/p/abc123')).headers.get('set-cookie')).toMatch(/Secure/i)
})

it('runs on personal links only', () => {
  expect(config.matcher).toBe('/p/:token')
})
