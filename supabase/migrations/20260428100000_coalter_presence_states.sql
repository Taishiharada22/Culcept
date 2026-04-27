-- ─────────────────────────────────────────────────────────────────────────────
-- CoAlter Stage 4 L4-e — Presence states server 正本 schema
--
-- 正本: layout plan v0.3 §7.5 / runtime contract §2 全体 (shared state / server 正本)
--
-- 本 migration は **作成のみ、未実行**。Stage 4 L4-l flip 時に CEO 別審議で実行する
-- (本 file は spec 凍結が目的、`supabase db push` / `migration up` は L4-l まで禁止)。
--
-- 案 A (Supabase Realtime + RLS、CEO 確定 2026-04-28):
--   - DB 単体で 9 件 SharedState を保持 (runtime §2.1.1)
--   - Realtime channel `coalter:pair:{pair_id}` で broadcast
--   - RLS で pair_id 経由のメンバーのみ select/update 可
--   - server 単調 timestamp は server_timestamp (BIGSERIAL) で実装
--
-- ペア識別子は既存 coalter_pair_states (master §5) と FK 連携。
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. coalter_presence_states (ペア単位、shared state 9 件)
create table if not exists public.coalter_presence_states (
  pair_id uuid primary key references public.coalter_pair_states(pair_id) on delete cascade,

  -- 1. executor availability (master §5 / 統合契約 §2.1)
  availability text not null default 'inactive'
    check (availability in ('disabled', 'inactive', 'pending_consent', 'enabled', 'active')),

  -- 2. Presence 状態 (S0-S8、統合契約 §2.2)
  presence_state text not null default 'S0'
    check (presence_state in ('S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8')),

  -- 3. Action Mode (phase2 凍結、null 許可)
  action_mode text
    check (action_mode is null or action_mode in ('decision', 'negotiate', 'clarify')),

  -- 4. 発話本文カード (jsonb、SharedSpeechCard)
  speech_card jsonb,

  -- 5. chip tap 結果 (jsonb、SharedChipTap)
  last_chip_tap jsonb,

  -- 6. memorySurface は別 table (coalter_memory_items、L4-g で定義)、本 table では参照のみ。
  --    本 migration で memorySurface 列は持たず、JOIN または別 query で取得する。

  -- 7. 提案カード (jsonb、SharedProposalCard)
  proposal_card jsonb,

  -- 8. handoff 状態 (jsonb、SharedHandoffStatus)
  handoff_status jsonb,

  -- 9. mode (active セッション単位、v1.1 §5)
  mode text not null default 'normal'
    check (mode in ('normal', 'daily', 'travel')),

  -- server 単調 timestamp (§2.2 同時到着順序の調停用)
  server_timestamp bigint not null default 0,

  -- audit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.coalter_presence_states is
  'CoAlter Presence shared state (server 正本、runtime §2.1.1)。pair_id 単位。Realtime channel coalter:pair:{pair_id} で両 client に broadcast。';

-- 2. インデックス (server_timestamp での順序判定用)
create index if not exists idx_coalter_presence_states_server_timestamp
  on public.coalter_presence_states (pair_id, server_timestamp desc);

-- 3. updated_at 自動更新 trigger
create or replace function public.set_coalter_presence_states_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_coalter_presence_states_updated_at on public.coalter_presence_states;
create trigger trg_coalter_presence_states_updated_at
  before update on public.coalter_presence_states
  for each row execute function public.set_coalter_presence_states_updated_at();

-- 4. server_timestamp 自動 increment (broadcast の単調 timestamp、§2.2)
create or replace function public.bump_coalter_presence_states_server_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.server_timestamp := coalesce(old.server_timestamp, 0) + 1;
  return new;
end;
$$;

drop trigger if exists trg_coalter_presence_states_bump_ts on public.coalter_presence_states;
create trigger trg_coalter_presence_states_bump_ts
  before update on public.coalter_presence_states
  for each row execute function public.bump_coalter_presence_states_server_timestamp();

-- 5. RLS (pair_id 経由のペアメンバーのみ select/update 可)
alter table public.coalter_presence_states enable row level security;

-- 既存 coalter_pair_states に user_a_id / user_b_id 列がある前提 (master §5)
-- ペアメンバー判定 helper view (既存 schema 整合性のため、ない場合は per-policy で sub-query)
drop policy if exists "coalter_presence_states_select_pair_member" on public.coalter_presence_states;
create policy "coalter_presence_states_select_pair_member"
  on public.coalter_presence_states for select
  using (
    exists (
      select 1 from public.coalter_pair_states cps
      where cps.pair_id = coalter_presence_states.pair_id
        and (cps.user_a_id = auth.uid() or cps.user_b_id = auth.uid())
    )
  );

drop policy if exists "coalter_presence_states_update_pair_member" on public.coalter_presence_states;
create policy "coalter_presence_states_update_pair_member"
  on public.coalter_presence_states for update
  using (
    exists (
      select 1 from public.coalter_pair_states cps
      where cps.pair_id = coalter_presence_states.pair_id
        and (cps.user_a_id = auth.uid() or cps.user_b_id = auth.uid())
    )
  );

-- insert は server 側 service role 経由のみ (client 直接 insert を禁止、master §5 個別チャネル非許可)
drop policy if exists "coalter_presence_states_insert_service_only" on public.coalter_presence_states;
create policy "coalter_presence_states_insert_service_only"
  on public.coalter_presence_states for insert
  with check (false); -- 全 client insert 拒否、server 側 service_role bypass で挿入

-- 6. Realtime publication 登録 (Supabase Realtime に publication 追加)
-- NOTE: Supabase Studio または service_role で `alter publication supabase_realtime add table public.coalter_presence_states;` を実行する想定
-- 本 migration は table 定義のみ、publication 登録は Stage 4 L4-l 実行時に CEO 確認の上手動で行う
