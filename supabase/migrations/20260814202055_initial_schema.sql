-- Initial route-sharing schema for PathFinder GPS.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.routes (
  id uuid default extensions.gen_random_uuid() primary key,
  name text not null,
  coordinates jsonb not null,
  distance numeric not null,
  duration integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

grant usage on schema public to anon, authenticated;
grant select, insert on table public.routes to anon, authenticated;

alter table public.routes enable row level security;

drop policy if exists "Allow public read access to routes" on public.routes;
drop policy if exists "Allow public insert access to routes" on public.routes;

create policy "Allow public read access to routes"
on public.routes for select
to anon, authenticated
using (true);

create policy "Allow public insert access to routes"
on public.routes for insert
to anon, authenticated
with check (true);

notify pgrst, 'reload schema';
