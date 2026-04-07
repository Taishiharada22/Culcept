-- P2-1: Narrative Lens — 意味づけの変化追跡
-- HDM v1 §8.1 (McAdams Narrative Identity)
--
-- 既存の stargazer_alter_narratives に以下を追加:
-- 1. interpretation_history: 過去の解釈をJSON配列で蓄積（上書きではなく履歴化）
-- 2. current_valence: 現在の解釈の感情極性
-- 3. current_agency: 現在の解釈の主体性
-- 4. revision_count: 解釈が書き換えられた回数
-- 5. frozen_since: 固着が検出された日時（narrative freezing）

ALTER TABLE stargazer_alter_narratives
  ADD COLUMN IF NOT EXISTS interpretation_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS current_valence text CHECK (current_valence IN ('positive', 'negative', 'neutral', 'ambivalent')),
  ADD COLUMN IF NOT EXISTS current_agency text CHECK (current_agency IN ('actor', 'receiver', 'observer', 'unknown')),
  ADD COLUMN IF NOT EXISTS revision_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frozen_since timestamptz;

-- frozen_since のインデックス（freezing 検出クエリ用）
CREATE INDEX IF NOT EXISTS idx_narratives_frozen
  ON stargazer_alter_narratives(user_id)
  WHERE frozen_since IS NOT NULL;

COMMENT ON COLUMN stargazer_alter_narratives.interpretation_history IS
  'JSON array of past interpretations: [{content, valence, agency, at}]. Newest first.';
COMMENT ON COLUMN stargazer_alter_narratives.current_valence IS
  'Current interpretation emotional polarity: positive/negative/neutral/ambivalent';
COMMENT ON COLUMN stargazer_alter_narratives.current_agency IS
  'Current interpretation agency: actor/receiver/observer/unknown';
COMMENT ON COLUMN stargazer_alter_narratives.revision_count IS
  'Number of times the interpretation has meaningfully changed (minor variations excluded)';
COMMENT ON COLUMN stargazer_alter_narratives.frozen_since IS
  'When narrative freezing was first detected. NULL = not frozen.';
