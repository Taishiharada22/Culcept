-- Stargazer 通知設定のデフォルト値を user_notification_preferences に追加
-- JSONB preferences カラムに stargazer_* キーを追加する。
-- 既存のレコードに対しては未設定のまま残し、アプリ側でデフォルト true を使う。
-- このマイグレーションは、今後設定画面から変更された場合にのみレコードが更新される想定。

-- preferences カラムのコメントを更新して、利用可能なキーを文書化する
COMMENT ON COLUMN user_notification_preferences.preferences IS
  'JSONB notification preferences. Keys: push_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, '
  'stargazer_prophecy (bool, default true), '
  'stargazer_blind_spot (bool, default true), '
  'stargazer_verification (bool, default true), '
  'stargazer_weekly (bool, default true)';
