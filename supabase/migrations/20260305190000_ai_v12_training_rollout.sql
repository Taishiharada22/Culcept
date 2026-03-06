-- AI v1.2 automatic improvement infrastructure foundation
-- - training artifact registry / handoff contract
-- - model_registry rollout & promotion metadata extension

create table if not exists ai_training_artifacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  artifact_type text not null,
  artifact_version text not null,
  source_filters jsonb,
  row_count int not null default 0 check (row_count >= 0),
  storage_path text,
  payload_json jsonb,
  status text not null default 'generated'
    check (status in ('generated', 'ready', 'consumed', 'failed')),
  checksum text,
  notes text,
  metadata jsonb,
  unique (artifact_type, artifact_version)
);

create index if not exists idx_ai_training_artifacts_type
  on ai_training_artifacts(artifact_type);
create index if not exists idx_ai_training_artifacts_version
  on ai_training_artifacts(artifact_version);
create index if not exists idx_ai_training_artifacts_status
  on ai_training_artifacts(status);
create index if not exists idx_ai_training_artifacts_created_at
  on ai_training_artifacts(created_at desc);
create index if not exists idx_ai_training_artifacts_checksum
  on ai_training_artifacts(checksum);

alter table ai_training_artifacts enable row level security;
-- ai_training_artifacts is intended for trusted server-side/service-role flows.

alter table if exists model_registry
  add column if not exists traffic_role text;

alter table if exists model_registry
  add column if not exists traffic_weight int not null default 0
    check (traffic_weight >= 0 and traffic_weight <= 100);

alter table if exists model_registry
  add column if not exists task_types jsonb;

alter table if exists model_registry
  add column if not exists promotion_status text;

alter table if exists model_registry
  add column if not exists promoted_at timestamptz;

alter table if exists model_registry
  add column if not exists demoted_at timestamptz;

alter table if exists model_registry
  add column if not exists notes text;

update model_registry
set traffic_role = case
  when lower(coalesce(model_role, '')) in ('challenger', 'shadow', 'champion')
    then lower(model_role)
  when is_active then 'champion'
  else 'shadow'
end
where traffic_role is null;

update model_registry
set traffic_weight = rollout_percent
where coalesce(rollout_percent, 0) > 0
  and coalesce(traffic_weight, 0) = 0;

update model_registry
set promotion_status = case when is_active then 'promoted' else 'candidate' end
where promotion_status is null;

create index if not exists idx_model_registry_traffic_role_active
  on model_registry(traffic_role, is_active);
create index if not exists idx_model_registry_promotion_status
  on model_registry(promotion_status);
create index if not exists idx_model_registry_traffic_weight
  on model_registry(traffic_weight);
