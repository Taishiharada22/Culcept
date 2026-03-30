-- Stargazer student monitor snapshots for longitudinal ops tracking

create table if not exists public.stargazer_student_monitor_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  snapshot_date date not null default current_date,
  lookback_hours int not null default 168,
  teacher_coverage_rate numeric,
  shadow_eval_coverage_rate numeric,
  shadow_eval_avg_score numeric,
  shadow_eval_pass_rate numeric,
  fallback_rate numeric,
  promotion_eligible boolean not null default false,
  passed_check_count int not null default 0,
  total_check_count int not null default 0,
  hard_negative_counts jsonb not null default '{}'::jsonb,
  task_primary_counts jsonb not null default '{}'::jsonb,
  task_shadow_counts jsonb not null default '{}'::jsonb,
  readiness_checks jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_stargazer_student_monitor_snapshots_created_at
  on public.stargazer_student_monitor_snapshots (created_at desc);
create index if not exists idx_stargazer_student_monitor_snapshots_snapshot_date
  on public.stargazer_student_monitor_snapshots (snapshot_date desc);
create index if not exists idx_stargazer_student_monitor_snapshots_eligible
  on public.stargazer_student_monitor_snapshots (promotion_eligible, created_at desc);

alter table public.stargazer_student_monitor_snapshots enable row level security;

do $$ begin
  create policy "Service role manages stargazer student monitor snapshots"
    on public.stargazer_student_monitor_snapshots for all
    using (true)
    with check (true);
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
