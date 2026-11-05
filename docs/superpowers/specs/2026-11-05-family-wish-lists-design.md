# Family wish lists: design

Date: 2026-11-05. Status: draft, waiting for the owner's approval.

All names and examples in this document are made up. The repo is public; see Constraints.

## Why

Every holiday season about eight adults in one extended family email their wish lists around, plus a
list for each of their kids. Then the logistics start. A grandmother writes "we're getting the pants
on Ben's list"; two days later the other grandmother writes that she wants to get the same pants, and
a parent has to email back "already taken". Whoever is closest to a list ends up as its switchboard:
each parent for their kids, each spouse for their partner. Switchboards catch duplicates, relay who is
buying what, and resend updated lists.

This app takes everyone out of the middle. Each list lives in one place, and when someone says "I'll
buy this", everyone except the list's owner sees it straight away.

## Goals

- No duplicate gifts from wish lists.
- Nobody relays claims or resends an updated list.
- The surprise holds: nobody sees what has been claimed on their own list.
- The least tech-comfortable adult can use it unaided, from a link, on a phone or a computer.
- Usable within about a week. Lists circulate in early November and buying runs until Christmas.

## Non-goals (this season)

- Gifts that aren't on anyone's list. The owner confirmed duplicates come from list items.
- Prices, product photos, ranking favourites, comments, splitting one gift between people.
- Email or push notifications of any kind.
- Birthdays, other occasions, or keeping past years.
- Kids using the app.

## Anti-goals: these count as failure even if everything technically works

- **People go back to email.** The owner said this happens when a screen is confusing or something
  goes wrong. Concretely: someone can't tell how to claim, isn't sure their claim saved, or their link
  stops working.
- **The app spoils a surprise.** Anything on your own list that hints at a claim counts: greyed items,
  counts, "taken" badges, a change in order.
- **The app causes a duplicate.** Two people claim the same item at the same moment and both believe
  they have it.

## People, households and lists

- **Adults** (about eight) are the only users. Each has one wish list.
- **Kids** each have one wish list but never use the app.
- **A household** is a group of adults and kids, such as a couple and their children, or the
  grandparents. Households group people on the home screen and decide who keeps a kid's list.
- **A kid's list is kept by the adults in that kid's household.** Either parent can add, edit and
  remove items. The owner confirmed every kid fits neatly into one household (no parents living apart,
  no step-family arrangements), so a kid belongs to exactly one household.
- **The organizer** is the owner, alone. Only the organizer sets up households, adults and kids, and
  only the organizer can see everyone's links.

## Who sees what (owner-confirmed)

| Viewer looking at… | Own list | Own kid's list | Anyone else's list |
|---|---|---|---|
| See the items | yes | yes | yes |
| Add, edit, remove items | yes | yes (either parent) | no |
| See claims and who made them | **no** | yes | yes |
| Claim an item | no | yes | yes |

"Anyone else" includes your spouse. Your spouse sees the claims on your list, which is what makes
them a useful switchboard today, and they can claim from it.

The rule that you can't see claims on your own list has to hold on the server, not just on screen.
Claim data for the viewer's own list is never sent to their browser. *(My call: it's cheap to do
properly, and family members do look.)*

Parents can claim from their own kids' lists. Parents buy from those lists too, Santa gifts included,
and their claims need to show so the grandparents don't duplicate them. *(My call; the owner agreed in
the playback.)*

## Getting in (owner-decided)

- **Every adult gets a personal link.** Opening it signs them in as themselves. They bookmark it. There
  are no passwords, no accounts and no sign-in screen.
- **Why not Google or Firebase sign-in:** at least some adults use Hotmail, so "Sign in with Google"
  doesn't cover everyone. A screen with two sign-in buttons is exactly the confusion to avoid, and
  emailed sign-in links break when they're opened on a different device.
