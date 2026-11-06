import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HouseholdCard, type OrganizerActions } from '@/components/organizer/HouseholdCard'
import { PersonRow } from '@/components/organizer/PersonRow'
import { copy } from '@/lib/copy'
import type { OrganizerData, Result } from '@/lib/types'

// Made-up ids and links. The actions are fakes that answer only when the test says so, the way a
// slow network would.
const ids = {
  benMaya: '00000000-0000-4000-8000-0000000000a1',
  samPriya: '00000000-0000-4000-8000-0000000000a2',
  ben: '00000000-0000-4000-8000-0000000000b1',
  maya: '00000000-0000-4000-8000-0000000000b2',
  leo: '00000000-0000-4000-8000-0000000000b3',
}
const benToken = 'a'.repeat(64)
const households = [
  { id: ids.benMaya, name: 'Ben & Maya' },
  { id: ids.samPriya, name: 'Sam & Priya' },
]
const ben = { id: ids.ben, name: 'Ben', kind: 'adult' as const, token: benToken }
const maya = { id: ids.maya, name: 'Maya', kind: 'adult' as const, token: 'b'.repeat(64) }
const leo = { id: ids.leo, name: 'Leo', kind: 'kid' as const, token: null }

type Answer = ReturnType<typeof Promise.withResolvers<Result>>

function fakeActions() {
  const answers: Answer[] = []
  const next = () => {
    const a = Promise.withResolvers<Result>()
    answers.push(a)
    return a.promise
  }
  const actions = {
    renameHousehold: vi.fn<OrganizerActions['renameHousehold']>(next),
    addPerson: vi.fn<OrganizerActions['addPerson']>(next),
    updatePerson: vi.fn<OrganizerActions['updatePerson']>(next),
    deletePerson: vi.fn<OrganizerActions['deletePerson']>(next),
    replaceLink: vi.fn<OrganizerActions['replaceLink']>(next),
  }
  // The answer to the latest call.
  const answer = (result: Result) => act(async () => answers.at(-1)!.resolve(result))
  return { actions, answer }
}

type Person = OrganizerData['households'][number]['people'][number]

function row(person: Person, opts: { you?: boolean } = {}) {
  const fake = fakeActions()
  const view = render(
    <ul>
      <PersonRow
        person={person}
        householdId={ids.benMaya}
        households={households}
        you={opts.you ?? false}
        actions={fake.actions}
      />
    </ul>,
  )
  return { ...fake, ...view }
}

const button = (name: string) => screen.getByRole('button', { name })
const noButton = (name: string) => expect(screen.queryByRole('button', { name })).toBeNull()

let writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}

beforeEach(() => {
  writeText = vi.fn<(text: string) => Promise<void>>(async () => {})
  setClipboard({ writeText })
})
afterEach(cleanup)

const benLink = () => `${window.location.origin}/p/${benToken}`

it("copy.invitation('Ben', 'https://x.test/p/abc') is the exact text in Task 3", () => {
  expect(copy.invitation('Ben', 'https://x.test/p/abc')).toBe(
    "Hi Ben!\n\nThis year our wish lists are all in one place. Tap this link to see everyone's lists and add your own:\n\nhttps://x.test/p/abc\n\nKeep this email. Whenever you want to see the lists, just tap the link again. You can bookmark the page too if you like.\n\nThis link is just for you, so please don't forward it.",
  )
})

it('an adult row shows Copy link, Copy invitation and Replace link; a kid row shows none of them', () => {
  row(ben)
  screen.getByText('Ben')
  for (const name of [copy.copyLink, copy.copyInvitation, copy.replaceLink, copy.edit, copy.remove]) button(name)
  cleanup()

  row(leo)
  screen.getByText('Leo')
  screen.getByText(copy.kid)
  for (const name of [copy.copyLink, copy.copyInvitation, copy.replaceLink]) noButton(name)
  // A kid can still be renamed, moved or removed.
  button(copy.edit)
  button(copy.remove)
})

