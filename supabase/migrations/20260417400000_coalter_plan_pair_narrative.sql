-- CoAlter Phase 1.5.3 ⑤ — 2人にとってのコンテキスト narrative
--
-- 採用済みプランに対して「この2人にとってどんな意味を持つか」を
-- LLM で生成し、永続化する。初回生成後は DB キャッシュから返すことで
-- LLM コスト・レイテンシを抑える。

ALTER TABLE coalter_plan_items
  ADD COLUMN IF NOT EXISTS pair_narrative TEXT;

COMMENT ON COLUMN coalter_plan_items.pair_narrative IS
  '2人にとっての意味を言語化した短文（40〜90文字、1〜2文想定）。NULL=未生成。';
