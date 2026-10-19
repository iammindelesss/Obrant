# FilamentFlow

A 3D-printing platform in four files: a home page, a **Print Calculator** (works fully), a **Model Library** (demo listings only) and a **Print Shop** coming-soon page. It runs entirely in your browser: no backend, no account, no data uploaded.

**Not built yet:** saved profiles, multiple materials or printers, job history, downloadable quotes and CAD-file analysis. A CAD model's volume cannot give accurate filament use or print time (that depends on slicer settings), so version 1 uses figures from your slicer.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | All pages: Home, Model Library, Print Calculator, Print Shop |
| `style.css` | All styling |
| `script.js` | Calculator, library and page switching |
| `README.md` | This guide |

## Run locally

Double-click `index.html`. It opens in your browser and needs no server or install.

## Upload to GitHub

1. Create a free account at github.com and sign in.
2. Click **New repository**. Name it (for example `filamentflow`), keep it **Public**, and click **Create repository**.
3. On the empty repository page, click **uploading an existing file**.
4. Drag in the 4 files (the files themselves, not a folder).
5. Click **Commit changes**.

## Enable GitHub Pages

1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Choose branch **main** and folder **/ (root)**, then click **Save**.
4. Wait a minute or two. The page shows your address: `https://YOUR-USERNAME.github.io/filamentflow/`.

## Update the site after changes

1. Edit the files on your computer and check them locally.
2. In the repository, click **Add file → Upload files**, drag in the changed files (same names replace the old ones), and click **Commit changes**.
3. Wait a minute or two, then hard-refresh the site (Ctrl+Shift+R, or Cmd+Shift+R on Mac).

## Formulas

- Cost per gram = spool price ÷ spool weight
- Filament cost = cost per gram × grams used
- Waste allowance = filament cost × allowance %
- Electricity = (watts ÷ 1000) × hours × price per kWh
- Total cost = filament + waste + electricity + maintenance + packaging + other
- Selling price = total cost × (1 + markup ÷ 100)
- Gross profit = selling price − total cost
- Margin = gross profit ÷ selling price × 100

Markup and margin are different: a 100% markup gives a 50% margin.

## Extending the code

The calculation functions at the top of `script.js` do not touch the page, so you can reuse them for saved profiles, quotes or other features. Saved inputs use the `localStorage` key `filamentflow.v1`.


## Connecting a backend (not done yet)

GitHub Pages only hosts static files. Accounts, the database and private file storage need a service such as **Supabase** (free tier available; check current limits). **Nothing in the site is connected to it yet**, so uploads, accounts, saved models and reporting do not work today.

## Steps
1. Create a project at supabase.com. Copy the **Project URL** and the **anon public key** into the `FF_CONFIG` block at the top of `script.js`. Never use or share the `service_role` key in this repo.
2. In the Supabase **SQL editor**, run the schema below.
3. In **Storage**, create a public bucket `previews` and a **private** bucket `model-files` (file limit about 50 MB). Serve private files only through short-lived signed URLs.
4. In **Authentication**, enable email sign-up.
5. Tell me when done and I will wire the frontend (sign in, upload form, real listings, reports).

## Schema (starting point)
```sql
create table profiles (id uuid primary key references auth.users on delete cascade,
  display_name text not null, bio text, avatar_url text, created_at timestamptz default now());
create table models (id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  title text not null, description text, category text, tags text[] default '{}',
  formats text[] default '{}', print_tips text, license text,
  is_premium boolean default false, price_cents int, file_path text, preview_paths text[] default '{}',
  status text default 'published', created_at timestamptz default now());
create table saved_models (user_id uuid references profiles(id) on delete cascade,
  model_id uuid references models(id) on delete cascade, primary key (user_id, model_id));
create table reports (id uuid primary key default gen_random_uuid(),
  model_id uuid references models(id) on delete cascade, reporter_id uuid references profiles(id),
  reason text not null, created_at timestamptz default now(), resolved boolean default false);

alter table profiles enable row level security;  alter table models enable row level security;
alter table saved_models enable row level security;  alter table reports enable row level security;
create policy "profiles readable" on profiles for select using (true);
create policy "own profile" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "published models readable" on models for select using (status = 'published' or owner_id = auth.uid());
create policy "owner writes models" on models for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own saves" on saved_models for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "signed-in users can report" on reports for insert with check (reporter_id = auth.uid());
```
Row-level security is what stops users editing each other's listings, so keep it on. Admin moderation and payments need extra work (payments must be verified on a server, never in the browser).
