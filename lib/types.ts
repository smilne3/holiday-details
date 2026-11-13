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

// The home screen: the two counts on its buttons, and every household with the viewer left out. A
// household that is empty, or holds only the viewer, is dropped. Nothing here may hint at claims on
// the viewer's own list: myItemCount counts their live items, claimed or not, and buyingCount counts
// the claims they made.
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

// What a write answers: done, or the message to show. gone marks the one refusal that should still
// refresh the page: the item was taken off the list since the page loaded, so it leaves the page.
export type Result = { ok: true } | { ok: false; error: string; gone?: true }

// The add and edit form's four fields, as typed. price is missing, rather than '', when the form had
// no price field at all: a page loaded before prices existed can still send its old form after a
// deploy (lib/stale-page.ts). Missing leaves the stored price as it is; '' clears it.
export interface ItemInput {
  name: string
  price?: string
  details: string
  link: string
}

// One item on a wish list, as its owner wrote it. price is text as typed ("40", "about $25"), never
// a number. It's item data, like details, so it's on every kind of list, the viewer's own included.
interface ItemFields {
  id: string
  name: string
  price: string | null
  details: string | null
  url: string | null
}

// An item on the viewer's own list. It has no claim key at all, and the type allows none, so no
// claim can reach their page by mistake.
export type OwnListItem = ItemFields & { claim?: never }

// An item on anyone else's list: who's buying it, or null when no one is yet.
export type ListItem = ItemFields & { claim: { buyerName: string; mine: boolean } | null }

// An off-list gift on anyone else's list (GLOSSARY.md): a gift its buyer added that isn't one of the
// list owner's wishes. It always has its buyer, and mine marks the viewer's own, which only they
// can change or remove.
export type OffListGift = ItemFields & { buyerName: string; mine: boolean }

// A wish list as one viewer sees it, by mode:
//   - 'own' is the viewer's list: they edit it, can't claim from it, and its items carry no claims.
//     It has no offList key at all, so no off-list gift for them can reach their page.
//   - 'kept' is one of their kids' lists: they edit it and claim from it, and see who's buying what
//   - 'other' is anyone else's, a spouse's included: they claim from it and see who's buying what
// keptBy names the adults who keep a kid's list ("Ben & Maya"), and is null for an adult's list or
// a kid's household with no adults. offList is every off-list gift for the list's owner, in the
// order they were added, and is empty when there are none.
export type ListViewData =
  | (ListOwner & { mode: 'own'; keptBy: null; canEdit: true; canClaim: false; items: OwnListItem[]; offList?: never })
  | (ListOwner & {
      mode: 'kept'
      keptBy: string | null
      canEdit: true
      canClaim: true
      items: ListItem[]
      offList: OffListGift[]
    })
  | (ListOwner & {
      mode: 'other'
      keptBy: string | null
      canEdit: false
      canClaim: true
      items: ListItem[]
      offList: OffListGift[]
    })

interface ListOwner {
  owner: { id: string; name: string; kind: PersonKind }
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
    price: string | null
    details: string | null
    url: string | null
    note: 'removed' | 'changed' | null
  }[]
}
