-- ─────────────────────────────────────────────
-- CoAlter handoff events (observability v1 — Phase A)
-- 2026-04-18
--
-- 目的:
--   bottom sheet 展開率 / 外部導線タップ率を provider 別に計測する。
--   「上映ページへ誘導できているか」「third_party と official のどちらが押されているか」を監査。
--
-- 1 ユーザー操作 = 1 行。session の終了依存なし。
-- ─────────────────────────────────────────────

create table if not exists public.coalter_handoff_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coalter_sessions(id) on delete cascade,

  -- 対象候補（ranked.candidateKey を受ける想定。free text）
  candidate_key text,

  -- イベント種別
  event_type text not null check (event_type in (
    'sheet_open',        -- bottom sheet を開いた
    'cta_tap',           -- 主 CTA ボタンをタップ
    'alternative_tap',   -- alternatives 枠をタップ
    'source_tap'         -- sources 出典をタップ
  )),

  -- テーマ (分析用、movie/food/...)
  theme text,

  -- 外部導線メタ (cta_tap / alternative_tap / source_tap 時のみ埋まる)
  provider_type text check (
    provider_type is null or
    provider_type in ('official', 'official_site', 'third_party')
  ),
  provider_name text,
  url text,
  label text,
  confidence text check (
    confidence is null or confidence in ('high', 'medium', 'low')
  ),

  -- 誰がタップしたか (A / B / unknown)
  actor_user_id uuid,

  created_at timestamptz not null default now()
);

create index if not exists coalter_handoff_events_session_idx
  on public.coalter_handoff_events(session_id);
create index if not exists coalter_handoff_events_event_type_idx
  on public.coalter_handoff_events(event_type);
create index if not exists coalter_handoff_events_provider_type_idx
  on public.coalter_handoff_events(provider_type);
create index if not exists coalter_handoff_events_created_at_idx
  on public.coalter_handoff_events(created_at desc);

-- RLS: admin dashboard / observability 用途。サービスロールのみ。
alter table public.coalter_handoff_events enable row level security;

create policy "service_role all access"
  on public.coalter_handoff_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.coalter_handoff_events is
  'CoAlter 外部導線ハンドオフのイベントログ (sheet open / CTA tap / alternatives / sources)。Phase A (2026-04-18) 追加。';
