-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SR Step 5b — シフト表取り込み 保存パス schema（migration DRAFT）
--
-- 設計: docs/alter-plan-shift-code-dictionary-design.md / 画像取り込み製品化 Step 4-6
--       CEO 2026-05-30「保存パス（確認→反映）」トラック選択
--
-- 目的（2 点）:
--   1. external_anchor_sources.source_type CHECK に 'shift_image' を追加
--      （= 画像/PDF シフト表取り込み由来の勤務 anchor を ics/google/microsoft と区別して識別）
--   2. plan_day_indicators テーブル新設
--      （= 休み/希望休 の日レベル印。CEO 指示「休みは anchor でない」→ anchor と別経路で保存・描画）
--
-- 背景:
--   - 勤務(timed_event) → external_anchors（one_off, source_type 経由）。
--   - 休み(day_indicator H/BD) / 希望休(candidate HREQ) → 時間枠を作らず日レベル「休み」表示。
--     anchor 化すると /plan のタイムラインに枠ができてしまうため、専用テーブルに分離。
--   - lib/plan/shift/shiftImportAdapter.ts（Step 5a）の ShiftDayImportIndicator と 1:1 対応。
--
-- 不変原則 + hardening（GPT 指摘 5 点採用 + Claude 独自判断、CEO 2026-05-30/31）:
--   - source_type は DROP/ADD CHECK のみ（既存 row は全て新 CHECK を満たす → 影響なし）
--   - 【強化① owner 整合】plan_day_indicators(source_id, user_id) → external_anchor_sources(id, user_id)
--       の composite FK。source の owner と day_indicator の owner が同一であることを DB レベルで強制
--       （RLS だけに依存しない。プライバシー第一原則の物理層強制）。
--       前提として external_anchor_sources に UNIQUE(id, user_id) を追加。
--       ※ 既存 external_anchors.source_id は単純 FK で同じ gap あり → 本 migration 範囲外として別途記録。
--   - 【強化⑤ provenance】shift_image 由来は source_id 必須（CHECK: source_type='manual' OR source_id IS NOT NULL）。
--   - 【強化④ データ衛生】label 空文字/空白のみ禁止（CHECK: btrim(label) <> ''）。
--   - 【強化③ idempotent】policy は DROP IF EXISTS → CREATE。外部 UNIQUE/CHECK も DROP/ADD。
--       ※ plan_day_indicators 自体は CREATE TABLE IF NOT EXISTS（初回 apply 前提）。policy/外部制約まで再実行に耐える。
--   - UNIQUE(user_id, date) で 1 日 1 印。再取り込みは Step 6 repository で upsert=last-wins（将来「同日複数印」は要拡張）。
--   - 【強化② updated_at trigger は不採用】project に updated_at 用 trigger helper が無く、sibling external_anchors も
--       app 層で updated_at を管理。一貫性のため本テーブルも DEFAULT now() + Step 6 repository が UPDATE 時に更新
--       （本テーブルだけ一回限りの trigger 関数を導入する不整合を避ける）。
--
-- ★ 本 migration は **draft 状態**。`supabase db push` / apply は **CEO 別承認**。
--   staging 適用順: 既存 source_type migration（20260529120000 microsoft）の後に本 migration。
--
-- ☆ CEO 承認済（2026-05-31）: source_type='shift_image' 確定 / plan_day_indicators 別テーブル / kind off,off_request。
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. source_type CHECK に 'shift_image' 追加
--
-- 旧: 'manual','template','pdf','image','chat','ics','google_calendar','microsoft_calendar'
-- 新: 上記 + 'shift_image'
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE external_anchor_sources
  DROP CONSTRAINT IF EXISTS external_anchor_sources_source_type_check;

ALTER TABLE external_anchor_sources
  ADD CONSTRAINT external_anchor_sources_source_type_check
  CHECK (source_type IN (
    'manual', 'template', 'pdf', 'image', 'chat',
    'ics', 'google_calendar', 'microsoft_calendar', 'shift_image'
  ));

COMMENT ON COLUMN external_anchor_sources.source_type IS
  'manual / template / pdf / image / chat / ics / google_calendar / microsoft_calendar / shift_image (= SR 2026-05-30 追加、画像/PDF シフト表取り込み)';

-- composite FK の前提（強化①）: (id, user_id) UNIQUE。
-- id は PK なので (id, user_id) は自明に一意 → 既存 row 影響なし、composite FK が参照する index を付与するだけ。
ALTER TABLE external_anchor_sources
  DROP CONSTRAINT IF EXISTS external_anchor_sources_id_user_unique;
