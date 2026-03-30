-- Anima: Rendezvous の魂 — インサイトログ
create table if not exists rendezvous_anima_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insight_type text not null,
  insight_message text not null,
  dismissed boolean default false,
  created_at timestamptz default now()
);

create index idx_anima_log_user on rendezvous_anima_log(user_id, created_at desc);

alter table rendezvous_anima_log enable row level security;

create policy "Users can manage own anima log"
  on rendezvous_anima_log
  for all
  using (auth.uid() = user_id);
