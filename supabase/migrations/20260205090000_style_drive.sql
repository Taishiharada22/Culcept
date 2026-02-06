create table if not exists public.style_drive_votes (
    id bigserial primary key,
    drive_id text not null,
    card_id text not null,
    user_id uuid not null,
    vote smallint not null check (vote in (-1, 1)),
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create unique index if not exists style_drive_votes_unique
    on public.style_drive_votes (drive_id, card_id, user_id);

create index if not exists style_drive_votes_drive_idx
    on public.style_drive_votes (drive_id, card_id);

create table if not exists public.style_drive_battles (
    id uuid primary key default gen_random_uuid(),
    drive_id text not null,
    card_id text not null,
    challenger_drive_id text,
    challenger_card_id text,
    created_by uuid,
    status text default 'voting',
    created_at timestamptz default now()
);

create index if not exists style_drive_battles_drive_idx
    on public.style_drive_battles (drive_id, created_at desc);
