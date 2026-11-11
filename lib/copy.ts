import { keptBy, possessive } from '@/lib/format'

// Every word the app shows. Pages and components take their text from here, never inline, and the
// wording the owner confirmed ("My wish list", "Gifts I'm buying", "I'll buy this", "Priya is buying
// this", "✓ You're buying this · Undo") stays exactly as it is.
export const copy = {
  hi: (n: string) => `Hi, ${n}`,
  signedInAs: (n: string) => `Signed in as ${n}`,

  myWishList: 'My wish list',
  giftsImBuying: "Gifts I'm buying",
  shopForFamily: 'Shop for the family',
  kid: 'kid',
  things: (n: number) => `${n} ${n === 1 ? 'thing' : 'things'}`,
  gifts: (n: number) => `${n} ${n === 1 ? 'gift' : 'gifts'}`,
  organizerPage: 'Organizer page',
  allLists: '‹ All lists',
  loading: 'Loading…',

  listTitle: (name: string) => `${possessive(name)} wish list`,
  keptByLine: (names: string[]) => `Kept by ${keptBy(names)}`,
  ownListNote: "You won't see what's been claimed on your own list. That's the surprise.",
  listEmpty: 'Nothing on this list yet.',

  illBuyThis: "I'll buy this",
  saving: 'Saving…',
  youreBuying: "✓ You're buying this",
  undo: 'Undo',
  addedToBuying: "Added to Gifts I'm buying",
  isBuying: (n: string) => `${n} is buying this`,
  justTaken: 'Someone just took this one.',
  gone: 'This was just taken off the list.',
  saveFailed: "That didn't save. Please try again.",

  fieldName: 'What is it?',
  fieldPrice: 'About how much? (optional)',
  fieldDetails: 'Size, color, details (optional)',
  fieldLink: 'Paste a link (optional)',
  addToMyList: 'Add to my wish list',
  addToList: (name: string) => `Add to ${possessive(name)} wish list`,
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  remove: 'Remove',
  removeConfirm: 'Remove this?',
  removeYes: 'Yes, remove',
  removeNo: 'Keep it',
  nameRequired: 'Please say what it is.',
  tooLong: "That's a bit long. Please shorten it.",
  badLink: "That link doesn't look right. Copy it from the shop's page and paste it again.",
  notAllowed: "You can't change this list.",

  forRecipient: (n: string) => `For ${n}`,
  removedFrom: (n: string) => `Removed from ${possessive(n)} list`,
  changedAfterClaim: 'Changed after you claimed it',
  buyingEmpty: `Nothing yet. When you tap "I'll buy this" on someone's list, it shows up here.`,

  notSignedIn: (org: string) => `To see the family's lists, tap the link in the email ${org} sent you.`,
  cantFindEmail: (org: string) => `Can't find the email? Ask ${org}.`,
  organizerFallback: 'the person who invited you',
  listMissing: "That list isn't here any more.",
  errorTitle: 'Something went wrong',
  tryAgain: 'Try again',
  // Shown only on a page whose buttons never came to life, such as on a phone too old for the app.
  // It names no browser or setting: some of the family don't know which they use.
  ifNothingHappens: (org: string) =>
    `If nothing happens when you tap, try another phone, tablet or computer, or ask ${org}.`,
  // After a page left open across a deploy reloads in answer to a tap, which it didn't carry out.
  appUpdated: "The app was just updated, so your last tap didn't go through. Please tap it again.",

  copyLink: 'Copy link',
  copyInvitation: 'Copy invitation',
  copied: 'Copied',
  replaceLink: 'Replace link',
  replaceConfirm: 'The old link will stop working. Replace it?',
  yes: 'Yes',
  no: 'No',
  cantDelete: "Can't remove someone who has a wish list or is buying gifts.",
  // The owner's own words, pasted into an email to one person, sent from the owner's own address. It
  // ends at "Love you," and the owner signs it. The repo is public, so it names no one but the person
  // it's for: the kids' line is general on purpose.
  invitation: (name: string, link: string) =>
    [
      `Hi ${name}!`,
      "You know how every year we email our Christmas lists around, then spend weeks texting/emailing back and forth to coordinate who's buying what, all while trying to keep it a secret from the person whose list it is? It's a lot of work just to make sure everyone gets something they want! As a product manager, I can't help but think there's got to be a better way. So, I built one!",
      `Introducing Family Wish Lists: a simple place where everyone's Christmas wishes live in one spot. You can add your own wishes (with links and prices, if you want), browse everyone else's lists, and tap "I'll buy this" on the items you're planning to get. That way, everyone knows what's been claimed and we avoid duplicate gifts.`,
      "You won't be able to see who's buying things from your own list, so the surprises stay surprises! If you have kiddos, you can manage their wish lists too.",
      `I kept it intentionally low-tech. There's nothing to download, no account to create, and no password to remember. Just tap this link:\n${link}`,
      "And hang on to this email! Whenever you want to check the lists, just come back to this link (or bookmark the page for easy access). One thing to point out: Everyone has personalized links, so don't forward it to spouses.",
      'Love you,',
    ].join('\n\n'),

  // The rest of the organizer page.
  addHousehold: 'Add a household',
  addAdult: 'Add an adult',
  addKid: 'Add a kid',
  rename: 'Rename',
  fieldHouseholdName: 'Household name',
  fieldNewPerson: "New person's name",
  fieldPersonName: 'Name',
  fieldHousehold: 'Household',
  householdEmpty: 'No one in this household yet.',
  you: 'you',
  removePerson: (n: string) => `Remove ${n}?`,
  linkReplaced: 'Done. The old link no longer works, so send them the new one.',
  copyByHand: "That didn't copy. Select it here and copy it yourself:",
} as const
