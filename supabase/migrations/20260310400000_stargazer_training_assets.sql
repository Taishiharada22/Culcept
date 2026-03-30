-- Stargazer training asset pipeline
-- - generation candidate audit trail
-- - question shown / answered metric maintenance helpers

create table if not exists public.stargazer_generation_candidates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  batch_id text,
  ai_run_id uuid references public.ai_runs(id) on delete set null,
  task_type text not null,
  source_stage text not null,
  entity_type text not null check (entity_type in ('question', 'lens')),
  axis_id text,
  lens_id text,
  candidate_index int not null default 0,
  request_context jsonb not null default '{}'::jsonb,
  candidate_json jsonb not null default '{}'::jsonb,
  normalized_output jsonb,
  acceptance_status text not null default 'rejected'
    check (acceptance_status in ('accepted', 'rejected')),
  accepted_entity_id text,
  rejection_reason text,
  downstream_metrics jsonb not null default '{}'::jsonb
);

create index if not exists idx_stargazer_generation_candidates_ai_run_id
  on public.stargazer_generation_candidates(ai_run_id);
create index if not exists idx_stargazer_generation_candidates_batch_id
  on public.stargazer_generation_candidates(batch_id);
create index if not exists idx_stargazer_generation_candidates_task_type
  on public.stargazer_generation_candidates(task_type);
create index if not exists idx_stargazer_generation_candidates_status
  on public.stargazer_generation_candidates(acceptance_status);
create index if not exists idx_stargazer_generation_candidates_entity
  on public.stargazer_generation_candidates(entity_type, accepted_entity_id);

alter table public.stargazer_generation_candidates enable row level security;

do $$ begin
  create policy "Service role manages stargazer generation candidates"
    on public.stargazer_generation_candidates for all
    using (true)
    with check (true);
exception when duplicate_object then null;
end $$;

create or replace function public.recompute_pool_question_metrics(
  p_question_key text
) returns void
language plpgsql
security definer
as $$
declare
  v_times_shown int := 0;
  v_times_answered int := 0;
  v_avg_response_time_ms numeric := null;
  v_score_variance numeric := null;
begin
  select
    count(*)::int,
    count(*) filter (where answered)::int,
    avg(response_time_ms)::numeric,
    coalesce(var_pop(score), 0)::numeric
  into
    v_times_shown,
    v_times_answered,
    v_avg_response_time_ms,
    v_score_variance
  from public.stargazer_question_shown
  where question_key = p_question_key;

  update public.stargazer_question_pool
  set
    times_shown = coalesce(v_times_shown, 0),
    times_answered = coalesce(v_times_answered, 0),
    avg_response_time_ms = v_avg_response_time_ms,
    score_variance = v_score_variance,
    updated_at = now()
  where question_key = p_question_key;
end;
$$;

create or replace function public.record_pool_question_shown(
  p_user_id uuid,
  p_question_key text,
  p_shown_at date default current_date
) returns boolean
language plpgsql
security definer
as $$
declare
  v_row_count int := 0;
begin
  insert into public.stargazer_question_shown (
    user_id,
    question_key,
    shown_at,
    answered
  ) values (
    p_user_id,
    p_question_key,
    coalesce(p_shown_at, current_date),
    false
  )
  on conflict (user_id, question_key, shown_at) do nothing;

  get diagnostics v_row_count = row_count;

  if v_row_count > 0 then
    perform public.recompute_pool_question_metrics(p_question_key);
  end if;

  return v_row_count > 0;
end;
$$;

create or replace function public.update_pool_question_metrics(
  p_user_id uuid,
  p_question_key text,
  p_score numeric,
  p_response_time_ms int,
  p_shown_at date default current_date
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.stargazer_question_shown (
    user_id,
    question_key,
    shown_at,
    answered,
    score,
    response_time_ms
  ) values (
    p_user_id,
    p_question_key,
    coalesce(p_shown_at, current_date),
    true,
    p_score,
    p_response_time_ms
  )
  on conflict (user_id, question_key, shown_at)
  do update set
    answered = true,
    score = excluded.score,
    response_time_ms = excluded.response_time_ms;

  perform public.recompute_pool_question_metrics(p_question_key);
end;
$$;
