-- CoAlter Phase 1.5.3 ② — 採用時に第2候補（代替案）を抱き合わせ保存
-- 目的: 「2人のプランは崩れやすい」問題への備え。当日NGになった時の再合意コストをゼロ化。
--
-- 仕様:
--  - alternatives: JSONB 配列。要素は {title, oneLiner, practicalInfo?, url?}
--  - NULL 許容（既存レコード互換、代替案なしの採用も可）
--  - ランクは配列順（index 0 が第2位、以降第3位…）
--
-- 実行タイミング: CEO承認後に supabase db push

ALTER TABLE coalter_plan_items
  ADD COLUMN IF NOT EXISTS alternatives JSONB;

COMMENT ON COLUMN coalter_plan_items.alternatives IS
  '採用時に一緒に保存した第2候補以降の控え案。[{title, oneLiner, practicalInfo?, url?}]。NULL=控えなし。';
