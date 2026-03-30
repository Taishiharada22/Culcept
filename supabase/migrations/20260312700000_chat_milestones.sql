-- Chat Milestones: マイルストーン到達 + マイクロリフレクション
-- Phase C: Intelligent Chat

create table if not exists rendezvous_chat_milestones (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references rendezvous_candidates(id) on delete cascade,
  milestone_type text not null,
  reached_at timestamptz not null default now(),
  reflection_answer jsonb,
  constraint unique_milestone unique (candidate_id, milestone_type)
);

create index if not exists idx_chat_milestones_candidate
  on rendezvous_chat_milestones(candidate_id);
