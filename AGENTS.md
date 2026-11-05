<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## The repo is public

Name only the made-up family from `db/dev-family.ts` in code, tests, docs, commits, issues and PRs: Ben, Maya, Leo, Ivy, Sam, Priya, Ollie, Grandma and Grandpa. The real family's names, items and links live only in the production database. Describe a bug found there in terms of the made-up family.

## Words on screen

Every word the app shows comes from `lib/copy.ts`. Pages and components import it and hold no text of their own. The interface never says "getting": the owner pointed out that Grandma could read "What I'm getting" as presents she'll receive. `tests/unit/invariants.test.ts` fails on that word anywhere in `app/`, `components/` or `lib/`, and it checks the repo's other invariants too.

## Who sees what

Permission rules live in `lib/rules.ts` and `lib/data/*`. Every data function takes the viewer as an argument and makes its own check. Pages and Server Actions look the viewer up with `getViewer()` and pass it in.

Claims on a viewer's own list stay on the server. `getListView` doesn't read them for the list's owner, so they can't reach props, HTML or flight data. Build any new read the same way: decide on the server, and send only what this viewer may see.
