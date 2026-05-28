-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- P3-A-1-1-a Migration — Calendar OAuth schema (= Google + 将来 Microsoft 用)
--
-- 設計書:
--   - docs/alter-plan-p3-a-1-google-calendar-readiness.md (= 親 readiness、 12 問 全 CEO 確定)
--   - docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md (= 本 migration の元 readiness、
--     §1.5 token + §1.8 settings の schema 草案)
--   - docs/decision-log.md 2026-05-26 entry (= P3 redefinition + Phase Next 6 軸記録)
--
-- 目的:
--   1. user_calendar_connections (= 接続単位、 token 暗号化保管 + status + scopes)
--   2. user_calendar_subscriptions (= 取り込み対象 calendar 単位、 per-calendar toggle + 差分 sync token)
--
-- 不変原則 (= CEO + GPT 補正 2026-05-26、 schema-only first commit に厳格限定):
--   1. **schema 定義のみ** (= OAuth API call / callback handler / env / 実 wiring には進まない)
--   2. RLS 二重防御 (= auth.uid() = user_id、 application 層でも明示 .eq 想定)
--   3. 暗号化方式は **実装時確定** (= refresh_token_encrypted bytea のまま、 暗号化処理は application 層)
--      候補: pgsodium / pgcrypto / Supabase Vault (= migration apply 前に方式確定)
--   4. idempotent (= CREATE TABLE IF NOT EXISTS、 DROP POLICY IF EXISTS + CREATE で再実行 OK)
--   5. 既存 schema 不変 (= auth.users / external_anchor_sources / external_anchors 等 触らない)
--   6. **db push は CEO 個別承認** (= P3-B .ics migration `20260526100000_p3_ics_import.sql` と
--      同じく HOLD、 本 commit は schema draft のみ)
--
-- 本 migration の範囲外 (= 別 sub-phase で扱う):
--   - Google Cloud Console 設定 (= 別途 CEO に確認: project / Support email / domain)
--   - OAuth flow scaffold (= P3-A-1-1-c 以降、 別 commit)
--   - callback handler (= P3-A-1-1-d 以降)
--   - token refresh logic (= P3-A-1-1-e、 application 層実装)
--   - initial sync logic (= P3-A-1-2)
--   - 差分 sync (= P3-A-1-3、 sync_token field を使用するが本 migration では schema のみ)
--   - UI (= P3-A-1-1-f / g / h)
--   - test (= P3-A-1-1-i、 application 層実装後)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. user_calendar_connections
--    接続単位 (= 1 user × 1 provider = 1 row、 token と接続状態を保持)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS user_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 接続先 provider (= 親 readiness P3-A-1 / A-2 / 将来拡張)
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft')),

  -- 暗号化された refresh_token
  -- 暗号化方式は実装時確定 (= pgsodium / pgcrypto / Supabase Vault のいずれか)
  -- bytea で保持し、 application 層で暗号化 / 復号
  refresh_token_encrypted bytea NOT NULL,

  -- access_token 期限切れ判定用
  -- access_token 自体は短命なので保管せず、 都度 refresh_token から再取得
  access_token_expires_at timestamptz,

  -- 取得した OAuth scope を記録 (= 将来 scope 拡張時の diff 比較に使う)
  -- 例: ['calendar.events.readonly', 'calendar.calendarlist.readonly']
  scopes text[] NOT NULL,

  -- 接続状態
  --   active        = 接続中、 sync 正常
  --   revoked       = user が切断 / Google 側で許可取り消し、 既存 token 失効
  --   token_expired = refresh_token 自体が失効 (= 長期未使用等)、 user に再連携要求必要
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'token_expired')),

  -- 接続時刻
  connected_at timestamptz NOT NULL DEFAULT now(),

  -- 最終 sync 時刻 (= connection 全体の最終時刻、 individual sync は subscriptions 側)
  last_synced_at timestamptz,

  -- 1 user × 1 provider 制約 (= 同 provider への重複接続防止)
  UNIQUE (user_id, provider)
);

COMMENT ON TABLE user_calendar_connections IS
  'P3-A-1-1: OAuth-based calendar 接続単位 (= Google + 将来 Microsoft)、 token 暗号化保管 + status 管理';

COMMENT ON COLUMN user_calendar_connections.refresh_token_encrypted IS
  '暗号化された refresh_token (= bytea、 方式は実装時確定: pgsodium / pgcrypto / Supabase Vault)';

COMMENT ON COLUMN user_calendar_connections.status IS
  'active=接続中 / revoked=user 切断 / token_expired=refresh_token 失効';

COMMENT ON COLUMN user_calendar_connections.scopes IS
  '取得した OAuth scope 配列。 P3-A-1 確定: calendar.events.readonly + calendar.calendarlist.readonly';


