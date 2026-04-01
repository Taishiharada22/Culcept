-- 20260401100000_anonymous_auth_support.sql
-- 後ログイン型: 匿名認証サポートのためのスキーマ変更
-- CEO承認: 2026-04-01

-- profiles テーブルに匿名データ merge 用カラムを追加
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_merged boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

-- is_merged のインデックス（匿名データの TTL バッチ削除で使用）
CREATE INDEX IF NOT EXISTS idx_profiles_is_merged
  ON profiles (is_merged)
  WHERE is_merged = false;

-- 匿名ユーザーのクリーンアップ用ビュー（30日TTL）
-- 週次バッチで参照: 未昇格かつ30日以上前の匿名ユーザーを特定
CREATE OR REPLACE VIEW anonymous_users_to_cleanup AS
SELECT
  au.id,
  au.created_at,
  au.is_anonymous,
  (SELECT count(*) FROM stargazer_observations so WHERE so.user_id = au.id) AS observation_count
FROM auth.users au
WHERE au.is_anonymous = true
  AND au.created_at < now() - interval '30 days'
  AND NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = au.id AND p.is_merged = true
  );

-- コメント
COMMENT ON COLUMN profiles.is_merged IS '匿名ユーザーのデータが正規ユーザーに移管済みかどうか';
COMMENT ON COLUMN profiles.merged_at IS '匿名データの移管完了日時';
