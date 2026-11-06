import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import NotFound from '@/app/not-found'
import { copy } from '@/lib/copy'

afterEach(cleanup)

// A list that isn't there any more, or any address that matches no page. The link goes to /, which
// takes a signed-in viewer on to their home page.
it("says the list isn't here any more, with ‹ All lists going to /", () => {
  render(<NotFound />)
  screen.getByText(copy.listMissing)
  expect(screen.getByRole('link', { name: copy.allLists }).getAttribute('href')).toBe('/')
})
