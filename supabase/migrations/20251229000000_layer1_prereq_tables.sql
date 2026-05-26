-- =============================================================================
-- Layer 1 Prereq Tables — base functions の前置 minimal CREATE TABLE
-- =============================================================================
-- 起草日: 2026-05-27
-- 親 phase: migration-debt-phase → migration-debt-repair → Stage R2-1 / R3
-- CEO 確定: 2026-05-27 (F、 3 段再分割)
--
-- 目的:
--   base functions migration (20251231000000_layer1_base_functions.sql) が
--   関数 body 内で参照する table を先に作成する。
--
--   - public.generate_public_id() (LANGUAGE plpgsql、 lazy resolve)
--     → 関数 CREATE 時は table 不要、 ただし関数定義の DEFAULT 句で
--       依存先 (public.profiles) が必要になる順序のため前置する。
--
--   - public.is_admin() (LANGUAGE sql STABLE、 eager resolve)
--     → 関数 CREATE 時に public.app_admins を resolve するため前置必須。
--
-- 対象 (minimal CREATE TABLE のみ、 DEFAULT 関数依存 / POLICY は付けない):
--   1. public.profiles
--   2. public.app_admins
--
-- 順序:
--   この migration → base functions (20251231000000) → 補完 file (20260101000000) →
--   既存 172 file
--
-- 安全性:
--   既存環境 (production): IF NOT EXISTS で no-op
--   staging (clean): minimal CREATE TABLE 実行、 後段で PK/FK/POLICY/DEFAULT 追加
--
-- 関連 doc:
--   docs/alter-plan-migration-debt-stage-r3-staging-replay-readiness.md
--   docs/alter-plan-migration-debt-stage-r2-1-layer1-base-readiness.md
-- =============================================================================

-- ════════════════════════════════════════════════════════════════════
-- 1. public.profiles (minimal、 public_id DEFAULT 削除版)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "locale" "text" DEFAULT 'en'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "onboarded_at" timestamp with time zone,
    "is_merged" boolean DEFAULT false,
    "merged_at" timestamp with time zone,
    "gender" "text",
    "date_of_birth" "date",
    "prefecture" "text",
    "baseline_completed_at" timestamp with time zone,
    "city" "text",
    "occupation" "text",
    "occupation_detail" "text",
    "public_id" "text" NOT NULL,
    "baseline_home_label" "text",
    "baseline_home_place_type" "text" DEFAULT 'home'::"text" NOT NULL,
    "baseline_home_lat" numeric(9,6),
    "baseline_home_lng" numeric(9,6),
    CONSTRAINT "profiles_baseline_home_place_type_check" CHECK (("baseline_home_place_type" = ANY (ARRAY['home'::"text", 'other'::"text"]))),
    CONSTRAINT "profiles_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text", 'non_binary'::"text", 'prefer_not_to_say'::"text"]))),
    CONSTRAINT "profiles_locale_check" CHECK (("locale" = ANY (ARRAY['en'::"text", 'ja'::"text"])))
);

-- ════════════════════════════════════════════════════════════════════
-- 2. public.app_admins (minimal)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "public"."app_admins" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);
