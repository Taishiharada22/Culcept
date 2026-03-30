-- ============================================================
-- Rendezvous: アバター先行型接続機能
-- 分身同士が先に出会い、相互成立した接続だけを本人に届ける
-- ============================================================

-- ────────────────────────────────────────────
-- 1. rendezvous_profiles（参加設定）
-- ────────────────────────────────────────────

create table if not exists public.rendezvous_profiles (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    is_enabled      boolean not null default false,
    is_paused       boolean not null default false,
    display_name    text,
    avatar_asset_url text,
    avatar_version  int not null default 1,
    primary_category text not null default 'friendship',
    enabled_categories jsonb not null default '["friendship"]'::jsonb,
    visibility_scope text not null default 'all',
    notification_enabled boolean not null default true,
    notification_delay_mode text not null default 'standard',
    notification_delay_min_minutes int not null default 180,
    notification_delay_max_minutes int not null default 720,
    show_in_home    boolean not null default true,
    public_mood_summary text,
    public_style_summary text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint rendezvous_profiles_user_unique unique (user_id),
    constraint rendezvous_profiles_primary_category_check check (
        primary_category in ('romantic', 'friendship', 'cocreation', 'community')
    ),
    constraint rendezvous_profiles_visibility_check check (
        visibility_scope in ('all', 'limited', 'event_only')
    ),
    constraint rendezvous_profiles_delay_mode_check check (
        notification_delay_mode in ('standard', 'slow', 'custom')
    )
);

create index if not exists idx_rendezvous_profiles_user
    on public.rendezvous_profiles (user_id);

create index if not exists idx_rendezvous_profiles_enabled
    on public.rendezvous_profiles (is_enabled, is_paused);

comment on table public.rendezvous_profiles is 'Rendezvous参加設定（アバター・カテゴリ・通知）';

-- ────────────────────────────────────────────
-- 2. rendezvous_preferences（求める方向性）
-- ────────────────────────────────────────────

create table if not exists public.rendezvous_preferences (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    desired_relation_types jsonb not null default '["friendship"]'::jsonb,
    communication_style text,
    pace_preference text,
    distance_preference text,
    depth_preference text,
    stability_vs_stimulation numeric(3,2) default 0.50,
    similarity_vs_complementarity numeric(3,2) default 0.20,
    initiative_preference text,
    emotional_expression_preference text,
    conflict_resolution_preference text,
    excluded_relation_types jsonb not null default '[]'::jsonb,
    excluded_traits jsonb not null default '[]'::jsonb,
    matching_vector jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint rendezvous_preferences_user_unique unique (user_id),
    constraint rendezvous_preferences_stab_check check (
        stability_vs_stimulation >= 0 and stability_vs_stimulation <= 1
    ),
    constraint rendezvous_preferences_sim_check check (
        similarity_vs_complementarity >= 0 and similarity_vs_complementarity <= 1
    )
);

create index if not exists idx_rendezvous_preferences_user
    on public.rendezvous_preferences (user_id);

comment on table public.rendezvous_preferences is 'Rendezvous求める方向性・評価条件（matching_vector含む）';

-- ────────────────────────────────────────────
-- 3. encounter_events（接触トリガー）
-- ────────────────────────────────────────────

create table if not exists public.encounter_events (
    id                  uuid primary key default gen_random_uuid(),
    user_a              uuid not null references auth.users(id) on delete cascade,
    user_b              uuid not null references auth.users(id) on delete cascade,
    trigger_type        text not null default 'manual_seed',
    context_type        text,
    coarse_context      text,
    occurred_at         timestamptz not null default now(),
    evaluation_status   text not null default 'pending',
    evaluated_at        timestamptz,
    candidate_generated boolean not null default false,
    candidate_id        uuid,
    raw_signal_score    numeric(4,3),
    created_at          timestamptz not null default now(),

    constraint encounter_events_trigger_check check (
        trigger_type in (
            'physical_proximity', 'event_overlap', 'community_overlap',
            'place_overlap', 'schedule_overlap', 'manual_seed', 'system_retest'
        )
    ),
    constraint encounter_events_eval_status_check check (
        evaluation_status in (
            'pending', 'evaluating', 'not_eligible', 'not_mutual',
            'candidate_created', 'suppressed', 'failed'
        )
    ),
    constraint encounter_events_user_order check (user_a < user_b)
);

create index if not exists idx_encounter_events_pending
    on public.encounter_events (evaluation_status)
    where evaluation_status = 'pending';

create index if not exists idx_encounter_events_pair
    on public.encounter_events (user_a, user_b);

