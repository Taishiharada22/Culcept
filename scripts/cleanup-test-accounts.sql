-- ================================================================
-- Aneurasync: テストアカウント完全削除スクリプト
-- ================================================================
-- 対象: th7328aish@outlook.com, th6193aish@outlook.com, test200122@outlook.jp
-- 処理: auth.usersからアカウントごと削除
--       → ON DELETE CASCADE により全関連データが自動削除される
-- 安全: LLM学習情報（question_pool, observation_lenses等）はシステムテーブルなので影響なし
-- ================================================================
-- ⚠️ 実行前に必ず CEO 承認を得ること
-- ⚠️ Supabase Dashboard > SQL Editor で実行
-- ================================================================

-- Step 1: 対象確認（DRY RUN — まずこれだけ実行して確認）
SELECT id, email, created_at, last_sign_in_at
FROM auth.users
WHERE email IN (
  'th7328aish@outlook.com',
  'th6193aish@outlook.com',
  'test200122@outlook.jp'
);

-- Step 2: 削除実行（確認後に実行）
-- ON DELETE CASCADE により以下が自動削除される:
--   stargazer_*, rendezvous_*, origin_*, orbiter_*,
--   body_color_*, face_phenotype, genome_cards, etc. (全82テーブル)

DELETE FROM auth.users
WHERE email IN (
  'th7328aish@outlook.com',
  'th6193aish@outlook.com',
  'test200122@outlook.jp'
);

-- Step 3: 削除確認
SELECT count(*) AS remaining
FROM auth.users
WHERE email IN (
  'th7328aish@outlook.com',
  'th6193aish@outlook.com',
  'test200122@outlook.jp'
);
-- ↑ 0 になるはず
