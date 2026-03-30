-- ============================================================
-- Orbiter Phase 2: Signal Collection + User Model Tables
-- AIアドバイザー基盤としての行動シグナル蓄積・ユーザーモデル
-- ============================================================

-- ────────────────────────────────────────────
-- 1. orbiter_signals (行動シグナル蓄積)
-- ────────────────────────────────────────────

create table if not exists public.orbiter_signals (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    candidate_id    uuid not null references public.rendezvous_candidates(id) on delete cascade,
    signal_type     text not null,
    payload         jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),

    constraint orbiter_signals_type_check check (
        signal_type in (
            'detail_view', 'detail_view_end', 'like', 'pass',
            'revisit', 'chat_message_sent', 'reflection_submitted'
        )
    )
);

create index if not exists idx_orbiter_signals_user
    on public.orbiter_signals (user_id, created_at desc);

create index if not exists idx_orbiter_signals_candidate
    on public.orbiter_signals (candidate_id, signal_type);

create index if not exists idx_orbiter_signals_type
    on public.orbiter_signals (signal_type, created_at desc);

comment on table public.orbiter_signals is 'Orbiter行動シグナル: 閲覧時間、判断速度、再訪問、チャット活動';

-- RLS
alter table public.orbiter_signals enable row level security;

create policy "orbiter_signals_insert_own"
    on public.orbiter_signals for insert
    with check (auth.uid() = user_id);

create policy "orbiter_signals_select_own"
    on public.orbiter_signals for select
    using (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- 2. orbiter_reflections (対話後リフレクション)
-- ────────────────────────────────────────────

create table if not exists public.orbiter_reflections (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    candidate_id    uuid not null references public.rendezvous_candidates(id) on delete cascade,
    reflection_type text not null default 'chat_phase',
    answers         jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),

    constraint orbiter_reflections_type_check check (
        reflection_type in ('pre_meeting', 'post_meeting', 'chat_phase')
    )
);

create index if not exists idx_orbiter_reflections_user
    on public.orbiter_reflections (user_id, created_at desc);

create index if not exists idx_orbiter_reflections_candidate
    on public.orbiter_reflections (candidate_id);

comment on table public.orbiter_reflections is 'Orbiterリフレクション: 対話後の内省データ (自然体だった？エネルギーは？)';

alter table public.orbiter_reflections enable row level security;

create policy "orbiter_reflections_select_own"
    on public.orbiter_reflections for select
    using (auth.uid() = user_id);

create policy "orbiter_reflections_insert_own"
    on public.orbiter_reflections for insert
    with check (auth.uid() = user_id);

create policy "orbiter_reflections_update_own"
    on public.orbiter_reflections for update
    using (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- 3. orbiter_attraction_patterns (魅力4層モデル)
-- ────────────────────────────────────────────

create table if not exists public.orbiter_attraction_patterns (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    layer           text not null default 'instant',
    top_axes        jsonb not null default '[]'::jsonb,
    pattern         text not null default 'mixed',
    sample_count    int not null default 0,
    confidence      numeric(3,2) not null default 0.00,
    updated_at      timestamptz not null default now(),

    constraint orbiter_attraction_layer_check check (
        layer in ('stated', 'instant', 'sustained', 'healthy')
    ),
    constraint orbiter_attraction_pattern_check check (
        pattern in ('similar', 'complementary', 'mixed')
    ),
    constraint orbiter_attraction_unique unique (user_id, layer)
);

create index if not exists idx_orbiter_attraction_user
    on public.orbiter_attraction_patterns (user_id);

comment on table public.orbiter_attraction_patterns is 'Orbiter魅力パターン: 申告/直感/持続/健全の4層別の軸別傾向';

alter table public.orbiter_attraction_patterns enable row level security;

create policy "orbiter_attraction_select_own"
    on public.orbiter_attraction_patterns for select
    using (auth.uid() = user_id);

-- Write via admin only (computed server-side by recompute endpoint)

-- ────────────────────────────────────────────
-- 4. orbiter_breakpoint_triggers (個人固有の破綻トリガー)
-- ────────────────────────────────────────────

create table if not exists public.orbiter_breakpoint_triggers (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    caution_code    text not null,
    sensitivity     numeric(3,2) not null default 0.50,
    historical_outcome text not null default 'unknown',
    sample_count    int not null default 0,
    updated_at      timestamptz not null default now(),

    constraint orbiter_breakpoint_outcome_check check (
        historical_outcome in ('pass', 'like_then_stale', 'like_successful', 'unknown')
    ),
    constraint orbiter_breakpoint_unique unique (user_id, caution_code)
);

create index if not exists idx_orbiter_breakpoint_user
    on public.orbiter_breakpoint_triggers (user_id);

comment on table public.orbiter_breakpoint_triggers is 'Orbiterブレークポイント: ユーザー別caution_codeの敏感度と過去の結果';

alter table public.orbiter_breakpoint_triggers enable row level security;

create policy "orbiter_breakpoint_select_own"
    on public.orbiter_breakpoint_triggers for select
    using (auth.uid() = user_id);

-- Write via admin only (computed server-side by recompute endpoint)
