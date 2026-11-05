import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { HomeView } from '@/components/HomeView'
import type { HomeData } from '@/lib/types'

afterEach(cleanup)

// Maya's home screen as getHome returns it: households and members already in order, and Maya
// herself left out. The ids are made up.
const maya = { id: '00000000-0000-4000-8000-0000000000a2', name: 'Maya', isOrganizer: true }
const ben = { id: '00000000-0000-4000-8000-0000000000a1', name: 'Ben', isOrganizer: false }

const home: HomeData = {
  myItemCount: 2,
  buyingCount: 1,
  households: [
    {
      id: '00000000-0000-4000-8000-0000000000b1',
      name: 'Ben & Maya',
      members: [
        { id: ben.id, name: 'Ben', kind: 'adult' },
        { id: '00000000-0000-4000-8000-0000000000a4', name: 'Ivy', kind: 'kid' },
        { id: '00000000-0000-4000-8000-0000000000a3', name: 'Leo', kind: 'kid' },
      ],
    },
    {
      id: '00000000-0000-4000-8000-0000000000b3',
      name: 'Grandma & Grandpa',
      members: [
        { id: '00000000-0000-4000-8000-0000000000a8', name: 'Grandma', kind: 'adult' },
        { id: '00000000-0000-4000-8000-0000000000a9', name: 'Grandpa', kind: 'adult' },
      ],
    },
    {
      id: '00000000-0000-4000-8000-0000000000b2',
      name: 'Sam & Priya',
      members: [
        { id: '00000000-0000-4000-8000-0000000000a6', name: 'Priya', kind: 'adult' },
        { id: '00000000-0000-4000-8000-0000000000a5', name: 'Sam', kind: 'adult' },
        { id: '00000000-0000-4000-8000-0000000000a7', name: 'Ollie', kind: 'kid' },
      ],
    },
  ],
}

const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

it('greets the viewer and says who is signed in', () => {
  render(<HomeView viewer={maya} home={home} />)
  screen.getByRole('heading', { level: 1, name: 'Hi, Maya' })
  screen.getByText('Signed in as Maya')
})

it("My wish list and Gifts I'm buying are links with counts", () => {
  render(<HomeView viewer={maya} home={home} />)
  const mine = screen.getByRole('link', { name: /My wish list/ })
  expect(mine.getAttribute('href')).toBe(`/list/${maya.id}`)
  within(mine).getByText('2 things')
  const buying = screen.getByRole('link', { name: /Gifts I'm buying/ })
  expect(buying.getAttribute('href')).toBe('/buying')
  within(buying).getByText('1 gift')
  // The same order on a phone and a computer: My wish list first.
  expect(follows(mine, buying)).toBe(true)
})

it('households appear in order under Shop for the family; kids carry the kid label; every person links to /list/<id>', () => {
  const { container } = render(<HomeView viewer={maya} home={home} />)
  const shop = screen.getByRole('heading', { level: 2, name: 'Shop for the family' })
  const names = screen.getAllByRole('heading', { level: 3 })
  expect(names.map(h => h.textContent)).toEqual(['Ben & Maya', 'Grandma & Grandpa', 'Sam & Priya'])
  expect(follows(shop, names[0])).toBe(true)

  for (const household of home.households) {
    const card = screen.getByRole('region', { name: household.name })
    const links = within(card).getAllByRole('link')
    expect(links.map(a => a.getAttribute('href'))).toEqual(household.members.map(m => `/list/${m.id}`))
    household.members.forEach((m, i) => {
      within(links[i]).getByText(m.name)
      expect(within(links[i]).queryByText('kid') !== null).toBe(m.kind === 'kid')
    })
  }

  // Nothing collapses or waits behind a tap.
  expect(container.querySelector('details, [hidden], [aria-expanded]')).toBeNull()
})

it('the organizer link shows only for the organizer', () => {
  render(<HomeView viewer={maya} home={home} />)
  expect(screen.getByRole('link', { name: 'Organizer page' }).getAttribute('href')).toBe('/organizer')
  cleanup()

  render(<HomeView viewer={ben} home={home} />)
  expect(screen.queryByText('Organizer page')).toBeNull()
})
