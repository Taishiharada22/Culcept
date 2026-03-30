create extension if not exists pgcrypto;

create or replace function public.set_battle_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create table if not exists public.battle_contests (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    theme text not null,
    description text not null default '',
    battle_type text not null default 'standard',
    theme_cycle text not null default 'custom',
    status text not null default 'open_for_entry',
    prize text,
    cover_image_url text,
    entry_deadline_at timestamptz not null,
    voting_starts_at timestamptz not null,
    voting_ends_at timestamptz not null,
    finalized_at timestamptz,
    created_by uuid references auth.users(id) on delete set null,
    moderation_state text not null default 'active',
    moderation_reason text,
    moderated_at timestamptz,
    moderated_by uuid references auth.users(id) on delete set null,
    forced_end_reason text,
    forced_ended_at timestamptz,
    forced_ended_by uuid references auth.users(id) on delete set null,
    featured_rank integer,
    featured_until timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint battle_contests_status_check check (status in ('open_for_entry', 'voting', 'ended', 'cancelled')),
    constraint battle_contests_battle_type_check check (battle_type in ('standard', 'one_on_one', 'theme', 'budget', 'brand', 'seasonal_weather', 'tribe')),
    constraint battle_contests_theme_cycle_check check (theme_cycle in ('custom', 'daily', 'weekly')),
    constraint battle_contests_moderation_state_check check (moderation_state in ('active', 'flagged', 'hidden', 'disqualified')),
    constraint battle_contests_window_check check (entry_deadline_at <= voting_starts_at and voting_starts_at <= voting_ends_at)
);

-- Ensure columns exist for idempotent migration
do $$ begin
    alter table public.battle_contests add column if not exists entry_deadline_at timestamptz;
    alter table public.battle_contests add column if not exists voting_starts_at timestamptz;
    alter table public.battle_contests add column if not exists voting_ends_at timestamptz;
    alter table public.battle_contests add column if not exists battle_type text not null default 'standard';
    alter table public.battle_contests add column if not exists theme_cycle text not null default 'custom';
    alter table public.battle_contests add column if not exists moderation_state text not null default 'active';
    alter table public.battle_contests add column if not exists moderation_reason text;
    alter table public.battle_contests add column if not exists moderated_at timestamptz;
    alter table public.battle_contests add column if not exists moderated_by uuid;
    alter table public.battle_contests add column if not exists forced_end_reason text;
    alter table public.battle_contests add column if not exists forced_ended_at timestamptz;
    alter table public.battle_contests add column if not exists forced_ended_by uuid;
    alter table public.battle_contests add column if not exists featured_rank integer;
    alter table public.battle_contests add column if not exists featured_until timestamptz;
exception when others then null;
end $$;

create index if not exists battle_contests_status_idx
    on public.battle_contests (status, voting_ends_at desc);

create index if not exists battle_contests_featured_idx
    on public.battle_contests (featured_rank asc nulls last, featured_until desc nulls last);

create trigger battle_contests_updated_at
before update on public.battle_contests
for each row
execute function public.set_battle_updated_at();

create table if not exists public.battle_entries (
    id uuid primary key default gen_random_uuid(),
    contest_id uuid not null references public.battle_contests(id) on delete cascade,
    user_id uuid not null,
    display_name text not null,
    avatar_url text,
    image_url text not null,
    comment text,
    item_tags text[] not null default '{}'::text[],
    moderation_state text not null default 'active',
    moderation_reason text,
    moderated_at timestamptz,
    moderated_by uuid references auth.users(id) on delete set null,
    withdrawn_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint battle_entries_moderation_state_check check (moderation_state in ('active', 'flagged', 'hidden', 'disqualified')),
    constraint battle_entries_contest_user_unique unique (contest_id, user_id)
);

create index if not exists battle_entries_contest_idx
    on public.battle_entries (contest_id, created_at asc);

create index if not exists battle_entries_user_idx
    on public.battle_entries (user_id, created_at desc);

create trigger battle_entries_updated_at
before update on public.battle_entries
for each row
execute function public.set_battle_updated_at();

