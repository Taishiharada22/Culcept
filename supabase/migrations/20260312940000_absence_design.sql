create table if not exists rendezvous_absences (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  absence_type text not null,
  started_at timestamptz default now(),
  ends_at timestamptz,
  actual_ended_at timestamptz,
  accepted boolean default true,
  created_at timestamptz default now()
);

create index idx_absences_candidate on rendezvous_absences(candidate_id, user_id);
create index idx_absences_active on rendezvous_absences(user_id) where actual_ended_at is null;

alter table rendezvous_absences enable row level security;

create policy "Users can manage own absences"
  on rendezvous_absences
  for all
  using (auth.uid() = user_id);
