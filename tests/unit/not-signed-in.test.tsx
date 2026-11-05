import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { NotSignedIn } from '@/components/NotSignedIn'
import { copy } from '@/lib/copy'

afterEach(cleanup)

it('says to tap the link in the email first, and only then to ask the organizer', () => {
  const { container } = render(<NotSignedIn organizerName="Maya" />)
  const tap = screen.getByText(copy.notSignedIn('Maya'))
  const ask = screen.getByText(copy.cantFindEmail('Maya'))
  expect(tap.compareDocumentPosition(ask) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(container.textContent).not.toMatch(/browser|cookie|device/i)
})

it('speaks of the person who invited you when there is no organizer yet', () => {
  const { container } = render(<NotSignedIn organizerName={null} />)
  screen.getByText(copy.notSignedIn(copy.organizerFallback))
  screen.getByText(copy.cantFindEmail(copy.organizerFallback))
  expect(container.textContent).not.toMatch(/browser|cookie|device/i)
})
