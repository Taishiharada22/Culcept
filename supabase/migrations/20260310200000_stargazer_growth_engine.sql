-- Stargazer Growth Engine
-- 観測レンズ発見 + 質問深化 + 成長オーケストレーター
-- Lens × ProbeType × Depth × Axis × Subject × Style の交点で質問が生まれる

-- ═══ 1. Observation Lenses ═══
-- AIが発見した観測レンズの登録簿
CREATE TABLE IF NOT EXISTS stargazer_observation_lenses (
  id TEXT PRIMARY KEY,                          -- lens_motivation, lens_defense, etc.
  name_ja TEXT NOT NULL,                        -- 日本語名
  description TEXT NOT NULL,                    -- 何が観測できるか
  probing_targets TEXT[] NOT NULL DEFAULT '{}', -- どのprobe_typeと相性がいいか
  related_axes TEXT[] NOT NULL DEFAULT '{}',    -- 関連する特性軸ID
  example_situations TEXT[] DEFAULT '{}',       -- 代表的な場面例
  discovery_source TEXT NOT NULL DEFAULT 'manual', -- manual / ai_discovered / philosophy
  generation_batch_id TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',      -- proposed / active / cooling / exhausted / archived
  questions_generated INT NOT NULL DEFAULT 0,
  quality_metrics JSONB NOT NULL DEFAULT '{}',  -- {response_rate, skip_rate, answer_entropy, ...}
  avg_quality NUMERIC NOT NULL DEFAULT 0.5,     -- 要約値
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lenses_status
  ON stargazer_observation_lenses (status)
  WHERE status IN ('active', 'proposed');

-- ═══ 2. Extend Question Pool ═══

-- Lens所属（複合対応）
ALTER TABLE stargazer_question_pool
  ADD COLUMN IF NOT EXISTS primary_lens_id TEXT REFERENCES stargazer_observation_lenses(id),
  ADD COLUMN IF NOT EXISTS secondary_lens_ids TEXT[] DEFAULT '{}';

-- 深度とプローブ（分離設計）
-- depth_score: 1-6 (どれだけ内面に踏み込むか)
-- probe_type: どの角度から掘るか (TEXT for AI extensibility)
ALTER TABLE stargazer_question_pool
  ADD COLUMN IF NOT EXISTS depth_score INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS probe_type TEXT NOT NULL DEFAULT 'surface';

-- 深化文脈（複数親対応）
ALTER TABLE stargazer_question_pool
  ADD COLUMN IF NOT EXISTS parent_question_keys TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS context_snapshot JSONB;

-- 複合品質指標
ALTER TABLE stargazer_question_pool
  ADD COLUMN IF NOT EXISTS quality_metrics JSONB NOT NULL DEFAULT '{}';

-- UXヒント（深い質問の文脈表示用）
ALTER TABLE stargazer_question_pool
  ADD COLUMN IF NOT EXISTS ux_hint TEXT;

-- 質問ステータス（cooling制御用、is_activeとは別）
ALTER TABLE stargazer_question_pool
  ADD COLUMN IF NOT EXISTS question_status TEXT NOT NULL DEFAULT 'active';
-- 'active' / 'cooling' / 'archived'

-- ═══ 3. New Indexes ═══

CREATE INDEX IF NOT EXISTS idx_qpool_lens_depth
  ON stargazer_question_pool (primary_lens_id, depth_score, probe_type, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_qpool_probe
  ON stargazer_question_pool (probe_type, depth_score, quality_score DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_qpool_status
  ON stargazer_question_pool (question_status, is_active)
  WHERE is_active = true;

-- ═══ 4. Growth Runs ═══
-- Growth Orchestratorの実行ログ + 同時実行制御
CREATE TABLE IF NOT EXISTS stargazer_growth_runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL,         -- lens_discovery / question_expansion / quality_maintenance / full_cycle
  trigger TEXT NOT NULL DEFAULT 'manual', -- cron / pool_depletion / quality_threshold / manual
  status TEXT NOT NULL DEFAULT 'pending', -- pending / running / completed / error / timeout
  pool_snapshot JSONB,            -- 実行時のプール統計
  decisions JSONB,                -- Layer1+Layer2の判断ログ
  lenses_discovered INT NOT NULL DEFAULT 0,
  questions_generated INT NOT NULL DEFAULT 0,
  questions_cooled INT NOT NULL DEFAULT 0,
  ai_run_ids TEXT[],
  duration_ms INT,
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,         -- stale run検出用（15分タイムアウト）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_growth_runs_status
  ON stargazer_growth_runs (status)
  WHERE status = 'running';

-- ═══ 5. RLS for new tables ═══

ALTER TABLE stargazer_observation_lenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_growth_runs ENABLE ROW LEVEL SECURITY;

-- Lenses: anyone can read active lenses (no PII)
DO $$ BEGIN
  CREATE POLICY "Anyone can read active lenses"
    ON stargazer_observation_lenses FOR SELECT
    USING (status IN ('active', 'proposed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Lenses: service role manages
DO $$ BEGIN
  CREATE POLICY "Service role manages lenses"
    ON stargazer_observation_lenses FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Growth runs: service role only
DO $$ BEGIN
  CREATE POLICY "Service role manages growth runs"
    ON stargazer_growth_runs FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══ 6. Seed Lenses ═══
-- 初期10レンズをphilosophy sourceとしてactive状態で投入
INSERT INTO stargazer_observation_lenses (id, name_ja, description, probing_targets, related_axes, example_situations, discovery_source, status) VALUES
  ('lens_motivation', '動機の構造', '行動を駆動するものは何か — 承認、安心、成長、回避のどれが中心か', ARRAY['reason','trigger'], ARRAY['cautious_vs_bold','plan_vs_spontaneous','social_initiative'], ARRAY['大きな決断をする場面','新しい挑戦に踏み出す場面','断る場面'], 'philosophy', 'active'),
  ('lens_conflict', '内的葛藤', '相反する欲求が衝突するパターン — やりたいけどやれない、の構造', ARRAY['contradiction','exception'], ARRAY['independence_vs_harmony','plan_vs_spontaneous','emotional_variability'], ARRAY['自由と安定の板挟み','言いたいことを飲み込む場面','義務と欲求が衝突する場面'], 'philosophy', 'active'),
  ('lens_defense', '防衛反応', '脅威を感じた時に無自覚に発動する自己防衛パターン', ARRAY['defense','facade_gap'], ARRAY['boundary_awareness','stress_isolation_vs_social','emotional_regulation'], ARRAY['批判された時','期待に応えられない時','自分の弱さを見せる場面'], 'philosophy', 'active'),
  ('lens_ideal_self', '理想自己と現実', 'なりたい自分と実際の自分のギャップ、そしてそのギャップへの向き合い方', ARRAY['facade_gap','contradiction'], ARRAY['perfectionist_vs_pragmatic','public_private_gap','change_embrace_vs_resist'], ARRAY['理想の自分と比べて落ち込む場面','人前で演じている場面','自分に正直になれる場面'], 'philosophy', 'active'),
  ('lens_unchosen', '未選択の行動', '実際には選ばなかった行動・避けた道から見える本音', ARRAY['unchosen','reason'], ARRAY['cautious_vs_bold','social_initiative','intimacy_pace'], ARRAY['誘いを断った場面','言いかけてやめた場面','チャンスを見送った場面'], 'philosophy', 'active'),
  ('lens_relationship_shift', '関係性の変化', '人との関係が時間と共にどう変わるか — 近づき方と離れ方', ARRAY['trigger','exception'], ARRAY['intimacy_pace','relationship_mode_split','long_term_shift_risk'], ARRAY['仲良くなるプロセス','関係が冷める過程','再会した時の距離感'], 'philosophy', 'active'),
  ('lens_memory_trigger', '記憶起点', '過去の特定の経験が今の判断パターンにどう影響しているか', ARRAY['memory_link','trigger'], ARRAY['reassurance_need','boundary_awareness','emotional_variability'], ARRAY['似た場面で同じ反応をする','特定の言葉に過剰反応する','昔の経験が今の価値観を形作った'], 'philosophy', 'active'),
  ('lens_self_deception', '自己欺瞞', '自分に嘘をついているパターン — 認めたくない本音', ARRAY['facade_gap','defense'], ARRAY['public_private_gap','emotional_regulation','control_tendency'], ARRAY['大丈夫と言いながら無理している場面','怒りを悲しみに変換する場面','本当の理由を隠す場面'], 'philosophy', 'active'),
  ('lens_safety_condition', '安心の条件', '何があると安心し、何がないと不安になるか — 安心の構造', ARRAY['exception','trigger'], ARRAY['reassurance_need','boundary_awareness','stress_isolation_vs_social'], ARRAY['安心できる人の条件','不安になる環境','一人で安心できる条件'], 'philosophy', 'active'),
  ('lens_fatigue_pattern', '疲弊パターン', '何に消耗し、どう回復するか — エネルギーの法則', ARRAY['trigger','exception'], ARRAY['introvert_vs_extrovert','stress_isolation_vs_social','emotional_regulation'], ARRAY['人といて疲れる場面','意外と元気になる場面','回復に必要な条件'], 'philosophy', 'active')
ON CONFLICT (id) DO NOTHING;

-- ═══ 7. Backfill RPC ═══
-- axis_id ↔ lens.related_axes マッピングで既存seed質問にレンズを紐付ける
-- 冪等: primary_lens_id IS NULL の行だけ更新
CREATE OR REPLACE FUNCTION backfill_lens_associations()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INT := 0;
BEGIN
  -- primary_lens_id を axis_id → related_axes の一致で割り当て
  -- 一致するレンズが複数あれば id 昇順で最初のものを primary に
  WITH matches AS (
    SELECT
      q.question_key,
      (
        SELECT l.id
        FROM stargazer_observation_lenses l
        WHERE q.axis_id = ANY(l.related_axes)
          AND l.status = 'active'
        ORDER BY l.id
        LIMIT 1
      ) AS primary_lens,
      ARRAY(
        SELECT l.id
        FROM stargazer_observation_lenses l
        WHERE q.axis_id = ANY(l.related_axes)
          AND l.status = 'active'
        ORDER BY l.id
        OFFSET 1
      ) AS secondary_lenses
    FROM stargazer_question_pool q
    WHERE q.primary_lens_id IS NULL
      AND q.is_active = true
  )
  UPDATE stargazer_question_pool q
  SET
    primary_lens_id = m.primary_lens,
    secondary_lens_ids = m.secondary_lenses,
    updated_at = now()
  FROM matches m
  WHERE q.question_key = m.question_key
    AND m.primary_lens IS NOT NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- レンズ側の questions_generated カウントを更新
  UPDATE stargazer_observation_lenses l
  SET
    questions_generated = sub.cnt,
    updated_at = now()
  FROM (
    SELECT primary_lens_id, COUNT(*) AS cnt
    FROM stargazer_question_pool
    WHERE primary_lens_id IS NOT NULL AND is_active = true
    GROUP BY primary_lens_id
  ) sub
  WHERE l.id = sub.primary_lens_id;

  RETURN updated_count;
END;
$$;

-- increment_lens_question_count ヘルパー (JS fallback用)
CREATE OR REPLACE FUNCTION increment_lens_question_count(
  p_lens_id TEXT,
  p_increment INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE stargazer_observation_lenses
  SET
    questions_generated = questions_generated + p_increment,
    updated_at = now()
  WHERE id = p_lens_id;
END;
$$;