comment on table public.encounter_events is '分身同士の接触トリガー記録（内部用・UIに非公開）';

-- ────────────────────────────────────────────
-- 4. rendezvous_candidates（相互成立候補）
-- ────────────────────────────────────────────

create table if not exists public.rendezvous_candidates (
    id              uuid primary key default gen_random_uuid(),
    user_a          uuid not null references auth.users(id) on delete cascade,
    user_b          uuid not null references auth.users(id) on delete cascade,
    source_event_id uuid references public.encounter_events(id) on delete set null,
    category        text not null,
    a_to_b_score    numeric(4,3) not null,
    b_to_a_score    numeric(4,3) not null,
    overall_score   numeric(4,3) not null,
    reason_codes    jsonb not null default '[]'::jsonb,
    reason_texts    jsonb not null default '[]'::jsonb,
    caution_codes   jsonb not null default '[]'::jsonb,
    caution_texts   jsonb not null default '[]'::jsonb,
    label           text,
    state           text not null default 'candidate_generated',
    delivered_at    timestamptz,
    expires_at      timestamptz,
    matched_at      timestamptz,
    chat_opened_at  timestamptz,
    suppressed_until timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint rendezvous_candidates_category_check check (
        category in ('romantic', 'friendship', 'cocreation', 'community')
    ),
    constraint rendezvous_candidates_state_check check (
        state in (
            'candidate_generated', 'delivered', 'a_liked', 'b_liked',
            'mutual_liked', 'chat_opened', 'expired', 'dismissed'
        )
    ),
    constraint rendezvous_candidates_scores_check check (
        a_to_b_score >= 0 and a_to_b_score <= 1
        and b_to_a_score >= 0 and b_to_a_score <= 1
        and overall_score >= 0 and overall_score <= 1
    ),
    constraint rendezvous_candidates_user_order check (user_a < user_b)
);

create index if not exists idx_rendezvous_candidates_user_a
    on public.rendezvous_candidates (user_a, state);

create index if not exists idx_rendezvous_candidates_user_b
    on public.rendezvous_candidates (user_b, state);

create index if not exists idx_rendezvous_candidates_pair
    on public.rendezvous_candidates (user_a, user_b);

create index if not exists idx_rendezvous_candidates_state
    on public.rendezvous_candidates (state)
    where state not in ('expired', 'dismissed');

create index if not exists idx_rendezvous_candidates_expires
    on public.rendezvous_candidates (expires_at)
    where state not in ('expired', 'dismissed', 'chat_opened');

comment on table public.rendezvous_candidates is 'Rendezvous相互成立候補（成立時のみ作成）';

-- ────────────────────────────────────────────
-- 5. rendezvous_user_states（ユーザー視点状態）
-- ────────────────────────────────────────────

create table if not exists public.rendezvous_user_states (
    id              uuid primary key default gen_random_uuid(),
    candidate_id    uuid not null references public.rendezvous_candidates(id) on delete cascade,
    user_id         uuid not null references auth.users(id) on delete cascade,
    state           text not null default 'unseen',
    seen_at         timestamptz,
    liked_at        timestamptz,
    passed_at       timestamptz,
    saved_at        timestamptz,
    muted_at        timestamptz,
    dismissed_at    timestamptz,
    last_notified_at timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint rendezvous_user_states_unique unique (candidate_id, user_id),
    constraint rendezvous_user_states_state_check check (
        state in ('unseen', 'seen', 'liked', 'passed', 'saved', 'muted', 'expired')
    )
);

create index if not exists idx_rendezvous_user_states_user
    on public.rendezvous_user_states (user_id, state);

create index if not exists idx_rendezvous_user_states_candidate
    on public.rendezvous_user_states (candidate_id);

comment on table public.rendezvous_user_states is 'Rendezvous候補に対する各ユーザーの閲覧・応答状態';

-- ────────────────────────────────────────────
-- 6. rendezvous_chats（双Like後チャット）
-- ────────────────────────────────────────────

create table if not exists public.rendezvous_chats (
    id              uuid primary key default gen_random_uuid(),
    candidate_id    uuid not null references public.rendezvous_candidates(id) on delete cascade,
    thread_id       uuid not null,
    opened_by_user_id uuid references auth.users(id) on delete set null,
    opened_at       timestamptz not null default now(),
    created_at      timestamptz not null default now(),

    constraint rendezvous_chats_candidate_unique unique (candidate_id)
);

create index if not exists idx_rendezvous_chats_thread
    on public.rendezvous_chats (thread_id);

comment on table public.rendezvous_chats is 'Rendezvous双Like成立後のチャットスレッド対応';

