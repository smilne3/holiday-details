# Taking the app live

This takes the app from a branch on GitHub to the family's first invitations. Each step says what to
do, what goes in each field, and why.

## Before you start

- The pull request from `feat/wish-lists` into `main` is open, and its checks are green.
- You have a password manager open.
- Anything in `<angle brackets>` is a placeholder. Replace the whole thing, brackets included, with your
  own value.
- Dashboard labels move from time to time. If a button isn't where this says, look for the field it
  names. What goes in each field stays the same.

**Secrets.** These four things are secrets: the database password, the `DATABASE_URL` value, the
production address with anyone's `/p/<token>` on the end, and the token on its own. Put them only in
your password manager, the Supabase SQL Editor, the Vercel value field, an invitation email to the
person it belongs to, or your own browser's address bar. Keep them out of chats (Claude's included),
GitHub issues, commits and shared screenshots. Anyone holding a link can act as that person.

## 1. Check the accounts

1. **GitHub.** In a terminal, run `gh auth status`, or look at the avatar menu on github.com. It should
   show your personal username.
2. **Vercel.** At vercel.com, open the account switcher at the top left. Use your personal **Hobby**
   account, not a team that belongs to work or a university.
3. **Supabase.** At supabase.com/dashboard, open the organization switcher at the top left. Use an
   organization you own personally, on the **Free** plan.

**Why:** a project made under a work or university account belongs to that organization. It can
vanish when you leave, and the family's lists don't belong there. Each of these is hard to move once
it holds data, so check all three before creating anything.

## 2. Create the database (Supabase)

### Create the project

1. In your personal organization, click **New project**. The Free plan allows two active projects,
   and your budgeting app may already be one of them, so if Supabase says you've reached the limit,
   that's why.
2. **Project name:** `holiday-details`.
   **Why:** it matches the repository, so you'll know what it is next year.
3. **Database password:** click **Generate a password**. Copy it into a new password-manager entry
   named something like "Supabase holiday-details".
   **Why:** you need it once more, in step 2.13. Supabase won't show it again; it can only reset it.
4. **Region:** a US region near most of the family. If the form offers only broad choices, such as
   **Americas**, pick that one and Supabase chooses the exact region. Once the project exists, its
   card on the organization's **Projects** page shows the region's code, such as `us-east-1`. Note
   it.
   **Why:** a database near the family keeps pages quick. Vercel's region gets matched to it in step
   3.7.
5. **Plan:** the form shows your organization's plan. It should say Free.
6. If the form asks which connections you plan to use, choose **Only Connection String**.
   **Why:** the app talks to the database directly, with the password. It never uses Supabase's Data
   API, so turning that off closes a door nobody uses.
7. Click **Create new project**, then wait a minute or two until the project says it's ready.

### Create the tables

8. In the left sidebar, open **SQL Editor** and start a new query.
9. On GitHub, switch the repository to the `feat/wish-lists` branch and open
   `db/migrations/001_init.sql`. Use **Copy raw file**, paste it all into the editor, and click
   **Run**. You should see "Success. No rows returned".
   **Why:** this creates the four tables (households, people, items and claims) and the `new_token()`
   function that makes personal links. It also turns on row-level security with no policies, so
   Supabase's public API can read nothing. The app connects with the database password, which those
   rules don't limit. `main` doesn't have this file until you merge, which is why you open it on the
   branch.
10. Start another new query. Open `db/migrations/002_item_price.sql` on GitHub, copy it the same way,
    paste it in and click **Run**. You should see "Success. No rows returned" again.
    **Why:** it adds the optional price ("About how much?") to every item, and every list page reads it.
11. Run each file only once. A second run stops with "already exists" and changes nothing.
    If Supabase's Security Advisor later says "RLS Enabled No Policy" for these tables, that's the
    design described in step 2.9.

### Copy the connection string

12. Click **Connect** at the top of the project. The box opens on a **Framework** tab, which is for
    apps built on Supabase's own client library. This app isn't, so ignore that tab. Click the
    **Direct** tab (Connection string), choose **Transaction pooler**, which uses port `6543`, and
    copy the URI. You can't edit it there. Supabase only shows it, with `[YOUR-PASSWORD]` as a blank
    that you fill in at step 2.13. It looks like
    `postgresql://postgres.<project ref>:[YOUR-PASSWORD]@<pooler host>:6543/postgres`.
    **Why:** Vercel runs the app as many short-lived functions, each opening its own connection. The
    transaction pooler shares a few real connections among them, so the free plan's limit isn't
    reached. Supabase notes that this mode doesn't support prepared statements. The app already turns
    them off (`prepare: false` in `lib/db/postgres.ts`).
