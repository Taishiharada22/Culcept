-- ALTER MODE: Add "parts" to allowed modes for Alter dialogues
-- IFS(Internal Family Systems) parts mode support

ALTER TABLE stargazer_alter_dialogues
  DROP CONSTRAINT IF EXISTS stargazer_alter_dialogues_alter_mode_check;

ALTER TABLE stargazer_alter_dialogues
  ADD CONSTRAINT stargazer_alter_dialogues_alter_mode_check
  CHECK (alter_mode IN ('warm', 'provocative', 'analytical', 'parts'));
