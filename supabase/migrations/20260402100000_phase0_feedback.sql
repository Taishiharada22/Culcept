-- Phase 0: 既知ペア検証用フィードバックテーブル
-- 関係性インサイトの妥当性を7指標で測定する

CREATE TABLE IF NOT EXISTS rendezvous_phase0_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  pair_key text NOT NULL,  -- sorted "userA_userB" で一意識別

  -- 7指標（各1-5）
  accuracy_score smallint CHECK (accuracy_score BETWEEN 1 AND 5),       -- 納得感
  discovery_score smallint CHECK (discovery_score BETWEEN 1 AND 5),     -- 発見感
  action_intent_score smallint CHECK (action_intent_score BETWEEN 1 AND 5), -- 行動意志
  non_destructive_score smallint CHECK (non_destructive_score BETWEEN 1 AND 5), -- 非破壊性
  revisit_score smallint CHECK (revisit_score BETWEEN 1 AND 5),         -- 再訪意志

  -- 項目別フィードバック（各1-5）
  narrative_score smallint CHECK (narrative_score BETWEEN 1 AND 5),      -- 1文ナラティブ
  resonance_score smallint CHECK (resonance_score BETWEEN 1 AND 5),     -- 共鳴する点
  unobserved_score smallint CHECK (unobserved_score BETWEEN 1 AND 5),   -- まだ見えていない点

  -- 自由記述
  free_text text,

  -- 持続性追跡（後日更新）
  followup_at timestamptz,
  followup_change_happened boolean,
  followup_text text,

  -- メタ
  insight_snapshot jsonb NOT NULL,  -- 表示したインサイトのスナップショット
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE rendezvous_phase0_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own feedback"
  ON rendezvous_phase0_feedback
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index
CREATE INDEX idx_phase0_feedback_pair ON rendezvous_phase0_feedback(pair_key);
