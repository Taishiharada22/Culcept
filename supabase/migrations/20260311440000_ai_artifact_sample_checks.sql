-- periodic artifact sample check history for training data quality monitoring

create table if not exists public.ai_artifact_sample_checks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  track text not null,
  artifact_type text not null,
  artifact_id uuid references public.ai_training_artifacts(id) on delete set null,
  row_count int not null default 0 check (row_count >= 0),
  sample_count int not null default 0 check (sample_count >= 0),
  status text not null default 'pass'
    check (status in ('pass', 'warn', 'fail')),
  issues jsonb,
  sample_rows jsonb,
  metadata jsonb
);

create index if not exists idx_ai_artifact_sample_checks_track_created_at
  on public.ai_artifact_sample_checks(track, created_at desc);
create index if not exists idx_ai_artifact_sample_checks_artifact_type
  on public.ai_artifact_sample_checks(artifact_type);
create index if not exists idx_ai_artifact_sample_checks_status
  on public.ai_artifact_sample_checks(status);

alter table public.ai_artifact_sample_checks enable row level security;

notify pgrst, 'reload schema';
