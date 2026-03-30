-- 4カテゴリ双方向スコアリング: 顔 / 雰囲気 / スタイル / 性格
-- A→B と B→A それぞれの視点からの category scores を格納

ALTER TABLE rendezvous_candidates
  ADD COLUMN IF NOT EXISTS category_scores_a_to_b jsonb,
  ADD COLUMN IF NOT EXISTS category_scores_b_to_a jsonb;

COMMENT ON COLUMN rendezvous_candidates.category_scores_a_to_b
  IS 'Category scores: {face, vibe, style, personality, overall} from A perspective viewing B';

COMMENT ON COLUMN rendezvous_candidates.category_scores_b_to_a
  IS 'Category scores: {face, vibe, style, personality, overall} from B perspective viewing A';
