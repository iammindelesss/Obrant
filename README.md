# Orbrant

Orbrant is a 3D-printing platform made of plain HTML, CSS and JavaScript, hosted free on GitHub Pages, with accounts, the Model Library and file storage provided by Supabase.

- **Orbrant Calculator**: filament, electricity and other costs, selling price, profit and margin.
- **Orbrant Model Library**: browse, search, upload, report and download 3D models (STL, 3MF, OBJ, STEP).
- **Orbrant Studio**: a separate desktop app. No release exists, so the site shows a Coming Soon page and no download.
- **Settings** and **User Profile** (username, bio, picture).

Premium listings can be created and shown with a price, but **payments are not set up**: nobody can buy, and premium files cannot be downloaded.

## Files (4 on GitHub + 2 for Supabase)

| File | Purpose |
| --- | --- |
| `index.html` | All pages (Home, Calculator, Model Library, Orbrant Studio, Settings, account pages, Upload) |
| `style.css` | Styling |
| `script.js` | Calculator, library, uploads, accounts, page switching. Supabase settings are at the top. |
| `README.md` | This guide |
| `supabase-migration.sql` | Paste into the Supabase SQL editor. **Not uploaded to GitHub.** |
| `moderation-function.ts` | Pasted into Supabase Edge Functions (see below). **Not uploaded to GitHub.** |

All links and files use relative paths, so the site works under any repository name.

## Repository name

Your repository is currently named **Obrant** (no "r"), so the site is at `https://iammindelesss.github.io/Obrant/`. The brand is **Orbrant**. If you want the repository to match, rename it: GitHub repo → **Settings → General → Repository name** → `orbrant` → Rename. The site then moves to `https://iammindelesss.github.io/orbrant/`, and the old address stops working. Whichever name you end up with, do step 2 below with that exact address.

## Setup (do in this order)

1. **Run the migration.** Supabase dashboard → **SQL Editor → New query**, paste all of `supabase-migration.sql`, click **Run**. It creates or repairs the `profiles` table (fixing "Could not find the table 'public.profiles'" and the missing `bio` column), the `models` table, the storage buckets and all security rules, and refreshes the API schema cache. It keeps existing data and is safe to run again. If it stops with a message about a different `models` table, nothing was changed; ask for help.
2. **Fix the sign-in redirect addresses.** Supabase → **Authentication → URL Configuration**: set **Site URL** to your live address (for example `https://iammindelesss.github.io/Obrant/`) and add the same address under **Redirect URLs**. Email confirmation and password-reset links use this.
3. **Check the key.** `script.js` already contains your project URL and publishable key. Never put a `sb_secret_` or `service_role` key in the site.
4. **Upload the 4 files** to the repository (Add file → Upload files), replacing the old ones. Wait a couple of minutes and hard-refresh (Ctrl+Shift+R). The browser console (F12) should show `Orbrant build 5`.

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

- Model files live in a **private** bucket. Visitors can download a file only when a **published, free** listing points at it; the site asks Supabase for a link that expires after 60 seconds.
- Premium files cannot be read by anyone but their owner. Real premium sales need a payment provider and a server-side check (for example a Supabase Edge Function), which are not built.
- Preview images and profile pictures are public. Profiles contain only username, bio and picture, never email addresses.
- Creators can change or delete only their own rows and files. The database and storage rules enforce this, not the buttons.

## Test checklist (do these on the live site)

1. Sign up, confirm the email, sign in, refresh (you stay signed in).
2. User Profile: save a username and bio, refresh, and check they stay.
3. Signed out, open `#/upload` (it asks you to sign in).
4. Signed in, upload a small STL with an image. Check it appears in **Storage** (`model-files`, `model-previews`) and as a `published` row in **Table Editor → models** with your user ID as `creator_id`.
5. Check it appears in the library, search and category filter find it, and the **Download** button gives back the same file.
6. Try a `.zip`, a file over 50 MB and a premium listing with no price; all should be refused.
7. With a second account, check you cannot change or delete the first account's listing.
8. Make a premium listing and check there is no working download.
9. Report a model from a second account and follow the email link (see Reports and removal).

## Test report for this version

- **Server function:** 24 logic checks run against a fake in-memory database (not real Supabase or Resend): sign-in required to report, one report per person per model, daily limit, token hashing, wrong token/password refused, 8-attempt lock, removal deletes the row and both files, dismiss keeps the model, HTML-escaped emails, the email link uses your `SITE_URL`.
- **Done by me, against a stand-in for Supabase (not the real service):** report button and removal page, uploads going live, page switching and the guards, the account menu, library listing, search/filter/sort/load-more calls, detail page, free download request, premium shown without download, upload validation, upload success, upload failure cleanup and no double-submit, creator listings and delete, Settings, mobile layout and console errors.
- **Not tested by me:** the real Supabase project (sign-in, profile saves, uploads, storage, downloads, the SQL and the security rules). I had no access, so none of that is verified until you run the checklist above. Real-service checks 1–9 are all untested, and the Edge Function, the Resend email and the reports table have never run for real.
- **Not built:** 3D preview, byte-level upload progress (the page shows stages), creator profile pages, payments, saved favourites, reporting, an Orbrant Studio download.

## Run locally / update

Serve the folder (`python3 -m http.server 8000`, then open http://localhost:8000) and add that address to Supabase Redirect URLs if you want email links to work locally. To update the live site, upload changed files to GitHub and hard-refresh.

## Calculator formulas

Cost per gram = spool price ÷ weight; filament = cost per gram × grams; waste = filament × allowance %; electricity = (W ÷ 1000) × hours × price per kWh; total = filament + waste + electricity + maintenance + packaging + other; selling price = total × (1 + markup ÷ 100); profit = price − total; margin = profit ÷ price × 100. A 100% markup is a 50% margin.
