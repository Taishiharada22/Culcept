create extension if not exists "pgcrypto";

create table if not exists public.user_body_avatar_jobs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    run_id text not null,
    status text not null default 'queued',
    input_path text not null,
    output_dir text not null,
    enable_3d boolean not null default false,
    result_urls jsonb,
    warning text,
    error text,
    created_at timestamptz default now(),
    started_at timestamptz,
    finished_at timestamptz,
    updated_at timestamptz default now()
);

create index if not exists user_body_avatar_jobs_user_status_idx
    on public.user_body_avatar_jobs (user_id, status);

create index if not exists user_body_avatar_jobs_status_created_idx
    on public.user_body_avatar_jobs (status, created_at);
