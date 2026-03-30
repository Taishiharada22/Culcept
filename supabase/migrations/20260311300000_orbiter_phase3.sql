-- ============================================================
-- Orbiter Phase 3: Delta Snapshots + Branching Reflections
-- ============================================================

-- ── Delta Snapshots ──
-- ユーザーの判断パターンの定点観測。
-- 前回との差分で「あなたの選び方がどう変わったか」を検出する。

create table if not exists public.orbiter_delta_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  decision_count      int not null default 0,
  avg_decision_time_ms numeric,
  like_rate           numeric(3,2) not null default 0.50,
  top_preferred_axes  jsonb not null default '[]'::jsonb,
  avg_visit_count     numeric(4,2) not null default 1.00,
  created_at          timestamptz not null default now()
);

create index idx_orbiter_delta_user
  on public.orbiter_delta_snapshots (user_id, created_at desc);

-- RLS
alter table public.orbiter_delta_snapshots enable row level security;
create policy "Users can read own delta snapshots"
  on public.orbiter_delta_snapshots for select using (auth.uid() = user_id);
-- Write: admin only (server-side)

-- ── Branching Reflections ──
-- 分岐型の観測対話。回答が次の質問を決める。

create table if not exists public.orbiter_branching_reflections (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  candidate_id    uuid not null references public.rendezvous_candidates(id) on delete cascade,
  flow_id         text not null,
  answers         jsonb not null default '[]'::jsonb,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_orbiter_branching_user
  on public.orbiter_branching_reflections (user_id, created_at desc);

-- RLS
alter table public.orbiter_branching_reflections enable row level security;
create policy "Users can manage own branching reflections"
  on public.orbiter_branching_reflections for all using (auth.uid() = user_id);
