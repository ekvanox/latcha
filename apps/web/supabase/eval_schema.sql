-- Run in Supabase SQL editor to set up eval database

-- 1. Create table for Captcha Images (the generated ones)
create table if not exists public.captchas (
  id uuid primary key default gen_random_uuid(),
  challenge_id text not null unique,
  generation_type text not null,
  image_uuid text not null,
  image_file_name text not null,
  bucket_path text not null,
  answer_alternatives jsonb not null,
  correct_alternative text not null,
  generation_time_ms integer,
  generation_timestamp timestamptz not null,
  question text not null,
  generation_specific_metadata jsonb,
  created_at timestamptz not null default now()
);

-- 2. Create table for Eval Sessions
create table if not exists public.eval_sessions (
  id uuid primary key default gen_random_uuid(),
  user_agent text,
  device_type text,
  total_session_time_ms integer,
  timestamp timestamptz not null default now()
);

-- 3. Create table for Eval Results
create table if not exists public.eval_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.eval_sessions(id) on delete cascade,
  captcha_id text not null references public.captchas(challenge_id) on delete cascade,
  answer_time_ms integer not null,
  response text,
  is_correct boolean not null,
  timestamp timestamptz not null default now()
);

-- Enable RLS and set policies
alter table public.captchas enable row level security;
alter table public.eval_sessions enable row level security;
alter table public.eval_results enable row level security;

-- Policies for captchas (anyone can read, only service role can insert)
create policy "Allow public read access on captchas"
  on public.captchas for select to public using (true);
create policy "Allow service role insert on captchas"
  on public.captchas for insert to service_role with check (true);

-- Policies for sessions and results (anyone can insert, maybe select if needed)
create policy "Allow public insert on eval_sessions"
  on public.eval_sessions for insert to public with check (true);
create policy "Allow public insert on eval_results"
  on public.eval_results for insert to public with check (true);

-- Allow public read so they can export their own results during the session
create policy "Allow public read on eval_sessions"
  on public.eval_sessions for select to public using (true);
create policy "Allow public read on eval_results"
  on public.eval_results for select to public using (true);
