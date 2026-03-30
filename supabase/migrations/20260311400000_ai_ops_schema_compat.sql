-- AI ops schema compatibility backfill for live DBs that had pre-existing partial tables

alter table if exists public.teacher_outputs
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists ai_run_id uuid references public.ai_runs(id) on delete set null,
  add column if not exists task_type text,
  add column if not exists student_provider text,
  add column if not exists student_model text,
  add column if not exists student_response text,
  add column if not exists teacher_provider text,
  add column if not exists teacher_model text,
  add column if not exists teacher_response text,
  add column if not exists metadata jsonb;

create index if not exists idx_teacher_outputs_ai_run_id
  on public.teacher_outputs(ai_run_id);
create index if not exists idx_teacher_outputs_task_type
  on public.teacher_outputs(task_type);
create index if not exists idx_teacher_outputs_created_at
  on public.teacher_outputs(created_at desc);

alter table if exists public.ai_eval_runs
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists ai_run_id uuid references public.ai_runs(id) on delete set null,
  add column if not exists task_type text,
  add column if not exists eval_type text not null default 'auto',
  add column if not exists score numeric,
  add column if not exists passed boolean not null default false,
  add column if not exists metadata jsonb;

create index if not exists idx_ai_eval_runs_ai_run_id
  on public.ai_eval_runs(ai_run_id);
create index if not exists idx_ai_eval_runs_task_type
  on public.ai_eval_runs(task_type);
create index if not exists idx_ai_eval_runs_eval_type
  on public.ai_eval_runs(eval_type);
create index if not exists idx_ai_eval_runs_created_at
  on public.ai_eval_runs(created_at desc);
create index if not exists idx_ai_eval_runs_passed
  on public.ai_eval_runs(passed);

notify pgrst, 'reload schema';