13. Open the password-manager entry from step 2.3, click **Edit**, and paste the URI into its
    **Notes** field. Copy the entry's password. In the notes, select `[YOUR-PASSWORD]` with its square
    brackets: click just before the `[`, then Shift-click just after the `]`. A double-click misses
    the brackets. Paste the password over it, then save the entry. The result has no brackets, no
    spaces and no quotes. It starts `postgresql://`, has `:6543/` near the end, and ends `/postgres`. This finished
    URI is the value of `DATABASE_URL`.
    If your password contains any of `@ : / ? # [ ] %`, the URI won't work. Reset the password to one
    of letters and digits only (Project Settings → Database), then do this step again.

### Know about the pause

14. A Free project pauses after about a week with no visits. Through December the family's visits keep
    it awake. In January, if the app says "Something went wrong" on every page, open the Supabase
    dashboard. If the project says it's paused, press **Restore project** and wait a few minutes.
    Nothing is lost.

## 3. Create the site (Vercel)

### Import the repository

1. In your personal Hobby account, click **Add New…** → **Project**.
2. Under **Import Git Repository**, find `holiday-details` and click **Import**. If it isn't listed,
   click **Adjust GitHub App Permissions**. Give it **Only select repositories** → `holiday-details`,
   then save.
   **Why:** Vercel sees only the repositories you grant, and it needs only this one.
3. On the **Configure Project** screen, enter these:
   - **Project Name:** `holiday-details`.
   - **Framework Preset:** choose **Next.js** yourself.
     **Why:** Vercel guesses the preset from `main`, which doesn't have the app yet. A wrong guess
     would build every later deployment the wrong way.
   - **Root Directory:** leave it as `./`. Leave **Build and Output Settings** alone.
   - **Environment Variables:** leave this empty for now.
     **Why:** each of the two variables belongs to just one kind of deployment, and step 3.5 is where
     you choose which.
4. Click **Deploy**. This first production deployment builds `main`, which doesn't have the app yet,
   so expect it to fail with `No Next.js version detected`. The app reaches production when you merge in section 5.

### Add the two environment variables

5. Open the project's **Settings**. If the sidebar lists **Environment Variables**, open it. If it
   lists **Environments** instead, open that and click the **Production** row; that environment's
   variables are on its page. Add this one:
   - **Key:** `DATABASE_URL`. Type just the name, with no `=`, quotes or spaces.
   - **Value:** the finished URI from step 2.13, pasted from your password manager.
   - **Environments:** **Production** only. Untick Preview and Development.
   - **Sensitive:** on.

   Click **Save**.
   **Why Production only:** the real family's data stays out of every preview. A preview is built from
   whatever branch is pushed, including half-finished work, and none of it can reach the real database.
   **Why Sensitive:** nobody can read the value back from the dashboard, you included. That's why it
   lives in your password manager.
6. Add a second variable. In the **Environments** layout, go back and click the **Preview** row
   first:
   - **Key:** `DEMO_DATA`.
   - **Value:** `1`.
   - **Environments:** **Preview** only.
   - **Sensitive:** off, because it isn't a secret.

   Click **Save**.
   **Why:** a preview has no `DATABASE_URL`, so without this it would fail on every page by design.
   With it, previews run the made-up family (Ben, Maya, Grandma and the rest) in memory, so you can
   try any change safely.

### Check two settings

7. **Settings** → **Functions** → **Function Region.** Choose the region nearest your Supabase region
   from step 2.4: **Washington, D.C., USA (iad1)** for `us-east-1`, **Portland, USA (pdx1)** for
   `us-west-2`, or **San Francisco, USA (sfo1)** for `us-west-1`. Save.
   **Why:** each page asks the database a few questions, one after another. If the app runs across
   the country from the database, every question waits for that trip.
8. **Settings** → **Deployment Protection.** Vercel Authentication should be on, set to **Standard
   Protection**. That's the default, so just check it.
   **Why:** previews then need your Vercel login, and production stays open so the family can use it.

### Build a preview with the variables

9. Open **Deployments**. Find the newest **Preview** deployment of `feat/wish-lists`, open its **⋯**
   menu and click **Redeploy**. If there's no preview of that branch yet, ask Claude to push an empty
   commit to it. Vercel builds a preview for every push.
   **Why:** a deployment keeps the variables it was built with. One built before steps 5 and 6 doesn't
   have them.
10. Wait until it shows **Ready**.

## 4. Look at the preview on your phone

1. On your phone, open the pull request on GitHub and tap the Vercel preview link in its comment. You
   can also open the Ready deployment from step 3.10 and copy its address. Log in to Vercel when it
   asks; that's step 3.8 at work.
2. Add `/p/dev-grandma` to the end of the address. You're now Grandma. Open Leo's list and tap "I'll
   buy this" on something, which should turn green. Then open Gifts I'm buying.
