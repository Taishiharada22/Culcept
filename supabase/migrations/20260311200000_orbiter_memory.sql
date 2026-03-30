-- ============================================================
-- Orbiter Memory: 内的独白の永続化
-- Orbiterが「覚えている存在」になるための基盤
-- ============================================================

-- orbiter_memos — Orbiterの内的独白
-- セラピストがセッション後にノートを書くのと同じ。
-- 観察→仮説→質問→修正のサイクルを記録する。
create table if not exists public.orbiter_memos (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    candidate_id    uuid not null references public.rendezvous_candidates(id) on delete cascade,
    memo_type       text not null,
    content         text not null,
    confidence      numeric(3,2) not null default 0.50,
    linked_memo_id  uuid references public.orbiter_memos(id) on delete set null,
    metadata        jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    constraint orbiter_memos_type_check check (
        memo_type in ('observation', 'hypothesis', 'question', 'revision', 'milestone')
    )
);

-- Index: ユーザー×候補者の最新メモを高速取得
create index idx_orbiter_memos_user_candidate
    on public.orbiter_memos (user_id, candidate_id, created_at desc);

-- Index: メモタイプで絞り込み
create index idx_orbiter_memos_type
    on public.orbiter_memos (user_id, memo_type, created_at desc);

-- RLS
alter table public.orbiter_memos enable row level security;

-- ユーザーは自分のメモのみ参照可能 (insert はサーバー側のみ)
create policy "orbiter_memos_select_own"
    on public.orbiter_memos for select
    using (auth.uid() = user_id);

-- サービスロール (supabaseAdmin) は全操作可能
-- (デフォルトでservice_roleはRLSをバイパスするため、追加ポリシー不要)

-- Comment
comment on table public.orbiter_memos is
    'Orbiterの内的独白。観察・仮説・質問・修正・マイルストーンを記録し、記憶に基づく発言を可能にする';
comment on column public.orbiter_memos.memo_type is
    'observation=行動観察, hypothesis=仮説, question=次の観察ポイント, revision=仮説修正, milestone=節目';
comment on column public.orbiter_memos.linked_memo_id is
    'revision時に修正対象のメモを指す。メモ間の因果関係を保持する';
comment on column public.orbiter_memos.confidence is
    'この思考の確度 0.00-1.00。データ量と一致度に基づく';
