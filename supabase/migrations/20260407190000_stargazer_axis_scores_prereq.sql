-- =============================================================================
-- stargazer_axis_scores Prereq — 20260407200000 UPDATE 前置 historical shape
-- =============================================================================
-- 起草日: 2026-05-27
-- 親 phase: migration-debt-phase → migration-debt-repair → Stage R3 staging replay
-- CEO 確定: 2026-05-27 (B base、 bulk audit 結果 1 件、 最小形 a 採用)
--
-- 目的:
--   後続 20260407200000_frozen_axis_migration.sql の
--   `UPDATE stargazer_axis_scores SET …` (× 2 block) が解決する前提条件として、
--   stargazer_axis_scores を最小 historical shape で前置する。
--
-- Historical shape の根拠 (Stage R3 Bulk Audit Result §3-A、 2026-05-27):
--   - 20260407200000 の UPDATE 構造から逆算:
--       `WHERE ba.user_id = … AND ba.axis_id = 'boundary_awareness'`
--         → (user_id, axis_id) で 1 行特定 = composite PK
--       `score * 0.7 + score * 0.3` → numeric 計算 = double precision 妥当
--       axis_id 観測値: boundary_awareness / boundary_respect /
--                       control_tendency / pressure_risk / exclusivity_pressure
--   - production / staging には Studio 手動作成の table 既存 (推定)。
--     CREATE TABLE IF NOT EXISTS で no-op になる。
--
-- 最小形採用 (CEO 確定 2026-05-27):
--   FK / RLS / POLICY / INDEX / trigger / function は本 file では 一切追加しない。
--   理由:
--     - 20260407200000 が必要としているのは relation 存在 + 3 column + 一意性のみ
--     - auth.users FK が必要だという証拠は今の監査にない
--     - 未確定の FK を先回りで足すと新しい mismatch を作る可能性
--   追加制約が必要になったら、 後段の証拠が出た時点で別 migration で足す。
--
-- 順序:
--   この migration (20260407190000_stargazer_axis_scores_prereq.sql)
--     → 20260407200000 (UPDATE × 2 block で score 統合)
--
-- 安全性:
--   既存環境 (production / staging-pre-reset): IF NOT EXISTS で no-op
--   staging (clean reset): 本 file が CREATE、 UPDATE は rows 無しで no-op
--
-- sanitize 7 ルール準拠:
--   1. CREATE TABLE → IF NOT EXISTS  ✓
--   2-7. (該当なし — 本 file は CREATE TABLE のみ)
--
-- 関連 doc:
--   docs/alter-plan-migration-debt-stage-r3-staging-replay-readiness.md
--   docs/alter-plan-migration-debt-stage-r3-bulk-audit-result.md §3-A
-- =============================================================================

CREATE TABLE IF NOT EXISTS "public"."stargazer_axis_scores" (
    "user_id" "uuid" NOT NULL,
    "axis_id" "text" NOT NULL,
    "score" double precision,
    PRIMARY KEY ("user_id", "axis_id")
);
