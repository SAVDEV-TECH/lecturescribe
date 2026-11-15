-- ==============================================================================
-- LectureScribe AI — Supabase PostgreSQL Schema & Row-Level Security (RLS)
-- Run this script in your Supabase SQL Editor to enable Cloud Sync.
-- ==============================================================================

-- Enable UUID generation if not already active
create extension if not exists "pgcrypto";

-- 1. Create the lectures/notes table
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Lecture',
  tag text not null default 'General Studies',
  transcript text not null default '',
  notes_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast user queries ordered by creation date
create index if not exists idx_notes_user_created
  on public.notes (user_id, created_at desc);

-- 2. Enable Row Level Security (RLS)
alter table public.notes enable row level security;

-- 3. RLS Policies: Users can only view, insert, update, and delete their own notes
drop policy if exists "Users can view their own notes" on public.notes;
create policy "Users can view their own notes"
  on public.notes for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own notes" on public.notes;
create policy "Users can insert their own notes"
  on public.notes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own notes" on public.notes;
create policy "Users can update their own notes"
  on public.notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own notes" on public.notes;
create policy "Users can delete their own notes"
  on public.notes for delete
  using (auth.uid() = user_id);
