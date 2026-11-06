import { afterEach, expect, it, vi } from 'vitest'
import { pageIsLeaving, restoreDraft } from '@/lib/stale-page'
import { redirectTo, staleAction, watchReload } from '@/tests/helpers/leaving'

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
  document.body.innerHTML = ''
})

// A form like the add-person one: a text field, the kind's buttons, and a hidden field and a select
// standing in for anything that isn't typed.
function aForm(): HTMLFormElement {
  document.body.innerHTML = `
    <form>
      <input type="text" name="name" value="Pip">
      <input type="text" value="no name, so not kept">
      <input type="hidden" name="secret" value="not typed">
      <select name="householdId"><option value="h1" selected>h1</option></select>
      <button type="submit" name="kind" value="kid">Add a kid</button>
    </form>`
  return document.querySelector('form')!
}

it('a stale page reloads and keeps only the named text fields', () => {
  const reload = watchReload()
  expect(pageIsLeaving(staleAction(), { key: 'add-person:h1', form: aForm() })).toBe(true)
  expect(reload).toHaveBeenCalledOnce()
  expect(JSON.parse(sessionStorage.getItem('add-person:h1')!)).toEqual({ name: 'Pip' })
})

it("a redirect is the page leaving too, but it doesn't reload: the router is already going", () => {
  const reload = watchReload()
  expect(pageIsLeaving(redirectTo('/'), { key: 'add-person:h1', form: aForm() })).toBe(true)
  expect(reload).not.toHaveBeenCalled()
  expect(sessionStorage.length).toBe(0)
})

it('any other failure is an ordinary one, for the control to report', () => {
  const reload = watchReload()
  for (const error of [new Error('the network dropped'), 'a string', null, undefined]) {
    expect(pageIsLeaving(error, { key: 'add-person:h1', form: aForm() })).toBe(false)
  }
  expect(reload).not.toHaveBeenCalled()
  expect(sessionStorage.length).toBe(0)
})

it('restoring fills only text fields, ignores anything unreadable, and never throws', () => {
  const form = aForm()
  sessionStorage.setItem('k', JSON.stringify({ name: 'Ivy', secret: 'changed', householdId: 'h2', kind: 'adult', gone: 'x' }))
  restoreDraft('k', form)
  expect((form.elements.namedItem('name') as HTMLInputElement).value).toBe('Ivy')
  expect((form.elements.namedItem('secret') as HTMLInputElement).value).toBe('not typed')
  expect((form.elements.namedItem('householdId') as HTMLSelectElement).value).toBe('h1')

  for (const junk of ['not json', 'null', '42', '["Ivy"]', '{"name": 7}']) {
    sessionStorage.setItem('k', junk)
    expect(() => restoreDraft('k', aForm())).not.toThrow()
    expect((document.querySelector('[name=name]') as HTMLInputElement).value).toBe('Pip')
    expect(sessionStorage.getItem('k')).toBeNull()
  }
})
