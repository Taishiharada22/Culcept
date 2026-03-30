-- ============================================================
-- Rendezvous Engagement Features A-H: Phase 1 (B + E)
-- Daily Topics, Topic Gallery, Prophecies
-- ============================================================

-- ---------- B: Daily Topics ----------

create table if not exists public.rendezvous_daily_topics (
    id              uuid primary key default gen_random_uuid(),
    topic_date      date not null,
    category        text not null default 'general',
    prompt_text     text not null,
    prompt_subtext  text,
    axis_id         text,                    -- stargazer trait axis used as seed
    generation_meta jsonb default '{}'::jsonb, -- full generation context
    created_at      timestamptz not null default now(),
    constraint uq_daily_topic_date_cat unique (topic_date, category)
);

create index if not exists idx_daily_topics_date
    on public.rendezvous_daily_topics (topic_date desc);

create table if not exists public.rendezvous_topic_answers (
    id          uuid primary key default gen_random_uuid(),
    topic_id    uuid not null references public.rendezvous_daily_topics(id) on delete cascade,
    user_id     uuid not null references auth.users(id) on delete cascade,
    answer_text text not null check (char_length(answer_text) between 1 and 500),
    category    text not null default 'general',
    created_at  timestamptz not null default now(),
    constraint uq_answer_per_topic_user unique (topic_id, user_id, category)
);

create index if not exists idx_topic_answers_topic
    on public.rendezvous_topic_answers (topic_id, created_at desc);

create table if not exists public.rendezvous_topic_likes (
    id          uuid primary key default gen_random_uuid(),
    answer_id   uuid not null references public.rendezvous_topic_answers(id) on delete cascade,
    liker_id    uuid not null references auth.users(id) on delete cascade,
    created_at  timestamptz not null default now(),
    constraint uq_like_per_answer_user unique (answer_id, liker_id)
);

create index if not exists idx_topic_likes_answer
    on public.rendezvous_topic_likes (answer_id);
create index if not exists idx_topic_likes_liker
    on public.rendezvous_topic_likes (liker_id);

-- ---------- E: Prophecies ----------

create table if not exists public.rendezvous_prophecies (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references auth.users(id) on delete cascade,
    prophecy_text     text not null,
    target_date       date not null,
    category          text,
    engineered_via    text,                        -- 'session' | 'topic' | 'mission' | 'constellation'
    engineered_params jsonb default '{}'::jsonb,
    state             text not null default 'active' check (state in ('active', 'fulfilled', 'expired')),
    fulfilled_at      timestamptz,
    verification_text text,
    created_at        timestamptz not null default now()
);

create index if not exists idx_prophecies_user_active
    on public.rendezvous_prophecies (user_id, state) where state = 'active';

-- ---------- Phase 2: Anonymous Sessions (A) ----------

create table if not exists public.rendezvous_sessions (
    id              uuid primary key default gen_random_uuid(),
    user_a          uuid not null references auth.users(id),
    user_b          uuid references auth.users(id),
    category        text not null,
    session_date    date not null default current_date,
    mode            text not null default 'text' check (mode in ('text', 'voice')),
    state           text not null default 'queued' check (state in ('queued', 'matched', 'active', 'ended')),
    started_at      timestamptz,
    ends_at         timestamptz,
    decision_a      text check (decision_a in ('again', 'pass')),
    decision_b      text check (decision_b in ('again', 'pass')),
    mutual_result   boolean,
    matched_candidate_id uuid,
    created_at      timestamptz not null default now()
);

create index if not exists idx_sessions_date_state
    on public.rendezvous_sessions (session_date, state);
create index if not exists idx_sessions_user_a
    on public.rendezvous_sessions (user_a);
create index if not exists idx_sessions_user_b
    on public.rendezvous_sessions (user_b);

create table if not exists public.rendezvous_session_messages (
    id          uuid primary key default gen_random_uuid(),
    session_id  uuid not null references public.rendezvous_sessions(id) on delete cascade,
    sender_id   uuid not null references auth.users(id),
    content     text not null,
    created_at  timestamptz not null default now()
);

create index if not exists idx_session_messages_session
    on public.rendezvous_session_messages (session_id, created_at);

-- ---------- Phase 3: Deepening Missions (F) + Collaborative Missions (C) ----------

