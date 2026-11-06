// @vitest-environment node
import { expect, it } from 'vitest'
import { metadata } from '@/app/layout'

// A personal link that ends up somewhere public mustn't put that person's lists in search results.
it('asks search engines not to index any page or follow its links', () => {
  expect(metadata.robots).toEqual({ index: false, follow: false })
})