3. Change the end of the address to `/p/dev-maya`. You're now Maya, the organizer. Check that her own
   list opens and shows **Edit** and **Remove**, that Leo's list (her kid's) shows Grandma's claim,
   and that the Organizer page opens.
   No one in the made-up family is buying anything on Maya's list, so it can't show a claim here
   whatever the app does. Step 7.2 is the real check that your own list keeps the surprise.
4. If you'll copy invitations from your phone, tap **Copy invitation** on Ben's row of the Organizer
   page. It should say **Copied**. Paste it into a new email draft to see it whole, then delete the
   draft.
   **Why:** a phone copies differently from a computer, and here a copy that fails costs nothing. If
   it can't copy, the invitation shows in a box for you to select and copy yourself.
5. Look for anything hard to read, hard to tap, cut off, or scrolling sideways. Tell Claude what you
   find. Fixes go on the same branch and get a new preview.

A preview keeps its made-up family in the memory of whichever server instance answers, and Vercel can
run several. Every instance starts with the same family, so every list opens. But a claim or an item
you add lives only in the instance that saved it. On another page, or after a reload, it can seem to
vanish or come back. A tap on something added in another instance is refused, in one of these ways:

- **I'll buy this** on an item added there says "This was just taken off the list."
- **Edit** or **Remove** on an item added there says "You can't change this list."
- A person added on the Organizer page there has a link that opens the page saying to tap the link
  in the email, and a list that says "That list isn't here any more."

These are the demo, not bugs. Production keeps everything in one place, Supabase.

## 5. Merge

1. On GitHub, open the pull request and check that its checks are all green. Click **Merge pull
   request**, then confirm.
   **Why:** production deploys only from `main`. Merging is what puts the app at the production
   address.
2. In Vercel, under **Deployments**, a new **Production** deployment of `main` appears. Wait for
   **Ready**.
3. Find the production address on the project's **Overview** page, under **Domains**. It ends in
   `.vercel.app`. This guide calls it `<production address>`.
4. Open `https://<production address>/`. It should say "To see the family's lists, tap the link in the
   email the person who invited you sent you." That shows the app reached the database, which has no
   one in it yet. If it says "Something went wrong" instead, see "If something's wrong" at the end.

## 6. Start the family

1. In Supabase, open **SQL Editor** and start a new query. Paste this in:

   ```sql
   with h as (insert into households (name) values ('<household name>') returning id)
   insert into people (household_id, name, kind, token, is_organizer)
   select id, '<your first name>', 'adult', new_token(), true from h returning token;
   ```

2. Replace `<household name>` with your household's name, the way the family will see it, such as
   `Ben & Maya`. Replace `<your first name>` with yours, such as `Maya`. Keep the single quotes around
   each one. If a name has an apostrophe in it, type the apostrophe twice: `'Grandma''s house'`.
   **Why:** this makes your household and you in it, as the organizer, with a personal link. Type the
   names here and nowhere else, so they stay out of the repository.
3. Click **Run**, once. It returns one row with a `token`, a 64-character string of letters and
   digits. Copy it into your password manager.
4. Type `https://<production address>/p/<token>` into the address bar yourself, rather than opening
   the site from a Vercel page. It says "Hi, <your first name>". Bookmark it if you like.
   **Why:** the invitations in step 6.6 are built from the address in this tab, so it has to be the
   production address.
5. Click **Organizer page** at the bottom. Then:
   - In your household's card, type your spouse's first name in **New person's name** and click
     **Add an adult**. Do the same for each kid, with **Add a kid**.
   - For each other household, type its name in **Household name** at the bottom and click **Add a
     household**. Then add its adults and kids in its card.

   **Why:** adults get a personal link and a wish list. Kids get a wish list that the adults in their
   household keep.
6. Before you copy anything, look at the address bar. It should start with exactly
   `<production address>/`. If it shows anything else, such as a longer address ending in
   `.vercel.app` with your Vercel username in it, go back to step 6.4 and come here again from there.
   **Why:** the link in each invitation starts with the address of the page you copy it on. That
   longer address belongs to one deployment and sits behind your Vercel login (step 3.8), so every
   relative who tapped the link would get a Vercel login page instead of the lists.

   Then, for each adult, click **Copy invitation**. Paste it into a new email to that person only, and
   send it from your own email. Send yourself yours too.
   **Why:** the invitation holds that person's own link and tells them to keep the email. Tapping the
   link in it is how they get back in, on any phone or computer. One email per person, because each
   link signs in as exactly one person. Your own copy gives you the same way back in as everyone else.

   If you'd rather check everything first, send only your spouse's invitation and your own now. Do
   step 6.7 and section 7, then come back and send the rest.