it('Replace link asks copy.replaceConfirm with Yes and No before calling the action', async () => {
  const { actions, answer } = row(ben)
  fireEvent.click(button(copy.replaceLink))
  screen.getByText(copy.replaceConfirm)
  expect(actions.replaceLink).not.toHaveBeenCalled()

  // No puts it away and replaces nothing.
  fireEvent.click(button(copy.no))
  expect(screen.queryByText(copy.replaceConfirm)).toBeNull()
  expect(actions.replaceLink).not.toHaveBeenCalled()

  fireEvent.click(button(copy.replaceLink))
  fireEvent.click(button(copy.yes))
  expect(actions.replaceLink).toHaveBeenCalledOnce()
  expect(actions.replaceLink).toHaveBeenCalledWith(ids.ben)
  // While it saves: Saving…, disabled, and a second tap sends nothing.
  const saving = button(copy.saving)
  expect(saving).toHaveProperty('disabled', true)
  fireEvent.click(saving)
  expect(actions.replaceLink).toHaveBeenCalledOnce()

  await answer({ ok: true })
  screen.getByText(copy.linkReplaced)
  expect(screen.queryByText(copy.replaceConfirm)).toBeNull()
})

it('two taps on Yes that land before the row redraws still replace the link once', async () => {
  const { actions, answer } = row(ben)
  fireEvent.click(button(copy.replaceLink))
  const yes = button(copy.yes)
  act(() => {
    yes.click()
    yes.click()
  })
  expect(actions.replaceLink).toHaveBeenCalledOnce()
  await answer({ ok: true })
})

it("a refused Replace link says why, and doesn't claim it worked", async () => {
  const { answer } = row(ben)
  fireEvent.click(button(copy.replaceLink))
  fireEvent.click(button(copy.yes))
  await answer({ ok: false, error: copy.notAllowed })
  expect(screen.getByRole('alert').textContent).toBe(copy.notAllowed)
  expect(screen.queryByText(copy.linkReplaced)).toBeNull()
  button(copy.replaceLink)
})

it("Copy link writes window.location.origin + '/p/' + token to navigator.clipboard, then shows Copied", async () => {
  row(ben)
  expect(screen.queryByText(copy.copied)).toBeNull()
  await act(async () => fireEvent.click(button(copy.copyLink)))
  expect(writeText).toHaveBeenCalledOnce()
  expect(writeText).toHaveBeenCalledWith(benLink())
  expect(benLink()).toMatch(/^http:\/\/[^/]+\/p\/a{64}$/)
  screen.getByText(copy.copied)
})

it("doesn't say Copied until the clipboard has it", async () => {
  const written = Promise.withResolvers<void>()
  writeText.mockImplementation(() => written.promise)
  row(ben)
  await act(async () => fireEvent.click(button(copy.copyLink)))
  expect(writeText).toHaveBeenCalledOnce()
  expect(screen.queryByText(copy.copied)).toBeNull()
  await act(async () => written.resolve())
  screen.getByText(copy.copied)
})

it('Copy invitation writes the invitation with their name and link', async () => {
  row(ben)
  await act(async () => fireEvent.click(button(copy.copyInvitation)))
  expect(writeText).toHaveBeenCalledWith(copy.invitation('Ben', benLink()))
  screen.getByText(copy.copied)
})

it.each([
  ['refuses', () => setClipboard({ writeText: vi.fn(async () => Promise.reject(new Error('denied'))) })],
  ['is missing', () => setClipboard(undefined)],
])('when the clipboard %s, the full link shows in a read-only field to copy by hand', async (_, breakIt) => {
  breakIt()
  row(ben)
  await act(async () => fireEvent.click(button(copy.copyLink)))
  expect(screen.queryByText(copy.copied)).toBeNull()
  const field = screen.getByLabelText(copy.copyByHand) as HTMLInputElement
  expect(field.value).toBe(benLink())
  expect(field.readOnly).toBe(true)

  // The invitation, being several lines, shows whole in a box of its own.
  await act(async () => fireEvent.click(button(copy.copyInvitation)))
  const boxes = screen.getAllByLabelText(copy.copyByHand) as HTMLTextAreaElement[]
  const invitation = boxes.find(b => b.tagName === 'TEXTAREA')!
  expect(invitation.value).toBe(copy.invitation('Ben', benLink()))
  expect(invitation.readOnly).toBe(true)
})

