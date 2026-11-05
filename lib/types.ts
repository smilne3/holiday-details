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

// The home screen: the two counts on its buttons, and every household with the viewer left out.
// Nothing here may hint at claims on the viewer's own list: myItemCount counts their live items,
// claimed or not, and buyingCount counts the claims they made.
export interface HomeData {
  myItemCount: number
  buyingCount: number
  households: { id: string; name: string; members: { id: string; name: string; kind: PersonKind }[] }[]
}
