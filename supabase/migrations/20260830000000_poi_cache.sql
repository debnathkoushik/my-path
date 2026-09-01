-- Migration: Nearby Places Discovery — poi_cache table
-- Shared cache (no user_id): any two users hitting the same geohash cell
-- within the TTL window must hit the same cache row.

create table if not exists public.poi_cache (
  geohash     text primary key,
  fetched_at  timestamptz not null,
  ttl_seconds int         not null,
  pois        jsonb       not null
);

-- Grant read access to both anonymous and authenticated roles.
-- No write grants here — writes go exclusively through the Edge Function
-- using the service role.
grant usage  on schema public           to anon, authenticated;
grant select on table  public.poi_cache to anon, authenticated;

alter table public.poi_cache enable row level security;

-- ── Read policy: open to all clients (including unauthenticated) ──────────
drop policy if exists "poi_cache_public_read" on public.poi_cache;
create policy "poi_cache_public_read"
  on public.poi_cache for select
  to anon, authenticated
  using (true);

-- ── Write policies: service_role only ─────────────────────────────────────
-- Client code must never insert or update poi_cache directly.
-- The "fetch-pois" Edge Function runs with the service role key and is the
-- only writer.  These policies intentionally have no anon/authenticated
-- grant — the service_role bypasses RLS by default in Supabase.

notify pgrst, 'reload schema';
