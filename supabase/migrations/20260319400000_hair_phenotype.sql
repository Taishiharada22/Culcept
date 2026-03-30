-- 髪型 Phenotype テーブル（localStorageからDB移行）
CREATE TABLE IF NOT EXISTS hair_phenotype (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  length TEXT,         -- veryshort, short, bob, medium, semilong, long
  bangs TEXT,          -- maegaminashi, throw, omome, nagashi, center, up
  silhouette TEXT,     -- straight, layer, wolf, uchimaki, sotohane, volume
  texture TEXT,        -- tyokumou, nami, yuru, spiral, kuse
  color TEXT,          -- black, dark_brown, brown, ash, beige, high_tone, etc
  color_hex TEXT,      -- カスタム色 hex値
  recipe JSONB DEFAULT '{}',  -- 完全なレシピ（後方互換用）
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE hair_phenotype ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own hair phenotype"
  ON hair_phenotype FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own hair phenotype"
  ON hair_phenotype FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own hair phenotype"
  ON hair_phenotype FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on hair_phenotype"
  ON hair_phenotype FOR ALL
  USING (auth.role() = 'service_role');
