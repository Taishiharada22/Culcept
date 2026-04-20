-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Baseline 編集 + Alter 始終点接続
-- 仕様: docs/baseline-edit-spec-v1.md
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- /my-page から baseline を編集可能にするための 4 カラム追加。
-- `baseline_home_*` は「生活の base」= 1 日の始点・終点の基準を意味する
-- （住居形態としての家ではなく、プラン起点の意味）。
--
-- lat/lng は source-of-truth ではなく prefecture+city+label の派生キャッシュ。
-- NULL の場合は runtime で locationResolver が prefecture フォールバックに解決する
-- ため、機能劣化はしない。
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE profiles ADD COLUMN baseline_home_label TEXT;

ALTER TABLE profiles ADD COLUMN baseline_home_place_type TEXT
  NOT NULL DEFAULT 'home'
  CHECK (baseline_home_place_type IN ('home', 'other'));

ALTER TABLE profiles ADD COLUMN baseline_home_lat DECIMAL(9,6);
ALTER TABLE profiles ADD COLUMN baseline_home_lng DECIMAL(9,6);

COMMENT ON COLUMN profiles.baseline_home_label IS
  'User-provided label for their base (nullable free text, max 40 chars at API layer)';
COMMENT ON COLUMN profiles.baseline_home_place_type IS
  'home = primary base of daily life / other = non-home base (e.g. parents, second home)';
COMMENT ON COLUMN profiles.baseline_home_lat IS
  'Resolved coordinate cache (municipality precision). NULL means runtime locationResolver falls back to prefecture.';
COMMENT ON COLUMN profiles.baseline_home_lng IS
  'See baseline_home_lat.';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Backfill 方針
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 既存ユーザーの lat/lng backfill は MUNICIPALITY_COORDS (TypeScript dict) が必要なため、
-- この migration 内では実施しない。別スクリプトで実施する:
--
--   scripts/backfill-baseline-home-coords.ts
--
-- backfill は idempotent（既に lat/lng が set 済みの行はスキップ）で、
-- 市区町村が未収録のユーザーは lat/lng NULL のままとする。
-- （runtime prefecture フォールバックで動くため機能劣化なし）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
