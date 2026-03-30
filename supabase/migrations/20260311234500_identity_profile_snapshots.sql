-- ============================================================
-- Identity Student Track
-- Unified internal profile snapshots across Stargazer / Orbiter / behavior
-- ============================================================

create table if not exists public.identity_profile_snapshots (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid not null references auth.users(id) on delete cascade,
    ai_run_id           uuid references public.ai_runs(id) on delete set null,
    version             int not null default 1,
    profile_json        jsonb not null default '{}'::jsonb,
    profile_text        text not null default '',
    previous_snapshot_id uuid references public.identity_profile_snapshots(id) on delete set null,
    source_summary      jsonb not null default '{}'::jsonb,
    contradiction_score numeric(5,4) not null default 0,
    consumer_readiness  jsonb not null default '{}'::jsonb,
    confidence          numeric(5,4) not null default 0,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists idx_identity_profile_snapshots_user
    on public.identity_profile_snapshots (user_id, created_at desc);

create index if not exists idx_identity_profile_snapshots_ai_run
    on public.identity_profile_snapshots (ai_run_id);

create unique index if not exists idx_identity_profile_snapshots_user_version
    on public.identity_profile_snapshots (user_id, version);

alter table public.identity_profile_snapshots enable row level security;

do $$ begin
  create policy "identity_profile_snapshots_select_own"
      on public.identity_profile_snapshots for select
      using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

comment on table public.identity_profile_snapshots is
    'Unified internal profile snapshots for the identity student track. Used as long-term internal state and future training asset.';
