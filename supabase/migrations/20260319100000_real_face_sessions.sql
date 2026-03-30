-- Real Face Capture Sessions
-- globalThis インメモリストアから Supabase に移行
-- セッションは 20 分 TTL、QR コードベースのモバイル撮影で使用

CREATE TABLE IF NOT EXISTS real_face_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired')),
  capture_url text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_real_face_sessions_token ON real_face_sessions (token);
CREATE INDEX IF NOT EXISTS idx_real_face_sessions_user_status ON real_face_sessions (user_id, status);

-- RLS
ALTER TABLE real_face_sessions ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のセッションを読める
CREATE POLICY "Users can read own sessions"
  ON real_face_sessions FOR SELECT
  USING (auth.uid() = user_id);

-- ユーザーは自分のセッションを作成できる
CREATE POLICY "Users can create own sessions"
  ON real_face_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ユーザーは自分のセッションを更新できる
CREATE POLICY "Users can update own sessions"
  ON real_face_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- service_role はすべてのセッションにアクセス可（API route から token ベースで検索するため）
CREATE POLICY "Service role full access"
  ON real_face_sessions FOR ALL
  USING (auth.role() = 'service_role');
