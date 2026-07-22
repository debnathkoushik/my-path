-- Create the routes table to store GPS coordinates and metadata
create table if not exists public.routes (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  coordinates jsonb not null, -- Stores the coordinates array: [{"lat": 1.23, "lng": 4.56, "timestamp": 12345}]
  distance numeric not null,  -- Total distance in meters
  duration integer not null,  -- Duration of tracking in seconds
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.routes enable row level security;

-- Create a policy to allow anyone to read route paths by ID (no auth required)
create policy "Allow public read access to routes"
on public.routes for select
to public
using (true);

-- Create a policy to allow anyone to save route paths (no auth required)
create policy "Allow public insert access to routes"
on public.routes for insert
to public
with check (true);
