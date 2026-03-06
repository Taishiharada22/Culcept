-- AI Router Foundation v1
-- Tables: ai_runs, ai_semantic_cache, teacher_outputs, model_registry

create table if not exists ai_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id text,
  session_id text,
  task_type text not null,
  provider text not null,
  model text,
  prompt_text text not null,
  system_prompt text,
  response_text text,
  structured_json jsonb,
  success boolean not null default false,
  latency_ms int,
  input_tokens int,
  output_tokens int,
  fallback_used boolean not null default false,
  error_message text,
  metadata jsonb
);

create index if not exists idx_ai_runs_created_at on ai_runs(created_at desc);
create index if not exists idx_ai_runs_task_type on ai_runs(task_type);
create index if not exists idx_ai_runs_provider on ai_runs(provider);
create index if not exists idx_ai_runs_success on ai_runs(success);
create index if not exists idx_ai_runs_user_id on ai_runs(user_id);
create index if not exists idx_ai_runs_session_id on ai_runs(session_id);

alter table ai_runs enable row level security;

create table if not exists ai_semantic_cache (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cache_key text not null unique,
  task_type text not null,
  prompt_text text not null,
  system_prompt text,
  response_text text not null,
  structured_json jsonb,
  provider text not null,
  model text,
  source_ai_run_id uuid references ai_runs(id),
  metadata jsonb
);

create index if not exists idx_ai_semantic_cache_cache_key on ai_semantic_cache(cache_key);
create index if not exists idx_ai_semantic_cache_created_at on ai_semantic_cache(created_at desc);
create index if not exists idx_ai_semantic_cache_task_type on ai_semantic_cache(task_type);

alter table ai_semantic_cache enable row level security;

create table if not exists teacher_outputs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ai_run_id uuid references ai_runs(id),
  task_type text not null,
  student_provider text,
  student_model text,
  student_response text,
  teacher_provider text not null,
  teacher_model text,
  teacher_response text not null,
  metadata jsonb
);

create index if not exists idx_teacher_outputs_ai_run_id on teacher_outputs(ai_run_id);
create index if not exists idx_teacher_outputs_task_type on teacher_outputs(task_type);
create index if not exists idx_teacher_outputs_created_at on teacher_outputs(created_at desc);

alter table teacher_outputs enable row level security;

create table if not exists model_registry (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  model_key text not null,
  model_version text not null,
  model_role text not null default 'champion',
  provider text not null,
  is_active boolean not null default true,
  rollout_percent int not null default 100 check (rollout_percent >= 0 and rollout_percent <= 100),
  metadata jsonb
);

create index if not exists idx_model_registry_model_key on model_registry(model_key);
create index if not exists idx_model_registry_is_active on model_registry(is_active);
create index if not exists idx_model_registry_model_role on model_registry(model_role);

alter table model_registry enable row level security;