create table if not exists public.rendezvous_deepening_missions (
    id              uuid primary key default gen_random_uuid(),
    candidate_id    uuid not null,
    day_number      int not null check (day_number >= 1),
    mission_type    text not null,  -- 'open_question' | 'guess' | 'voice' | 'meetup' | ...
    payload         jsonb not null default '{}'::jsonb,
    completed_by_a  boolean not null default false,
    completed_by_b  boolean not null default false,
    created_at      timestamptz not null default now(),
    constraint uq_deepening_day unique (candidate_id, day_number)
);

create table if not exists public.rendezvous_missions (
    id              uuid primary key default gen_random_uuid(),
    mission_type    text not null,  -- 'playlist' | 'story' | 'trip' | ...
    category        text not null,
    user_a          uuid not null references auth.users(id),
    user_b          uuid references auth.users(id),
    state           text not null default 'waiting' check (state in ('waiting', 'active', 'completed', 'expired')),
    payload         jsonb not null default '{}'::jsonb,
    progress        jsonb not null default '{}'::jsonb,
    decision_a      text,
    decision_b      text,
    mutual_result   boolean,
    matched_candidate_id uuid,
    starts_at       timestamptz,
    expires_at      timestamptz,
    created_at      timestamptz not null default now()
);

-- ---------- Phase 4: Constellations (G) + Games (D) ----------

create table if not exists public.rendezvous_constellations (
    id              uuid primary key default gen_random_uuid(),
    category        text not null,
    state           text not null default 'forming' check (state in ('forming', 'active', 'expired', 'kept')),
    member_ids      uuid[] not null,
    mission_payload jsonb,
    expires_at      timestamptz not null,
    created_at      timestamptz not null default now()
);

create table if not exists public.rendezvous_constellation_messages (
    id              uuid primary key default gen_random_uuid(),
    constellation_id uuid not null references public.rendezvous_constellations(id) on delete cascade,
    sender_id       uuid not null references auth.users(id),
    content         text not null,
    created_at      timestamptz not null default now()
);

create index if not exists idx_constellation_messages
    on public.rendezvous_constellation_messages (constellation_id, created_at);

create table if not exists public.rendezvous_constellation_decisions (
    id               uuid primary key default gen_random_uuid(),
    constellation_id uuid not null references public.rendezvous_constellations(id) on delete cascade,
    user_id          uuid not null references auth.users(id),
    keep_group       boolean not null default false,
    keep_individual_ids uuid[] not null default '{}',
    created_at       timestamptz not null default now(),
    constraint uq_constellation_decision unique (constellation_id, user_id)
);

create table if not exists public.rendezvous_game_sessions (
    id          uuid primary key default gen_random_uuid(),
    game_type   text not null,  -- 'dilemma' | 'trolley' | 'values_rank' | ...
    state       text not null default 'lobby' check (state in ('lobby', 'active', 'results', 'ended')),
    payload     jsonb not null default '{}'::jsonb,
    max_players int not null default 20,
    started_at  timestamptz,
    ended_at    timestamptz,
    created_at  timestamptz not null default now()
);

create table if not exists public.rendezvous_game_participants (
    id          uuid primary key default gen_random_uuid(),
    game_id     uuid not null references public.rendezvous_game_sessions(id) on delete cascade,
    user_id     uuid not null references auth.users(id),
    answers     jsonb not null default '[]'::jsonb,
    joined_at   timestamptz not null default now(),
    constraint uq_game_participant unique (game_id, user_id)
);

-- ---------- RLS (基本設定) ----------

alter table public.rendezvous_daily_topics enable row level security;
alter table public.rendezvous_topic_answers enable row level security;
alter table public.rendezvous_topic_likes enable row level security;
alter table public.rendezvous_prophecies enable row level security;
alter table public.rendezvous_sessions enable row level security;
alter table public.rendezvous_session_messages enable row level security;
alter table public.rendezvous_deepening_missions enable row level security;
alter table public.rendezvous_missions enable row level security;
alter table public.rendezvous_constellations enable row level security;
alter table public.rendezvous_constellation_messages enable row level security;
alter table public.rendezvous_constellation_decisions enable row level security;
alter table public.rendezvous_game_sessions enable row level security;
alter table public.rendezvous_game_participants enable row level security;

-- Daily topics: 誰でも閲覧可、service_role のみ作成
drop policy if exists "topics_read" on public.rendezvous_daily_topics;
create policy "topics_read" on public.rendezvous_daily_topics for select using (true);

