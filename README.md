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


## Accounts: what exists and what you must set up

The sign-in, create-account, forgot/reset password, profile and account-menu screens are built, and `script.js` contains the code that talks to Supabase. **It has not been connected to a real Supabase project or tested against one**, so treat registration and sign-in as unverified until you finish the steps below and test them yourself.

Security notes: passwords are handled only by Supabase (the site never sees or stores them). The key you paste into `script.js` is the public "anon/publishable" key, which is designed to be visible. **Never paste the `service_role` key anywhere in this project.** Real protection comes from the Row Level Security rules in step 3, not from hidden buttons.

### 1. Create the project
1. Create a free project at supabase.com.
2. In **Project Settings → API**, copy the **Project URL** and the **anon / publishable key**.
3. Paste them into `FF_CONFIG` at the top of `script.js`.

### 2. Authentication settings
In **Authentication** in the Supabase dashboard (menu names change over time, so look for the matching setting):
- Turn on the **Email** provider and **Confirm email**.
- Set the minimum password length to 8.
- Under **URL Configuration**, set **Site URL** to `https://iammindelesss.github.io/filamentflow/` and add that same address under **Redirect URLs**. Also add `http://localhost:8000/` if you want to test locally.
- Supabase's built-in email sender is heavily rate-limited. For real use, add your own SMTP provider later.

### 3. Database, security rules and storage
Open the **SQL editor**, paste this, and run it:

```sql
create table profiles (id uuid primary key references auth.users on delete cascade,
  username text unique check (username ~ '^[a-z0-9_]{3,20}$'),
  bio text check (char_length(bio) <= 280), avatar_url text, created_at timestamptz default now());
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into profiles (id) values (new.id); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

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

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;
create policy "avatars public read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars own upload" on storage.objects for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own update" on storage.objects for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
```
Later, model files will go in a **private** bucket served through short-lived signed links. Payments and private downloads must be verified on a server, never in the browser.

### 4. Test it yourself
Serve the folder locally (`python3 -m http.server 8000` inside it, then open http://localhost:8000) or use the published site, then check:
1. Create an account, confirm the email, and sign in.
2. Refresh the page: you should stay signed in.
3. Save a profile with a username, bio and picture.
4. Sign out, then try "Forgot password" and finish the reset in the same browser.
5. Try a wrong password and an email that already has an account, and check the messages.
6. In the SQL editor or with a second account, confirm one user cannot change another user's profile.

Password-reset and confirmation links only work from the published site or a local web server, not from a double-clicked file.

### Not built yet
Model uploads, real listings from the database, saving favourites, reporting, an admin role and the 3D viewer. The creator dashboard and the "save" button are placeholders until listings come from the database.
