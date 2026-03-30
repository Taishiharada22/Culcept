-- ============================================================
-- Orbiter Memory Summary Student Track
-- AI-generated candidate memory summaries for Orbiter
-- ============================================================

create table if not exists public.orbiter_memory_summaries (
    id                    uuid primary key default gen_random_uuid(),
    user_id               uuid not null references auth.users(id) on delete cascade,
    candidate_id          uuid not null references public.rendezvous_candidates(id) on delete cascade,
    ai_run_id             uuid references public.ai_runs(id) on delete set null,
    summary_text          text not null default '',
    summary_json          jsonb not null default '{}'::jsonb,
    source_memo_count     int not null default 0,
    source_new_memo_count int not null default 0,
    quality_metrics       jsonb not null default '{}'::jsonb,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    constraint orbiter_memory_summaries_user_candidate_unique unique (user_id, candidate_id)
);

create index if not exists idx_orbiter_memory_summaries_user
    on public.orbiter_memory_summaries (user_id, updated_at desc);

create index if not exists idx_orbiter_memory_summaries_candidate
    on public.orbiter_memory_summaries (candidate_id, updated_at desc);

alter table public.orbiter_memory_summaries enable row level security;

create policy "orbiter_memory_summaries_select_own"
    on public.orbiter_memory_summaries for select
    using (auth.uid() = user_id);

comment on table public.orbiter_memory_summaries is
    'Orbiterが候補者ごとに保持するAI生成の記憶要約。teacher/shadow/student学習用の素材にもなる';