7. Go back to your home page with **‹ All lists**, open **My wish list**, and add one thing: type it in
   **What is it?** and click **Add to my wish list**. A real wish is fine.
   **Why:** section 7 has your spouse claim something on your list, and an empty list has nothing to
   claim.

## 7. Check production together

1. **A stranger sees nothing.** Open `https://<production address>/` in a private window. It should
   say "To see the family's lists, tap the link in the email <your first name> sent you."
   **Why:** this checks that a visitor without a link sees no names or lists. It also checks that
   production isn't behind a Vercel login. If you see a Vercel login, set Deployment Protection back to
   Standard Protection, as in step 3.8.
2. **Your own list keeps the surprise.** Your spouse taps the link in their invitation (step 6.6) on
   their own phone, opens your list, and taps "I'll buy this" on the item you added in step 6.7. On
   your own **My wish list**, nothing changes: nothing is greyed, crossed out, named or counted, and
   the order stays the same.
   **Why:** keeping the surprise is the app's main promise, and this checks it against the real
   database.
3. **An edit reaches the buyer.** On your own **My wish list**, tap **Edit** on that item, type
   something in **Size, color, details (optional)**, and tap **Save**. Your spouse opens **Gifts I'm
   buying**, where the item now says "Changed after you claimed it".
   **Why:** this is the first time an edit, and the check behind that note, run on the real database.
   The note is how a buyer finds out that a wish changed after they claimed it.
4. **Undo the test claim.** Your spouse opens **Gifts I'm buying** and taps **Undo** on that item. It
   disappears, and the item says "I'll buy this" again on their view of your list.
   **Why:** a test claim left behind would sit in the real data and hide that gift from everyone else.
5. **It works on your phone.** Open your own invitation email on your phone and tap the link. The page
   it opens should be your home page, at an address starting with exactly `<production address>/p/`.
   The home page, a wish list and Gifts I'm buying should all fit the screen, with nothing scrolling
   sideways.
   **Why:** your invitation was copied the same way as everyone else's, so its address checks step
   6.6 for all of them.

## 8. If your own link leaks

The Organizer page can replace anyone's link except yours. Replacing it there would sign you out
partway through, with no way back except this SQL. So you replace your own link in Supabase:

1. In Supabase, open **SQL Editor**, start a new query, and run:

   ```sql
   update people set token = new_token() where is_organizer returning name, token;
   ```

2. It should return one row, with your name and your new token. Copy the token into your password
   manager, replacing the old one.
   If it returns more than one row, step 6.1 was run more than once and there's more than one
   organizer. Tell Claude before going on, without pasting any token.
3. Open `https://<production address>/p/<new token>` on each of your devices.
4. On the Organizer page, use **Copy invitation** on your own row and email it to yourself again, so
   your email holds the new link.

The old link stops working immediately. Anyone who opens it, or any browser still signed in with it,
sees the "tap the link in your email" page.

For anyone else's leaked link, open the Organizer page and click **Replace link** on their row, then
**Yes**. Then send them a fresh **Copy invitation**.

## If something's wrong

- **"Something went wrong" on every production page.** The Supabase project may be paused (step 2.14),
  or `DATABASE_URL` may be wrong. To fix the variable, open **Settings** → **Environment Variables**
  (in the **Environments** layout, **Settings** → **Environments** → the **Production** row, as in
  step 3.5), edit `DATABASE_URL`, and paste the finished URI again (step 2.13). Then open **Deployments**, and use
  **Redeploy** on the newest Production deployment. A deployment only picks up a changed variable when
  it's built again.
- **A preview shows "Something went wrong".** `DEMO_DATA` is missing from Preview (step 3.6), or the
  preview was built before it was added (step 3.9).
- **Wish lists and Gifts I'm buying say "Something went wrong" just after a merge.** The merge may
  have brought a database change that wasn't run in Supabase first. Run it now, as in "Adding a
  database change later" below. The pages come back without a redeploy.

## Adding a database change later

Some changes add a file to `db/migrations/`, as `002_item_price.sql` did for the price. Previews and
`npm run dev` run a new file by themselves. Production's database gets it only from you, the way it
got the first ones in section 2.

1. Before you merge the pull request that adds the file, open the file on that pull request's branch
   on GitHub. Copy it, paste it into a new query in Supabase's **SQL Editor**, and click **Run**,
   once. You should see "Success. No rows returned".
   **Why:** merging puts the new code into production within minutes. Code that reads a column the
   database doesn't have yet fails on every list page, for everyone, until the database has it. A
   change that only adds something, as `002_item_price.sql` does, is safe to run first: the code
   already in production never asks for a column it doesn't know about.
2. Then merge, as in section 5. Once the new Production deployment is **Ready**, open a wish list at
   the production address.
   **Why:** that's the first page to read the new column from the real database, so it's the check
   that step 1 worked.