- **The personal link is the home page, and it stays in the address bar.** People bookmark the page
  they're looking at, so the personal link must not redirect to a plain URL. Bookmarking the home page
  then works on any device. *(My call, settling a reviewer's question.)*
- **Every other page carries no identity in its address.** Opening the personal link also sets a
  long-lived cookie (lasting into January), and every other page uses that cookie. This means a page
  copied out of the address bar, such as Leo's list pasted into the family email thread, can't sign
  anyone in as the person who copied it. A bookmark of an inner page works in the same browser; on a
  browser without the cookie it shows the "ask the organizer for your link" page. *(My call.)*
- **Every page says who you're signed in as** ("Signed in as Maya"), so a wrong identity is obvious.
  The owner confirmed no adults share a device or an email address, so this line is enough, and
  there's no "Who's this?" check.
- **Links work all season.** They must not expire before January.
- **Anyone holding a personal link is that person.** That's an accepted risk inside one family. The organizer
  can replace a person's link if one leaks; the old link then stops working. *(My call.)*
- **Visiting without a valid link** shows one plain sentence: ask the organizer for your link. There's
  no sign-up.

## Screens (the owner chose these from mockups)

The mockups are local only, in `.superpowers/brainstorm/1808-1793893211/content/` (gitignored). The
relevant files are `home-options-v2.html` (option B), `b-computer-and-list.html` and
`b-computer-v2.html` (option 1). They use made-up names.

### Home

- A greeting with the person's name.
- **Two small buttons along the top: "My wish list" and "Gifts I'm buying"**, each with a count. On a
  computer they stay button-sized, not full width. The order is the same on phone and computer.
- Below them, **"Shop for the family"**: one card per household, listing every adult and kid in it
  except the viewer. Kids carry a small "kid" label, and their list shows who keeps it. Cards stack on
  a phone and sit side by side in a grid on a computer.
- Nothing is collapsible or hidden behind a tap.

### Someone else's wish list

- Title "Leo's wish list". A kid's list adds "Kept by Ben & Maya".
- Each item has a **name**, optional **details** ("Green, size XS") and an optional **link**. The link
  is shown as the shop's domain ("asos.com ↗") and opens in a new tab. The full URL is stored exactly
  as pasted, since real shop links are very long and full of tracking parameters.
- **Unclaimed:** a button, **"I'll buy this"**. On a computer each item is one row with the button on
  the right; on a phone the button is full width under the item.
- **After tapping:** the item turns green and reads **"✓ You're buying this"**, with "Added to Gifts
  I'm buying" and an **Undo** link. The confirmation appears right where they tapped. It must not claim
  success until the claim has actually saved.
- **Claimed by someone else:** greyed out and struck through, reading **"Priya is buying this"**. It
  stays on the list; nothing disappears.
- **Two people claim at once:** exactly one wins. The other is told someone just took it and sees the
  current state, never a false ✓.

### My wish list

- A short note: "You won't see what's been claimed on your own list. That's the surprise."
- Items with Edit and Remove.
- An add form with three fields: *What is it?*, *Size, color, details (optional)*, *Paste a link
  (optional)*. The button reads "Add to my wish list".

### A kid's wish list, seen by a parent

The editing tools from "My wish list", plus the claims view and the claim button from "Someone else's
wish list".

### Gifts I'm buying

- Everything the viewer has claimed, grouped by recipient, with the link and Undo. *(Grouping is my
  call.)*
- **If the owner removes or edits an item after it was claimed**, the buyer finds out. The item stays
  in their Gifts I'm buying with a note such as "Removed from Leo's list" or "Changed after you claimed
  it". The owner is never told it had been claimed. *(My call; the owner agreed in the playback.)*

### Organizer page (organizer only)

- Add and edit households, adults and kids, and put each person in a household.
- Each adult shows a **Copy link** button and a way to replace their link.
- Kids have no link.

## Wording (owner-confirmed)

Use exactly: **My wish list**, **Gifts I'm buying**, **I'll buy this**, **Priya is buying this**,
**✓ You're buying this · Undo**. Don't use "getting" anywhere in the interface. The owner pointed out grandma could read "What I'm
getting" as presents she'll receive.

## Constraints

- **Stack (owner-decided):** Next.js on Vercel, with Supabase for the data. That's the same setup as
  the owner's budgeting app, which the owner already knows how to run. Check the installed Next.js
  version's own docs (`node_modules/next/dist/docs/`) before writing code; recent versions have
  breaking changes.
- **Accounts (owner-decided):** use the owner's *personal* GitHub (`smilne3`), Vercel and Supabase
  accounts, never a work or university account. Before creating any project, show the owner which
  account each tool is signed into and wait for the OK.
- **The repo is public.** No real family names, emails, list contents or links go into code, tests,
  seed data, docs, commits, issues or PR descriptions. Use made-up names everywhere. Real family data
  lives only in the Supabase database. Personal-link tokens and secrets are never committed.
- **Commit email:** the repo is configured to commit with the owner's GitHub noreply address. Pushes
  using the university address are declined.
- **Timeline:** usable by about 2026-11-12, then in use through 2026-12-25.
- **Devices:** phones and computers carry equal weight. Check both layouts in real browsers, and check
  on a real phone before calling it done.
- **Cost:** free tiers (Vercel Hobby, Supabase Free). A free Supabase project can pause after a period
  without activity, which won't matter in December but will in January.
- **The owner wants to learn the operations side.** When a step happens in a dashboard (creating the
  Supabase project, setting Vercel environment variables, deploying), write it as numbered steps with
  the reason for each, then verify it together.
- The repo's `.gitignore` is currently GitHub's Visual Studio template. Replace it with a Node/Next.js
  one and keep the `.superpowers/` line.

## Launch

Nothing has gone out by email yet this year (owner, 2026-11-05), so the app replaces the email round
entirely and there's nothing to import. At launch the organizer sets up the family and sends each adult
their link. Everyone enters their own list, and parents enter their kids' lists. There are no tools
for adding items or claims on someone else's behalf.

## What success looks like

- This season, nobody emails anyone to say who's buying what or to resend a list.
- No duplicate gifts from wish lists.
- Nobody finds out from the app what they're getting.
- All the adults use it with nothing more than their link.

## Left to the builder

- The data model and how personal links work under the hood, within the bookmark rule above.
- Visual style beyond the mockups: colours, type, spacing. Keep it warm and plain.
- The app's name and address. A `vercel.app` subdomain is fine.
- Item order within a list (order added is fine).
- How the organizer page looks, as long as only the organizer reaches it.
- The testing approach.
