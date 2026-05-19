-- =============================================================================
-- CoAlter Mirror Channel — E-2-1a kill switch foundation migration
-- =============================================================================
--
-- 正本:
--   - 設計: docs/coalter-aoo-phase-e2-0-sequencing.md §5 / §6
--   - E-2-1a runbook: docs/coalter-aoo-phase-e2-1a-migration-runbook.md
--   - CEO 補正 4 件 (2026-05-20、PR #219 起票時):
--       1. service_role は RLS bypass、本 table は operator-only operation table
--       2. audit は tamper-evident (not tamper-proof)、UPDATE/DELETE 禁止 trigger を追加
--       3. SECURITY DEFINER function は search_path 固定
--       4. L1 env kill switch は env 削除 + 次回 Production deploy で反映 (即時ではない)
--
-- ⚠️ Production DB apply は本 migration 着地 (PR merge) とは別 step。
--    CEO 明示承認後に CEO が manual で実行する。本 PR merge では Production DB schema
--    に変更は加わらない。
--
-- 役割 (apply 後):
--   - Mirror Channel kill switch L3 の DB-side foundation
--   - `app_settings` table: kill switch flag store
--   - `coalter_mirror_kill_switch_audit` table: tamper-evident forensic log
--   - audit trigger function: kill switch flip の auto-record
--   - immutability trigger: audit row の UPDATE/DELETE を DB-side で deny
--   - RLS policies: anon/authenticated 経路の access 制御
--
-- ⚠️ canon 表明 (CEO 補正 #1):
--   Supabase の service_role は RLS を bypass する設計 (Supabase 公式 canon)。
--   本 migration の RLS policy は **anon / authenticated 経路向け** の制御のみ。
--   service_role は本 table を SELECT / UPDATE / DELETE 自由に実行できる。
--   したがって以下の表現を避ける:
--     ❌ "RLS policy で service_role を制限する"
--     ❌ "service_role でも改ざん不能"
--   正しい表現:
--     ✅ "operator-only operation table (service_role 経由で Supabase Studio から操作)"
--     ✅ "audit は tamper-evident、service_role / owner 権限では完全不可変ではない"
--
-- ⚠️ canon 表明 (CEO 補正 #2):
--   audit table は immutability trigger を持つ (DB-side defense)。BEFORE UPDATE/DELETE
--   で RAISE EXCEPTION するため、通常の SQL 経路では改ざん不能。ただし trigger 自体を
--   DROP できる権限 (postgres owner / superuser) では改ざん可能。これは Postgres の根本
--   仕様であり、tamper-evident (改ざんが「記録される」or「失敗する」) で十分とする。

BEGIN;

-- =============================================================================
-- (1) app_settings table (operator-only operation table)
-- =============================================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_user_id UUID
);

COMMENT ON TABLE app_settings IS
  'CoAlter Mirror Channel kill switch + future feature flags. Operator-only operation table. service_role bypasses RLS by Supabase design — RLS policies here only constrain anon/authenticated paths.';

COMMENT ON COLUMN app_settings.key IS
  'flag identifier. Currently: mirror_channel_enabled. Future flags may be added; reader must whitelist by key.';

COMMENT ON COLUMN app_settings.value IS
  'JSONB flag payload. mirror_channel_enabled expected shape: {"enabled": boolean}.';

COMMENT ON COLUMN app_settings.updated_by_user_id IS
  'auth.uid() of operator who last updated. NULL for system/migration seed.';

-- =============================================================================
-- (2) Mirror Channel kill switch initial row
--
--   注: 本 migration apply 時点で Production の Mirror は動作していない
--   (Phase E-2-α 未着手、env NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED 未投入)。
--   したがって enabled: true の seed は安全 (Mirror が読みに来ない)。
-- =============================================================================
INSERT INTO app_settings (key, value)
VALUES ('mirror_channel_enabled', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- (3) coalter_mirror_kill_switch_audit table (tamper-evident forensic log)
-- =============================================================================
CREATE TABLE IF NOT EXISTS coalter_mirror_kill_switch_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL CHECK (action IN ('enable', 'disable')),
  triggered_by_user_id UUID,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prior_state JSONB,
  new_state JSONB NOT NULL,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_mirror_kill_switch_audit_triggered_at
  ON coalter_mirror_kill_switch_audit (triggered_at DESC);

COMMENT ON TABLE coalter_mirror_kill_switch_audit IS
  'Mirror Channel kill switch flip audit log. Tamper-evident (DB-side immutability trigger §5) — NOT tamper-proof. service_role / postgres owner can still modify by dropping triggers; defense-in-depth via DB role separation in operator policy.';

COMMENT ON COLUMN coalter_mirror_kill_switch_audit.action IS
  'enable | disable. Auto-derived from new_state.value->enabled by trigger function.';

COMMENT ON COLUMN coalter_mirror_kill_switch_audit.triggered_by_user_id IS
  'auth.uid() at trigger time. NULL when triggered via service_role (Supabase Studio).';

-- =============================================================================
-- (4) audit trigger function (SECURITY DEFINER + search_path 固定、CEO 補正 #3)
--
--   副作用: audit row insert のみ (UPDATE/DELETE/他 table touch なし)
-- =============================================================================
CREATE OR REPLACE FUNCTION audit_mirror_kill_switch() RETURNS TRIGGER
SECURITY DEFINER
SET search_path = pg_catalog, public
LANGUAGE plpgsql
AS $$
DECLARE
  v_action TEXT;
  v_new_enabled BOOLEAN;
BEGIN
  IF NEW.key = 'mirror_channel_enabled' THEN
    v_new_enabled := (NEW.value->>'enabled')::boolean;
    IF v_new_enabled = false THEN
      v_action := 'disable';
    ELSE
      v_action := 'enable';
    END IF;

    INSERT INTO coalter_mirror_kill_switch_audit
      (action, triggered_by_user_id, prior_state, new_state)
    VALUES
      (v_action, auth.uid(), OLD.value, NEW.value);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION audit_mirror_kill_switch() IS
  'Trigger: insert audit row when app_settings.mirror_channel_enabled is UPDATEd. SECURITY DEFINER + search_path = pg_catalog, public locked.';

CREATE TRIGGER mirror_kill_switch_audit_trigger
AFTER UPDATE ON app_settings
FOR EACH ROW EXECUTE FUNCTION audit_mirror_kill_switch();

-- =============================================================================
-- (5) audit table immutability defense (DB-side guard、CEO 補正 #2)
--
--   BEFORE UPDATE / BEFORE DELETE で RAISE EXCEPTION。
--   通常経路では audit row 改ざん不能。
--   注: trigger 自体を DROP できる権限 (postgres owner / superuser) では bypass 可能。
--   これは Postgres 根本仕様。本 layer は "tamper-evident" 防御として十分。
-- =============================================================================
CREATE OR REPLACE FUNCTION prevent_audit_row_modify() RETURNS TRIGGER
SECURITY DEFINER
SET search_path = pg_catalog, public
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'coalter_mirror_kill_switch_audit rows are immutable (tamper-evident DB-side guard, E-2-1a §5).';
END;
$$;

COMMENT ON FUNCTION prevent_audit_row_modify() IS
  'Block UPDATE/DELETE on audit table. Defense-in-depth for tamper-evident audit log. Bypassable only by DROP TRIGGER (requires postgres owner / superuser).';

CREATE TRIGGER prevent_audit_update_trigger
BEFORE UPDATE ON coalter_mirror_kill_switch_audit
FOR EACH ROW EXECUTE FUNCTION prevent_audit_row_modify();

CREATE TRIGGER prevent_audit_delete_trigger
BEFORE DELETE ON coalter_mirror_kill_switch_audit
FOR EACH ROW EXECUTE FUNCTION prevent_audit_row_modify();

-- =============================================================================
-- (6) RLS enable (anon / authenticated 経路向け、service_role は bypass、CEO 補正 #1)
-- =============================================================================
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE coalter_mirror_kill_switch_audit ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- (7) app_settings RLS policies (anon / authenticated 経路のみ制御)
--
--   注: service_role は本 policy を bypass する (Supabase canon)。
--   L3 kill switch flip は Supabase Studio = service_role connection で実行する想定。
-- =============================================================================

-- (7a) anon + authenticated: key whitelist (本 phase は mirror_channel_enabled のみ) で SELECT 可
CREATE POLICY "app_settings_anon_read_mirror_kill_switch"
ON app_settings FOR SELECT
TO anon, authenticated
USING (key = 'mirror_channel_enabled');

-- (7b) anon + authenticated: INSERT / UPDATE / DELETE は明示 deny
--   (default deny で十分だが、defensive な explicit deny として policy 不在 = deny)

-- =============================================================================
-- (8) audit table RLS policies (anon / authenticated 経路のみ制御)
--
--   audit は forensic 専用。operator は Supabase Studio (service_role) で参照。
--   anon / authenticated には SELECT 不可 (policy 不在 = default deny)。
-- =============================================================================

-- (8a) anon / authenticated: SELECT/INSERT/UPDATE/DELETE すべて deny
--   (policy 未定義 = ALL deny、defensive comment のみ)

-- =============================================================================
-- (9) grants
--
--   PostgreSQL default では public role に table 操作権限が付与されることがあるので、
--   defensive に anon / authenticated への明示的な REVOKE を追加。
--   service_role は granted privilege + RLS bypass で自由 access。
-- =============================================================================

-- (9a) public role からの権限剥奪 (defensive)
REVOKE ALL ON app_settings FROM public;
REVOKE ALL ON coalter_mirror_kill_switch_audit FROM public;

-- (9b) anon / authenticated: app_settings は RLS policy (7a) 経由でのみ SELECT
GRANT SELECT ON app_settings TO anon, authenticated;

-- (9c) audit table は anon / authenticated には不可
-- (GRANT 不要、RLS policy 未定義で default deny)

-- (9d) service_role: 全 access (Supabase default、RLS bypass で操作可)
-- (GRANT 不要、Supabase service_role role は default で全 table 操作可)

COMMIT;

-- =============================================================================
-- post-apply verify (manual、CEO が DB apply 後に Supabase Studio で実行):
--
--   -- table 存在確認
--   SELECT tablename FROM pg_tables WHERE tablename IN ('app_settings', 'coalter_mirror_kill_switch_audit');
--
--   -- initial row 確認
--   SELECT key, value, updated_at FROM app_settings WHERE key = 'mirror_channel_enabled';
--
--   -- audit trigger 存在確認
--   SELECT trigger_name FROM information_schema.triggers
--   WHERE event_object_table IN ('app_settings', 'coalter_mirror_kill_switch_audit');
--
--   -- function 存在確認
--   SELECT proname FROM pg_proc WHERE proname IN ('audit_mirror_kill_switch', 'prevent_audit_row_modify');
--
--   -- immutability test (失敗するはず)
--   -- UPDATE coalter_mirror_kill_switch_audit SET reason = 'tamper test' WHERE id = ...;
--   -- → ERROR: coalter_mirror_kill_switch_audit rows are immutable
-- =============================================================================
