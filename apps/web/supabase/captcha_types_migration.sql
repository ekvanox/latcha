-- Migration: extract captcha_types table
-- Run in Supabase SQL Editor

-- 1. Create the captcha_types table
create table if not exists public.captcha_types (
  id text primary key,            -- matches generation_type in captchas table
  display_name text not null,
  description text,
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. Populate from existing distinct generation_type values
insert into public.captcha_types (id, display_name, disabled)
select
  generation_type,
  initcap(replace(generation_type, '-', ' ')),
  false
from public.captchas
group by generation_type
on conflict (id) do nothing;

-- 3. Add a FK from captchas → captcha_types
alter table public.captchas
  add column if not exists captcha_type_id text
    references public.captcha_types(id) on delete restrict;

-- 4. Backfill the FK column from the existing generation_type column
update public.captchas
set captcha_type_id = generation_type
where captcha_type_id is null;

-- 5. RLS
alter table public.captcha_types enable row level security;

create policy "Allow public read on captcha_types"
  on public.captcha_types for select to public using (true);

create policy "Allow service_role insert on captcha_types"
  on public.captcha_types for insert to service_role with check (true);

create policy "Allow service_role update on captcha_types"
  on public.captcha_types for update to service_role using (true);

-- 6. Index for disabled filter
create index if not exists captcha_types_disabled_idx on public.captcha_types(disabled);