create table if not exists public.battle_votes (
    id uuid primary key default gen_random_uuid(),
    contest_id uuid not null references public.battle_contests(id) on delete cascade,
    entry_id uuid not null references public.battle_entries(id) on delete cascade,
    voter_user_id uuid not null,
    is_valid boolean not null default true,
    invalidated_at timestamptz,
    invalidated_by uuid references auth.users(id) on delete set null,
    invalidated_reason text,
    ip_hash text,
    ua_hash text,
    risk_flags text[] not null default '{}'::text[],
    created_at timestamptz not null default now(),
    constraint battle_votes_unique unique (contest_id, voter_user_id)
);

create index if not exists battle_votes_entry_idx
    on public.battle_votes (entry_id, created_at desc);

create index if not exists battle_votes_contest_idx
    on public.battle_votes (contest_id, created_at desc);

create index if not exists battle_votes_valid_idx
    on public.battle_votes (contest_id, is_valid, created_at desc);

create table if not exists public.battle_results (
    id uuid primary key default gen_random_uuid(),
    contest_id uuid not null references public.battle_contests(id) on delete cascade,
    entry_id uuid not null references public.battle_entries(id) on delete cascade,
    rank integer not null,
    votes integer not null default 0,
    vote_ratio numeric(6,2) not null default 0,
    is_winner boolean not null default false,
    snapshot_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint battle_results_contest_entry_unique unique (contest_id, entry_id)
);

create index if not exists battle_results_contest_rank_idx
    on public.battle_results (contest_id, rank asc, votes desc);

