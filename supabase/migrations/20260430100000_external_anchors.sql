-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Alter Plan: ExternalAnchor + ExternalAnchorSource 物理モデル
-- Wave 1 / W1-3 — migration draft (NOT for production push)
--
-- 設計書: docs/alter-plan-foundation-design.md
--   - §2.0 不変原則（Anchor / Seed の境界）
--   - §2.1 ExternalAnchor (discriminated union: one_off | recurring)
--   - §11 Privacy & Source Trace
--   - §12 Validity / Exceptions Model
--
-- 不変原則の物理層強制:
--   1. 未確認データは保存不可（confirmed_at NOT NULL）
--   2. discriminated union（CHECK 制約で one_off / recurring の排他）
--   3. raw retention の整合（rawRetention=discarded ↔ path/expires NULL）
--   4. validity 論理（valid_until >= valid_from）
--   5. source 単位削除（ON DELETE CASCADE）
--   6. RLS による user-scoped 完全分離
--
-- 本 migration は **draft 状態**。`supabase db push` は CEO 承認後。
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. external_anchor_sources
--    1 source（1 PDF / 1 会話発話 / 1 テンプレ）の trace。
--    1 source → N anchors（source 単位削除を成立させる正規化）。
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS external_anchor_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 入力経路
  source_type TEXT NOT NULL
    CHECK (source_type IN ('manual', 'template', 'pdf', 'image', 'chat')),

  -- PDF / 画像時のみ保持される元ファイル名（trace 用、生データ本体ではない）
  original_filename TEXT,

  -- 抽出時刻（PDF / 画像 / chat 時）
  extracted_at TIMESTAMPTZ,

  -- ソース取り込み時刻
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- raw 保持方針（§11.1）。default は破棄
  raw_retention TEXT NOT NULL DEFAULT 'discarded'
    CHECK (raw_retention IN ('discarded', 'stored')),

  -- stored 時のみ設定される。Supabase Storage の user-scoped bucket 配下
  raw_storage_path TEXT,

  -- stored 時の自動失効日（ユーザー指定、default 30 日は API 層）
  raw_expires_at TIMESTAMPTZ,

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- raw_retention と path / expires の整合
  -- discarded → path も expires も NULL
  -- stored    → path も expires も NOT NULL
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CONSTRAINT raw_retention_integrity CHECK (
    (raw_retention = 'discarded'
      AND raw_storage_path IS NULL
      AND raw_expires_at IS NULL)
    OR
    (raw_retention = 'stored'
      AND raw_storage_path IS NOT NULL
      AND raw_expires_at IS NOT NULL)
  )
);

-- Indexes
CREATE INDEX idx_external_anchor_sources_user_captured
  ON external_anchor_sources (user_id, captured_at DESC);

-- stored だけを対象にした partial index（期限切れ raw の sweep 用）
CREATE INDEX idx_external_anchor_sources_stored_expiry
  ON external_anchor_sources (user_id, raw_expires_at)
  WHERE raw_retention = 'stored';

-- RLS
ALTER TABLE external_anchor_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "external_anchor_sources_owner_select"
  ON external_anchor_sources FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "external_anchor_sources_owner_insert"
  ON external_anchor_sources FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "external_anchor_sources_owner_update"
  ON external_anchor_sources FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "external_anchor_sources_owner_delete"
  ON external_anchor_sources FOR DELETE
  USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE external_anchor_sources IS
  'Source trace for ExternalAnchor (1 PDF / 1 chat / 1 template = 1 source). 1:N to external_anchors. See docs/alter-plan-foundation-design.md §2.1, §11.2';
COMMENT ON COLUMN external_anchor_sources.source_type IS
  'manual / template / pdf / image / chat';
COMMENT ON COLUMN external_anchor_sources.raw_retention IS
  'discarded (default, raw file deleted after parse) or stored (user explicitly opted in)';
COMMENT ON COLUMN external_anchor_sources.raw_storage_path IS
  'Supabase Storage path under user-scoped bucket. NULL when raw_retention = discarded (enforced by CHECK)';
COMMENT ON COLUMN external_anchor_sources.raw_expires_at IS
  'Auto-expiry timestamp for stored raw file. NULL when raw_retention = discarded (enforced by CHECK)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. external_anchors
