-- ============================================================
-- マッチング統合強化: Stargazer context profiles + 理想像 + 顔タイプ
-- ============================================================

-- ---------- Stargazer Context-Stratified Profiles ----------
-- per-subject 集計プロファイル（friends, romantic_partner, coworkers等ごとの軸スコア）

create table if not exists public.stargazer_context_profiles (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    context         text not null,  -- 'self' | 'friends' | 'romantic_partner' | 'family' | 'coworkers' | ...
    axis_scores     jsonb not null default '{}'::jsonb,  -- { "introvert_vs_extrovert": -0.3, ... }
    observation_count int not null default 0,
    last_updated_at timestamptz not null default now(),
    constraint uq_context_profile unique (user_id, context)
);

create index if not exists idx_ctx_profiles_user
    on public.stargazer_context_profiles (user_id);

-- ---------- カテゴリ別「理想の相手像」 ----------

create table if not exists public.rendezvous_ideal_partner_profiles (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    category        text not null,  -- romantic, friendship, cocreation, community, partner

    -- 求める性格特性（Stargazer軸ベース、重要度付き）
    -- { "introvert_vs_extrovert": { "preferred": 0.3, "importance": 0.8 }, ... }
    desired_traits  jsonb not null default '{}'::jsonb,

    -- 求める顔タイプ（ソフトブースト用）
    preferred_face_types text[] not null default '{}',

    -- 求める関係性の質
    -- { "intimacy": 0.8, "excitement": 0.3, "independence": 0.7, ... }
    relationship_qualities jsonb not null default '{}'::jsonb,

    -- 価値観一致の重要度（0-1）
    value_alignment_importance numeric(3,2) not null default 0.5,

    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint uq_ideal_profile unique (user_id, category)
);

create index if not exists idx_ideal_profiles_user
    on public.rendezvous_ideal_partner_profiles (user_id);

-- ---------- 顔タイプ分類結果キャッシュ ----------

create table if not exists public.face_type_classifications (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    primary_type    text not null,   -- lumiere, silhouette, prism, aurora, bloom, terre, ember, monolith
    secondary_type  text,
    structure_score numeric(4,3),    -- -1(straight) to +1(curved) 骨格軸
    impression_score numeric(4,3),   -- -1(fresh) to +1(deep) 印象軸
    warmth_score    numeric(4,3),    -- -1(cool) to +1(warm) 温度軸
    confidence      numeric(3,2) not null default 0.5,
    computed_at     timestamptz not null default now(),
    constraint uq_face_type unique (user_id)
);

-- ---------- RLS ----------

alter table public.stargazer_context_profiles enable row level security;
alter table public.rendezvous_ideal_partner_profiles enable row level security;
alter table public.face_type_classifications enable row level security;

-- Context profiles: 自分のみ閲覧、service_roleで更新
create policy "ctx_profiles_read" on public.stargazer_context_profiles
    for select using (auth.uid() = user_id);

-- Ideal partner profiles: 自分のみ
create policy "ideal_profiles_read" on public.rendezvous_ideal_partner_profiles
    for select using (auth.uid() = user_id);
create policy "ideal_profiles_insert" on public.rendezvous_ideal_partner_profiles
    for insert with check (auth.uid() = user_id);
create policy "ideal_profiles_update" on public.rendezvous_ideal_partner_profiles
    for update using (auth.uid() = user_id);

-- Face type: 自分のみ閲覧（マッチング時はservice_role経由）
create policy "face_type_read" on public.face_type_classifications
    for select using (auth.uid() = user_id);
