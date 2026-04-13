-- ============================================================
-- Partner 書類ステータス JSONB カラム追加
--
-- 結婚相談所水準の書類提出管理:
--   identity     → 既存の review_status で管理
--   single_status → 独身証明書
--   income        → 収入証明書
--   education     → 学歴証明書
--   employment    → 勤務先証明
--
-- 各書類のステータスを JSONB で保管:
--   { "single_status": "pending", "income": "not_submitted", ... }
--
-- CEO承認後に実行すること。
-- ============================================================

ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS partner_document_statuses jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN rendezvous_profiles.partner_document_statuses IS
  'Partner 書類ステータス (JSONB)。key: single_status/income/education/employment, value: not_submitted/pending/approved/rejected';
