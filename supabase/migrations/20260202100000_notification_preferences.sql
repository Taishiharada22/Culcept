-- 通知設定テーブル
CREATE TABLE IF NOT EXISTS user_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    preferences JSONB NOT NULL DEFAULT '{
        "new_items": true,
        "price_drops": true,
        "restock": true,
        "favorite_seller": true,
        "likes_on_items": true,
        "new_followers": true,
        "messages": true,
        "purchase_updates": true,
        "weekly_digest": true,
        "recommendations": false,
        "push_enabled": false,
        "email_enabled": true,
        "quiet_hours_enabled": false,
        "quiet_hours_start": "22:00",
        "quiet_hours_end": "08:00"
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_user_id
ON user_notification_preferences(user_id);

-- RLS
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分の設定のみアクセス可能
CREATE POLICY "Users can view own preferences"
ON user_notification_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
ON user_notification_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
ON user_notification_preferences FOR UPDATE
USING (auth.uid() = user_id);

-- プッシュ通知サブスクリプションテーブル（既存の場合はスキップ）
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    keys JSONB NOT NULL,
    preferences JSONB DEFAULT '{
        "new_items": true,
        "price_drops": true,
        "restock": true,
        "weekly_digest": true
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
ON push_subscriptions(user_id);

-- RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
ON push_subscriptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscriptions"
ON push_subscriptions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscriptions"
ON push_subscriptions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own subscriptions"
ON push_subscriptions FOR DELETE
USING (auth.uid() = user_id);

-- 通知テーブルに data カラムを追加（既存の場合はスキップ）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'notifications' AND column_name = 'data'
    ) THEN
        ALTER TABLE notifications ADD COLUMN data JSONB;
    END IF;
END $$;

-- 通知テーブルのインデックス追加
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type
ON notifications(type);

-- 通知削除ポリシー（既存でなければ追加）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'notifications' AND policyname = 'Users can delete own notifications'
    ) THEN
        CREATE POLICY "Users can delete own notifications"
        ON notifications FOR DELETE
        USING (auth.uid() = user_id);
    END IF;
END $$;

-- 通知の自動削除トリガー（90日以上前の通知を削除）
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
    DELETE FROM notifications
    WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- コメント
COMMENT ON TABLE user_notification_preferences IS '通知設定（プッシュ、メール、おやすみモードなど）';
COMMENT ON TABLE push_subscriptions IS 'Web Push通知のサブスクリプション';
