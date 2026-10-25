-- Profile fields the app saves, event location/email options, saved addresses and avatar uploads.

-- ── profiles ────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists profile_photo text,
  add column if not exists timezone text,
  add column if not exists username text,
  add column if not exists whatsapp_number text,
  add column if not exists bio text;
create unique index if not exists profiles_username_key on public.profiles (lower(username)) where username is not null and username <> '';

-- the app creates a missing profile row on first sign-in
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

-- ── event types: in-person address and optional guest email ────────────────
alter table public.event_types
  add column if not exists address text,
  add column if not exists email_required boolean not null default true;

-- guests may book without an email when the event allows it
alter table public.bookings alter column guest_email drop not null;

-- ── avatar uploads (public bucket; each user writes only their own folder) ─
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ── saved addresses (address manager) ───────────────────────────────────────
create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null default '',
  address text not null check (char_length(address) between 1 and 300),
  created_date timestamptz not null default now()
);
create index if not exists addresses_owner_idx on public.addresses (created_by_id);
alter table public.addresses enable row level security;
drop policy if exists addresses_own on public.addresses;
create policy addresses_own on public.addresses for all to authenticated
  using ((select auth.uid()) = created_by_id) with check ((select auth.uid()) = created_by_id);
grant select, insert, update, delete on public.addresses to authenticated;
