import type { Person } from '@/lib/types'

// Who may do what with a wish list. The viewer is whoever opened the app; the owner is the person
// the list belongs to.

// Your own list, and the lists of the kids in your household.
export function canEdit(viewer: Person, owner: Person): boolean {
  return viewer.id === owner.id || (owner.kind === 'kid' && owner.householdId === viewer.householdId)
}

// Everyone's list but your own, so the surprise holds. Parents do see claims on their kids' lists.
export function canSeeClaims(viewer: Person, owner: Person): boolean {
  return viewer.id !== owner.id
}

// The same lists as canSeeClaims: you can't buy from your own list.
export function canClaim(viewer: Person, owner: Person): boolean {
  return canSeeClaims(viewer, owner)
}
