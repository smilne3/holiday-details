import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ItemForm } from '@/components/ItemForm'
import { copy } from '@/lib/copy'
import type { Result } from '@/lib/types'
import { redirectTo, staleAction, watchReload } from '@/tests/helpers/leaving'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  sessionStorage.clear()
})

// A save the test answers when it chooses, the way a slow network would.
function setup(props: { onSaved?: () => void; onCancel?: () => void; draftKey?: string } = {}) {
  const saved = Promise.withResolvers<Result>()
  const action = vi.fn<(prev: Result | null, form: FormData) => Promise<Result>>(() => saved.promise)
  render(<ItemForm action={action} submitLabel={copy.addToMyList} {...props} />)
  return { action, saved }
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement

function fill(name: string, details = '', link = '') {
  fireEvent.change(field(copy.fieldName), { target: { value: name } })
  fireEvent.change(field(copy.fieldDetails), { target: { value: details } })
  fireEvent.change(field(copy.fieldLink), { target: { value: link } })
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: copy.addToMyList }))

it('shows three fields labelled What is it?, Size, color, details (optional) and Paste a link (optional)', () => {
  setup()
  for (const label of [copy.fieldName, copy.fieldDetails, copy.fieldLink]) {
    expect(field(label).tagName).toBe('INPUT')
  }
  screen.getByRole('button', { name: copy.addToMyList })
})

it('sends the three fields as typed', async () => {
  const { action, saved } = setup()
  fill('Sweater', 'Green, size XS', 'asos.com/sweater')
  submit()
  expect(action).toHaveBeenCalledOnce()
  const form = action.mock.calls[0][1]
  expect([form.get('name'), form.get('details'), form.get('link')]).toEqual([
    'Sweater',
    'Green, size XS',
    'asos.com/sweater',
  ])
  await act(async () => saved.resolve({ ok: true }))
})

it('shows the error the server gives, and keeps what was typed so it can be fixed', async () => {
  const { saved } = setup()
  fill('Sweater', 'Green, size XS', 'not a link')
  submit()
  await act(async () => saved.resolve({ ok: false, error: copy.badLink }))
  screen.getByText(copy.badLink)
  expect([field(copy.fieldName).value, field(copy.fieldDetails).value, field(copy.fieldLink).value]).toEqual([
    'Sweater',
    'Green, size XS',
    'not a link',
  ])
})

it('clears the fields after the server says ok', async () => {
  const onSaved = vi.fn()
  const { saved } = setup({ onSaved })
  fill('Sweater', 'Green, size XS', 'asos.com/sweater')
  submit()
  await act(async () => saved.resolve({ ok: true }))
  expect([field(copy.fieldName).value, field(copy.fieldDetails).value, field(copy.fieldLink).value]).toEqual([
    '',
    '',
    '',
  ])
  expect(onSaved).toHaveBeenCalledOnce()
})

it('while saving, the button says Saving… and a second tap sends nothing more', async () => {
  const { action, saved } = setup()
  fill('Sweater')
  submit()
  const saving = screen.getByRole('button', { name: copy.saving })
  expect(saving).toHaveProperty('disabled', true)
  fireEvent.submit(saving.closest('form')!)
  expect(action).toHaveBeenCalledOnce()
  await act(async () => saved.resolve({ ok: true }))
  expect(action).toHaveBeenCalledOnce()
})

it("a save that fails on the way says That didn't save. Please try again.", async () => {
  const { saved } = setup()
  fill('Sweater')
  submit()
  await act(async () => saved.reject(new Error('the network dropped')))
  screen.getByText(copy.saveFailed)
  expect(field(copy.fieldName).value).toBe('Sweater')
  expect(screen.getByRole('button', { name: copy.addToMyList })).toHaveProperty('disabled', false)
})

it('editing starts from the item as it is, and Cancel leaves without saving', () => {
  const action = vi.fn(async () => ({ ok: true }) as Result)
  const onCancel = vi.fn()
  render(
    <ItemForm
      action={action}
      submitLabel={copy.save}
      initial={{ name: 'Sweater', details: 'Green, size XS', link: 'https://www.asos.com/' }}
      onCancel={onCancel}
    />,
  )
  expect([field(copy.fieldName).value, field(copy.fieldDetails).value, field(copy.fieldLink).value]).toEqual([
    'Sweater',
    'Green, size XS',
    'https://www.asos.com/',
  ])
  fireEvent.click(screen.getByRole('button', { name: copy.cancel }))
  expect(onCancel).toHaveBeenCalledOnce()
  expect(action).not.toHaveBeenCalled()
})

// The key an add form keeps its typing under. The id is made up.
const draftKey = 'add-item:00000000-0000-4000-8000-0000000000a2'
const values = () => [copy.fieldName, copy.fieldDetails, copy.fieldLink].map(l => field(l).value)

it('on a page loaded before a deploy, an add saves what was typed, reloads, and says nothing else', async () => {
  const reload = watchReload()
  const { action, saved } = setup({ draftKey })
  fill('Sweater', 'Green, size XS', 'asos.com/sweater')
  submit()
  await act(async () => saved.reject(staleAction()))
  expect(reload).toHaveBeenCalledOnce()
  expect(JSON.parse(sessionStorage.getItem(draftKey)!)).toEqual({
    name: 'Sweater',
    details: 'Green, size XS',
    link: 'asos.com/sweater',
  })
  expect(screen.queryByRole('alert')).toBeNull()
  // Saving… until the page goes, and nothing more is sent.
  const saving = screen.getByRole('button', { name: copy.saving })
  expect(saving).toHaveProperty('disabled', true)
  fireEvent.submit(saving.closest('form')!)
  expect(action).toHaveBeenCalledOnce()
})

it('the reloaded add form puts back what was typed, once', () => {
  sessionStorage.setItem(draftKey, JSON.stringify({ name: 'Sweater', details: 'Green, size XS', link: 'asos.com/sweater' }))
  setup({ draftKey })
  expect(values()).toEqual(['Sweater', 'Green, size XS', 'asos.com/sweater'])
  expect(sessionStorage.getItem(draftKey)).toBeNull()
  cleanup()
  setup({ draftKey })
  expect(values()).toEqual(['', '', ''])
})

it('a form without a draft key (an edit) reloads too, but keeps nothing', async () => {
  const reload = watchReload()
  const { saved } = setup()
  fill('Sweater')
  submit()
  await act(async () => saved.reject(staleAction()))
  expect(reload).toHaveBeenCalledOnce()
  expect(sessionStorage.length).toBe(0)
  expect(screen.queryByRole('alert')).toBeNull()
})

it("when storage refuses (a private window can), the page still reloads, and the form still opens", async () => {
  const reload = watchReload()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('QuotaExceededError')
  })
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('SecurityError')
  })
  const { saved } = setup({ draftKey })
  fill('Sweater')
  submit()
  await act(async () => saved.reject(staleAction()))
  expect(reload).toHaveBeenCalledOnce()
  cleanup()
  setup({ draftKey })
  expect(values()).toEqual(['', '', ''])
})

it('signed out, a save says nothing of its own while the server sends the page to the tap-the-link page', async () => {
  const reload = watchReload()
  const { saved } = setup({ draftKey })
  fill('Sweater')
  submit()
  await act(async () => saved.reject(redirectTo('/')))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('button', { name: copy.saving })).toHaveProperty('disabled', true)
  expect(reload).not.toHaveBeenCalled()
  expect(sessionStorage.length).toBe(0)
})
