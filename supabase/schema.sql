-- ============================================================================
-- WINGO database schema for Supabase (Postgres)
-- Run this in Supabase Studio → SQL Editor → New Query → paste → Run
-- ============================================================================

-- Extension for UUID generation (usually already enabled on Supabase)
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- profiles: one row per authenticated user, tracks role (admin / player)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'player' check (role in ('admin', 'player')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view all profiles"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- games: one row per game session (admin creates/controls this)
-- ----------------------------------------------------------------------------
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'WINGO Game',
  status text not null default 'lobby' check (status in ('lobby', 'active', 'ended')),
  created_by uuid references public.profiles(id),
  drawn_numbers jsonb not null default '[]'::jsonb, -- ordered list of {number, symbol, drawnAt}
  draw_interval_seconds int not null default 15,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

alter table public.games enable row level security;

create policy "Anyone signed in can view games"
  on public.games for select
  using (auth.role() = 'authenticated');

create policy "Only admins can create games"
  on public.games for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Only admins can update games"
  on public.games for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ----------------------------------------------------------------------------
-- tickets: one row per player per game, holds their 15x5 grid as jsonb
-- ----------------------------------------------------------------------------
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  grid jsonb not null default '[]'::jsonb, -- 15x5 array, null or {number, wild}
  score int not null default 0,
  score_details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (game_id, player_id)
);

alter table public.tickets enable row level security;

create policy "Players can view all tickets in games they're in"
  on public.tickets for select
  using (auth.role() = 'authenticated');

create policy "Players can insert their own ticket"
  on public.tickets for insert
  with check (auth.uid() = player_id);

create policy "Players can update their own ticket"
  on public.tickets for update
  using (auth.uid() = player_id);

-- ----------------------------------------------------------------------------
-- Realtime: enable replication so clients get live updates
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.tickets;

-- ----------------------------------------------------------------------------
-- Helper: promote a user to admin (run manually after they sign up once)
-- Replace the email below with the account you want to be admin.
-- ----------------------------------------------------------------------------
-- update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');

-- ----------------------------------------------------------------------------
-- MIGRATION: if you already ran this schema before (games table exists
-- without draw_interval_seconds), run just this line to add the new column:
-- ----------------------------------------------------------------------------
-- alter table public.games add column if not exists draw_interval_seconds int not null default 15;
