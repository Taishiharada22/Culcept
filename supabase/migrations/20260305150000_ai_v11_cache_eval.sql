-- AI v1.1 evaluation and feedback infrastructure

create table if not exists ai_eval_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ai_run_id uuid references ai_runs(id),
  task_type text,
  eval_type text not null default 'auto',
  score numeric,
  passed boolean not null default false,
  metadata jsonb
);

create index if not exists idx_ai_eval_runs_ai_run_id on ai_eval_runs(ai_run_id);
create index if not exists idx_ai_eval_runs_task_type on ai_eval_runs(task_type);
create index if not exists idx_ai_eval_runs_eval_type on ai_eval_runs(eval_type);
create index if not exists idx_ai_eval_runs_created_at on ai_eval_runs(created_at desc);
create index if not exists idx_ai_eval_runs_passed on ai_eval_runs(passed);

alter table ai_eval_runs enable row level security;

create table if not exists ai_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ai_run_id uuid references ai_runs(id),
  user_id text,
  rating int not null check (rating >= -1 and rating <= 1),
  comment text,
  metadata jsonb
);

create index if not exists idx_ai_feedback_ai_run_id on ai_feedback(ai_run_id);
create index if not exists idx_ai_feedback_user_id on ai_feedback(user_id);
create index if not exists idx_ai_feedback_created_at on ai_feedback(created_at desc);
create index if not exists idx_ai_feedback_rating on ai_feedback(rating);

alter table ai_feedback enable row level security;
