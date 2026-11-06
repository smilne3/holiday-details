# Family Wish Lists

One extended family's holiday wish lists, kept in one place, with each adult signing in from a
personal link. Anyone can tap "I'll buy this" on someone else's list, and everyone except that list's
owner sees it straight away, so nothing is bought twice and no surprise is spoiled.

## Run it locally

You need Node 22 or later. CI uses Node 24, as `.nvmrc` says.

```sh
npm ci
npm run dev
```

Then open <http://localhost:3000/p/dev-maya>. That's Maya's personal link, and she's the organizer.
Each adult's link is `/p/dev-<name>`: `dev-ben`, `dev-maya`, `dev-sam`, `dev-priya`, `dev-grandma` and
`dev-grandpa`. Opening a link signs that browser in as that person, so open another link to switch. A
private window lets you be two people at once.

The family is made up (`db/dev-family.ts`). It lives in `.pglite/`, a local database that the first
`npm run dev` creates and seeds, and your changes stay there between runs. To start again from the
made-up family, stop the server, delete `.pglite/` and run `npm run dev` again.

To try a production build with the made-up family, run `npm run build`, then `DEMO_DATA=1 npm start`.

## Tests

```sh
npx vitest run     # unit and component tests
npx tsc --noEmit   # type check
npm run lint       # ESLint
```

CI runs all three, plus `npm run build`, on every pull request (`.github/workflows/ci.yml`).

## Where the data comes from

`lib/db/index.ts` picks the database on the first request:

| Mode | When | Data |
|---|---|---|
| Postgres | `DATABASE_URL` is set | The real family, in Supabase, through its transaction pooler. Vercel sets it for Production only. |
| Dev | No `DATABASE_URL`, and not a production build (`npm run dev`) | The made-up family in `.pglite/`, seeded once |
| Demo | No `DATABASE_URL`, a production build, and `DEMO_DATA=1` | The made-up family in memory, seeded at each start. Vercel previews use this. |

A production build with neither variable set fails on every page rather than guess. That way a
production deployment that has lost `DATABASE_URL` fails loudly, instead of quietly showing the
made-up family to the real one. The schema is `db/migrations/001_init.sql`.

## Going live

[`docs/go-live.md`](docs/go-live.md) takes you from accounts to the family's first invitations, one
numbered step at a time.