--    Discriminated union: one_off + recurring を CHECK 制約で物理層強制。
--    confirmed_at NOT NULL で未確認データの保存を禁止。
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS external_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source trace（§11.2）
  -- ON DELETE CASCADE: source 削除で派生 anchor が原子的に削除される
  source_id UUID NOT NULL
    REFERENCES external_anchor_sources(id) ON DELETE CASCADE,

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 共通 base
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  title TEXT NOT NULL,

  -- HH:mm 形式 or ISO 8601 時刻。検証は API 層
  start_time TEXT NOT NULL,
  end_time TEXT,

  location_text TEXT,
  location_category TEXT
    CHECK (location_category IS NULL OR location_category IN
      ('home', 'office', 'school', 'cafe',
       'outdoor', 'public', 'transit', 'unknown')),

  -- hard = 動かすと現実崩壊 / soft = 基本固定だが動かせる（§12.4）
  rigidity TEXT NOT NULL
    CHECK (rigidity IN ('hard', 'soft')),

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 不変原則の核: 未確認データは保存不可（§2.1）
  -- NOT NULL により、確認なし anchor が物理的に書き込めない
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  confirmed_at TIMESTAMPTZ NOT NULL,

  -- 抽出時の自信度（0.000 - 1.000）
  confidence DECIMAL(4,3)
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),

  -- sensitive 情報カテゴリ（§11.4）
  sensitive_category TEXT
    CHECK (sensitive_category IS NULL OR sensitive_category IN
      ('medical', 'legal', 'exam', 'other')),

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Discriminated union: anchor_kind
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  anchor_kind TEXT NOT NULL
    CHECK (anchor_kind IN ('one_off', 'recurring')),

  -- one_off only: 特定日付に紐づく
  date DATE,

  -- recurring only: validity window + RRULE
  valid_from DATE,
  valid_until DATE,
  recurrence_rule TEXT,   -- iCal RRULE per RFC 5545
  exception_dates DATE[],

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Discriminated union 完全性制約
  -- TypeScript の `?: never` を DB レベルで強制する。
  -- 「kind = one_off → date 必須 ∧ recurring 専用 field は NULL」
  -- 「kind = recurring → valid_from + RRULE 必須 ∧ date は NULL」
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CONSTRAINT anchor_kind_one_off_columns CHECK (
    anchor_kind <> 'one_off' OR (
      date IS NOT NULL
      AND valid_from IS NULL
      AND valid_until IS NULL
      AND recurrence_rule IS NULL
      AND exception_dates IS NULL
    )
  ),
  CONSTRAINT anchor_kind_recurring_columns CHECK (
    anchor_kind <> 'recurring' OR (
      date IS NULL
      AND valid_from IS NOT NULL
      AND recurrence_rule IS NOT NULL
    )
  ),

  -- validity window の論理整合
  CONSTRAINT validity_window_order CHECK (
    valid_until IS NULL
    OR valid_from IS NULL
    OR valid_until >= valid_from
  ),

  -- recurrence_rule の長さ制限（悪意あるペイロード対策、通常 RRULE は < 200 文字）
  CONSTRAINT recurrence_rule_length CHECK (
    recurrence_rule IS NULL OR char_length(recurrence_rule) <= 500
  )
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Indexes
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- one_off 日付検索（Calendar 表示 / Flow 構築）
CREATE INDEX idx_external_anchors_user_date
  ON external_anchors (user_id, date)
  WHERE anchor_kind = 'one_off';

-- recurring 期間検索（特定日に展開する recurring を絞る）
CREATE INDEX idx_external_anchors_user_validity
  ON external_anchors (user_id, valid_from, valid_until)
  WHERE anchor_kind = 'recurring';

-- source 単位削除 / source 経由検索
CREATE INDEX idx_external_anchors_source
  ON external_anchors (source_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- RLS（user-scoped 完全分離、§11.1, §11.3）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE external_anchors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "external_anchors_owner_select"
  ON external_anchors FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "external_anchors_owner_insert"
  ON external_anchors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "external_anchors_owner_update"
  ON external_anchors FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "external_anchors_owner_delete"
  ON external_anchors FOR DELETE
  USING (auth.uid() = user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Comments（設計書との traceability）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMMENT ON TABLE external_anchors IS
  'Alter Plan ExternalAnchor (discriminated union: one_off | recurring). See docs/alter-plan-foundation-design.md §2.0, §2.1, §12';
COMMENT ON COLUMN external_anchors.anchor_kind IS
  'one_off (single date) or recurring (validity window + RRULE). Mutual exclusivity enforced by anchor_kind_*_columns CHECK';
COMMENT ON COLUMN external_anchors.rigidity IS
  'hard = cannot move without breaking reality (work meeting / flight) / soft = movable per context (regular gym / hobby class)';
COMMENT ON COLUMN external_anchors.confirmed_at IS
  'NOT NULL enforced. §2.1 invariant: unconfirmed AI extractions must NEVER be persisted as ExternalAnchor.';
COMMENT ON COLUMN external_anchors.recurrence_rule IS
  'iCal RRULE per RFC 5545 (e.g., FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR). Format validation happens at API layer.';
COMMENT ON COLUMN external_anchors.exception_dates IS
  'Holiday / suspended class / shift change. Array of DATE.';
COMMENT ON COLUMN external_anchors.valid_until IS
  'Optional. NULL means "end date undetermined" — NOT "permanent". Update when semester / contract ends.';
COMMENT ON COLUMN external_anchors.source_id IS
  'References external_anchor_sources. ON DELETE CASCADE: deleting a source atomically deletes all derived anchors.';
COMMENT ON COLUMN external_anchors.sensitive_category IS
  'medical / legal / exam / other. Future sharing features must default-exclude (§11.4).';
