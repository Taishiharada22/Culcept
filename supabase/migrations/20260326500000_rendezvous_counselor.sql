-- ============================================================
-- Rendezvous Counselor: AI結婚相談所カウンセラーシステム
-- ============================================================

-- 切断分析テーブル
CREATE TABLE IF NOT EXISTS rendezvous_disconnect_analyses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID NOT NULL REFERENCES rendezvous_candidates(id) ON DELETE CASCADE,
  disconnected_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  disconnected_user_id    UUID NOT NULL REFERENCES auth.users(id),
  reason_code   TEXT NOT NULL,
  reason_detail TEXT,
  structural_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  tendency_insight     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_disconnect_analyses_disconnected_user
  ON rendezvous_disconnect_analyses(disconnected_user_id, created_at DESC);
CREATE INDEX idx_disconnect_analyses_candidate
  ON rendezvous_disconnect_analyses(candidate_id);

-- カウンセラーセッションテーブル
CREATE TABLE IF NOT EXISTS rendezvous_counselor_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id),
  disconnect_analysis_id UUID REFERENCES rendezvous_disconnect_analyses(id),
  state         TEXT NOT NULL DEFAULT 'analyzing',
  session_data  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_counselor_sessions_user
  ON rendezvous_counselor_sessions(user_id, created_at DESC);

-- 傾向パターン蓄積テーブル（長期成長追跡用）
CREATE TABLE IF NOT EXISTS rendezvous_tendency_patterns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id),
  pattern_key   TEXT NOT NULL,
  pattern_data  JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurrence_count INT NOT NULL DEFAULT 1,
  improving     BOOLEAN NOT NULL DEFAULT false,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_detected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, pattern_key)
);

CREATE INDEX idx_tendency_patterns_user
  ON rendezvous_tendency_patterns(user_id);

-- プレブリーフィングテーブル
CREATE TABLE IF NOT EXISTS rendezvous_pre_briefings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID NOT NULL REFERENCES rendezvous_candidates(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id),
  briefing_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(candidate_id, user_id)
);

-- アバター仲介テーブル
CREATE TABLE IF NOT EXISTS rendezvous_avatar_introductions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID NOT NULL REFERENCES rendezvous_candidates(id) ON DELETE CASCADE,
  from_user_id  UUID NOT NULL REFERENCES auth.users(id),
  to_user_id    UUID NOT NULL REFERENCES auth.users(id),
  mode          TEXT NOT NULL CHECK (mode IN ('avatar', 'direct')),
  avatar_message TEXT,
  suggested_topics TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_avatar_intros_candidate
  ON rendezvous_avatar_introductions(candidate_id);

-- ポストレビューテーブル
CREATE TABLE IF NOT EXISTS rendezvous_post_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    UUID NOT NULL REFERENCES rendezvous_candidates(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('chat', 'call', 'date')),
  feeling         TEXT NOT NULL,
  free_text       TEXT,
  ai_insight      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_reviews_user
  ON rendezvous_post_reviews(user_id, created_at DESC);
CREATE INDEX idx_post_reviews_candidate
  ON rendezvous_post_reviews(candidate_id);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE rendezvous_disconnect_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendezvous_counselor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendezvous_tendency_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendezvous_pre_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendezvous_avatar_introductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendezvous_post_reviews ENABLE ROW LEVEL SECURITY;

-- 切断分析: 切った側は書き込み可、切られた側は自分の行のみ読み取り可
CREATE POLICY "disconnect_analyses_insert"
  ON rendezvous_disconnect_analyses FOR INSERT
  WITH CHECK (auth.uid() = disconnected_by_user_id);

CREATE POLICY "disconnect_analyses_select_disconnected"
  ON rendezvous_disconnect_analyses FOR SELECT
  USING (auth.uid() = disconnected_user_id);

CREATE POLICY "disconnect_analyses_select_by"
  ON rendezvous_disconnect_analyses FOR SELECT
  USING (auth.uid() = disconnected_by_user_id);

-- カウンセラーセッション: 自分のみ
CREATE POLICY "counselor_sessions_own"
  ON rendezvous_counselor_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 傾向パターン: 自分のみ
CREATE POLICY "tendency_patterns_own"
  ON rendezvous_tendency_patterns FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ブリーフィング: 自分のみ
CREATE POLICY "pre_briefings_own"
  ON rendezvous_pre_briefings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- アバター仲介: from/to ユーザーのみ
CREATE POLICY "avatar_intros_own"
  ON rendezvous_avatar_introductions FOR ALL
  USING (auth.uid() IN (from_user_id, to_user_id))
  WITH CHECK (auth.uid() = from_user_id);

-- ポストレビュー: 自分のみ
CREATE POLICY "post_reviews_own"
  ON rendezvous_post_reviews FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- RPC: upsert_tendency_pattern
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_tendency_pattern(
  p_user_id    UUID,
  p_pattern_key TEXT,
  p_pattern_data JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO rendezvous_tendency_patterns (user_id, pattern_key, pattern_data)
  VALUES (p_user_id, p_pattern_key, p_pattern_data)
  ON CONFLICT (user_id, pattern_key) DO UPDATE
    SET occurrence_count = rendezvous_tendency_patterns.occurrence_count + 1,
        pattern_data     = EXCLUDED.pattern_data,
        last_detected_at = now(),
        updated_at       = now();
END;
$$;

-- ============================================================
-- ALTER: rendezvous_suppressions に disconnect_cooldown 追加
-- ============================================================

ALTER TABLE rendezvous_suppressions
  DROP CONSTRAINT rendezvous_suppressions_type_check;

ALTER TABLE rendezvous_suppressions
  ADD CONSTRAINT rendezvous_suppressions_type_check CHECK (
    suppression_type IN (
      'pass_cooldown', 'expired_cooldown', 'hide_forever',
      'report_review_hold', 'safety_hold', 'duplicate_hold',
      'disconnect_cooldown'
    )
  );
