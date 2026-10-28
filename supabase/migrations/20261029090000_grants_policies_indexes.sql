-- GlassMeet: launch audit fixes. Tables made after the hardening revoke got TRUNCATE (which
-- skips RLS) for every signed-in user, duplicate read policies are folded into the owner
-- policies, the group-capacity check gets its index, and the unused busy_slots view stops
-- running as its owner. Run after 20261028140000_delete_account.sql. Safe to run more than once.

-- ── 1. no TRUNCATE / TRIGGER / REFERENCES for app roles ─────────────────────
-- 20261026090000_hardening.sql revoked these once, but event_templates and holidays came later
-- and got Supabase's default grants: any signed-in user could TRUNCATE every host's templates
-- or the holiday list. Revoke again, and stop new tables from getting them.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;

-- ── 2. one SELECT policy per table ──────────────────────────────────────────
-- Each *_read policy has the same USING as the table's *_write_own policy (FOR ALL, to
-- authenticated), so it adds nothing; two permissive policies just mean two checks per row.
drop policy if exists event_types_read on public.event_types;
drop policy if exists availability_rules_read on public.availability_rules;
drop policy if exists availability_exceptions_read on public.availability_exceptions;

-- ── 3. indexes for the booking checks ───────────────────────────────────────
-- guard_guest_booking() counts a group event's guests by (event_type_id, start_time); this also
-- covers the foreign key, so the single-column index goes.
create index if not exists bookings_event_start_idx on public.bookings (event_type_id, start_time);
drop index if exists public.bookings_event_type_idx;
-- bookings_host_created_idx stays although the advisor calls it unused: the per-host and
-- per-guest rate limits (created_date > now() - 1 hour) and the dashboard's newest-first list
-- read it; it just hasn't had traffic yet.

-- ── 4. the old busy_slots view respects RLS ─────────────────────────────────
-- Nothing reads it any more (busy_times() replaced it and its grants were revoked), but as an
-- owner-run view it would show every host's bookings to anyone granted it later.
alter view public.busy_slots set (security_invoker = true);

-- ── 5. trigger functions aren't callable through the API ────────────────────
revoke execute on function public.touch_updated_date() from public, anon, authenticated;
