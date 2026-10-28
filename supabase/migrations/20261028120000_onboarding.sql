-- GlassMeet: new hosts go through setup (name and photo, WhatsApp number, weekly hours) once.
-- Hosts who signed up before this are treated as set up. Run after
-- 20261027130000_privacy_rate_limits.sql. Safe to run more than once.

-- added as true so every existing host counts as onboarded, then new rows start at false
alter table public.profiles add column if not exists onboarded boolean not null default true;
alter table public.profiles alter column onboarded set default false;