-- RLS (= user 隔離、 RLS + 明示 .eq の二重防御 前提)
ALTER TABLE user_calendar_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_connection_select" ON user_calendar_connections;
CREATE POLICY "own_connection_select" ON user_calendar_connections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_connection_insert" ON user_calendar_connections;
CREATE POLICY "own_connection_insert" ON user_calendar_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_connection_update" ON user_calendar_connections;
CREATE POLICY "own_connection_update" ON user_calendar_connections
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_connection_delete" ON user_calendar_connections;
CREATE POLICY "own_connection_delete" ON user_calendar_connections
  FOR DELETE USING (auth.uid() = user_id);


-- index (= user_id + provider lookup 高速化、 UNIQUE と一部重複するが意図的)
CREATE INDEX IF NOT EXISTS idx_user_calendar_connections_user_status
  ON user_calendar_connections (user_id, status)
  WHERE status = 'active';


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. user_calendar_subscriptions
--    取り込み対象 calendar 単位 (= 親 Q2 採用案 c の per-calendar toggle + 差分 sync token)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS user_calendar_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES user_calendar_connections(id) ON DELETE CASCADE,

  -- 外部 calendar 識別子 (= Google: calendar.id、 Microsoft: calendar.id)
  -- 例: "primary" / "user@gmail.com" / "shared@group.calendar.google.com"
  external_calendar_id text NOT NULL,

  -- user 向け表示名 (= calendar list 取得時の summary)
  -- 例: "仕事", "家族共有", "国民の祝日"
  display_name text NOT NULL,

  -- accessRole 記録 (= 親 Q2 採用案 c の自動判定 logic で参照)
  --   owner  = user 自身の calendar (= default ON)
  --   writer = 書き込み許可された共有 calendar (= default ON)
  --   reader = 読み取り専用共有 calendar (= default OFF、 他人の予定混入防止)
  access_role text NOT NULL CHECK (access_role IN ('owner', 'writer', 'reader')),

  -- primary calendar flag (= 必ず is_enabled=true、 親 Q2 確定)
  is_primary boolean NOT NULL DEFAULT false,

  -- 取り込み対象か (= sync で events 読み込むか)
  -- 親 Q2 採用案: primary 必ず true / owner-writer default true / reader default false
  -- user は設定画面 (= 親 Q5、 マイページ > 設定 > 連携) で個別に toggle 可能
  is_enabled boolean NOT NULL DEFAULT false,

  -- 差分 sync 用 syncToken (= Google syncToken、 calendar 別に保管)
  -- NULL なら次回 sync は full sync (= 親 Q4 採用案 過去 30 日 + 未来 90 日)
  -- 値あれば incremental sync
  sync_token text,

  -- per-calendar の最終 sync 時刻
  last_synced_at timestamptz,

  -- sync failure 時の error message (= 親 Q6 silent degrade + banner logic で参照)
  -- 例: "rate_limit_exceeded" / "auth_failed" / "calendar_not_found"
  last_sync_error text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- 1 connection × 1 external_calendar = 1 row 制約 (= 重複防止)
  UNIQUE (connection_id, external_calendar_id)
);

COMMENT ON TABLE user_calendar_subscriptions IS
  'P3-A-1-1: per-calendar 取り込み対象 + 差分 sync token (= Google syncToken / 将来 Microsoft delta link)';

COMMENT ON COLUMN user_calendar_subscriptions.is_enabled IS
  '取り込み対象か。 親 Q2 採用案: primary 必ず true / owner-writer default ON / reader default OFF';

COMMENT ON COLUMN user_calendar_subscriptions.sync_token IS
  'Google syncToken (= incremental sync 用、 calendar 別)。 NULL なら次回 full sync 実行';

COMMENT ON COLUMN user_calendar_subscriptions.access_role IS
  'Google calendar list accessRole (= owner / writer / reader)。 default is_enabled 設定の根拠';


-- RLS (= user 隔離、 connection 経由ではなく直接 user_id で隔離)
ALTER TABLE user_calendar_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_subscription_select" ON user_calendar_subscriptions;
CREATE POLICY "own_subscription_select" ON user_calendar_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_subscription_insert" ON user_calendar_subscriptions;
CREATE POLICY "own_subscription_insert" ON user_calendar_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_subscription_update" ON user_calendar_subscriptions;
CREATE POLICY "own_subscription_update" ON user_calendar_subscriptions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_subscription_delete" ON user_calendar_subscriptions;
CREATE POLICY "own_subscription_delete" ON user_calendar_subscriptions
  FOR DELETE USING (auth.uid() = user_id);


-- index
-- 1. connection 経由 lookup (= sync 時に connection から全 subscriptions を取得)
CREATE INDEX IF NOT EXISTS idx_user_calendar_subscriptions_connection
  ON user_calendar_subscriptions (connection_id);

-- 2. user × enabled lookup (= 設定画面表示や sync 候補抽出に使う)
CREATE INDEX IF NOT EXISTS idx_user_calendar_subscriptions_user_enabled
  ON user_calendar_subscriptions (user_id, is_enabled)
  WHERE is_enabled = true;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 注: updated_at の自動更新は application 層で行う前提
--   (= 既存 schema に共通 trigger function が無い場合、 application 層で SET updated_at=now())
--   既存 trigger 流用するなら本 migration に追記 (= 実装時 検討、 別 commit)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
