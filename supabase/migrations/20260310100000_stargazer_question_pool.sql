-- Stargazer AI Question Pool
-- 動的質問生成 — AI(cowork)が育てる観測質問プール
-- 45軸 × 10対象 × 5気分 × 6スタイル × 5角度 ≈ 5万次元組み合わせ → 事実上無限の質問空間

-- ═══ 1. Question Pool Table ═══
CREATE TABLE IF NOT EXISTS stargazer_question_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Question identity (maps to QuestionVariant.id)
  question_key TEXT NOT NULL UNIQUE,

  -- QuestionVariant互換JSON (UIがそのまま消費)
  variant_json JSONB NOT NULL,

  -- ═══ 次元座標 (インデックス選択用) ═══
  axis_id TEXT NOT NULL,
  observation_layer TEXT NOT NULL DEFAULT 'state',

  -- 関係対象
  subject TEXT NOT NULL DEFAULT 'self',

  -- 気分・エネルギー
  energy_target TEXT NOT NULL DEFAULT 'neutral',

  -- 表現スタイル
  phrasing_style TEXT NOT NULL DEFAULT 'direct',

  -- 観測角度
  angle TEXT NOT NULL DEFAULT 'self_reflection',

  -- ═══ 生成元・品質追跡 ═══
  source TEXT NOT NULL DEFAULT 'ai',
  generation_batch_id TEXT,
  ai_run_id TEXT,

  -- 品質メトリクス (使用ごとに更新)
  times_shown INT NOT NULL DEFAULT 0,
  times_answered INT NOT NULL DEFAULT 0,
  avg_response_time_ms NUMERIC,
  score_variance NUMERIC,
  quality_score NUMERIC NOT NULL DEFAULT 0.5,

  -- ライフサイクル
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══ 2. インデックス ═══

-- 基本選択: 軸 + アクティブ
CREATE INDEX IF NOT EXISTS idx_qpool_axis_active
  ON stargazer_question_pool (axis_id, is_active)
  WHERE is_active = true;

-- 多次元選択 (最も頻繁なクエリパターン)
CREATE INDEX IF NOT EXISTS idx_qpool_dimension_select
  ON stargazer_question_pool (axis_id, subject, energy_target, phrasing_style, is_active)
  WHERE is_active = true;

-- 品質順選択
CREATE INDEX IF NOT EXISTS idx_qpool_quality
  ON stargazer_question_pool (axis_id, quality_score DESC, is_active)
  WHERE is_active = true;

-- ソース追跡
CREATE INDEX IF NOT EXISTS idx_qpool_source
  ON stargazer_question_pool (source, generation_batch_id);

-- ═══ 3. ユーザー表示履歴 (重複回避) ═══
CREATE TABLE IF NOT EXISTS stargazer_question_shown (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  question_key TEXT NOT NULL,
  shown_at DATE NOT NULL DEFAULT CURRENT_DATE,
  answered BOOLEAN NOT NULL DEFAULT false,
  score NUMERIC(4,3),
  response_time_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, question_key, shown_at)
);

CREATE INDEX IF NOT EXISTS idx_qshown_user_recent
  ON stargazer_question_shown (user_id, shown_at DESC);

-- ═══ 4. 生成バッチ追跡 (coworkセッション管理) ═══
CREATE TABLE IF NOT EXISTS stargazer_generation_batches (
  id TEXT PRIMARY KEY,
  batch_type TEXT NOT NULL,
  target_axis TEXT,
  target_dimensions JSONB,
  requested_count INT NOT NULL,
  generated_count INT NOT NULL DEFAULT 0,
  accepted_count INT NOT NULL DEFAULT 0,
  rejected_count INT NOT NULL DEFAULT 0,
  ai_run_ids TEXT[],
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ═══ 5. RLS ═══
ALTER TABLE stargazer_question_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_question_shown ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_generation_batches ENABLE ROW LEVEL SECURITY;

-- Pool: アクティブ質問は誰でも読める (ユーザーデータなし)
DO $$ BEGIN
  CREATE POLICY "Anyone can read active pool questions"
    ON stargazer_question_pool FOR SELECT
    USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Pool: service role のみ INSERT/UPDATE
DO $$ BEGIN
  CREATE POLICY "Service role can manage pool"
    ON stargazer_question_pool FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Shown: ユーザーは自分のレコードのみ
DO $$ BEGIN
  CREATE POLICY "Users read own shown"
    ON stargazer_question_shown FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users insert own shown"
    ON stargazer_question_shown FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users update own shown"
    ON stargazer_question_shown FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Batches: service role のみ
DO $$ BEGIN
  CREATE POLICY "Service role can manage batches"
    ON stargazer_generation_batches FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
