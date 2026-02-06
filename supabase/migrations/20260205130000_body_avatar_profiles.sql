create table if not exists public.user_body_avatar_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    views jsonb not null default '{}'::jsonb,
    updated_at timestamptz default now()
);

create index if not exists user_body_avatar_profiles_views_gin
    on public.user_body_avatar_profiles using gin (views);
