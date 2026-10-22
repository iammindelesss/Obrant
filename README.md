# Orbrant

Orbrant is a 3D-printing platform made of plain HTML, CSS and JavaScript, hosted free on GitHub Pages, with accounts, the Model Library and file storage provided by Supabase.

- **Orbrant Calculator**: filament, electricity and other costs, selling price, profit and margin.
- **Orbrant Model Library**: browse, search, upload and download 3D models (STL, 3MF, OBJ, STEP).
- **Orbrant Studio**: a separate desktop app. No release exists, so the site shows a Coming Soon page and no download.
- **Settings** and **User Profile** (username, bio, picture).

Premium listings can be created and shown with a price, but **payments are not set up**: nobody can buy, and premium files cannot be downloaded.

## Files (4 on GitHub + 1 for Supabase)

| File | Purpose |
| --- | --- |
| `index.html` | All pages (Home, Calculator, Model Library, Orbrant Studio, Settings, account pages, Upload) |
| `style.css` | Styling |
| `script.js` | Calculator, library, uploads, accounts, page switching. Supabase settings are at the top. |
| `README.md` | This guide |
| `supabase-migration.sql` | Paste into the Supabase SQL editor. **Not uploaded to GitHub.** |

All links and files use relative paths, so the site works under any repository name.

## Repository name

Your repository is currently named **Obrant** (no "r"), so the site is at `https://iammindelesss.github.io/Obrant/`. The brand is **Orbrant**. If you want the repository to match, rename it: GitHub repo → **Settings → General → Repository name** → `orbrant` → Rename. The site then moves to `https://iammindelesss.github.io/orbrant/`, and the old address stops working. Whichever name you end up with, do step 2 below with that exact address.

## Setup (do in this order)

1. **Run the migration.** Supabase dashboard → **SQL Editor → New query**, paste all of `supabase-migration.sql`, click **Run**. It creates or repairs the `profiles` table (fixing "Could not find the table 'public.profiles'" and the missing `bio` column), the `models` table, the storage buckets and all security rules, and refreshes the API schema cache. It keeps existing data and is safe to run again. If it stops with a message about a different `models` table, nothing was changed; ask for help.
2. **Fix the sign-in redirect addresses.** Supabase → **Authentication → URL Configuration**: set **Site URL** to your live address (for example `https://iammindelesss.github.io/Obrant/`) and add the same address under **Redirect URLs**. Email confirmation and password-reset links use this.
3. **Check the key.** `script.js` already contains your project URL and publishable key. Never put a `sb_secret_` or `service_role` key in the site.
4. **Upload the 4 files** to the repository (Add file → Upload files), replacing the old ones. Wait a couple of minutes and hard-refresh (Ctrl+Shift+R). The browser console (F12) should show `Orbrant build 5`.

## Approving uploads

To stop people publishing their own uploads, every upload starts as **pending**, and the database refuses client requests that try to set a model to published. You approve models yourself: Supabase → **Table Editor → models**, change the row's `status` from `pending` to `published`. It appears in the library straight away, with no redeploy. (A review screen inside the site is not built yet.) Set `status` to `rejected` to refuse a model; the creator can delete it.

## How downloads and privacy work

- Model files live in a **private** bucket. Visitors can download a file only when a **published, free** listing points at it; the site asks Supabase for a link that expires after 60 seconds.
- Premium files cannot be read by anyone but their owner. Real premium sales need a payment provider and a server-side check (for example a Supabase Edge Function), which are not built.
- Preview images and profile pictures are public. Profiles contain only username, bio and picture, never email addresses.
- Creators can change or delete only their own rows and files. The database and storage rules enforce this, not the buttons.

## Test checklist (do these on the live site)

1. Sign up, confirm the email, sign in, refresh (you stay signed in).
2. User Profile: save a username and bio, refresh, and check they stay.
3. Signed out, open `#/upload` (it asks you to sign in).
4. Signed in, upload a small STL with an image. Check it appears in **Storage** (`model-files`, `model-previews`) and as a `pending` row in **Table Editor → models** with your user ID as `creator_id`.
5. Approve it, then check it appears in the library, search and category filter find it, and the **Download** button gives back the same file.
6. Try a `.zip`, a file over 50 MB and a premium listing with no price; all should be refused.
7. With a second account, check you cannot see or change the first account's pending listing.
8. Make a premium listing, approve it, and check there is no working download.

## Test report for this version

- **Done by me, against a stand-in for Supabase (not the real service):** page switching and the guards, the account menu, library listing, search/filter/sort/load-more calls, detail page, free download request, premium shown without download, upload validation, upload success, upload failure cleanup and no double-submit, creator listings and delete, Settings, mobile layout and console errors.
- **Not tested by me:** the real Supabase project (sign-in, profile saves, uploads, storage, downloads, the SQL and the security rules). I had no access, so none of that is verified until you run the checklist above. Real-service checks 1–8 are all untested.
- **Not built:** a review screen for approving uploads, 3D preview, byte-level upload progress (the page shows stages), creator profile pages, payments, saved favourites, reporting, an Orbrant Studio download.

## Run locally / update

Serve the folder (`python3 -m http.server 8000`, then open http://localhost:8000) and add that address to Supabase Redirect URLs if you want email links to work locally. To update the live site, upload changed files to GitHub and hard-refresh.

## Calculator formulas

Cost per gram = spool price ÷ weight; filament = cost per gram × grams; waste = filament × allowance %; electricity = (W ÷ 1000) × hours × price per kWh; total = filament + waste + electricity + maintenance + packaging + other; selling price = total × (1 + markup ÷ 100); profit = price − total; margin = profit ÷ price × 100. A 100% markup is a 50% margin.
