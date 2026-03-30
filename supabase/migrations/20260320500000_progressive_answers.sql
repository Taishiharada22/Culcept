-- Progressive Profile Answers（プログレッシブ回答履歴）
create table if not exists rendezvous_progressive_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  answer_value real not null check (answer_value >= 0 and answer_value <= 1),
  vector_before jsonb,
  vector_after jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, question_id)
);

alter table rendezvous_progressive_answers enable row level security;

create policy "Users can read own progressive answers"
  on rendezvous_progressive_answers for select
  using (auth.uid() = user_id);

create index idx_progressive_answers_user on rendezvous_progressive_answers(user_id);

-- Unmatch columns on rendezvous_candidates
alter table rendezvous_candidates
  add column if not exists unmatched_by uuid references auth.users(id),
  add column if not exists unmatched_at timestamptz;

-- Safety action columns on rendezvous_candidates
alter table rendezvous_candidates
  add column if not exists chat_paused_until timestamptz,
  add column if not exists chat_pause_reason text,
  add column if not exists blocked_by text,
  add column if not exists blocked_reason text;

-- Safety warning columns on rendezvous_user_states
alter table rendezvous_user_states
  add column if not exists safety_warning boolean default false,
  add column if not exists safety_warning_type text,
  add column if not exists hidden boolean default false,
  add column if not exists hidden_reason text;

-- Safety flag on profile
alter table rendezvous_profiles
  add column if not exists safety_flag boolean default false,
  add column if not exists safety_flag_at timestamptz;

-- Scheduled delete for messages (GDPR unmatch)
alter table rendezvous_messages
  add column if not exists scheduled_delete_at timestamptz;
