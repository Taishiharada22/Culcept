-- CEO Skill Telemetry — skill発動ログ
create table if not exists ceo_skill_runs (
  id           uuid primary key default gen_random_uuid(),
  skill_name   text not null,
  target_type  text,           -- e.g. 'user', 'system', 'cron'
  target_id    text,
  status       text not null default 'running' check (status in ('running','success','error')),
  duration_ms  int,
  summary      text,
  metadata     jsonb default '{}',
  executed_at  timestamptz not null default now(),
  finished_at  timestamptz
);

create index if not exists idx_ceo_skill_runs_executed on ceo_skill_runs (executed_at desc);
create index if not exists idx_ceo_skill_runs_skill   on ceo_skill_runs (skill_name, executed_at desc);