ALTER TABLE external_anchor_sources
  ADD CONSTRAINT external_anchor_sources_id_user_unique UNIQUE (id, user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. plan_day_indicators — 休み / 希望休 の日レベル印（anchor でない）
--
--    勤務は external_anchors（時間枠あり）。休みは時間枠を作らず、その日に
--    「休み / 希望休」を表示するだけ。よって anchor とは別テーブルで保存する。
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS plan_day_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 取り込み source trace（任意）。shift_image 由来は external_anchor_sources を指す。
  -- owner 整合 + ON DELETE CASCADE は下の composite FK（強化①）で担保。
  -- manual 由来など source が無い場合は NULL（MATCH SIMPLE で FK 検査スキップ）。
  source_id UUID,

  -- 対象日
  date DATE NOT NULL,

  -- off = 確定した休み（公休 H / BD 等） / off_request = 希望休（HREQ 等、未確定の申請段階）
  kind TEXT NOT NULL
    CHECK (kind IN ('off', 'off_request')),

  -- 表示ラベル（例「公休」「休み」「希望休」）。空文字/空白のみ禁止（強化④）。
  label TEXT NOT NULL
    CHECK (btrim(label) <> ''),

  -- 公休カウント対象か（off のみ意味を持つ。off_request は常に false）。月の公休数監査に使う。
  counts_as_public_holiday BOOLEAN NOT NULL DEFAULT FALSE,

  -- 原稿の表記（監査・逆引き用、任意）
  raw_code TEXT,
  semantic_type TEXT,

  -- 由来経路（shift_image = 画像取り込み / manual = 手動）
  source_type TEXT NOT NULL DEFAULT 'shift_image'
    CHECK (source_type IN ('shift_image', 'manual')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 1 日 1 印（再取り込みは Step 6 repository で upsert=last-wins）
  CONSTRAINT plan_day_indicators_user_date_unique UNIQUE (user_id, date),

  -- off_request は公休にしない（整合）
  CONSTRAINT plan_day_indicators_request_not_public CHECK (
    kind <> 'off_request' OR counts_as_public_holiday = FALSE
  ),

  -- 【強化⑤】取り込み由来（shift_image）は source trace を失わない。manual のみ source_id 省略可。
  CONSTRAINT plan_day_indicators_source_required CHECK (
    source_type = 'manual' OR source_id IS NOT NULL
  ),

  -- 【強化①】owner 整合: source_id が指す source は同一 user のもの（DB レベル強制、RLS に依存しない）。
  -- source_id NULL（manual）時は MATCH SIMPLE により FK 検査をスキップ。
  -- ON DELETE CASCADE: 取り込み source 削除で派生 day_indicator も原子的に削除（anchor と同じ）。
  CONSTRAINT plan_day_indicators_source_owner_fk
    FOREIGN KEY (source_id, user_id)
    REFERENCES external_anchor_sources (id, user_id)
    ON DELETE CASCADE
);

-- Indexes（UNIQUE(user_id, date) が Calendar 表示の主検索 index を兼ねる）
CREATE INDEX IF NOT EXISTS idx_plan_day_indicators_source
  ON plan_day_indicators (source_id);

-- RLS（user-scoped 完全分離）
ALTER TABLE plan_day_indicators ENABLE ROW LEVEL SECURITY;

-- 強化③: policy は DROP IF EXISTS → CREATE（途中 apply 失敗後の再実行に耐える）
DROP POLICY IF EXISTS "plan_day_indicators_owner_select" ON plan_day_indicators;
CREATE POLICY "plan_day_indicators_owner_select"
  ON plan_day_indicators FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "plan_day_indicators_owner_insert" ON plan_day_indicators;
CREATE POLICY "plan_day_indicators_owner_insert"
  ON plan_day_indicators FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "plan_day_indicators_owner_update" ON plan_day_indicators;
CREATE POLICY "plan_day_indicators_owner_update"
  ON plan_day_indicators FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "plan_day_indicators_owner_delete" ON plan_day_indicators;
CREATE POLICY "plan_day_indicators_owner_delete"
  ON plan_day_indicators FOR DELETE
  USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE plan_day_indicators IS
  '休み/希望休 の日レベル印（anchor でない）。勤務は external_anchors、休みは時間枠を作らず本テーブル。SR 2026-05-30。';
COMMENT ON COLUMN plan_day_indicators.kind IS
  'off = 確定した休み（公休 H / BD） / off_request = 希望休（HREQ 等、未確定）';
COMMENT ON COLUMN plan_day_indicators.counts_as_public_holiday IS
  'off のみ意味を持つ。月の公休数監査（countPublicHolidays）の保存先。off_request は常に false（CHECK）。';
COMMENT ON COLUMN plan_day_indicators.source_id IS
  'external_anchor_sources 参照（任意）。ON DELETE CASCADE で取り込み source 削除時に派生印も削除。';
