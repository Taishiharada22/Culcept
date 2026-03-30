-- Stargazer Continuous Observation Engine
-- 継続観測のための新テーブル + 既存テーブル拡張

-- ═══ 1. 軸スナップショット（軌道追跡） ═══
CREATE TABLE IF NOT EXISTS stargazer_axis_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  axis_id TEXT NOT NULL,
  score NUMERIC(4,3) NOT NULL,         -- -1.000 to +1.000
  confidence NUMERIC(4,3),
  context TEXT,                         -- NULL=global, 'friends'/'romance'/etc.
  observation_layer TEXT,               -- 'state'/'context_bound'/'delta'
  variant_id TEXT,                      -- どの言い回しバリアントで観測したか
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_axis_snap_user ON stargazer_axis_snapshots(user_id, axis_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_axis_snap_ctx ON stargazer_axis_snapshots(user_id, axis_id, context);

-- ═══ 2. 日次状態スナップショット ═══
CREATE TABLE IF NOT EXISTS stargazer_daily_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  observation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  self_alignment NUMERIC(4,3),          -- 自己一致感
  interpersonal_energy NUMERIC(4,3),    -- 対人エネルギー（近づきたい↔離れたい）
  emotional_temp NUMERIC(4,3),          -- 感情温度（穏やか↔活性化）
  boundary_sense NUMERIC(4,3),          -- 境界感覚（柔軟↔堅い）
  raw_answers JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, observation_date)
);

-- ═══ 3. 既存テーブル拡張: stargazer_observations ═══
ALTER TABLE stargazer_observations
  ADD COLUMN IF NOT EXISTS observation_layer TEXT,   -- 'state'/'context_bound'/'delta'
  ADD COLUMN IF NOT EXISTS context TEXT,             -- 'friends'/'romance'/etc.
  ADD COLUMN IF NOT EXISTS variant_id TEXT;          -- 使用した質問バリアントID

-- ═══ 4. 既存テーブル拡張: stargazer_profiles ═══
ALTER TABLE stargazer_profiles
  ADD COLUMN IF NOT EXISTS observation_mode TEXT DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS total_sessions INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_observation_at TIMESTAMPTZ;

-- ═══ 5. RLS ═══
ALTER TABLE stargazer_axis_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_daily_states ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own axis snapshots"
    ON stargazer_axis_snapshots FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own axis snapshots"
    ON stargazer_axis_snapshots FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can read own daily states"
    ON stargazer_daily_states FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own daily states"
    ON stargazer_daily_states FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own daily states"
    ON stargazer_daily_states FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
