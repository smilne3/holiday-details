import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ErrorPage from '@/app/error'
import { copy } from '@/lib/copy'

afterEach(cleanup)

it('says something went wrong, and Try again retries', () => {
  const retry = vi.fn()
  render(<ErrorPage error={new Error('boom')} retry={retry} />)
  screen.getByText(copy.errorTitle)
  expect(retry).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: copy.tryAgain }))
  expect(retry).toHaveBeenCalledOnce()
})
