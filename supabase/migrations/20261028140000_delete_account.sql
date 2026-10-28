-- GlassMeet: a host can delete their account and everything in it. Every table that holds a
-- host's data (profiles, event types, hours, bookings, notifications, templates, addresses,
-- WhatsApp settings, calendar-feed links) cascades from auth.users, so removing the login removes
-- the rest. Profile photos live in Storage, which the app empties first (it can't be cleared from
-- SQL). Run after 20261028120000_onboarding.sql. Safe to run more than once.

-- the app lists a host's own photo folder to delete it
drop policy if exists avatars_select_own on storage.objects;
create policy avatars_select_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- deletes the signed-in user only; nobody can name another account
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  delete from auth.users where id = me;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
