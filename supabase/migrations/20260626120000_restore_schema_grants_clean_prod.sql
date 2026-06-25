-- ============================================================================
-- Option 2 — broad authenticated/service_role GRANT（clean prod 42501 系統的修正）
-- ----------------------------------------------------------------------------
-- 背景（2026-06-26）:
--   clean prod（plodugvgmdkusifdrdfz）は migration が table への明示 GRANT を持たず、
--   Supabase 既定の自動 grant に依存していたため全 table が 42501（permission denied）。
--   table-specific 最小 grant は Alter(35 table)/Genome/Stargazer/Plan 派生ごとに 42501 を
--   踏むため、Supabase 標準 posture（broad grant + RLS で行保護）に戻す。
--
-- live 前提確認（CEO が SQL Editor で実行・2026-06-26）:
--   SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity=false;
--   = rls_disabled_public_table_count = 0（全 public table が RLS 有効）
--   よって authenticated への broad DML grant は安全（RLS が全 table で行を保護）。
--
-- 方針:
--   anon          = 最小（schema usage + health の profiles SELECT）。table broad 無し。
--   authenticated = public 全 table に DML（SELECT/INSERT/UPDATE/DELETE）。行保護は RLS。DDL 無し。
--   service_role  = 広く全権（backend 信頼境界）。
--   app_admins    = anon/authenticated へ table-level 公開しない（REVOKE）。is_admin() が DEFINER で読む。
--   default privileges = 今後の table/sequence/function にも自動付与（再発防止）。
--   is_admin()    = SECURITY DEFINER 維持。
--
-- 冪等: GRANT/REVOKE/ALTER DEFAULT PRIVILEGES/ALTER FUNCTION は再実行 no-op。
-- ============================================================================

-- schema usage（PostgREST expose・全 role）
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- service_role: 広く全権（RLS bypass・信頼境界）
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- authenticated: public 全 table に DML（行保護は RLS）。DDL は与えない
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- anon: 最小（health の anon->profiles SELECT のみ。RLS で他人行 0）
GRANT SELECT ON public.profiles TO anon;

-- app_admins を anon/authenticated に table-level 公開しない（is_admin は DEFINER）
REVOKE ALL ON public.app_admins FROM anon, authenticated;

-- is_admin() を SECURITY DEFINER 維持（INVOKER だと authenticated の profiles policy が落ちる）
ALTER FUNCTION public.is_admin() SECURITY DEFINER;

-- default privileges（今後 migration が作る object へ自動付与＝同事故の再発防止）
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
-- 注: anon は default privileges に含めない（最小維持）。今後 anon read が要る table は個別 GRANT。
