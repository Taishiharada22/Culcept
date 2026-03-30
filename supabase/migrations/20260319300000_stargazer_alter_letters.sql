-- Alter Letters: 5セッションごとにAlterが手紙を書く機能
CREATE TABLE IF NOT EXISTS stargazer_alter_letters (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_count INT NOT NULL,
  content TEXT NOT NULL,
  tone TEXT NOT NULL CHECK (tone IN ('gentle', 'philosophical', 'provocative', 'playful')),
  key_insight TEXT NOT NULL DEFAULT '',
  referenced_observations TEXT[] DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_alter_letters_user ON stargazer_alter_letters(user_id);
CREATE INDEX idx_alter_letters_unread ON stargazer_alter_letters(user_id) WHERE read_at IS NULL;

ALTER TABLE stargazer_alter_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own letters"
  ON stargazer_alter_letters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert letters"
  ON stargazer_alter_letters FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own letters"
  ON stargazer_alter_letters FOR UPDATE
  USING (auth.uid() = user_id);
