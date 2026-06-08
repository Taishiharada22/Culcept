-- ════════════════════════════════════════════════════════════════════════
-- prm_review_decisions — PRM review 決定ログ（A1-7-27 / M2・**draft / 未 apply**）
--
-- 設計: docs/prm-m2-review-decisions-design.md（A1-7-27）/ docs/prm-persistence-schema-design.md §3.2（A1-7-5）
--       lib/plan/reality/learning/review-flow-contract.ts（A1-7-7）/ review-decision-dry-run.ts（A1-7-8）
--
-- 役割: 人間が proposal（A1-7-3 candidate）を review した **決定（approve/reject/defer）を append-only で永続化**する。
--   **PRM model（M3）への唯一の入口**＝review なしに PRM entry は生まれない（reviewRequired の実体）。
--   proposal 自体は派生（events から再導出）ゆえ保存しない。保存するのは「人間が review した」という新事実 + 再現用 snapshot。
--
-- 方針（過断定防止・privacy・review gate）:
--   - **certainty CHECK in (low, tentative)＝high を DB で構造的に不可能化**（過断定防止 5 重 gate の #1 を persistence 層で担保）。
--   - **structured-only**: raw 自由文 / 元発話 / seedRef / source_ref を列に **持たない**。snapshot は flat 列（enum/数値/code 配列のみ・jsonb 不使用）。
--     proposal_fingerprint / source_dimension / source_value / dominant_action / favored_hypothesis / still_possible（code[]）は controlled。
--   - **append-only**: INSERT + SELECT + DELETE（user 削除）のみ。**UPDATE policy を作らない**＝事実は変えない（再 review は新 row・latest が有効）。
--   - **自動 review 禁止**: decision は人間が入れる（operator=推論品質検証 / user=第二の自己 confirm/correct）。
--   - **RLS owner-only**（auth.uid()=user_id）・service_role 非前提・cross-user 不可。
--   - **personality/trait 列を持たない**（tendency framing のみ）。
--
-- ⚠ 本 migration は **M2 schema draft**。**実 DB への apply / db push / local reset は別 GO（CEO 承認後）**。
--    M3（prm_model_entries）は **本 file に含めない**（別 migration）。M1（prm_learning_events）は適用済（staging）。
--    ── revert / down（M2 独立で可逆・新規 table ゆえ clean DROP）:
--      DROP INDEX IF EXISTS idx_prm_review_decisions_user_reviewed;
--      DROP INDEX IF EXISTS idx_prm_review_decisions_user_fingerprint;
--      DROP TABLE IF EXISTS prm_review_decisions;  -- policies は table と共に drop
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS prm_review_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- どの proposal か（A1-7-7 proposalFingerprint = sourceDimension:sourceValue:dominantAction・派生 proposal の参照）
  proposal_fingerprint TEXT NOT NULL,

  -- 人間の決定（A1-7-7 ReviewDecisionKind）
  decision TEXT NOT NULL
    CHECK (decision IN ('approve', 'reject', 'defer')),

  -- 誰が review したか（A1-7-7 ReviewerKind・operator=推論品質 / user=第二の自己）
  reviewer TEXT NOT NULL
    CHECK (reviewer IN ('operator', 'user')),

  -- ── review 時点 snapshot（再現性・audit・flat 列・raw でない・A1-7-8 ReviewedProposalSnapshot）──
  source_dimension TEXT NOT NULL
    CHECK (source_dimension IN ('band', 'durationBucket', 'confidence', 'source')),
  source_value TEXT NOT NULL,
  dominant_action TEXT NOT NULL
    CHECK (dominant_action IN ('accept', 'dismiss', 'later')),
  favored_hypothesis TEXT NOT NULL,
  still_possible TEXT[] NOT NULL DEFAULT '{}',
  evidence_count INTEGER NOT NULL
    CHECK (evidence_count >= 0),
  counter_count INTEGER NOT NULL
    CHECK (counter_count >= 0),

  -- **過断定防止の構造的 gate**: certainty に high を許さない（PRM の確からしさは最大 tentative）
  certainty TEXT NOT NULL
    CHECK (certainty IN ('low', 'tentative')),

  -- review 時刻（client/operator 由来・注入）と作成時刻
  reviewed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── indexes（fingerprint ごとの latest decision 照会 + recency）──
CREATE INDEX IF NOT EXISTS idx_prm_review_decisions_user_fingerprint
  ON prm_review_decisions (user_id, proposal_fingerprint, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_prm_review_decisions_user_reviewed
  ON prm_review_decisions (user_id, reviewed_at DESC);

-- ── RLS（owner-only・service_role 非前提・**append-only: UPDATE policy を作らない**）──
ALTER TABLE prm_review_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY prm_review_decisions_owner_select ON prm_review_decisions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY prm_review_decisions_owner_insert ON prm_review_decisions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- DELETE は user 起点削除（GDPR）用。**UPDATE policy は無し＝決定は更新不能（append-only・再 review は新 row）**。
CREATE POLICY prm_review_decisions_owner_delete ON prm_review_decisions
  FOR DELETE USING (auth.uid() = user_id);
