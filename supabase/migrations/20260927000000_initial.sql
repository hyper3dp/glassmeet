create extension if not exists pgcrypto with schema extensions;

create table public.app_records (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index app_records_entity_owner_idx on public.app_records (entity, owner_id);
create index app_records_owner_created_idx on public.app_records (owner_id, created_at desc);

alter table public.app_records enable row level security;
grant select, insert, update, delete on public.app_records to anon, authenticated;
grant all on public.app_records to service_role;

create policy "Users read their records and public booking data"
  on public.app_records for select to anon, authenticated
  using (
    owner_id = auth.uid()
    or (entity = 'EventType' and coalesce((data ->> 'active')::boolean, true))
    or entity in ('AvailabilityRule', 'AvailabilityException', 'BookedSlot')
  );

create policy "Users create their own records"
  on public.app_records for insert to authenticated
  with check (owner_id = auth.uid());

create policy "Guests create bookings for active event types"
  on public.app_records for insert to anon, authenticated
  with check (
    entity = 'Booking'
    and owner_id = (data ->> 'host_id')::uuid
    and exists (
      select 1
      from public.app_records event_type
      where event_type.id = (data ->> 'event_type_id')::uuid
        and event_type.entity = 'EventType'
        and event_type.owner_id = public.app_records.owner_id
        and coalesce((event_type.data ->> 'active')::boolean, true)
    )
  );

create policy "Guests create booked slots for active event types"
  on public.app_records for insert to anon, authenticated
  with check (
    entity = 'BookedSlot'
    and owner_id = (data ->> 'host_id')::uuid
    and exists (
      select 1
      from public.app_records event_type
      where event_type.id = (data ->> 'event_type_id')::uuid
        and event_type.entity = 'EventType'
        and event_type.owner_id = public.app_records.owner_id
        and coalesce((event_type.data ->> 'active')::boolean, true)
    )
  );

create policy "Users update their own records"
  on public.app_records for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Users delete their own records"
  on public.app_records for delete to authenticated
  using (owner_id = auth.uid());

create table public.google_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  refresh_token_encrypted text not null,
  calendar_id text not null default 'primary',
  calendar_name text not null default 'Primary',
  auto_sync boolean not null default true,
  last_synced timestamptz,
  connected_at timestamptz not null default now()
);

alter table public.google_credentials enable row level security;
revoke all on public.google_credentials from anon, authenticated;
grant all on public.google_credentials to service_role;