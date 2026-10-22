-- Orbrant: Supabase migration (safe to run more than once).
-- Paste into Supabase Dashboard > SQL Editor > New query > Run.
-- This file does NOT go in your GitHub repository.

-- 0. Safety check: stop if a different "models" table already exists.
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'models')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'models' and column_name = 'creator_id') then
    raise exception 'A different public.models table already exists. Nothing was changed. Ask for help before continuing.';
  end if;
end $$;

-- 1. Shared helper: keep updated_at current.
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- 2. Profiles (created if missing; existing data and columns are kept).
create table if not exists public.profiles (id uuid primary key references auth.users (id) on delete cascade);
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    alter table public.profiles add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_length') then
    alter table public.profiles add constraint profiles_bio_length check (bio is null or char_length(bio) <= 280) not valid;
  end if;
end $$;
create unique index if not exists profiles_username_key on public.profiles (lower(username)) where username is not null;
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- Give every existing user a profile row, and create one automatically for new sign-ups.
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id) values (new.id) on conflict (id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
drop policy if exists "orbrant profiles public read" on public.profiles;
drop policy if exists "orbrant profiles insert own" on public.profiles;
drop policy if exists "orbrant profiles update own" on public.profiles;
-- The profiles table holds only username, bio and avatar (no email), so public read is safe.
create policy "orbrant profiles public read" on public.profiles for select using (true);
create policy "orbrant profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "orbrant profiles update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- 3. Models.
create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 100),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null,
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  file_path text not null,
  file_name text not null,
  file_type text not null check (file_type in ('stl', '3mf', 'obj', 'step', 'stp')),
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  thumbnail_path text,
  listing_type text not null default 'free' check (listing_type in ('free', 'premium')),
  price numeric(10, 2),
  status text not null default 'pending' check (status in ('draft', 'pending', 'published', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint models_price_rule check ((listing_type = 'free' and price is null) or (listing_type = 'premium' and price > 0 and price <= 10000))
);
create index if not exists models_status_created_idx on public.models (status, created_at desc);
create index if not exists models_creator_idx on public.models (creator_id);
create index if not exists models_tags_idx on public.models using gin (tags);

create or replace function public.models_guard() returns trigger language plpgsql as $$
begin
  if new.creator_id <> old.creator_id then raise exception 'creator_id cannot be changed'; end if;
  new.created_at = old.created_at; new.updated_at = now();
  return new;
end; $$;
drop trigger if exists models_guard_trg on public.models;
create trigger models_guard_trg before update on public.models for each row execute function public.models_guard();

alter table public.models enable row level security;
drop policy if exists "orbrant models read" on public.models;
drop policy if exists "orbrant models insert own" on public.models;
drop policy if exists "orbrant models update own" on public.models;
drop policy if exists "orbrant models delete own" on public.models;
-- Anyone can see published listings; creators also see their own.
create policy "orbrant models read" on public.models for select using (status = 'published' or creator_id = auth.uid());
-- Creators insert only their own rows, only as draft/pending, and only pointing at files in their own folder.
create policy "orbrant models insert own" on public.models for insert
  with check (creator_id = auth.uid() and status in ('draft', 'pending')
              and file_path like auth.uid()::text || '/%'
              and (thumbnail_path is null or thumbnail_path like auth.uid()::text || '/%'));
-- Creators can edit only unpublished rows of their own, and cannot publish them. Approval is done by you in the dashboard.
create policy "orbrant models update own" on public.models for update
  using (creator_id = auth.uid() and status in ('draft', 'pending', 'rejected'))
  with check (creator_id = auth.uid() and status in ('draft', 'pending')
              and file_path like auth.uid()::text || '/%'
              and (thumbnail_path is null or thumbnail_path like auth.uid()::text || '/%'));
create policy "orbrant models delete own" on public.models for delete using (creator_id = auth.uid());

-- 4. Storage buckets (existing buckets are updated, not recreated).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('model-files', 'model-files', false, 52428800, null),
  ('model-previews', 'model-previews', true, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 5. Storage policies. The first folder in every path must be the user's own ID.
drop policy if exists "orbrant avatars read" on storage.objects;
drop policy if exists "orbrant avatars write" on storage.objects;
drop policy if exists "orbrant avatars update" on storage.objects;
drop policy if exists "orbrant avatars delete" on storage.objects;
create policy "orbrant avatars read" on storage.objects for select using (bucket_id = 'avatars');
create policy "orbrant avatars write" on storage.objects for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "orbrant avatars update" on storage.objects for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "orbrant avatars delete" on storage.objects for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "orbrant previews write" on storage.objects;
drop policy if exists "orbrant previews delete" on storage.objects;
create policy "orbrant previews write" on storage.objects for insert with check (bucket_id = 'model-previews' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "orbrant previews delete" on storage.objects for delete using (bucket_id = 'model-previews' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "orbrant files write" on storage.objects;
drop policy if exists "orbrant files delete" on storage.objects;
drop policy if exists "orbrant files read" on storage.objects;
create policy "orbrant files write" on storage.objects for insert with check (bucket_id = 'model-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "orbrant files delete" on storage.objects for delete using (bucket_id = 'model-files' and (storage.foldername(name))[1] = auth.uid()::text);
-- Model files are private. They can be read by their owner, or by anyone ONLY when a published FREE listing points at that exact file.
create policy "orbrant files read" on storage.objects for select using (
  bucket_id = 'model-files' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.models m where m.file_path = name and m.status = 'published' and m.listing_type = 'free')
  )
);

-- 6. Make the API notice the new tables and columns (fixes "not found in the schema cache").
notify pgrst, 'reload schema';