-- ────────────────────────────────────────────
-- 7. rendezvous_blocks（完全ブロック）
-- ────────────────────────────────────────────

create table if not exists public.rendezvous_blocks (
    id              uuid primary key default gen_random_uuid(),
    blocker_user_id uuid not null references auth.users(id) on delete cascade,
    blocked_user_id uuid not null references auth.users(id) on delete cascade,
    reason          text,
    created_at      timestamptz not null default now(),

    constraint rendezvous_blocks_unique unique (blocker_user_id, blocked_user_id)
);

create index if not exists idx_rendezvous_blocks_blocker
    on public.rendezvous_blocks (blocker_user_id);

create index if not exists idx_rendezvous_blocks_blocked
    on public.rendezvous_blocks (blocked_user_id);

comment on table public.rendezvous_blocks is 'Rendezvousブロック関係（双方向遮断）';

-- ────────────────────────────────────────────
-- 8. rendezvous_reports（通報）
-- ────────────────────────────────────────────

create table if not exists public.rendezvous_reports (
    id              uuid primary key default gen_random_uuid(),
    reporter_user_id uuid not null references auth.users(id) on delete cascade,
    target_user_id  uuid not null references auth.users(id) on delete cascade,
    candidate_id    uuid references public.rendezvous_candidates(id) on delete set null,
    reason_code     text not null,
    detail          text,
    reviewed        boolean not null default false,
    created_at      timestamptz not null default now(),

    constraint rendezvous_reports_reason_check check (
        reason_code in (
            'unsafe_behavior', 'harassment', 'impersonation',
            'spam', 'sexual_misconduct', 'hate_or_abuse', 'other'
        )
    )
);

create index if not exists idx_rendezvous_reports_target
    on public.rendezvous_reports (target_user_id);

comment on table public.rendezvous_reports is 'Rendezvous通報履歴（管理レビュー対象）';

-- ────────────────────────────────────────────
-- 9. rendezvous_suppressions（再出現抑止）
-- ────────────────────────────────────────────

create table if not exists public.rendezvous_suppressions (
    id              uuid primary key default gen_random_uuid(),
    user_low        uuid not null references auth.users(id) on delete cascade,
    user_high       uuid not null references auth.users(id) on delete cascade,
    suppression_type text not null,
    until_at        timestamptz,
    reason_code     text,
    created_at      timestamptz not null default now(),

    constraint rendezvous_suppressions_type_check check (
        suppression_type in (
            'pass_cooldown', 'expired_cooldown', 'hide_forever',
            'report_review_hold', 'safety_hold', 'duplicate_hold'
        )
    ),
    constraint rendezvous_suppressions_user_order check (user_low < user_high)
);

create index if not exists idx_rendezvous_suppressions_pair
    on public.rendezvous_suppressions (user_low, user_high);

create index if not exists idx_rendezvous_suppressions_until
    on public.rendezvous_suppressions (until_at)
    where until_at is not null;

comment on table public.rendezvous_suppressions is 'Rendezvous再出現抑止（ペア単位、正規化キー）';

-- ────────────────────────────────────────────
-- 10. rendezvous_notifications（通知ログ）
-- ────────────────────────────────────────────

create table if not exists public.rendezvous_notifications (
    id              uuid primary key default gen_random_uuid(),
    candidate_id    uuid not null references public.rendezvous_candidates(id) on delete cascade,
    user_id         uuid not null references auth.users(id) on delete cascade,
    notification_type text not null,
    scheduled_for   timestamptz not null,
    sent_at         timestamptz,
    status          text not null default 'pending',
    created_at      timestamptz not null default now(),

    constraint rendezvous_notifications_type_check check (
        notification_type in (
            'new_candidate', 'waiting_response', 'mutual_like',
            'chat_opened', 'reminder'
        )
    ),
    constraint rendezvous_notifications_status_check check (
        status in ('pending', 'sent', 'skipped', 'cancelled')
    )
);

create index if not exists idx_rendezvous_notifications_pending
    on public.rendezvous_notifications (scheduled_for, status)
    where status = 'pending';

create index if not exists idx_rendezvous_notifications_user
    on public.rendezvous_notifications (user_id);

comment on table public.rendezvous_notifications is 'Rendezvous遅延通知スケジュール・送信ログ';

-- ────────────────────────────────────────────
-- 11. rendezvous_candidate_logs（内部監査）
-- ────────────────────────────────────────────

create table if not exists public.rendezvous_candidate_logs (
    id              bigint generated always as identity primary key,
    candidate_id    uuid references public.rendezvous_candidates(id) on delete set null,
    event_type      text not null,
    payload         jsonb not null default '{}',
    created_at      timestamptz not null default now()
);

