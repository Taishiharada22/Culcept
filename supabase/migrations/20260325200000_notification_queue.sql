-- Rendezvous 遅延通知キュー
-- scheduleDelayedNotification() でキューに投入、
-- cron/rendezvous-notification-dispatch で定期処理

CREATE TABLE IF NOT EXISTS rendezvous_notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  payload jsonb DEFAULT '{}',
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- pending 通知の効率的なクエリ用インデックス
CREATE INDEX IF NOT EXISTS idx_notification_queue_pending
  ON rendezvous_notification_queue(scheduled_for)
  WHERE status = 'pending';

-- ユーザー別通知履歴参照用インデックス
CREATE INDEX IF NOT EXISTS idx_notification_queue_user
  ON rendezvous_notification_queue(user_id, created_at DESC);

-- RLS: ユーザーは自分の通知のみ参照可能
ALTER TABLE rendezvous_notification_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification queue"
  ON rendezvous_notification_queue
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role のみ INSERT/UPDATE 可能（cron ジョブ用）
CREATE POLICY "Service role can manage notification queue"
  ON rendezvous_notification_queue
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
