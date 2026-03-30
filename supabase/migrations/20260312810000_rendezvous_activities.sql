-- Rendezvous Activities (共鳴体験)
-- Parallel Questions, Style Duets, Future Scenes

create table if not exists rendezvous_activities (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references rendezvous_candidates(id) on delete cascade,
  activity_type text not null,
  payload jsonb not null default '{}',
  user_a_answer jsonb,
  user_b_answer jsonb,
  revealed boolean not null default false,
  insight_text text,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_rendezvous_activities_candidate
  on rendezvous_activities(candidate_id);

create index if not exists idx_rendezvous_activities_type
  on rendezvous_activities(candidate_id, activity_type);

-- RLS
alter table rendezvous_activities enable row level security;

create policy "Users can view their own activities"
  on rendezvous_activities for select
  using (
    candidate_id in (
      select id from rendezvous_candidates
      where user_a = auth.uid() or user_b = auth.uid()
    )
  );