it("a replaced link takes away the old one's Copied, which no longer holds", async () => {
  const fake = fakeActions()
  const props = { householdId: ids.benMaya, households, you: false, actions: fake.actions }
  const { rerender } = render(
    <ul>
      <PersonRow person={ben} {...props} />
    </ul>,
  )
  await act(async () => fireEvent.click(button(copy.copyLink)))
  screen.getByText(copy.copied)
  rerender(
    <ul>
      <PersonRow person={{ ...ben, token: 'c'.repeat(64) }} {...props} />
    </ul>,
  )
  expect(screen.queryByText(copy.copied)).toBeNull()
  await act(async () => fireEvent.click(button(copy.copyLink)))
  expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/p/${'c'.repeat(64)}`)
})

it("the organizer's own row copies her link, but can't replace it or remove her", () => {
  row(maya, { you: true })
  screen.getByText(copy.you)
  button(copy.copyLink)
  button(copy.copyInvitation)
  button(copy.edit)
  noButton(copy.replaceLink)
  noButton(copy.remove)
})

it('Remove asks first, then says why when someone has a list or is buying', async () => {
  const { actions, answer } = row(ben)
  fireEvent.click(button(copy.remove))
  screen.getByText(copy.removePerson('Ben'))
  fireEvent.click(button(copy.no))
  expect(actions.deletePerson).not.toHaveBeenCalled()

  fireEvent.click(button(copy.remove))
  fireEvent.click(button(copy.yes))
  expect(actions.deletePerson).toHaveBeenCalledWith(ids.ben)
  expect(button(copy.saving)).toHaveProperty('disabled', true)
  await answer({ ok: false, error: copy.cantDelete })
  expect(screen.getByRole('alert').textContent).toBe(copy.cantDelete)
  expect(screen.queryByText(copy.removePerson('Ben'))).toBeNull()
})

it('Edit changes the name and household together', async () => {
  const { actions, answer } = row(leo)
  fireEvent.click(button(copy.edit))
  const name = screen.getByLabelText(copy.fieldPersonName) as HTMLInputElement
  const household = screen.getByLabelText(copy.fieldHousehold) as HTMLSelectElement
  expect(name.value).toBe('Leo')
  expect(household.value).toBe(ids.benMaya)
  expect([...household.options].map(o => o.textContent)).toEqual(['Ben & Maya', 'Sam & Priya'])

  fireEvent.change(name, { target: { value: 'Leonard' } })
  fireEvent.change(household, { target: { value: ids.samPriya } })
  fireEvent.click(button(copy.save))
  expect(actions.updatePerson).toHaveBeenCalledOnce()
  const [personId, , form] = actions.updatePerson.mock.calls[0]
  expect(personId).toBe(ids.leo)
  expect([form.get('name'), form.get('householdId')]).toEqual(['Leonard', ids.samPriya])

  // A refusal keeps the form open with what was typed.
  await answer({ ok: false, error: copy.tooLong })
  screen.getByText(copy.tooLong)
  expect((screen.getByLabelText(copy.fieldPersonName) as HTMLInputElement).value).toBe('Leonard')

  fireEvent.click(button(copy.save))
  await answer({ ok: true })
  expect(screen.queryByLabelText(copy.fieldPersonName)).toBeNull()
  button(copy.edit)
})

it('Cancel closes the edit form without saving', () => {
  const { actions } = row(leo)
  fireEvent.click(button(copy.edit))
  fireEvent.click(button(copy.cancel))
  expect(screen.queryByLabelText(copy.fieldPersonName)).toBeNull()
  expect(actions.updatePerson).not.toHaveBeenCalled()
})

function card(household: OrganizerData['households'][number] = { ...households[0], people: [ben, maya, leo] }) {
  const fake = fakeActions()
  render(<HouseholdCard household={household} households={households} viewerId={ids.maya} actions={fake.actions} />)
  return fake
}

it('a household card names the household and lists its people, marking the organizer', () => {
  card()
  const region = screen.getByRole('region', { name: 'Ben & Maya' })
  expect(within(region).getAllByRole('listitem').map(li => li.firstElementChild?.textContent)).toEqual([
    'Ben',
    `Maya${copy.you}`,
    `Leo${copy.kid}`,
  ])
  // Only Ben's row can have its link replaced: Maya is the organizer, and Leo is a kid.
  expect(within(region).getAllByRole('button', { name: copy.replaceLink })).toHaveLength(1)
})

it('an empty household says so', () => {
  card({ id: ids.samPriya, name: 'Sam & Priya', people: [] })
  screen.getByText(copy.householdEmpty)
})

it('Add an adult and Add a kid send the name and which one, and the field clears once saved', async () => {
  const { actions, answer } = card()
  const name = () => screen.getByLabelText(copy.fieldNewPerson) as HTMLInputElement

  fireEvent.change(name(), { target: { value: 'Zed' } })
  fireEvent.click(button(copy.addAdult))
  expect(actions.addPerson).toHaveBeenCalledOnce()
  let [householdId, , form] = actions.addPerson.mock.calls[0]
  expect(householdId).toBe(ids.benMaya)
  expect([form.get('name'), form.get('kind')]).toEqual(['Zed', 'adult'])
  await answer({ ok: true })
  expect(name().value).toBe('')

  fireEvent.change(name(), { target: { value: 'Pip' } })
  fireEvent.click(button(copy.addKid))
  ;[householdId, , form] = actions.addPerson.mock.calls[1]
  expect([form.get('name'), form.get('kind')]).toEqual(['Pip', 'kid'])
  await answer({ ok: false, error: copy.nameRequired })
  screen.getByText(copy.nameRequired)
  expect(name().value).toBe('Pip')
})

// What a browser does with Enter, or Go on a phone's keyboard, in a text field (HTML's implicit
// submission), which jsdom doesn't do itself: it presses the form's default button, the first submit
// button, unless that button is disabled. A keyboard that reports the key sends a keydown first,
// and cancelling it stops the rest.
function pressEnter(field: HTMLElement, { reported = true } = {}) {
  if (reported && !fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' })) return
  const defaultButton = field.closest('form')!.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (defaultButton && !defaultButton.disabled) fireEvent.click(defaultButton)
}

it('Enter in the new-person field adds no one: the organizer taps Add an adult or Add a kid', async () => {
  const { actions, answer } = card()
  const name = screen.getByLabelText(copy.fieldNewPerson) as HTMLInputElement
  fireEvent.change(name, { target: { value: 'Pip' } })
  pressEnter(name)
  expect(actions.addPerson).not.toHaveBeenCalled()
  expect(name.value).toBe('Pip')
  // Enter is cancelled itself, so no browser gets as far as choosing a button.
  expect(fireEvent.keyDown(name, { key: 'Enter', code: 'Enter' })).toBe(false)

  fireEvent.click(button(copy.addKid))
  const [, , form] = actions.addPerson.mock.calls[0]
  expect([form.get('name'), form.get('kind')]).toEqual(['Pip', 'kid'])
  await answer({ ok: true })
})

it("nor does Go on a phone keyboard that doesn't report the key", () => {
  const { actions } = card()
  const name = screen.getByLabelText(copy.fieldNewPerson)
  fireEvent.change(name, { target: { value: 'Pip' } })
  pressEnter(name, { reported: false })
  expect(actions.addPerson).not.toHaveBeenCalled()
})

it('a form with one button still saves on Enter', async () => {
  const { actions, answer } = card()
  fireEvent.click(button(copy.rename))
  const name = screen.getByLabelText(copy.fieldHouseholdName)
  fireEvent.change(name, { target: { value: 'The Smiths' } })
  pressEnter(name)
  expect(actions.renameHousehold).toHaveBeenCalledOnce()
  expect(actions.renameHousehold.mock.calls[0][2].get('name')).toBe('The Smiths')
  await answer({ ok: true })
})

it('Rename changes the household name', async () => {
  const { actions, answer } = card()
  fireEvent.click(button(copy.rename))
  const name = screen.getByLabelText(copy.fieldHouseholdName) as HTMLInputElement
  expect(name.value).toBe('Ben & Maya')
  fireEvent.change(name, { target: { value: 'The Smiths' } })
  fireEvent.click(button(copy.save))
  const [householdId, , form] = actions.renameHousehold.mock.calls[0]
  expect(householdId).toBe(ids.benMaya)
  expect(form.get('name')).toBe('The Smiths')
  await answer({ ok: true })
  expect(screen.queryByLabelText(copy.fieldHouseholdName)).toBeNull()
})

it('a save that fails on the way says so, rather than nothing', async () => {
  const { actions } = card()
  actions.addPerson.mockRejectedValueOnce(new Error('offline'))
  fireEvent.change(screen.getByLabelText(copy.fieldNewPerson), { target: { value: 'Zed' } })
  await act(async () => fireEvent.click(button(copy.addAdult)))
  screen.getByText(copy.saveFailed)
})