create index if not exists idx_rendezvous_candidate_logs_candidate
    on public.rendezvous_candidate_logs (candidate_id);

create index if not exists idx_rendezvous_candidate_logs_event
    on public.rendezvous_candidate_logs (event_type, created_at desc);

comment on table public.rendezvous_candidate_logs is 'Rendezvous候補生成・状態遷移の内部監査ログ';

-- ────────────────────────────────────────────
-- 12. updated_at トリガー
-- ────────────────────────────────────────────

create or replace function public.set_rendezvous_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger rendezvous_profiles_updated_at
    before update on public.rendezvous_profiles
    for each row execute function public.set_rendezvous_updated_at();

create trigger rendezvous_preferences_updated_at
    before update on public.rendezvous_preferences
    for each row execute function public.set_rendezvous_updated_at();

create trigger rendezvous_candidates_updated_at
    before update on public.rendezvous_candidates
    for each row execute function public.set_rendezvous_updated_at();

create trigger rendezvous_user_states_updated_at
    before update on public.rendezvous_user_states
    for each row execute function public.set_rendezvous_updated_at();

-- ────────────────────────────────────────────
-- 13. RLS（Row-Level Security）
-- ────────────────────────────────────────────

alter table public.rendezvous_profiles enable row level security;
alter table public.rendezvous_preferences enable row level security;
alter table public.encounter_events enable row level security;
alter table public.rendezvous_candidates enable row level security;
alter table public.rendezvous_user_states enable row level security;
alter table public.rendezvous_chats enable row level security;
alter table public.rendezvous_blocks enable row level security;
alter table public.rendezvous_reports enable row level security;
alter table public.rendezvous_suppressions enable row level security;
alter table public.rendezvous_notifications enable row level security;
alter table public.rendezvous_candidate_logs enable row level security;

-- profiles: 自分のみ
create policy "rendezvous_profiles_select_own"
    on public.rendezvous_profiles for select
    using (auth.uid() = user_id);

create policy "rendezvous_profiles_insert_own"
    on public.rendezvous_profiles for insert
    with check (auth.uid() = user_id);

create policy "rendezvous_profiles_update_own"
    on public.rendezvous_profiles for update
    using (auth.uid() = user_id);

-- preferences: 自分のみ（センシティブ）
create policy "rendezvous_preferences_select_own"
    on public.rendezvous_preferences for select
    using (auth.uid() = user_id);

create policy "rendezvous_preferences_insert_own"
    on public.rendezvous_preferences for insert
    with check (auth.uid() = user_id);

create policy "rendezvous_preferences_update_own"
    on public.rendezvous_preferences for update
    using (auth.uid() = user_id);

-- encounter_events: server only（ユーザーにはRLS経由で非公開）
-- Internal APIのみ service role で操作する

-- candidates: 自分が関与するもののみ
create policy "rendezvous_candidates_select_own"
    on public.rendezvous_candidates for select
    using (auth.uid() = user_a or auth.uid() = user_b);

-- user_states: 自分のもののみ（相手のstateは不可視）
create policy "rendezvous_user_states_select_own"
    on public.rendezvous_user_states for select
    using (auth.uid() = user_id);

create policy "rendezvous_user_states_update_own"
    on public.rendezvous_user_states for update
    using (auth.uid() = user_id);

-- chats: 関連candidateに紐づくユーザーのみ
create policy "rendezvous_chats_select_own"
    on public.rendezvous_chats for select
    using (
        exists (
            select 1 from public.rendezvous_candidates c
            where c.id = candidate_id
            and (c.user_a = auth.uid() or c.user_b = auth.uid())
        )
    );

-- blocks: 自分が作ったもののみ
create policy "rendezvous_blocks_select_own"
    on public.rendezvous_blocks for select
    using (auth.uid() = blocker_user_id);

create policy "rendezvous_blocks_insert_own"
    on public.rendezvous_blocks for insert
    with check (auth.uid() = blocker_user_id);

-- reports: 自分が作ったもののみ
create policy "rendezvous_reports_select_own"
    on public.rendezvous_reports for select
    using (auth.uid() = reporter_user_id);

create policy "rendezvous_reports_insert_own"
    on public.rendezvous_reports for insert
    with check (auth.uid() = reporter_user_id);

-- notifications: 自分宛のみ
create policy "rendezvous_notifications_select_own"
    on public.rendezvous_notifications for select
    using (auth.uid() = user_id);

-- suppressions / candidate_logs: server only
-- Internal APIのみ service role で操作する
