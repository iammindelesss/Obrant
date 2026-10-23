# Obryth

Obryth is a 3D-printing platform made of plain HTML, CSS and JavaScript, hosted free on GitHub Pages, with accounts, the model library and file storage provided by Supabase.

- **Obryth Calculator**: filament, electricity and other costs, selling price, profit and margin.
- **Obryth Model Library**: browse, search, upload, favourite, comment on, report and download 3D models (STL, 3MF, OBJ, STEP).
- **Obryth Studio**: a separate desktop app. No release exists, so the site shows a Coming Soon page and no download.
- **User Profile**, public creator profiles, follows, notifications and **Settings**.

Premium listings can be created and shown with a price, but **payments are not set up**: nobody can buy, and premium files cannot be downloaded.

## Files (4 on GitHub + 2 for Supabase)

| File | Purpose |
| --- | --- |
| `index.html` | All pages |
| `style.css` | Styling (dark theme) |
| `script.js` | Calculator, library, uploads, accounts, notifications, comments, profiles, page switching. Supabase settings are at the top. |
| `README.md` | This guide |
| `supabase-migration.sql` | Paste into the Supabase SQL editor. **Not uploaded to GitHub.** |
| `moderation-function.ts` | Pasted into Supabase Edge Functions. **Not uploaded to GitHub.** |

Links and files use relative paths, so the site works at its current address. The repository name and site address were not changed.

## Setup (in this order)

1. **Run the migration.** Supabase → **SQL Editor → New query**, paste all of `supabase-migration.sql`, click **Run**. It is safe to run again and keeps existing data. It now also creates comments, favourites, follows, download history, notifications and notification preferences, with security rules on each, plus download/favourite counters on models and a `display_name` on profiles. If it stops with a message about a different `models` or `reports` table, nothing was changed; ask for help. Policy names still start with "orbrant": they are database identifiers, and keeping them means re-running replaces the old policies instead of duplicating them.
2. **Upload the 4 site files** to GitHub (replace the old ones). Wait a couple of minutes and hard-refresh (Ctrl+Shift+R). The browser console (F12) should show `Obryth build 7`.
3. **Reports email (only if not done yet):** follow "Reports and removal" below. The function's emails now say "Obryth"; re-paste `moderation-function.ts` into your existing `moderation` function and redeploy to get the new wording.

Nothing needs changing in Supabase Authentication URLs, Storage buckets or the key.

## Things that behave differently now

- **Downloading requires a signed-in account.** This makes download counts and history real and stops anonymous scraping. Storage enforces it, not just the button.
- **Download counts** go up once per person per model per 24 hours, only after the file download has started. Clearing your history never lowers a model's count.
- **Notifications** appear for comments on your models, favourites on your models and new followers (never for your own actions; repeating an action cannot create a duplicate). They refresh on every page change and every minute; there is no realtime push.
- Uploads still go live immediately; reports are the safety net.

## Reports and removal (no pre-approval)

Uploads go live in the library straight away. Safety works afterwards: any signed-in visitor can click **Report this model**. That sends you an email with a button. Clicking it opens a page on your site that shows the report; you type your password and click **Remove model permanently** (or **Keep model**). The model row and its files are then deleted.

**Be aware:** with no review, anything uploaded is public immediately, including the file download. Reports are your only safety net, so check your email. You can always remove a model yourself in Supabase (Table Editor → models → delete the row, then delete its files in Storage).

Sending email and checking the password must happen on a server, because those need secrets that can never be in a GitHub Pages site. The server part is one small Supabase **Edge Function**, `moderation-function.ts` (not uploaded to GitHub). Setup, once:

1. **Run the migration again.** Re-run all of `supabase-migration.sql` in the SQL Editor. It is safe to repeat; it now allows published uploads and adds the `reports` table. (Models you uploaded earlier that are still `pending` can be made live with `update public.models set status = 'published' where status = 'pending';`.)
2. **Get an email sender (free).** Sign up at resend.com using **the same email address that should receive reports**, then create an API key. Resend's free plan (3,000 emails a month, 100 a day) can only send to the address you signed up with, which is what we want. Check current limits on their site.
3. **Deploy the function.** Supabase → **Edge Functions → Deploy a new function → Via Editor**. Name it exactly `moderation`, paste the whole of `moderation-function.ts`, and deploy. Then open the function's settings and **turn off "Verify JWT"**. (Visitors who are not signed in must be able to open your email link; the function checks the report token, your password and the user's sign-in itself.)
4. **Add the secrets.** Edge Functions → **Secrets**, add these four:
   - `RESEND_API_KEY`: the key from step 2.
   - `ADMIN_REMOVE_PASSWORD`: a long password only you know. Never put it in any site file.
   - `SITE_URL`: your live address with a trailing slash, e.g. `https://iammindelesss.github.io/Obrant/`
   - `OWNER_EMAIL`: where reports go (you asked for `iammindeless@gmail.com`; check the spelling matches your Resend sign-up email).
