-- Living Score: スコア履歴 + Growth Nudges
-- Phase F: 生きるスコア

create table if not exists rendezvous_score_history (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references rendezvous_candidates(id) on delete cascade,
  score numeric(4,3) not null,
  computed_at timestamptz not null default now(),
  signal_summary jsonb
);

create index if not exists idx_score_history_candidate
  on rendezvous_score_history(candidate_id, computed_at desc);

create table if not exists rendezvous_growth_nudges (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references rendezvous_candidates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nudge_type text not null,
  nudge_text text not null,
  feedback text, -- 'helpful' | 'not_relevant' | null
  created_at timestamptz not null default now()
);

create index if not exists idx_growth_nudges_candidate_user
  on rendezvous_growth_nudges(candidate_id, user_id, created_at desc);
