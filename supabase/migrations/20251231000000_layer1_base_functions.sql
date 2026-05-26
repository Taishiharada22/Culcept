-- =============================================================================
-- Layer 1 Base Functions — 補完 migration (前置 base functions)
-- =============================================================================
-- 起草日: 2026-05-27
-- 親 phase: migration-debt-phase → migration-debt-repair → Stage R2-1 / R3
-- CEO 確定: 2026-05-27 (B + E + 補正、 関数依存解消)
--
-- 対象 (production manual function、 schema dump から抽出):
--   1. public.generate_public_id() : profiles.public_id column DEFAULT で参照
--   2. public.is_admin() : profiles + notifications の POLICY で参照
--
-- 起源:
--   production に手動作成された関数を補完。
--   production schema dump (--schema public) から CREATE 文をそのまま抽出、
--   to_regprocedure() check で wrap (推測なし、 raw definition そのまま)。
--
-- 安全性:
--   to_regprocedure IS NOT NULL (既存環境): no-op
--   to_regprocedure IS NULL (staging clean): CREATE 実行
--
-- 関数 body 内の dependencies:
--   - generate_public_id: public.profiles を参照 (後段の 20260101000000 で作成)
--   - is_admin: public.app_admins を参照 (lazy resolve、 関数 CREATE 自体は OK)
--
-- 関連 doc:
--   docs/alter-plan-migration-debt-stage-r3-staging-replay-readiness.md
--   docs/alter-plan-migration-debt-stage-r2-1-layer1-base-readiness.md
-- =============================================================================

-- ════════════════════════════════════════════════════════════════════
-- 1. public.generate_public_id()
-- ════════════════════════════════════════════════════════════════════

DO $check_generate_public_id$
BEGIN
  IF to_regprocedure('public.generate_public_id()') IS NULL THEN
CREATE OR REPLACE FUNCTION "public"."generate_public_id"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$ DECLARE new_id TEXT; exists_count INT; BEGIN LOOP new_id := 'ANRS-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT || NOW()::TEXT), 1, 4)) || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 4)); SELECT COUNT(*) INTO exists_count FROM public.profiles WHERE public_id = new_id; EXIT WHEN exists_count = 0; END LOOP; RETURN new_id; END; $$;
  END IF;
END $check_generate_public_id$;


-- ════════════════════════════════════════════════════════════════════
-- 2. public.is_admin()
-- ════════════════════════════════════════════════════════════════════

DO $check_is_admin$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1 from public.app_admins a
    where a.user_id = auth.uid()
  );
$$;
  END IF;
END $check_is_admin$;
