-- ════════════════════════════════════════════════════════════════════════
-- prm_learning_events — PRM 学習 signal log（A1-7-11 / M1・**draft / 未 apply**）
--
-- 設計: docs/prm-migration-readiness-plan.md（A1-7-10・M1）/ docs/prm-persistence-schema-design.md（A1-7-5）
--       docs/aneurasync-reality-control-os-connection-design.md §10.5 / §10.10 / §10.11
--
-- 役割: candidate action（accept/dismiss/later）の **源泉 signal を append-only で永続化**する facts ログ。
--   patterns（A1-7-1）/ proposals（A1-7-3）/ PRM model（M3）は**本 events の純関数で再導出**するため、
--   本 table は **raw facts（action + context + 時刻）のみ**を持つ。
--
-- 方針（CEO 補正・過断定防止・「raw を同じ読み取り表面に置かない」）:
--   - **structured-only**: raw 自由文 / 元発話 / seedRef / source_ref を列に **持たない**（構造的に保存不能）。
--     handle は opaque（一方向 hash・seedRef でない）。
--   - **append-only**: INSERT + SELECT + DELETE（user 削除）のみ。**UPDATE policy を作らない**＝RLS で更新拒否（事実は変えない・訂正は新 row）。
--   - **derived/model 概念は持たない**: certainty / evidence_count / counter_count / still_possible / hypotheses は
--     pattern（再導出）/ PRM model（M3）の概念。本 events には**含めない**（certainty high CHECK は M3 の制約）。
--   - **personality / trait / fixed_preference 列を持たない**（性格を schema が表現不能）。
--   - **RLS owner-only**（auth.uid() = user_id）・**service_role 非前提**・cross-user 不可。
--
-- ⚠ 本 migration は **M1 schema draft**。**実 DB への apply / db push / local reset は別 GO（CEO 承認後）**。
--    M2（prm_review_decisions）/ M3（prm_model_entries）は **本 file に含めない**（別 migration）。
--    ── revert / down（M1 独立で可逆）: 下記を別 revert migration で実行する（本 table は新規ゆえ clean DROP）:
--      DROP INDEX IF EXISTS idx_prm_learning_events_active_expiry;
--      DROP INDEX IF EXISTS idx_prm_learning_events_user_acted;
--      DROP TABLE IF EXISTS prm_learning_events;  -- policies は table と共に drop
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS prm_learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- opaque candidate handle（一方向 hash・seedRef を含まない・action の対象参照）
  handle TEXT NOT NULL,

  -- 取った action（CandidateActionKind と一致）
  action TEXT NOT NULL
    CHECK (action IN ('accept', 'dismiss', 'later')),

  -- 中立 signal（LearningSignal と一致・評価でない・action から導出可だが query 用に保持）
  signal TEXT NOT NULL
    CHECK (signal IN ('adoption', 'non_adoption', 'deferral')),

  -- ── context（候補の安全 field・aggregation 用・raw でない）──
  desired_date DATE,
  band TEXT
    CHECK (band IS NULL OR band IN ('morning', 'afternoon', 'evening')),
  confidence_band TEXT NOT NULL
    CHECK (confidence_band IN ('high', 'medium', 'low')),
  duration_min INTEGER
    CHECK (duration_min IS NULL OR duration_min >= 0),
  source_kind TEXT NOT NULL
    CHECK (source_kind IN ('seed_explicit', 'correction')),

  -- action 時刻（recency / decay 用・client 由来）と捕捉時刻
  acted_at TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- TTL（古い signal を age out・sweep cron は別段階）
  expires_at TIMESTAMPTZ
);

-- ── indexes（recency 集約 read + TTL sweep）──
CREATE INDEX IF NOT EXISTS idx_prm_learning_events_user_acted
  ON prm_learning_events (user_id, acted_at);
CREATE INDEX IF NOT EXISTS idx_prm_learning_events_active_expiry
  ON prm_learning_events (user_id, expires_at)
  WHERE expires_at IS NOT NULL;

-- ── RLS（owner-only・service_role 非前提・**append-only: UPDATE policy を作らない**）──
ALTER TABLE prm_learning_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY prm_learning_events_owner_select ON prm_learning_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY prm_learning_events_owner_insert ON prm_learning_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- DELETE は user 起点削除（GDPR）用に許可。**UPDATE policy は無し＝事実は更新不能（append-only）**。
CREATE POLICY prm_learning_events_owner_delete ON prm_learning_events
  FOR DELETE USING (auth.uid() = user_id);
