<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## The repo is public

Name only the made-up family from `db/dev-family.ts` in code, tests, docs, commits, issues and PRs: Ben, Maya, Leo, Ivy, Sam, Priya, Ollie, Grandma and Grandpa. Tests and comments, and the plan's sketches of them, may also use an obvious placeholder for someone outside that family, such as Zed, Pip, "Aunt Jo" or "The Smiths". The real family's names, items and links live only in the production database. Describe a bug found there in terms of the made-up family.

## Words on screen

Every word the app shows comes from `lib/copy.ts`. Pages and components import it and hold no text of their own. The one exception is the browser tab's title, which `app/layout.tsx` sets inline in its `metadata`. The interface never says "getting": the owner pointed out that Grandma could read "What I'm getting" as presents she'll receive. `tests/unit/invariants.test.ts` fails on that word anywhere in `app/`, `components/` or `lib/`, and it checks the repo's other invariants too.

## Who sees what

Permission rules live in `lib/rules.ts` and `lib/data/*`. Every data function that reads or writes for someone takes the viewer as an argument and makes its own check. Three take no viewer:

- `findViewerByToken`, which is how a viewer is found.
- `getOrganizerName`, for the page that tells someone without a working link to tap the one in their email.
- `findItem`, which the item and claim functions call before their own checks.

Server Actions and every page but one look the viewer up from the cookie with `getViewer()` and pass it in. A Server Action with no viewer calls `redirect('/')`, which is that tap-the-link page.

The exception is `app/p/[token]/page.tsx`, the home page at a personal link, and it's deliberate. It calls `findViewerByToken` with the token in the address. On the first tap of an invitation, the proxy sets the cookie on that very response, so the request doesn't carry it yet. Don't change it to `getViewer()`: every invitation's first tap would then land on the tap-the-link page. `tests/unit/home-page.test.tsx` guards it.

A client control that calls a Server Action passes any failure to `pageIsLeaving` in `lib/stale-page.ts` before reporting it. That reloads a page loaded before a deploy, and stays quiet while a signed-out viewer is redirected.

Claims on a viewer's own list stay on the server. `getListView` doesn't read them for the list's owner, so they can't reach props, HTML or flight data. Build any new read the same way: decide on the server, and send only what this viewer may see.
