# Family Wish Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A small web app where a family keeps its holiday wish lists in one place and taps "I'll buy this" on items. Everyone except the list's owner sees what's taken.

**Architecture:** This is a Next.js 16 App Router app on Vercel. Server Components read from Postgres (Supabase) through one small `Db` interface, and Server Actions write through it. All permission rules live in `lib/data/*` and `lib/rules.ts`, which take the viewer as an argument. Those modules are tested against real Postgres semantics in PGlite (in-process, no Docker). Identity comes from a personal link, `/p/<token>`. `proxy.ts` copies the token into a cookie, which every other page reads. No Supabase client runs in the browser, and there's no Supabase Auth.

**Tech Stack:** next 16.4.5, react/react-dom 19.3.1, TypeScript 5, Tailwind 4, postgres (postgres.js) 3.4.9 in production, @electric-sql/pglite 0.5.12 for tests, local dev and preview demo data, Vitest 4.1.12, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-05-family-wish-lists-design.md`. Read it before starting any task.

**Why not supabase-js, unlike the budgeting app:** these permission rules (who sees claims, who may edit, one buyer per item) are the product. Plain SQL through a `Db` interface lets the very same queries run in PGlite in tests, with no mocked client. The budgeting app's notes record that a shared mock once hid three dead guards. The setup is still Vercel plus Supabase. Only the client library differs.

## Global Constraints

- **Run every `npm`/`npx`/`node` command as `env -u TYPESAFE_API_KEY <command>`.** The shell exports a real secret. Never print the environment.
- **Never run `npm install` in `~/every-dollar-counts`.** Read config files from it only.
- **One committing agent per checkout.** Work in a worktree under the session scratchpad (`<scratchpad>/wt-wish-lists`), not the home folder, on branch `feat/wish-lists` created from `design/family-wish-lists`. Worktrees in the home folder vanished on 2026-11-05.
- **Commit and push as soon as a task's tests pass**, before long steps such as builds or reviews (`git push -u origin feat/wish-lists` the first time). Uncommitted work in a worktree exists nowhere else.
- **Commits use the repo's configured noreply email.** End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **The repo is public.** Use only made-up names: the dev family in Task 2 (Ben, Maya, Leo, Ivy, Sam, Priya, Ollie, Grandma, Grandpa). No real names, emails, list contents, links or tokens anywhere in the repo, in issues or in PRs.
- **Exact versions:** next 16.4.5, eslint-config-next 16.4.5, react/react-dom 19.3.1, postgres 3.4.9, @electric-sql/pglite 0.5.12, vitest 4.1.12. Other dev tooling uses the budgeting app's ranges (`~/every-dollar-counts/package.json`). Node 24 in CI and `.nvmrc`; `"engines": { "node": ">=22" }`.
- **Read the installed Next docs** in `node_modules/next/dist/docs/` before using any Next API. Next 16 calls middleware `proxy.ts`, `cookies()` is async, page `params` is a Promise, and `refresh()` (from `next/cache`) re-renders after a Server Action.
- **User-facing text comes only from `lib/copy.ts`** (Task 3), and its values are exactly as listed there. The word "getting" never appears in `app/`, `components/` or `lib/`, comments included.
- **Claim data for the viewer's own list never leaves the server.** It isn't selected and isn't in any props.
- **Every Server Action resolves the viewer itself** with `getViewer()` and passes the viewer to a `lib/data` function, which enforces permissions. `proxy.ts` is not a security boundary.
- **Cookie:** name `hd_person`, value = token, `httpOnly`, `sameSite: 'lax'`, `path: '/'`, `maxAge: 7776000` (90 days), `secure` only when `NODE_ENV === 'production'`.
- **Personal link:** `/p/<token>`. The home page renders at that address and never redirects away from it.
- **Tokens:** 64 lowercase hex characters from SQL `new_token()` (Task 2).
- **Layout:** phone first. Switch layouts at `md:` (768px) or wider, never at `sm:`, which is inside a phone's range. Every tappable control is at least 44px tall (`min-h-11`).
- **SQL:** parameters are `$1, $2…` only, and every count is cast with `::int`, because postgres.js and PGlite parse `bigint` differently.
- **No `NEXT_PUBLIC_` env vars.** The only env vars are `DATABASE_URL` (Production) and `DEMO_DATA=1` (Preview).

## Review Focus

1. **A pasted link that isn't a plain web address** (`javascript:…`, `data:…`, `amazon.com/dp/1` without `https://`, or prose). A missing scheme gets `https://` added. Anything else is refused with `copy.badLink`. Nothing except `http(s)` ever becomes a clickable link. *Test: Task 3 `normalizeLink` table; Task 2 schema check.*
2. **A double tap, or a slow or failed network, on "I'll buy this."** It must make one call, disable the button while saving, never show a ✓ before the server answers, and say so when the save fails. *Test: Task 9 `ItemClaim`.*
3. **A stale, replaced, mistyped or kid-shaped link** (`/p/<old token>`, `/p/abc`, `/list/not-a-uuid`). It shows the friendly not-signed-in page or "That list isn't here any more", never an error page or anyone's data. *Tests: Task 4 `findViewerByToken`, Task 5 malformed ids, Task 11 replaced token.*
4. **A forged request** (a Server Action called with another list's item id, an owner claiming their own item, a claim on a removed item). It's refused server-side. An owner's refused claim must not reveal whether the item was taken. *Tests: Tasks 5 and 6.*
5. **Real-world names and text** ("James", 300-character item names, emoji). The possessive reads "James's", and limits come back as `copy.tooLong` instead of a database error. *Tests: Tasks 3 and 5.*

## File Structure

```
proxy.ts                         copies /p/<token> into the hd_person cookie
next.config.ts                   PGlite external; db/migrations traced into the server bundle
db/migrations/001_init.sql       the whole schema (also pasted into Supabase's SQL Editor)
db/dev-family.ts                 made-up family for tests, local dev and preview demo
lib/db/types.ts                  Db interface, isUniqueViolation
lib/db/postgres.ts               Db over postgres.js (production)
lib/db/pglite.ts                 Db over PGlite (tests, dev, demo)
lib/db/index.ts                  chooseDbMode, getDb
lib/rules.ts                     canEdit / canSeeClaims / canClaim
lib/format.ts                    possessive, keptBy, shopName, normalizeLink
lib/copy.ts                      every user-facing string
lib/types.ts                     Person, Viewer, Result, ClaimResult and view types
lib/data/people.ts               findViewerByToken, getHome, getOrganizerName
lib/data/lists.ts                getListView, addItem, updateItem, removeItem
lib/data/claims.ts               claimItem, unclaimItem, getBuying
lib/data/organizer.ts            organizer-only reads and writes
lib/session.ts                   getViewer (cookie → Viewer)
app/layout.tsx, globals.css, page.tsx, loading.tsx, error.tsx, not-found.tsx
app/p/[token]/page.tsx           home
app/list/[personId]/page.tsx     any wish list; app/list/actions.ts
app/buying/page.tsx              Gifts I'm buying
app/organizer/page.tsx           organizer page; app/organizer/actions.ts
components/                      NotSignedIn, SignedInAs, HomeView, ListView, ItemClaim,
                                 ItemForm, RemoveItem, BuyingView, organizer/*
tests/helpers/db.ts              PGlite test database with the dev family
tests/unit/**                    all tests (node env for db tests, jsdom for components)
```

---

### Task 1: Scaffold, CI and repo checks

**Files:**
- Create: `package.json`, `.npmrc`, `.nvmrc`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.mts`, `tests/stubs/empty.ts`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (placeholder; replaced in Task 7), `.github/workflows/ci.yml`, `.github/dependabot.yml`, `tests/unit/invariants.test.ts`
- Modify: `.gitignore` (replace the Visual Studio template)

**Interfaces:**
- Produces: `npm test`, `npm run lint`, `npm run build`; the `@/*` path alias; test environment `jsdom` by default, with `// @vitest-environment node` at the top of DB tests.

- [ ] **Step 1: Write the config.** Copy `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `.npmrc` and `tests/stubs/empty.ts` verbatim from `~/every-dollar-counts`. Base `vitest.config.mts` on its config, dropping the `PLAID_ENV`/`TZ` env and keeping the `server-only` alias and the Node 25 `execArgv`. Base `.github/dependabot.yml` on its version, keeping its pinned-action comment convention. `.nvmrc` holds `24`.
- [ ] **Step 2: Write `package.json`** with the versions from Global Constraints. Scripts: `dev`, `build`, `start`, `lint` (`eslint`) and `test` (`vitest`). Dependencies: `next`, `react`, `react-dom`, `postgres`, `@electric-sql/pglite`, `server-only`. PGlite is a runtime dependency because preview demo mode loads it.
- [ ] **Step 3: Replace `.gitignore`** with GitHub's Node template plus `.next/`, `.vercel/`, `.env*.local`, `.pglite/`, `.DS_Store` and the existing `.superpowers/` lines.
- [ ] **Step 4: Write the failing test** `tests/unit/invariants.test.ts`:

```ts
// @vitest-environment node
it('never says "getting" in app/, components/ or lib/ (spec: Wording)', () => {
  expect(filesUnder(['app', 'components', 'lib']).filter(f => /getting/i.test(read(f)))).toEqual([])
})
it('has no NEXT_PUBLIC_ env vars anywhere in the app', () => {
  expect(filesUnder(['app', 'components', 'lib', 'proxy.ts']).filter(f => read(f).includes('NEXT_PUBLIC_'))).toEqual([])
})
it('lays out with md: or wider, never sm:', () => {
  expect(filesUnder(['app', 'components']).filter(f => /\bsm:/.test(read(f)))).toEqual([])
})
```

`filesUnder` walks `.ts`/`.tsx` files and returns `[]` for paths that don't exist yet. To see the third test fail, temporarily add `sm:hidden` to the placeholder `app/page.tsx` and run it, then take the class out.
- [ ] **Step 5: Install and fix the lockfile.** Run `env -u TYPESAFE_API_KEY npm install`, then `env -u TYPESAFE_API_KEY npx -y npm@10 install --package-lock-only`. Npm 11 on this Mac drops the `"libc"` fields from `@next/swc-linux-*`, and npm 10 keeps them. Expected: `grep -c '"libc"' package-lock.json` ≥ 2. Then run `env -u TYPESAFE_API_KEY npm audit signatures`. Expected: all verified.
- [ ] **Step 6: Write `app/layout.tsx`** (`<html lang="en">`, metadata title `Family Wish Lists`, body background `#fffdf8`) and `app/globals.css` (`@import "tailwindcss";`, plus the mockup colours as CSS variables: accent `#b8452f`, wish-list blue `#eaf1fb`/`#1f4f8f`, buying `#fbe9e4`/`#8a2f1d`, family green `#2f5a24`).
- [ ] **Step 7: Write `.github/workflows/ci.yml`.** Copy `~/every-dollar-counts/.github/workflows/ci.yml`, keeping its commit-pinned `actions/checkout` and `actions/setup-node` lines. Use `node-version: 24` and no `env:` block. The steps are `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npx vitest run` and `npm run build`.
- [ ] **Step 8: Verify.** Run `env -u TYPESAFE_API_KEY npx tsc --noEmit && env -u TYPESAFE_API_KEY npm run lint && env -u TYPESAFE_API_KEY npx vitest run && env -u TYPESAFE_API_KEY npm run build`. Expected: all pass.
- [ ] **Step 9: Commit.** Message: `Scaffold Next 16 app, CI and repo checks`.

### Task 2: Database schema, adapters and the dev family

**Files:**
- Create: `db/migrations/001_init.sql`, `lib/db/types.ts`, `lib/db/postgres.ts`, `lib/db/pglite.ts`, `lib/db/index.ts`, `db/dev-family.ts`, `lib/types.ts`, `tests/helpers/db.ts`, `tests/unit/db/schema.test.ts`, `tests/unit/db/mode.test.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Produces:
  - `interface Db { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> }`
  - `isUniqueViolation(e: unknown): boolean`, which is true when `(e as {code?: string}).code === '23505'`
  - `createPostgresDb(url: string): Db`
  - `createPgliteDb(opts?: { dataDir?: string }): Promise<Db & { close(): Promise<void> }>`
  - `chooseDbMode(env: Record<string, string | undefined>): 'postgres' | 'dev' | 'demo'`
  - `getDb(): Promise<Db>`
  - `lib/types.ts`: `type PersonKind = 'adult' | 'kid'`, `interface Person { id: string; name: string; kind: PersonKind; householdId: string }`, `interface Viewer extends Person { token: string; isOrganizer: boolean }`
  - `db/dev-family.ts`: `seedDevFamily(db: Db): Promise<Family>` and `seedDevItems(db: Db, f: Family): Promise<void>`, where `Family` has `households: { benMaya, samPriya, grandparents }` (ids), adult `Viewer`s `ben, maya, sam, priya, grandma, grandpa` and kid `Person`s `leo, ivy, ollie`
  - `tests/helpers/db.ts`: `testDb(): Promise<{ db: Db; family: Family; reset(): Promise<Family>; close(): Promise<void> }>`. `reset` truncates every table and reseeds the family without items. Raw-insert helpers for tests that come before the data layer: `itemRow(db, ownerId: string, name: string, extra?: { details?: string; url?: string }): Promise<string>` (returns the item id) and `claimRow(db, itemId: string, buyerId: string): Promise<void>`.

- [ ] **Step 1: Write `db/migrations/001_init.sql`:**

```sql
create function new_token() returns text language sql volatile
  as $$ select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') $$;

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now());

create table people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  name text not null check (length(trim(name)) between 1 and 60),
  kind text not null check (kind in ('adult', 'kid')),
  token text unique,
  is_organizer boolean not null default false,
  created_at timestamptz not null default now(),
  check ((kind = 'adult') = (token is not null)),
  check (not is_organizer or kind = 'adult'));

create table items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references people(id),
  name text not null check (length(trim(name)) between 1 and 200),
  details text check (details is null or length(details) <= 500),
  url text check (url is null or (length(url) <= 2000 and url ~ '^https?://')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz);
create index items_owner on items(owner_id);

-- One buyer per item: the primary key is what makes two simultaneous claims produce one winner.
create table claims (
  item_id uuid primary key references items(id),
  buyer_id uuid not null references people(id),
  created_at timestamptz not null default now());
create index claims_buyer on claims(buyer_id);

-- No policies: Supabase's public API (anon/authenticated) sees nothing. The app connects as the owner.
alter table households enable row level security;
alter table people enable row level security;
alter table items enable row level security;
alter table claims enable row level security;
```

- [ ] **Step 2: Write the failing tests** in `tests/unit/db/schema.test.ts` (node env, using `testDb()`):
  - `a second claim on the same item is a unique violation`: insert one claim row, then insert another for the same item. The second rejects, and `isUniqueViolation(err)` is `true`.
  - `an adult needs a token and a kid cannot have one`: an adult with a `null` token rejects, and a kid with any token rejects.
  - `two people cannot share a token`.
  - `only http(s) links are stored`: an item with url `javascript:alert(1)` rejects, and `https://x.com` is accepted.
  - `new_token() is 64 lowercase hex characters and different each call`: matches `/^[0-9a-f]{64}$/`, and two calls differ.
  - `the dev family is three households, six adults, three kids, and Maya is the only organizer`.

  Then write `tests/unit/db/mode.test.ts`:

```ts
expect(chooseDbMode({ DATABASE_URL: 'x', NODE_ENV: 'production' })).toBe('postgres')
expect(chooseDbMode({ DATABASE_URL: 'x', DEMO_DATA: '1', NODE_ENV: 'production' })).toBe('postgres')
expect(chooseDbMode({ NODE_ENV: 'development' })).toBe('dev')
expect(chooseDbMode({ NODE_ENV: 'production', DEMO_DATA: '1' })).toBe('demo')
expect(() => chooseDbMode({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/)
```

- [ ] **Step 3: Run them and confirm they fail.** Run `env -u TYPESAFE_API_KEY npx vitest run tests/unit/db`. Expected: FAIL, because the modules don't exist yet.
- [ ] **Step 4: Implement the modules.**
  - `createPostgresDb` uses `postgres(url, { prepare: false, max: 5, connect_timeout: 10, idle_timeout: 20 })`. `prepare: false` is required by Supabase's transaction pooler. `query` maps to `sql.unsafe(text, params)`.
  - `createPgliteDb` opens `new PGlite(dataDir)` and runs every `db/migrations/*.sql` file in name order, read from `path.join(process.cwd(), 'db/migrations')`. `query` maps to `(await pg.query(text, params)).rows`.
  - `getDb` memoizes on `globalThis`, which survives dev hot reloads. In `'dev'` mode it uses dataDir `.pglite` and seeds the family and items only when `households` is empty. In `'demo'` mode it runs in memory and always seeds both. It never seeds in `'postgres'` mode.
  - `seedDevFamily` creates the households `Ben & Maya` (Ben, Maya, Leo, Ivy), `Sam & Priya` (Sam, Priya, Ollie) and `Grandma & Grandpa`. Adult tokens are `dev-<lowercase name>`, and Maya is the organizer.
  - `seedDevItems` adds the mockup items to Leo's list: AirPods 5 (`https://www.apple.com/shop/buy-airpods/airpods-5`); Sweater with details `Green, size XS` (`https://www.asos.com/`), claimed by Priya; Yo-yo, claimed by Grandma; Any LEGO set with details `He likes the space ones`. It also adds two items to each adult's list.
  - `next.config.ts` sets `serverExternalPackages: ['@electric-sql/pglite']` and `outputFileTracingIncludes: { '/**': ['./db/migrations/*.sql'] }`.
- [ ] **Step 5: Run them and confirm they pass.** Run `env -u TYPESAFE_API_KEY npx vitest run tests/unit/db`. Expected: PASS.
- [ ] **Step 6: Commit.** Message: `Schema, Db adapters (postgres.js, PGlite) and a made-up dev family`.

### Task 3: Rules, formatting and copy

**Files:**
- Create: `lib/rules.ts`, `lib/format.ts`, `lib/copy.ts`, `tests/unit/rules.test.ts`, `tests/unit/format.test.ts`

**Interfaces:**
- Consumes: `Person` from `lib/types.ts`.
- Produces:
  - `canEdit(viewer: Person, owner: Person): boolean`, which is true when the viewer is the owner, or the owner is a kid in the viewer's household
  - `canSeeClaims(viewer: Person, owner: Person): boolean`, which is true when `viewer.id !== owner.id`
  - `canClaim(viewer: Person, owner: Person): boolean`, which behaves the same as `canSeeClaims`
  - `possessive(name: string): string`
  - `keptBy(names: string[]): string`
  - `shopName(url: string): string`
  - `normalizeLink(input: string): { ok: true; url: string | null } | { ok: false }`
  - `copy` with exactly these values:

```ts
hi: (n) => `Hi, ${n}`;  signedInAs: (n) => `Signed in as ${n}`
myWishList: 'My wish list';  giftsImBuying: "Gifts I'm buying";  shopForFamily: 'Shop for the family';  kid: 'kid'
things: (n) => `${n} ${n === 1 ? 'thing' : 'things'}`;  gifts: (n) => `${n} ${n === 1 ? 'gift' : 'gifts'}`
organizerPage: 'Organizer page';  allLists: '‹ All lists'
listTitle: (name) => `${possessive(name)} wish list`;  keptByLine: (names) => `Kept by ${keptBy(names)}`
ownListNote: "You won't see what's been claimed on your own list. That's the surprise."
illBuyThis: "I'll buy this";  saving: 'Saving…';  youreBuying: "✓ You're buying this";  undo: 'Undo'
addedToBuying: "Added to Gifts I'm buying";  isBuying: (n) => `${n} is buying this`
justTaken: 'Someone just took this one.';  gone: 'This was just taken off the list.'
saveFailed: "That didn't save. Please try again."
fieldName: 'What is it?';  fieldDetails: 'Size, color, details (optional)';  fieldLink: 'Paste a link (optional)'
addToMyList: 'Add to my wish list';  addToList: (name) => `Add to ${possessive(name)} wish list`
edit: 'Edit';  save: 'Save';  cancel: 'Cancel';  remove: 'Remove'
removeConfirm: 'Remove this?';  removeYes: 'Yes, remove';  removeNo: 'Keep it'
nameRequired: 'Please say what it is.';  tooLong: "That's a bit long. Please shorten it."
badLink: "That link doesn't look right. Copy it from the shop's page and paste it again."
notAllowed: "You can't change this list."
forRecipient: (n) => `For ${n}`;  removedFrom: (n) => `Removed from ${possessive(n)} list`
changedAfterClaim: 'Changed after you claimed it'
buyingEmpty: `Nothing yet. When you tap "I'll buy this" on someone's list, it shows up here.`
notSignedIn: (org) => `To see the family's lists, tap the link in the email ${org} sent you.`
cantFindEmail: (org) => `Can't find the email? Ask ${org}.`;  organizerFallback: 'the person who invited you'
listMissing: "That list isn't here any more.";  errorTitle: 'Something went wrong';  tryAgain: 'Try again'
copyLink: 'Copy link';  copyInvitation: 'Copy invitation';  copied: 'Copied';  replaceLink: 'Replace link'
replaceConfirm: 'The old link will stop working. Replace it?';  yes: 'Yes';  no: 'No'
cantDelete: "Can't remove someone who has a wish list or is buying gifts."
invitation: (name, link) => `Hi ${name}!\n\nThis year our wish lists are all in one place. Tap this link to see everyone's lists and add your own:\n\n${link}\n\nKeep this email. Whenever you want to see the lists, just tap the link again. You can bookmark the page too if you like.\n\nThis link is just for you, so please don't forward it.`
```

- [ ] **Step 1: Write the failing tests.** `rules.test.ts` is a table test:

| viewer → owner | canEdit | canSeeClaims | canClaim |
|---|---|---|---|
| maya → maya (own) | true | false | false |
| maya → leo (her kid) | true | true | true |
| ben → maya (spouse) | false | true | true |
| grandma → maya | false | true | true |
| sam → leo (another household's kid) | false | true | true |

`format.test.ts`:

```ts
expect(possessive('Leo')).toBe("Leo's"); expect(possessive('James')).toBe("James's")
expect(keptBy(['Ben'])).toBe('Ben'); expect(keptBy(['Ben', 'Maya'])).toBe('Ben & Maya')
expect(keptBy(['Ann', 'Bo', 'Cy'])).toBe('Ann, Bo & Cy')
expect(shopName('https://www.asos.com/us/x?gclid=1')).toBe('asos.com')
expect(shopName('https://apple.com/shop')).toBe('apple.com')
expect(normalizeLink('  ')).toEqual({ ok: true, url: null })
expect(normalizeLink(' amazon.com/dp/123 ')).toEqual({ ok: true, url: 'https://amazon.com/dp/123' })
expect(normalizeLink('http://x.com/a')).toEqual({ ok: true, url: 'http://x.com/a' })
for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'not a link', 'https://' + 'a'.repeat(2000)])
  expect(normalizeLink(bad)).toEqual({ ok: false })
```

`possessive` adds `'s` to every name. That's the spec's "James's".
- [ ] **Step 2: Run them and confirm they fail.** Run `env -u TYPESAFE_API_KEY npx vitest run tests/unit/rules.test.ts tests/unit/format.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `lib/rules.ts`, `lib/format.ts` and `lib/copy.ts`. In `normalizeLink`, trim the input and return `{ok:true,url:null}` if it's empty. Try `new URL(s)` and accept only `http:`/`https:`. Otherwise try `new URL('https://' + s)` and accept it if there are no spaces and the hostname contains a dot. Refuse anything longer than 2000 characters.
- [ ] **Step 4: Run them and confirm they pass**, along with `invariants.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `Permission rules, link handling and all interface copy`.

### Task 4: Identity and home data

**Files:**
- Create: `lib/data/people.ts`, `tests/unit/data/people.test.ts`

**Interfaces:**
- Consumes: `Db`, `Viewer`, `testDb`.
- Produces:
  - `findViewerByToken(db: Db, token: string): Promise<Viewer | null>`
  - `getHome(db: Db, viewer: Viewer): Promise<HomeData>`
  - `getOrganizerName(db: Db): Promise<string | null>`, which returns the earliest-created organizer's name
  - `interface HomeData { myItemCount: number; buyingCount: number; households: { id: string; name: string; members: { id: string; name: string; kind: PersonKind }[] }[] }`, added to `lib/types.ts`

- [ ] **Step 1: Write the failing tests** (node env):
  - `finds Maya by her token, as the organizer`: `findViewerByToken(db,'dev-maya')` gives `name 'Maya'` and `isOrganizer true`.
  - `an unknown, empty or odd token finds no one`: `'nope'`, `''` and `"'; drop table people;--"` each give `null`.
  - `home lists households by name, without the viewer`: for Maya, the household names in order are `['Ben & Maya','Grandma & Grandpa','Sam & Priya']`. Her household's members are `Ben, Leo, Ivy`, with adults first, then kids, each group by name.
  - `a household left empty without the viewer is omitted`: add a household containing only a new adult, Zed, and give Zed a home. It has no `Zed` household.
  - `counts: my live items, and my claims including removed items`: after `itemRow` twice for Maya, `myItemCount` is 2. After setting one item's `removed_at`, it's 1. After `claimRow` for Grandma on a Leo item whose `removed_at` is then set, her `buyingCount` is still 1.
  - `organizer name is Maya; null when there's no organizer`.
- [ ] **Step 2: Run them and confirm they fail.** Run `env -u TYPESAFE_API_KEY npx vitest run tests/unit/data/people.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `lib/data/people.ts`.**
- [ ] **Step 4: Run them and confirm they pass.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `Find the viewer by token and build the home screen's data`.

### Task 5: Wish lists and items

**Files:**
- Create: `lib/data/lists.ts`, `tests/unit/data/lists.test.ts`

**Interfaces:**
- Consumes: `canEdit`, `canSeeClaims`, `canClaim`, `normalizeLink`, `keptBy`, `copy`.
- Produces (types go in `lib/types.ts`):
  - `type Result = { ok: true } | { ok: false; error: string }`
  - `interface ItemInput { name: string; details: string; link: string }`
  - `interface ListItem { id: string; name: string; details: string | null; url: string | null; claim?: { buyerName: string; mine: boolean } | null }`. The `claim` key is **absent** in `'own'` mode, and `null` means unclaimed.
  - `interface ListViewData { owner: { id: string; name: string; kind: PersonKind }; mode: 'own' | 'kept' | 'other'; keptBy: string | null; canEdit: boolean; canClaim: boolean; items: ListItem[] }`
  - `getListView(db, viewer, ownerId: string): Promise<ListViewData | null>`
  - `addItem(db, viewer, ownerId: string, input: ItemInput): Promise<Result>`
  - `updateItem(db, viewer, itemId: string, input: ItemInput): Promise<Result>`
  - `removeItem(db, viewer, itemId: string): Promise<Result>`

- [ ] **Step 1: Write the failing tests** (node env). The first is the spec's core rule:

```ts
it("the owner's own list carries no claim data at all", async () => {
  await addItem(db, f.maya, f.maya.id, { name: 'Bird feeder', details: '', link: '' })
  const [item] = (await getListView(db, f.maya, f.maya.id))!.items
  await claimRow(db, item.id, f.priya.id)               // direct insert helper in tests/helpers/db.ts
  const view = (await getListView(db, f.maya, f.maya.id))!
  expect(view.mode).toBe('own'); expect('claim' in view.items[0]).toBe(false)
  expect(JSON.stringify(view)).not.toContain('Priya')
})
```

  Also:
  - `a parent sees claims on their kid's list and can edit it`: Maya → Leo gives `mode 'kept'`, `canEdit true`, `canClaim true` and `keptBy 'Ben & Maya'`, and Grandma's claim reads `{ buyerName: 'Grandma', mine: false }`.
  - `others see who's buying; your own claim is marked mine`.
  - `removed items are hidden from every view`.
  - `items come back in the order they were added`.
  - `unknown or malformed owner id gives null`: `'not-a-uuid'` and a random UUID. Check the UUID format before querying, because Postgres throws on a malformed `uuid`.
  - `addItem`: Maya → Leo is `ok`; Grandma → Leo gives `{ok:false,error:copy.notAllowed}`; a blank name gives `copy.nameRequired`; a 201-character name gives `copy.tooLong`; link `javascript:x` gives `copy.badLink`; link `amazon.com/dp/1` is stored as `https://amazon.com/dp/1`; an emoji name is stored as typed.
  - `updateItem`: the owner gets `ok` and `updated_at` moves forward. Ben editing Grandma's item gets `notAllowed`, and so does editing a removed item.
  - `removeItem`: sets `removed_at`; a non-editor gets `notAllowed`.
- [ ] **Step 2: Run them and confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement `lib/data/lists.ts`.** In `'own'` mode the query must not join `claims` at all. Trim inputs, and treat an empty `details` as `null`.
- [ ] **Step 4: Run them and confirm they pass.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `Wish-list views and item editing, with claims kept from owners`.

### Task 6: Claims and Gifts I'm buying data

**Files:**
- Create: `lib/data/claims.ts`, `tests/unit/data/claims.test.ts`

**Interfaces:**
- Consumes: `canClaim`, `isUniqueViolation`.
- Produces (types go in `lib/types.ts`):
  - `type ClaimResult = 'claimed' | 'taken' | 'gone' | 'not-allowed'`
  - `claimItem(db, viewer, itemId: string): Promise<ClaimResult>`
  - `unclaimItem(db, viewer, itemId: string): Promise<void>`
  - `interface BuyingGroup { recipient: { id: string; name: string }; items: { id: string; name: string; details: string | null; url: string | null; note: 'removed' | 'changed' | null }[] }`
  - `getBuying(db, viewer): Promise<BuyingGroup[]>`

- [ ] **Step 1: Write the failing tests** (node env):
  - `Grandma claims an item on Leo's list` gives `'claimed'`.
  - `a second claim on a taken item is 'taken'`.
  - `two claims at the same moment: exactly one wins`: `(await Promise.all([claimItem(db,f.grandma,id), claimItem(db,f.priya,id)])).sort()` equals `['claimed','taken']`.
  - `an owner claiming their own item is 'not-allowed', even when it is taken`. That doesn't reveal the claim.
  - `a removed item, an unknown id, or 'not-a-uuid' is 'gone'`.
  - `unclaim removes only your own claim`: Grandma unclaiming Priya's claim leaves it in place.
  - `getBuying groups my claims by recipient name, with links and details`.
  - `a claimed item edited afterwards is noted 'changed'; one removed afterwards stays, noted 'removed'`.
  - `getBuying never includes anyone else's claims`.
- [ ] **Step 2: Run them and confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement `lib/data/claims.ts`.** Check permission and removal first, then `insert into claims … on conflict (item_id) do nothing returning item_id`. No returned row means `'taken'`. `'changed'` means `items.updated_at > claims.created_at`.
- [ ] **Step 4: Run them and confirm they pass.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `Claims with one winner per item, and the Gifts I'm buying list`.

### Task 7: Signing in: proxy, session, fallback page and `/`

**Files:**
- Create: `proxy.ts`, `lib/session.ts`, `components/NotSignedIn.tsx`, `components/SignedInAs.tsx`, `app/error.tsx`, `app/not-found.tsx`, `tests/unit/proxy.test.ts`, `tests/unit/not-signed-in.test.tsx`, `tests/unit/error-page.test.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `getDb`, `findViewerByToken`, `getOrganizerName`, `copy`.
- Produces:
  - `SESSION_COOKIE = 'hd_person'`
  - `getViewer(): Promise<Viewer | null>`, which reads the cookie and looks the token up
  - `<NotSignedIn organizerName={string | null} />`
  - `<SignedInAs name={string} />`
  - `proxy(request: NextRequest): NextResponse` with `config = { matcher: '/p/:token' }`

- [ ] **Step 1: Write the failing tests:**

```ts
// proxy.test.ts (node env)
const res = proxy(new NextRequest('http://localhost/p/abc123'))
const c = res.headers.get('set-cookie')!
expect(c).toMatch(/^hd_person=abc123;/); expect(c).toMatch(/HttpOnly/i); expect(c).toMatch(/Path=\//)
expect(c).toMatch(/Max-Age=7776000/); expect(c).toMatch(/SameSite=lax/i); expect(c).not.toMatch(/Secure/i)
expect(res.status).toBe(200)                         // no redirect: the personal link stays in the address bar
expect(proxy(new NextRequest('http://localhost/p/%3Cx%3E')).headers.get('set-cookie')).toBeNull()
expect(config.matcher).toBe('/p/:token')
```

  `not-signed-in.test.tsx`: renders `copy.notSignedIn('Maya')` and `copy.cantFindEmail('Maya')`, and uses `copy.organizerFallback` when the name is `null`. The page text never contains `browser`, `cookie` or `device`.

  `error-page.test.tsx`: renders `copy.errorTitle`, and clicking `copy.tryAgain` calls the `retry` prop. Check the prop name in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`.
- [ ] **Step 2: Run them and confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `proxy` sets the cookie (Global Constraints values) only when the token matches `/^[A-Za-z0-9_-]{1,128}$/`, and returns `NextResponse.next()`.
  - `app/page.tsx` redirects a known viewer to `/p/<token>`; anyone else gets `<NotSignedIn>` with `getOrganizerName`.
  - `app/not-found.tsx` shows `copy.listMissing` and a link to `/`.
  - `<SignedInAs>` is a small line at the top right.
- [ ] **Step 4: Run them and confirm they pass.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `Personal links: cookie from /p/<token>, and a friendly page without one`.

### Task 8: Home page

**Files:**
- Create: `app/p/[token]/page.tsx`, `components/HomeView.tsx`, `app/loading.tsx`, `tests/unit/home-view.test.tsx`

**Interfaces:**
- Consumes: `findViewerByToken`, `getHome`, `copy`, `SignedInAs`, `NotSignedIn`.
- Produces: `<HomeView viewer={{ id, name, isOrganizer }} home={HomeData} />`.

- [ ] **Step 1: Write the failing tests** (jsdom, fixture data):
  - `greets the viewer and says who is signed in`: shows `Hi, Maya` and `Signed in as Maya`.
  - `My wish list and Gifts I'm buying are links with counts`: `My wish list` links to `/list/<maya.id>` and shows `2 things`; `Gifts I'm buying` links to `/buying` and shows `1 gift`.
  - `households appear in order under Shop for the family; kids carry the kid label; every person links to /list/<id>`.
  - `the organizer link shows only for the organizer`.
- [ ] **Step 2: Run them and confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement the page and `HomeView`.**
  - The page reads the token from `params`, not the cookie. That way the personal link works before the cookie exists. An unknown token renders `<NotSignedIn>`.
  - Layout is option B with small top buttons, as in mockups `home-options-v2.html` B and `b-computer-v2.html` 1. The two buttons are button-sized at every width (`flex gap-3`, never `w-full` at `md:`). Household cards use `grid gap-4 md:grid-cols-2 lg:grid-cols-3`. Rows are `min-h-11` links.
  - `app/loading.tsx` is a quiet centered "Loading…", so a slow tap visibly does something. Use no `#fragment` links anywhere under it.
- [ ] **Step 4: Run them and confirm they pass.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `Home: two buttons, then the family by household`.

### Task 9: Wish-list page: viewing, claiming and editing

**Files:**
- Create: `app/list/[personId]/page.tsx`, `app/list/actions.ts`, `components/ListView.tsx`, `components/ItemClaim.tsx`, `components/ItemForm.tsx`, `components/RemoveItem.tsx`, `tests/unit/item-claim.test.tsx`, `tests/unit/list-view.test.tsx`, `tests/unit/item-form.test.tsx`

**Interfaces:**
- Consumes: `getViewer`, `getListView`, `addItem`, `updateItem`, `removeItem`, `claimItem`, `unclaimItem`, `shopName`, `copy`.
- Produces:
  - Server Actions in `app/list/actions.ts`:
    - `claimAction(itemId: string): Promise<ClaimResult>`
    - `unclaimAction(itemId: string): Promise<void>`
    - `addItemAction(ownerId: string, prev: Result | null, form: FormData): Promise<Result>`
    - `updateItemAction(itemId: string, prev: Result | null, form: FormData): Promise<Result>`
    - `removeItemAction(itemId: string): Promise<Result>`

    Each calls `getViewer()`. With no viewer it returns `{ok:false,error:copy.notSignedIn(…)}` or `'not-allowed'`. Otherwise it calls the data function, then `refresh()`.
  - `<ItemClaim itemId initial={'open' | 'mine'} claim={(id) => Promise<ClaimResult>} unclaim={(id) => Promise<void>} />`
  - `<ListView view={ListViewData} viewerName={string} homeHref={string} actions={{ claim, unclaim, add, update, remove }} />`, where the actions are the Server Actions above

- [ ] **Step 1: Write the failing tests.** `item-claim.test.tsx` uses fake `claim`/`unclaim` functions:
  - `while saving, the button is disabled, says Saving…, and a second click does not claim again`: with a pending promise, click twice; `claim` is called once.
  - `once the server says claimed, shows ✓ You're buying this, Added to Gifts I'm buying, and Undo`. No ✓ appears before the promise resolves.
  - `'taken' shows Someone just took this one.`; `'gone'` shows `copy.gone`.
  - `a failed save says That didn't save. Please try again. and offers the button again`: `claim` rejects.
  - `Undo calls unclaim and shows I'll buy this again`.
  - `initial 'mine' shows ✓ You're buying this and Undo, without the Added hint`.

  `list-view.test.tsx`:
  - `own: shows the surprise note, Edit and Remove, Add to my wish list, and no I'll buy this`.
  - `kept: shows Kept by Ben & Maya, the claim controls, the edit tools, and Add to Leo's wish list`.
  - `other: an item someone else claimed is struck through and says Priya is buying this; no edit tools`.
  - `a link shows asos.com ↗, opens in a new tab with rel="noopener noreferrer", and keeps the full URL`.
  - `title is Leo's wish list (My wish list for your own); ‹ All lists links to the home href; Signed in as Maya shows`.

  `item-form.test.tsx`: the form shows three fields labelled with `copy.fieldName`, `copy.fieldDetails` and `copy.fieldLink`; an error result is displayed; the fields clear after `{ok:true}`.
- [ ] **Step 2: Run them and confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The page awaits `params` and calls `getViewer()`. No viewer renders `<NotSignedIn>`, and a `null` view calls `notFound()`. `homeHref` is `/p/<viewer.token>`.
  - `ItemClaim` keeps its "just claimed" hint in local state, so the hint survives the `refresh()`.
  - `RemoveItem` confirms inline with `copy.removeConfirm`, `copy.removeYes` and `copy.removeNo`. It doesn't use `window.confirm`.
  - Use the layouts from `b-computer-and-list.html`: one row per item with the button on the right at `md:` and wider, and a full-width button below the item on phones.
- [ ] **Step 4: Run them and confirm they pass.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `Wish-list page: I'll buy this, with Undo, and editing for owners and parents`.

### Task 10: Gifts I'm buying page

**Files:**
- Create: `app/buying/page.tsx`, `components/BuyingView.tsx`, `tests/unit/buying-view.test.tsx`

**Interfaces:**
- Consumes: `getViewer`, `getBuying`, `unclaimAction`, `shopName`, `copy`.
- Produces: `<BuyingView groups={BuyingGroup[]} viewerName={string} homeHref={string} unclaim={(id) => Promise<void>} />`.

- [ ] **Step 1: Write the failing tests:**
  - `groups under For Leo, with details and the shop link`.
  - `notes read Removed from Leo's list and Changed after you claimed it`.
  - `Undo calls unclaim with the item id`.
  - `empty shows the empty message`: `copy.buyingEmpty`.
  - `shows Signed in as Maya and ‹ All lists`.
- [ ] **Step 2: Run them and confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement the page and the view.** With no viewer, render `<NotSignedIn>`.
- [ ] **Step 4: Run them and confirm they pass.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `Gifts I'm buying, grouped by person, with notes when a list changes`.

### Task 11: Organizer page

**Files:**
- Create: `lib/data/organizer.ts`, `app/organizer/page.tsx`, `app/organizer/actions.ts`, `components/organizer/PersonRow.tsx`, `components/organizer/CopyButton.tsx`, `components/organizer/HouseholdCard.tsx`, `tests/unit/data/organizer.test.ts`, `tests/unit/organizer-ui.test.tsx`

**Interfaces:**
- Consumes: `Db`, `Viewer`, `copy`.
- Produces. Every function takes the viewer first and returns `{ok:false,error:copy.notAllowed}` unless `viewer.isOrganizer`:
  - `getOrganizerData(db, viewer): Promise<{ households: { id: string; name: string; people: { id: string; name: string; kind: PersonKind; token: string | null }[] }[] } | null>`
  - `createHousehold(db, viewer, name)`
  - `renameHousehold(db, viewer, id, name)`
  - `addPerson(db, viewer, { name, kind, householdId })`
  - `updatePerson(db, viewer, id, { name, householdId })`
  - `deletePerson(db, viewer, id)`
  - `replaceLink(db, viewer, personId)`

  All return `Promise<Result>`. Matching Server Actions go in `app/organizer/actions.ts`, following Task 9's pattern.

- [ ] **Step 1: Write the failing tests.** In `organizer.test.ts` (node env):
  - `everything is refused for Ben, who isn't the organizer`.
  - `an added adult gets a 64-hex token; an added kid gets none`.
  - `rename and move a person between households`.
  - `delete is refused, with copy.cantDelete, for someone who has items or claims; allowed otherwise`.
  - `replaceLink: the old token no longer finds anyone, the new one finds the same person`. This uses `findViewerByToken`.

  In `organizer-ui.test.tsx`:
  - `copy.invitation('Ben', 'https://x.test/p/abc')` equals the exact text in Task 3.
  - An adult row shows `Copy link`, `Copy invitation` and `Replace link`; a kid row shows none of them.
  - `Replace link` asks `copy.replaceConfirm` with Yes and No before calling the action.
  - `Copy link` writes `window.location.origin + '/p/' + token` to `navigator.clipboard`, then shows `Copied`.
- [ ] **Step 2: Run them and confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement the module, the page and the components.** A non-organizer gets `notFound()`. Add a household, add an adult or a kid, rename, move, delete, copy the link or invitation, replace the link. Keep it plain; the spec leaves its look to the builder.
- [ ] **Step 4: Run them and confirm they pass**, then run the full suite with `env -u TYPESAFE_API_KEY npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `Organizer page: set up the family and hand out personal links`.

### Task 12: Check it end to end, then go live with the owner

This task runs with the owner at the keyboard. The owner wants to learn these steps. Give numbered steps with the reason for each, match the current dashboards (screenshot first), and never ask for a secret in chat.

**Files:**
- Create: `docs/go-live.md` (the same steps, with placeholders only)
- Modify: `README.md` (local dev: `npm run dev`, then open `http://localhost:3000/p/dev-maya`; the made-up family lives in `.pglite/`)

- [ ] **Step 1: Local end-to-end check** with `npm run dev`, at phone width (390px) and desktop width (1280px). Check each of these:
  - `/p/dev-maya` shows the home screen. `/` in a private window shows the friendly page.
  - As Grandma (`/p/dev-grandma`), "I'll buy this" on Leo's list turns green. Priya's claim shows as "Priya is buying this".
  - As Maya, her own list shows no claims. Leo's list (her kid) shows the claims and the edit tools.
  - After removing a claimed item as Maya, Grandma's Gifts I'm buying shows "Removed from Leo's list".
  - The organizer page works for Maya and gives "not found" for Ben.

  Fix anything that fails, with a test, before going on.
- [ ] **Step 2: Open a PR** from `feat/wish-lists` into `main` (it's been pushed task by task). Read CI's result, which runs on Node 24, before calling it green.
- [ ] **Step 3: Account check.** Show the owner the GitHub (`gh auth status`), Vercel and Supabase accounts in use. Wait for the owner's OK that each is a personal account, not ASU.
- [ ] **Step 4: Supabase (owner).**
  1. Create the project `holiday-details` on the Free plan in a US West region, and save the database password in a password manager.
  2. In the SQL Editor, paste `db/migrations/001_init.sql` and run it.
  3. Under Connect → Transaction pooler, copy the URI.
  4. Note that a free project pauses after a stretch with no visits. That's fine through December, but expect to press Restore in January.
- [ ] **Step 5: Vercel (owner).**
  1. Import `smilne3/holiday-details`.
  2. Add env var `DATABASE_URL` (Sensitive), Production only. Real family data stays out of previews.
  3. Add env var `DEMO_DATA` = `1`, Preview only. Previews then show the made-up family.
  4. Redeploy the PR's preview.
- [ ] **Step 6: Real-phone check (owner)** on the PR preview, at `/p/dev-grandma` and `/p/dev-maya`. Each serverless instance keeps its own demo data, which is fine for a look. Fix anything the owner finds, then merge.
- [ ] **Step 7: Start the family (owner, Supabase SQL Editor).** Run this, with the owner typing their own names into the editor. These are never committed:

```sql
with h as (insert into households (name) values ('<household name>') returning id)
insert into people (household_id, name, kind, token, is_organizer)
select id, '<your first name>', 'adult', new_token(), true from h returning token;
```

  Open `https://<production address>/p/<token>`, then use the Organizer page to add everyone and send the invitations.
- [ ] **Step 8: Verify production together.**
  - `/` in a private window shows the friendly page.
  - The owner's own list hides a claim that the spouse's link made. Test this together, then undo the claim.
  - The page renders on the owner's phone.
- [ ] **Step 9: Commit** README and `docs/go-live.md` with message `How to run it locally and take it live`, push, and merge.
