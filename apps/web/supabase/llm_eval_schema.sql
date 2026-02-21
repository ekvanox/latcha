-- Run in Supabase SQL Editor
-- LLM Eval schema: sessions and per-result records tied to captchas table

create table if not exists public.llm_eval_sessions (
  id uuid primary key default gen_random_uuid(),
  -- which model / setup
  model_id text not null,
  model_name text not null,
  prompt_template text not null,
  temperature numeric not null,
  max_tokens integer not null,
  -- scope
  generation_type text,          -- null means "all types"
  captcha_count integer not null,
  -- aggregate stats (computed after run)
  correct_count integer not null default 0,
  accuracy numeric not null default 0,
  avg_latency_ms numeric not null default 0,
  -- timing
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.llm_eval_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.llm_eval_sessions(id) on delete cascade,
  captcha_id text not null references public.captchas(challenge_id) on delete cascade,
  -- the challenge state at eval time
  question text not null,
  answer_alternatives jsonb not null,
  correct_alternative text not null,
  -- what the model did
  prompt_sent text not null,
  raw_response text not null,
  parsed_answer text not null,
  is_correct boolean not null,
  latency_ms integer not null,
  -- metadata
  created_at timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists llm_eval_results_session_id_idx on public.llm_eval_results(session_id);
create index if not exists llm_eval_results_captcha_id_idx on public.llm_eval_results(captcha_id);
create index if not exists llm_eval_sessions_model_id_idx on public.llm_eval_sessions(model_id);
create index if not exists llm_eval_sessions_generation_type_idx on public.llm_eval_sessions(generation_type);

-- RLS
alter table public.llm_eval_sessions enable row level security;
alter table public.llm_eval_results enable row level security;

-- Public read, service_role write
create policy "Allow public read on llm_eval_sessions"
  on public.llm_eval_sessions for select to public using (true);
create policy "Allow service_role insert on llm_eval_sessions"
  on public.llm_eval_sessions for insert to service_role with check (true);
create policy "Allow service_role update on llm_eval_sessions"
  on public.llm_eval_sessions for update to service_role using (true);

create policy "Allow public read on llm_eval_results"
  on public.llm_eval_results for select to public using (true);
create policy "Allow service_role insert on llm_eval_results"
  on public.llm_eval_results for insert to service_role with check (true);
