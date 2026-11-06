// @vitest-environment node
import { expect, it } from 'vitest'
import { canClaim, canEdit, canSeeClaims } from '@/lib/rules'
import type { Person } from '@/lib/types'

// People from three of the dev family's households: Ben & Maya with their kid Leo, Sam & Priya, and
// Grandma & Grandpa.
const maya: Person = { id: 'maya', name: 'Maya', kind: 'adult', householdId: 'ben-maya' }
const ben: Person = { id: 'ben', name: 'Ben', kind: 'adult', householdId: 'ben-maya' }
const leo: Person = { id: 'leo', name: 'Leo', kind: 'kid', householdId: 'ben-maya' }
const sam: Person = { id: 'sam', name: 'Sam', kind: 'adult', householdId: 'sam-priya' }
const grandma: Person = { id: 'grandma', name: 'Grandma', kind: 'adult', householdId: 'grandparents' }

it.each([
  { label: 'maya → maya (own)', viewer: maya, owner: maya, edit: true, seeClaims: false, claim: false },
  { label: 'maya → leo (her kid)', viewer: maya, owner: leo, edit: true, seeClaims: true, claim: true },
  { label: 'ben → maya (spouse)', viewer: ben, owner: maya, edit: false, seeClaims: true, claim: true },
  { label: 'grandma → maya', viewer: grandma, owner: maya, edit: false, seeClaims: true, claim: true },
  { label: "sam → leo (another household's kid)", viewer: sam, owner: leo, edit: false, seeClaims: true, claim: true },
])('$label', ({ viewer, owner, edit, seeClaims, claim }) => {
  expect(canEdit(viewer, owner)).toBe(edit)
  expect(canSeeClaims(viewer, owner)).toBe(seeClaims)
  expect(canClaim(viewer, owner)).toBe(claim)
})
