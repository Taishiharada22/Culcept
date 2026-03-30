create extension if not exists pgcrypto;

create or replace function public.set_origin_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.origin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'in_progress',
  current_step text,
  draft jsonb,
  completed boolean not null default false,
  finished_at timestamptz,
  result_generated boolean not null default false,
  result_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint origin_sessions_status_check
    check (status in ('in_progress', 'generating', 'completed', 'cancelled')),
  constraint origin_sessions_step_check
    check (
      current_step is null or current_step in (
        'period_selection',
        'atmosphere',
        'perspective',
        'comparison',
        'triggers',
        'ai_recovery',
        'correction',
        'save'
      )
    )
);

create table if not exists public.origin_records (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid unique references public.origin_sessions(id) on delete set null,
  chapter jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.origin_sessions
  add column if not exists result_record_id uuid references public.origin_records(id) on delete set null;

create table if not exists public.origin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_position jsonb,
  latest_session_id uuid references public.origin_sessions(id) on delete set null,
  latest_record_id uuid references public.origin_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_origin_sessions_user_updated
  on public.origin_sessions (user_id, updated_at desc);

create unique index if not exists idx_origin_sessions_active_user
  on public.origin_sessions (user_id)
  where status in ('in_progress', 'generating');

create index if not exists idx_origin_records_user_created
  on public.origin_records (user_id, created_at desc);

create index if not exists idx_origin_profiles_latest_session
  on public.origin_profiles (latest_session_id);

drop trigger if exists origin_sessions_updated_at on public.origin_sessions;
create trigger origin_sessions_updated_at
before update on public.origin_sessions
for each row execute function public.set_origin_updated_at();

drop trigger if exists origin_records_updated_at on public.origin_records;
create trigger origin_records_updated_at
before update on public.origin_records
for each row execute function public.set_origin_updated_at();

drop trigger if exists origin_profiles_updated_at on public.origin_profiles;
create trigger origin_profiles_updated_at
before update on public.origin_profiles
for each row execute function public.set_origin_updated_at();

alter table public.origin_sessions enable row level security;
alter table public.origin_records enable row level security;
alter table public.origin_profiles enable row level security;

do $$ begin
  create policy "Users can read own origin sessions"
    on public.origin_sessions for select
    using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Users can insert own origin sessions"
    on public.origin_sessions for insert
    with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Users can update own origin sessions"
    on public.origin_sessions for update
    using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Users can read own origin records"
    on public.origin_records for select
    using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Users can insert own origin records"
    on public.origin_records for insert
    with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Users can update own origin records"
    on public.origin_records for update
    using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Users can read own origin profile"
    on public.origin_profiles for select
    using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Users can insert own origin profile"
    on public.origin_profiles for insert
    with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Users can update own origin profile"
    on public.origin_profiles for update
    using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;
