-- Run this in the Supabase SQL editor to initialize route sharing.
-- It is safe to run more than once.

-- Required for gen_random_uuid() on Supabase/Postgres projects where pgcrypto
-- has not already been enabled.
create extension if not exists pgcrypto with schema extensions;

-- Create the routes table to store GPS coordinates and metadata.
create table if not exists public.routes (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  coordinates jsonb not null, -- Stores the coordinates array: [{"lat": 1.23, "lng": 4.56, "timestamp": 12345}]
  distance numeric not null,  -- Total distance in meters
  duration integer not null,  -- Duration of tracking in seconds
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Allow the browser client roles to access the table through Supabase's API.
grant usage on schema public to anon, authenticated;
grant select, insert on table public.routes to anon, authenticated;

-- Enable Row Level Security (RLS).
alter table public.routes enable row level security;

-- Recreate policies so rerunning this file keeps the expected behavior.
drop policy if exists "Allow public read access to routes" on public.routes;
drop policy if exists "Allow public insert access to routes" on public.routes;

-- Create a policy to allow anyone to read route paths by ID (no auth required).
create policy "Allow public read access to routes"
on public.routes for select
to anon, authenticated
using (true);

-- Create a policy to allow anyone to save route paths (no auth required).
create policy "Allow public insert access to routes"
on public.routes for insert
to anon, authenticated
with check (true);

-- Tell Supabase's REST API to refresh its schema cache immediately.
notify pgrst, 'reload schema';

-- Make the SQL editor fail loudly if the table was not created.
do $$
begin
  if to_regclass('public.routes') is null then
    raise exception 'public.routes was not created. Check the earlier SQL editor error output.';
  end if;
end
$$;

select to_regclass('public.routes') as created_table;