5. **Upload the 4 site files** to GitHub (build 6 in the console).
6. **Test it**: with a second account, report a model. You should get an email (check spam). Open its link, try a wrong password (refused), then the right one (model removed, and gone from the library and Storage).

How it is protected: the link holds a random 64-character token, and only a hash of it is stored. Removing needs the token **and** your password. After 8 wrong passwords a link locks (you can still remove the model in Supabase). Each person can report a model once and send at most 10 reports a day. If the email can't be sent (for example a wrong key), the report is still saved in the `reports` table, but its link cannot be recovered.

## How downloads and privacy work

- Model files live in a **private** bucket. A signed-in visitor can download a file only when a **published, free** listing points at it; the site asks Supabase for a link that expires after 60 seconds.
- Premium files can be read only by their owner. Real premium sales need a payment provider and a server-side check, which are not built.
- Preview images and profile pictures are public. Public profile data is only username, display name, bio, picture and join date, never email addresses.
- Creators can change or delete only their own rows and files, and can edit only title, description, category, tags and thumbnail; status, price, counters and owner are locked at the database level. Comments can be edited only by their author and deleted by the author or the model's owner. Notifications, favourites, download history and preferences are private to each user. Rules are enforced by the database, not the buttons.

## Test checklist (do these on the live site, with two accounts)

1. Sign in; User Profile: save a username, display name and bio; refresh; they stay.
2. Account A uploads a small STL with an image. Check the files in **Storage** and the `published` row in **Table Editor → models**.
3. Account B opens the model: comment, favourite it, download it. Check the download count goes 0 → 1, downloading again does not raise it, and Download history on B's dashboard lists it.
4. Account A's bell shows the comment and favourite. Mark one read, then mark all read. Turn off "Comments" in A's Settings, comment again as B, and check no new notification appears.
5. B follows A from A's public profile (`#/u/username`); A gets a "started following you" notification. Find A with **Find creators**.
6. B edits and deletes their own comment; B cannot edit A's comment. A can delete B's comment on A's model.
7. Signed out: cannot comment, favourite, follow or download (each asks you to sign in).
8. Premium listing: shows a price, has no working purchase or download.
9. Report a model and follow the email link (see Reports and removal).
10. Library: search by title, tag and creator name; try the file type, free/premium and sort controls.

## Test report for this version

- **Server function:** 24 logic checks against a fake in-memory database (not real Supabase or Resend) passed.
- **Browser checks against a stand-in for Supabase (not the real service):** 103 checks passed, covering page switching, the notification bell (badge, mark one/all read, empty state, navigation), comments (post, edit, delete, permissions), favourites, download order (signed link first, then the server count), profiles and follows, creator search, library filters and sorts, dashboard, Settings, the profile editor, no old brand names visible on 12 pages, no sideways scrolling on 9 pages at phone width, and no console errors.
- **Found and fixed during testing:** a wide file picker on the phone profile page.
- **Not tested by me:** the real Supabase project. The new SQL (tables, triggers, security rules, the download function) has never been run, and I had no way to syntax-check it. Sign-in, uploads, storage, downloads, notifications created by database triggers, and every security rule are unverified until you run the checklist above.
- **Not built in this version:** replies to comments, reporting individual comments or profiles, editing a model's details or thumbnail in the site (the database allows it), recently viewed models, Recently Added and Popular strips, follower and following lists, a Following feed, saved calculator presets, account deletion, profile visibility settings, creator view-count analytics, realtime notifications, 3D preview and payments.

## Calculator formulas

Cost per gram = spool price ÷ weight; filament = cost per gram × grams; waste = filament × allowance %; electricity = (W ÷ 1000) × hours × price per kWh; total = filament + waste + electricity + maintenance + packaging + other; selling price = total × (1 + markup ÷ 100); profit = price − total; margin = profit ÷ price × 100. A 100% markup is a 50% margin.
