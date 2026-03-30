-- ============================================================
-- Orbiter Phase 4: 無自覚観測 (Unconscious Observation)
-- ============================================================

-- ── orbiter_anomalies ──
-- パターンを壊す判断を記録し、無意識の変化を追跡する。
create table if not exists public.orbiter_anomalies (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  candidate_id    uuid not null references public.rendezvous_candidates(id) on delete cascade,
  anomaly_type    text not null,
  description     text not null,
  expected_outcome text not null,
  actual_outcome  text not null,
  significance    numeric(3,2) not null default 0.50,
  became_pattern  boolean not null default false,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  constraint orbiter_anomaly_type_check check (
    anomaly_type in ('pattern_break', 'surprising_pass', 'speed_anomaly', 'revisit_anomaly')
  )
);

create index if not exists idx_orbiter_anomalies_user
  on public.orbiter_anomalies (user_id, created_at desc);

alter table public.orbiter_anomalies enable row level security;

create policy "orbiter_anomalies_select_own"
  on public.orbiter_anomalies for select using (auth.uid() = user_id);

comment on table public.orbiter_anomalies is
  'Orbiter Phase 4: 異常アーカイブ。パターンを破る判断を記録し、無意識の変化を追跡する';

-- ── orbiter_era_snapshots ──
-- 判断の地層: ユーザーの判断パターンの時代区分を記録する。
create table if not exists public.orbiter_era_snapshots (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  era_type        text not null,
  start_date      timestamptz not null,
  decision_count  int not null default 0,
  metrics         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  constraint orbiter_era_type_check check (
    era_type in ('exploration', 'focus', 'wandering', 'deepening', 'crystallization')
  )
);

create index if not exists idx_orbiter_era_user
  on public.orbiter_era_snapshots (user_id, created_at desc);

alter table public.orbiter_era_snapshots enable row level security;

create policy "orbiter_era_select_own"
  on public.orbiter_era_snapshots for select using (auth.uid() = user_id);

comment on table public.orbiter_era_snapshots is
  'Orbiter Phase 4: 判断の地層。ユーザーの判断パターンの時代区分を記録する';
