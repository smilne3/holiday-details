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

// The organizer page: every household, empty ones included, and everyone in it, adults first and
// then kids, each by name. token is the adult's personal link; kids have none. Only the organizer
// is ever handed this.
export interface OrganizerData {
  households: {
    id: string
    name: string
    people: { id: string; name: string; kind: PersonKind; token: string | null }[]
  }[]
}

// What a write answers: done, or the message to show.
export type Result = { ok: true } | { ok: false; error: string }

// The add and edit form's three fields, as typed.
export interface ItemInput {
  name: string
  details: string
  link: string
}

// One item on a wish list. On the viewer's own list there is no claim key at all; elsewhere,
// null means no one is buying it yet.
export interface ListItem {
  id: string
  name: string
  details: string | null
  url: string | null
  claim?: { buyerName: string; mine: boolean } | null
}

// A wish list as one viewer sees it. 'own' is the viewer's list, 'kept' is one of their kids'
// lists, and 'other' is anyone else's, a spouse's included. keptBy names the adults who keep a
// kid's list ("Ben & Maya"), and is null for an adult's list or a kid's household with no adults.
export interface ListViewData {
  owner: { id: string; name: string; kind: PersonKind }
  mode: 'own' | 'kept' | 'other'
  keptBy: string | null
  canEdit: boolean
  canClaim: boolean
  items: ListItem[]
}

// What "I'll buy this" answers. 'claimed' means the viewer holds the item now, including when they
// already did; 'taken' means someone else holds it; 'gone' means it was removed from the list, or
// never existed; 'not-allowed' is the viewer's own item, whether or not anyone has claimed it, so
// the answer can't give a claim away.
export type ClaimResult = 'claimed' | 'taken' | 'gone' | 'not-allowed'

// One person's gifts in the viewer's Gifts I'm buying. note says what the owner did after the
// claim: took the item off the list, or edited it. A removed item stays until the buyer undoes it.
export interface BuyingGroup {
  recipient: { id: string; name: string }
  items: {
    id: string
    name: string
    details: string | null
    url: string | null
    note: 'removed' | 'changed' | null
  }[]
}