-- Topic answers: 誰でも閲覧可（匿名ギャラリー）、自分のみ作成
drop policy if exists "answers_read" on public.rendezvous_topic_answers;
create policy "answers_read" on public.rendezvous_topic_answers for select using (true);
drop policy if exists "answers_insert" on public.rendezvous_topic_answers;
create policy "answers_insert" on public.rendezvous_topic_answers for insert with check (auth.uid() = user_id);

-- Topic likes: 自分のいいねは閲覧・作成可
drop policy if exists "likes_read" on public.rendezvous_topic_likes;
create policy "likes_read" on public.rendezvous_topic_likes for select using (auth.uid() = liker_id);
drop policy if exists "likes_insert" on public.rendezvous_topic_likes;
create policy "likes_insert" on public.rendezvous_topic_likes for insert with check (auth.uid() = liker_id);

-- Prophecies: 自分の予言のみ閲覧
drop policy if exists "prophecies_read" on public.rendezvous_prophecies;
create policy "prophecies_read" on public.rendezvous_prophecies for select using (auth.uid() = user_id);

-- Sessions: 参加者のみ閲覧
drop policy if exists "sessions_read" on public.rendezvous_sessions;
create policy "sessions_read" on public.rendezvous_sessions for select
    using (auth.uid() = user_a or auth.uid() = user_b);

-- Session messages: セッション参加者のみ
drop policy if exists "session_msgs_read" on public.rendezvous_session_messages;
create policy "session_msgs_read" on public.rendezvous_session_messages for select
    using (exists (
        select 1 from public.rendezvous_sessions s
        where s.id = session_id and (s.user_a = auth.uid() or s.user_b = auth.uid())
    ));
drop policy if exists "session_msgs_insert" on public.rendezvous_session_messages;
create policy "session_msgs_insert" on public.rendezvous_session_messages for insert
    with check (auth.uid() = sender_id);

-- Constellation messages: メンバーのみ
drop policy if exists "const_msgs_read" on public.rendezvous_constellation_messages;
create policy "const_msgs_read" on public.rendezvous_constellation_messages for select
    using (exists (
        select 1 from public.rendezvous_constellations c
        where c.id = constellation_id and auth.uid() = any(c.member_ids)
    ));
drop policy if exists "const_msgs_insert" on public.rendezvous_constellation_messages;
create policy "const_msgs_insert" on public.rendezvous_constellation_messages for insert
    with check (auth.uid() = sender_id);

-- Game sessions: 全員閲覧可
drop policy if exists "games_read" on public.rendezvous_game_sessions;
create policy "games_read" on public.rendezvous_game_sessions for select using (true);

-- Game participants: 自分の参加のみ
drop policy if exists "game_parts_read" on public.rendezvous_game_participants;
create policy "game_parts_read" on public.rendezvous_game_participants for select
    using (auth.uid() = user_id);
drop policy if exists "game_parts_insert" on public.rendezvous_game_participants;
create policy "game_parts_insert" on public.rendezvous_game_participants for insert
    with check (auth.uid() = user_id);

-- Deepening missions: service_role 管理 (チャットAPI経由)
-- Missions: 参加者のみ
drop policy if exists "missions_read" on public.rendezvous_missions;
create policy "missions_read" on public.rendezvous_missions for select
    using (auth.uid() = user_a or auth.uid() = user_b);

-- Constellations: メンバーのみ
drop policy if exists "constellations_read" on public.rendezvous_constellations;
create policy "constellations_read" on public.rendezvous_constellations for select
    using (auth.uid() = any(member_ids));

-- Constellation decisions: 自分のみ
drop policy if exists "const_decisions_read" on public.rendezvous_constellation_decisions;
create policy "const_decisions_read" on public.rendezvous_constellation_decisions for select
    using (auth.uid() = user_id);
drop policy if exists "const_decisions_insert" on public.rendezvous_constellation_decisions;
create policy "const_decisions_insert" on public.rendezvous_constellation_decisions for insert
    with check (auth.uid() = user_id);

-- Deepening missions: 関連candidate経由でのアクセスはAPI経由
drop policy if exists "deepening_read" on public.rendezvous_deepening_missions;
create policy "deepening_read" on public.rendezvous_deepening_missions for select using (true);
