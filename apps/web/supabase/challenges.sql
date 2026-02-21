-- Run in Supabase SQL editor
-- Stores one-time CAPTCHA challenges for verification

create table if not exists public.captcha_challenges (
  id text primary key,
  expires_at timestamptz not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists captcha_challenges_expires_at_idx
  on public.captcha_challenges (expires_at);

-- Optional cleanup query (run as a scheduled job):
-- delete from public.captcha_challenges where expires_at < now();