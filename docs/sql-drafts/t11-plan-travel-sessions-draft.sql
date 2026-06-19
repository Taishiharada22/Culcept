-- ═══════════════════════════════════════════════════════════════════════════
-- DRAFT ONLY — DO NOT APPLY / DO NOT RESET / DO NOT GENERATE TYPES
-- ═══════════════════════════════════════════════════════════════════════════
-- B — SQL Draft（durable Travel session state・MVP 3 tables + owner-only RLS）
--
-- 設計正本: docs/t11-sql-rls-durable-travel-state-design.md（§7-13）
--           + pure 型 lib/shared/travel/travel-session-persistence-types.ts
--           + harness lib/shared/travel/travel-session-repository-harness.ts
--
-- ★ これは **review 用の draft**。`supabase/migrations/` に置かない（apply 候補にしない）。
--   apply / db reset / db push / supabase gen types は **CEO migration GO の別 GO**。
--   apply する時は staging-only・additive・rollback=新規 table DROP のみ。
--
-- 安全性（§13）: additive only・legacy table への ALTER/DROP なし・backfill なし・破壊操作なし・
--   trigger/function を追加しない（updated_at は writer が set）・production 前提なし。
--
-- 排除（authoritative/raw/display/action 列を一切持たない）:
--   AuthoritativePacketForServer / TravelPlanEngineOutput / DisplayPacketForClient /
--   PlanIntelligenceProjection / CoAlterProjectionCue / FitResult / diagnostics /
--   executionAuthority / booking / calendar / action / href / generatedUrl /
--   availability / price / route / weather。
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) plan_travel_sessions — session root（owner-owned travel intent）
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.plan_travel_sessions (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  -- 中立 status（authoritative/実行権限ではない）
  status        text not null check (status in ('draft', 'ready_snapshot')),
  visibility    text not null check (visibility in ('shared', 'private')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
  -- ★ authoritative packet / raw engine output / display / projection / cues / booking /
  --   calendar / action / executionAuthority 列は **持たない**（意図的欠落）。
);

create index if not exists plan_travel_sessions_owner_idx
  on public.plan_travel_sessions (owner_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) plan_travel_session_inputs — 構造化 confirmed/explicit input intent
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.plan_travel_session_inputs (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.plan_travel_sessions(id) on delete cascade,
  -- ★ MVP allowlist（red_line は HOLD＝private は別 owner-only table・本 draft に含めない）
  slot_key    text not null check (slot_key in (
                'destination_area', 'date_or_range', 'budget_band',
                'pace', 'mobility_tolerance', 'soft_preference', 'time_window'
              )),
  -- band/enum/areaText/descriptor のみ（raw axis score / raw chat / raw LLM / diagnostics を入れない）
  value       jsonb not null,
  slot_status text not null check (slot_status in ('confirmed', 'normalized')),
  fill_state  text not null check (fill_state in ('filled', 'partial', 'missing')),
  owner_kind  text not null check (owner_kind in ('shared', 'participant')),
  visibility  text not null check (visibility in ('shared', 'private')),
  -- 参照 id のみ（本文/raw を入れない）
  provenance  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
  -- ★ raw chat text / raw LLM output / raw M2・Stargazer dump / provider diagnostics /
  --   FitResult / display packet・projection・cues / href / generatedUrl / action authority は持たない。
);

create index if not exists plan_travel_session_inputs_session_idx
  on public.plan_travel_session_inputs (session_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) plan_travel_session_links — inert safe link metadata のみ
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.plan_travel_session_links (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references public.plan_travel_sessions(id) on delete cascade,
  -- ★ MVP allowlist（generated_maps_search は **含めない**＝recompute-only）
  source             text not null check (source in ('user_provided', 'manual_official', 'manual_maps')),
  -- inert 外部参照 value（href にしない・fetch しない・そのまま carry）
  external_reference text not null,
  -- ★ MVP 永続 row は generated=false（generated は recompute・永続しない）
  generated          boolean not null default false check (generated = false),
  -- ★ 常に inert
  inert              boolean not null default true check (inert = true),
  -- ★ static な表示適格（NOT analytics / NOT user behavior / NOT action・booking state）。`rendered` 列は持たない。
  renderable         boolean not null default true,
  eligibility        text not null check (eligibility in (
                       'eligible', 'ineligible_unconfirmed', 'ineligible_no_destination', 'invalid_url'
                     )),
  visibility         text not null check (visibility in ('shared', 'private')),
  provenance         jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
  -- ★ href / generatedUrl / fetched content / preview content / availability / price /
  --   route・weather・place live claim / booking・calendar・action 列は持たない。
);

create index if not exists plan_travel_session_links_session_idx
  on public.plan_travel_session_links (session_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) RLS — owner-only（auth.uid() = owner_user_id）・service_role 非前提・public access なし
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.plan_travel_sessions       enable row level security;
alter table public.plan_travel_session_inputs enable row level security;
alter table public.plan_travel_session_links  enable row level security;

-- sessions: owner-only CRUD
create policy plan_travel_sessions_select on public.plan_travel_sessions
  for select using (auth.uid() = owner_user_id);
create policy plan_travel_sessions_insert on public.plan_travel_sessions
  for insert with check (auth.uid() = owner_user_id);
create policy plan_travel_sessions_update on public.plan_travel_sessions
  for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create policy plan_travel_sessions_delete on public.plan_travel_sessions
  for delete using (auth.uid() = owner_user_id);

-- inputs: owning session の owner 経由でのみ（participant policy は participants table 承認まで HOLD）
create policy plan_travel_session_inputs_select on public.plan_travel_session_inputs
  for select using (exists (
    select 1 from public.plan_travel_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  ));
create policy plan_travel_session_inputs_insert on public.plan_travel_session_inputs
  for insert with check (exists (
    select 1 from public.plan_travel_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  ));
create policy plan_travel_session_inputs_update on public.plan_travel_session_inputs
  for update using (exists (
    select 1 from public.plan_travel_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  )) with check (exists (
    select 1 from public.plan_travel_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  ));
create policy plan_travel_session_inputs_delete on public.plan_travel_session_inputs
  for delete using (exists (
    select 1 from public.plan_travel_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  ));

-- links: owning session の owner 経由でのみ
create policy plan_travel_session_links_select on public.plan_travel_session_links
  for select using (exists (
    select 1 from public.plan_travel_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  ));
create policy plan_travel_session_links_insert on public.plan_travel_session_links
  for insert with check (exists (
    select 1 from public.plan_travel_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  ));
create policy plan_travel_session_links_update on public.plan_travel_session_links
  for update using (exists (
    select 1 from public.plan_travel_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  )) with check (exists (
    select 1 from public.plan_travel_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  ));
create policy plan_travel_session_links_delete on public.plan_travel_session_links
  for delete using (exists (
    select 1 from public.plan_travel_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════════════════════════════
-- HOLD（本 draft に含めない・別 GO）: plan_travel_session_participants（多人数）/
--   plan_travel_session_private_inputs（private red_line 等・owner-only 分離）/
--   plan_travel_session_entities / plan_travel_session_display_cache（display は recompute）。
-- ═══════════════════════════════════════════════════════════════════════════