create table if not exists public.battle_activity_logs (
    id bigint generated always as identity primary key,
    contest_id uuid references public.battle_contests(id) on delete cascade,
    entry_id uuid references public.battle_entries(id) on delete cascade,
    actor_user_id uuid references auth.users(id) on delete set null,
    event text not null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists battle_activity_logs_contest_idx
    on public.battle_activity_logs (contest_id, created_at desc);

create index if not exists battle_activity_logs_event_idx
    on public.battle_activity_logs (event, created_at desc);

create table if not exists public.battle_reactions (
    id uuid primary key default gen_random_uuid(),
    contest_id uuid not null references public.battle_contests(id) on delete cascade,
    entry_id uuid not null references public.battle_entries(id) on delete cascade,
    user_id uuid not null,
    reaction text not null,
    created_at timestamptz not null default now(),
    constraint battle_reactions_reaction_check check (reaction in ('fire', 'crown', 'sparkle', 'target')),
    constraint battle_reactions_unique unique (entry_id, user_id, reaction)
);

create index if not exists battle_reactions_entry_idx
    on public.battle_reactions (entry_id, created_at desc);

create table if not exists public.battle_reports (
    id uuid primary key default gen_random_uuid(),
    contest_id uuid not null references public.battle_contests(id) on delete cascade,
    entry_id uuid not null references public.battle_entries(id) on delete cascade,
    reporter_user_id uuid not null,
    reason text not null,
    status text not null default 'open',
    resolution_note text,
    resolved_by uuid references auth.users(id) on delete set null,
    resolved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint battle_reports_status_check check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
    constraint battle_reports_unique unique (entry_id, reporter_user_id)
);

create index if not exists battle_reports_status_idx
    on public.battle_reports (status, created_at desc);

create trigger battle_reports_updated_at
before update on public.battle_reports
for each row
execute function public.set_battle_updated_at();

create table if not exists public.battle_finalize_attempts (
    id uuid primary key default gen_random_uuid(),
    contest_id uuid not null references public.battle_contests(id) on delete cascade,
    trigger_reason text not null,
    status text not null default 'running',
    error_message text,
    attempt_no integer not null default 1,
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    constraint battle_finalize_attempts_status_check check (status in ('running', 'success', 'failed'))
);

create index if not exists battle_finalize_attempts_contest_idx
    on public.battle_finalize_attempts (contest_id, started_at desc);

create table if not exists public.battle_client_events (
    id bigint generated always as identity primary key,
    contest_id uuid references public.battle_contests(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null,
    event text not null,
    page text,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists battle_client_events_event_idx
    on public.battle_client_events (event, created_at desc);

alter table public.battle_contests enable row level security;
alter table public.battle_entries enable row level security;
alter table public.battle_votes enable row level security;
alter table public.battle_results enable row level security;
alter table public.battle_activity_logs enable row level security;
alter table public.battle_reactions enable row level security;
alter table public.battle_reports enable row level security;
alter table public.battle_finalize_attempts enable row level security;
alter table public.battle_client_events enable row level security;

drop policy if exists "battle_contests_public_select" on public.battle_contests;
create policy "battle_contests_public_select"
on public.battle_contests for select
using (moderation_state = 'active');

-- Ensure battle_entries columns exist for idempotent migration
do $$ begin
    alter table public.battle_entries add column if not exists withdrawn_at timestamptz;
    alter table public.battle_entries add column if not exists moderation_state text not null default 'active';
    alter table public.battle_entries add column if not exists moderation_reason text;
    alter table public.battle_entries add column if not exists moderated_at timestamptz;
    alter table public.battle_entries add column if not exists moderated_by uuid;
exception when others then null;
end $$;

-- Ensure battle_votes columns exist
do $$ begin
    alter table public.battle_votes add column if not exists voter_user_id uuid;
    alter table public.battle_votes add column if not exists is_valid boolean not null default true;
    alter table public.battle_votes add column if not exists invalidated_at timestamptz;
    alter table public.battle_votes add column if not exists invalidated_by uuid;
    alter table public.battle_votes add column if not exists invalidated_reason text;
    alter table public.battle_votes add column if not exists ip_hash text;
    alter table public.battle_votes add column if not exists ua_hash text;
    alter table public.battle_votes add column if not exists risk_flags text[] not null default '{}'::text[];
exception when others then null;
end $$;

-- Ensure battle_reports columns exist
do $$ begin
    alter table public.battle_reports add column if not exists reporter_user_id uuid;
    alter table public.battle_reports add column if not exists resolution_note text;
    alter table public.battle_reports add column if not exists resolved_by uuid;
    alter table public.battle_reports add column if not exists resolved_at timestamptz;
exception when others then null;
end $$;

-- Ensure battle_reactions columns exist
do $$ begin
    alter table public.battle_reactions add column if not exists reaction text;
exception when others then null;
end $$;

drop policy if exists "battle_entries_public_select" on public.battle_entries;
create policy "battle_entries_public_select"
on public.battle_entries for select
using (
    withdrawn_at is null
    and moderation_state = 'active'
    and exists (
        select 1
        from public.battle_contests c
        where c.id = contest_id
          and c.moderation_state = 'active'
    )
);

drop policy if exists "battle_votes_own_select" on public.battle_votes;
create policy "battle_votes_own_select"
on public.battle_votes for select
using (auth.uid() = voter_user_id);

drop policy if exists "battle_results_public_select" on public.battle_results;
create policy "battle_results_public_select"
on public.battle_results for select
using (
    exists (
        select 1
        from public.battle_contests c
        where c.id = contest_id
          and c.moderation_state = 'active'
    )
);

drop policy if exists "battle_activity_logs_public_select" on public.battle_activity_logs;
create policy "battle_activity_logs_public_select"
on public.battle_activity_logs for select
using (
    exists (
        select 1
        from public.battle_contests c
        where c.id = contest_id
          and c.moderation_state = 'active'
    )
);

drop policy if exists "battle_reactions_public_select" on public.battle_reactions;
create policy "battle_reactions_public_select"
on public.battle_reactions for select
using (true);

drop policy if exists "battle_reports_own_select" on public.battle_reports;
create policy "battle_reports_own_select"
on public.battle_reports for select
using (auth.uid() = reporter_user_id);

drop policy if exists "battle_client_events_own_insert" on public.battle_client_events;
create policy "battle_client_events_own_insert"
on public.battle_client_events for insert
with check (auth.uid() = user_id or user_id is null);

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        begin
            alter publication supabase_realtime add table public.battle_activity_logs;
        exception when duplicate_object then
            null;
        end;
    end if;
end $$;

comment on table public.battle_contests is 'Style Battle contest master';
comment on table public.battle_entries is 'Style Battle entry submissions';
comment on table public.battle_votes is 'Style Battle vote records';
comment on table public.battle_results is 'Finalized result snapshots';
comment on table public.battle_activity_logs is 'Realtime and audit event stream for Style Battle';
