export type PersonKind = 'adult' | 'kid'

export interface Person {
  id: string
  name: string
  kind: PersonKind
  householdId: string
}

// Whoever opened the app with their personal link. Only adults have one.
export interface Viewer extends Person {
  token: string
  isOrganizer: boolean
}
