-- ═══════════════════════════════════════════════════════════════════════
-- CoAlter M1 Candidate 3 — Pair onboarding minimum slice
--
-- [CEO lock 2026-04-20 M1 C3]
--   - ペアが CoAlter を activate した瞬間を `onboarded_at` でマークする
--     (null = 旧ペアまたは未 activate。フラグ OFF 時は触らない)
--   - invoke の Stage 1 で cold-start（onboarded_at is null かつ talk_messages 0）を
--     検出し、outcome="failed" を見せずに snapshot を欠落で返すための判定軸。
--
-- 併せて coalter_fairness_ledger.session_id を nullable 化する。
--   理由: activate 時に「bias_score=0 の seed row」を 1 件入れたいが、
--   現行 schema は session_id NOT NULL + FK(coalter_sessions) であり
--   session 未生成段階では insert できない。session_id IS NULL を
--   「pre-session seed」と解釈するために nullable へ緩和する。
--   既存の session 付き行には影響しない。
--
-- ロールバック:
--   - コード側は flag COALTER_PAIR_ONBOARDING=false で即無効化できるため
--     この migration を戻さなくても機能は停止する。
--   - スキーマを戻す場合:
--       ALTER TABLE coalter_pair_states DROP COLUMN IF EXISTS onboarded_at;
--       ALTER TABLE coalter_fairness_ledger ALTER COLUMN session_id SET NOT NULL;
--     ただし session_id IS NULL の seed row を残したまま NOT NULL 復帰は失敗するので
--     先に `DELETE FROM coalter_fairness_ledger WHERE session_id IS NULL;` が必要。
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE coalter_pair_states
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ NULL;

ALTER TABLE coalter_fairness_ledger
  ALTER COLUMN session_id DROP NOT NULL;
