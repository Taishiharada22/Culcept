-- =============================================================================
-- Layer 1 Minimal Base — 補完 migration (CEO 確定 6 回目、 7 件最小補完、 historical shape)
-- =============================================================================
-- 起草日: 2026-05-26 (initial) / 2026-05-27 (historical-shape 補正)
-- 親 phase: migration-debt-phase → migration-debt-repair → Stage R2-1 / R3
--
-- 7 table (L-A 2 + L-B 5):
--   L-A (Active + Replay-blocker):
--     1. profiles
--     2. notifications
--   L-B (Replay-blocker、 全 Stargazer 系):
--     3. stargazer_profiles
--     4. stargazer_observations
--     5. stargazer_core_star
--     6. stargazer_resolved_types
--     7. stargazer_orbit_snapshots
--
-- sanitize 7 ルール:
--   1. CREATE TABLE → IF NOT EXISTS
--   2. CREATE INDEX → IF NOT EXISTS
--   3. ADD COLUMN → IF NOT EXISTS (該当 0)
--   4. CREATE POLICY → DROP POLICY IF EXISTS 前置 + CREATE
--   5. ADD CONSTRAINT → pg_constraint existence check (DO $$ IF NOT EXISTS)
--   6. ENABLE ROW LEVEL SECURITY → そのまま
--   7. OWNER TO → 除去
--
-- Historical-shape 補正 (2026-05-27):
--   stargazer 3 件は constellation_* shape で base を置く。
--   - stargazer_core_star: constellation_code + constellation_label
--   - stargazer_resolved_types: constellation_code のみ (label は元から無し)
--   - stargazer_orbit_snapshots: constellation_code + constellation_label
--   後続の 20260324100000 (constellation_code reset) と
--   20260330200000 (constellation_* → archetype_* rename) が history 通りに replay 可能。
--
-- profiles については baseline_home_* 4 column を本ファイルから外す:
--   - 後続 20260418120000_baseline_home_columns.sql が ADD COLUMN を実行する。
--   - 本ファイルでも prereq でも baseline_home_* は持たない。
--
-- 関連 doc:
--   docs/alter-plan-migration-debt-stage-r1-result.md
--   docs/alter-plan-migration-debt-stage-r2-redesign-readiness.md
--   docs/alter-plan-migration-debt-stage-r2-1-layer1-base-readiness.md
--   docs/alter-plan-migration-debt-stage-r3-staging-replay-readiness.md
-- =============================================================================

-- ════════════════════════════════════════════════════════════════════
-- table: profiles
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
    CONSTRAINT "profiles_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text", 'non_binary'::"text", 'prefer_not_to_say'::"text"]))),
    CONSTRAINT "profiles_locale_check" CHECK (("locale" = ANY (ARRAY['en'::"text", 'ja'::"text"])))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_pkey'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_public_id_key'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_public_id_key" UNIQUE ("public_id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_id_fkey'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_profiles_baseline_completed" ON "public"."profiles" USING "btree" ("baseline_completed_at") WHERE ("baseline_completed_at" IS NOT NULL);
CREATE INDEX IF NOT EXISTS "idx_profiles_is_merged" ON "public"."profiles" USING "btree" ("is_merged") WHERE ("is_merged" = false);
CREATE INDEX IF NOT EXISTS "idx_profiles_onboarded_at" ON "public"."profiles" USING "btree" ("onboarded_at") WHERE ("onboarded_at" IS NOT NULL);
CREATE INDEX IF NOT EXISTS "idx_profiles_public_id" ON "public"."profiles" USING "btree" ("public_id");
CREATE INDEX IF NOT EXISTS "profiles_locale_idx" ON "public"."profiles" USING "btree" ("locale");

DROP POLICY IF EXISTS "admin all profiles" ON "public"."profiles";
CREATE POLICY "admin all profiles" ON "public"."profiles" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

DROP POLICY IF EXISTS "profiles_select_own" ON "public"."profiles";
CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));

DROP POLICY IF EXISTS "profiles_update_own" ON "public"."profiles";
CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));

DROP POLICY IF EXISTS "profiles_upsert_own" ON "public"."profiles";
CREATE POLICY "profiles_upsert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));

DROP POLICY IF EXISTS "user own profiles" ON "public"."profiles";
CREATE POLICY "user own profiles" ON "public"."profiles" TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));


-- ════════════════════════════════════════════════════════════════════
-- table: notifications
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "link" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    "data" "jsonb"
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_pkey'
      AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_notifications_type" ON "public"."notifications" USING "btree" ("type");
CREATE INDEX IF NOT EXISTS "idx_notifications_user_created" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id") WHERE ("read_at" IS NULL);
CREATE INDEX IF NOT EXISTS "notifications_user_created_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);

DROP POLICY IF EXISTS "Users can delete own notifications" ON "public"."notifications";
CREATE POLICY "Users can delete own notifications" ON "public"."notifications" FOR DELETE USING (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "admin all notifications" ON "public"."notifications";
CREATE POLICY "admin all notifications" ON "public"."notifications" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

DROP POLICY IF EXISTS "notifications_select_own" ON "public"."notifications";
CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "notifications_update_own" ON "public"."notifications";
CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "user own notifications" ON "public"."notifications";
CREATE POLICY "user own notifications" ON "public"."notifications" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


-- ════════════════════════════════════════════════════════════════════
-- table: stargazer_profiles
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "public"."stargazer_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "dimensions" "jsonb" DEFAULT '{}'::"jsonb",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "stage_progress" "jsonb" DEFAULT '{"stage": "none"}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "observation_mode" "text" DEFAULT 'initial'::"text",
    "total_sessions" integer DEFAULT 0,
    "last_observation_at" timestamp with time zone,
    "axis_beliefs" "jsonb" DEFAULT '{}'::"jsonb",
    "median_response_time_ms" integer DEFAULT 5000
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stargazer_profiles_pkey'
      AND conrelid = 'public.stargazer_profiles'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."stargazer_profiles"
    ADD CONSTRAINT "stargazer_profiles_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stargazer_profiles_user_id_key'
      AND conrelid = 'public.stargazer_profiles'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."stargazer_profiles"
    ADD CONSTRAINT "stargazer_profiles_user_id_key" UNIQUE ("user_id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stargazer_profiles_user_id_fkey'
      AND conrelid = 'public.stargazer_profiles'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."stargazer_profiles"
    ADD CONSTRAINT "stargazer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");
  END IF;
END $$;

ALTER TABLE "public"."stargazer_profiles" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own stargazer profile" ON "public"."stargazer_profiles";
CREATE POLICY "Users can insert own stargazer profile" ON "public"."stargazer_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "Users can read own stargazer profile" ON "public"."stargazer_profiles";
CREATE POLICY "Users can read own stargazer profile" ON "public"."stargazer_profiles" FOR SELECT USING (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "Users can update own stargazer profile" ON "public"."stargazer_profiles";
CREATE POLICY "Users can update own stargazer profile" ON "public"."stargazer_profiles" FOR UPDATE USING (("auth"."uid"() = "user_id"));


-- ════════════════════════════════════════════════════════════════════
-- table: stargazer_observations
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "public"."stargazer_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "question_id" "text" NOT NULL,
    "phase" "text" NOT NULL,
    "shown_at" timestamp with time zone NOT NULL,
    "answered_at" timestamp with time zone,
    "response_time_ms" integer,
    "answer" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "hesitation_level" numeric(4,3) DEFAULT 0,
    "confidence_self_report" integer,
    "skipped" boolean DEFAULT false NOT NULL,
    "context_tags" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "answer_value" "jsonb",
    "stage" "text",
    "observation_layer" "text",
    "context" "text",
    "variant_id" "text",
    CONSTRAINT "stargazer_observations_confidence_self_report_check" CHECK ((("confidence_self_report" >= 0) AND ("confidence_self_report" <= 100))),
    CONSTRAINT "stargazer_observations_phase_check" CHECK (("phase" = ANY (ARRAY['initial'::"text", 'daily'::"text", 'deep'::"text", 'core'::"text"])))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stargazer_observations_pkey'
      AND conrelid = 'public.stargazer_observations'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."stargazer_observations"
    ADD CONSTRAINT "stargazer_observations_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stargazer_observations_user_id_fkey'
      AND conrelid = 'public.stargazer_observations'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."stargazer_observations"
    ADD CONSTRAINT "stargazer_observations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE "public"."stargazer_observations" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_stargazer_observations_phase" ON "public"."stargazer_observations" USING "btree" ("user_id", "phase");
CREATE INDEX IF NOT EXISTS "idx_stargazer_observations_stage" ON "public"."stargazer_observations" USING "btree" ("user_id", "stage");
CREATE INDEX IF NOT EXISTS "idx_stargazer_observations_user" ON "public"."stargazer_observations" USING "btree" ("user_id", "created_at" DESC);

DROP POLICY IF EXISTS "stargazer_observations_insert_own" ON "public"."stargazer_observations";
CREATE POLICY "stargazer_observations_insert_own" ON "public"."stargazer_observations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "stargazer_observations_select_own" ON "public"."stargazer_observations";
CREATE POLICY "stargazer_observations_select_own" ON "public"."stargazer_observations" FOR SELECT USING (("auth"."uid"() = "user_id"));


-- ════════════════════════════════════════════════════════════════════
-- table: stargazer_core_star
-- ════════════════════════════════════════════════════════════════════

-- HISTORICAL shape: constellation_code / constellation_label.
-- 20260330200000_rename_constellation_to_archetype.sql が
-- constellation_* → archetype_* に rename する。
CREATE TABLE IF NOT EXISTS "public"."stargazer_core_star" (
    "user_id" "uuid" NOT NULL,
    "constellation_code" "text" DEFAULT 'unobserved'::"text" NOT NULL,
    "constellation_label" "text" DEFAULT '未観測'::"text" NOT NULL,
    "core_traits" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "stability_score" numeric(4,3) DEFAULT 0 NOT NULL,
    "confidence_score" numeric(4,3) DEFAULT 0 NOT NULL,
    "last_recomputed_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stargazer_core_star_pkey'
      AND conrelid = 'public.stargazer_core_star'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."stargazer_core_star"
    ADD CONSTRAINT "stargazer_core_star_pkey" PRIMARY KEY ("user_id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stargazer_core_star_user_id_fkey'
      AND conrelid = 'public.stargazer_core_star'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."stargazer_core_star"
    ADD CONSTRAINT "stargazer_core_star_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE "public"."stargazer_core_star" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stargazer_core_star_insert_own" ON "public"."stargazer_core_star";
CREATE POLICY "stargazer_core_star_insert_own" ON "public"."stargazer_core_star" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "stargazer_core_star_select_own" ON "public"."stargazer_core_star";
CREATE POLICY "stargazer_core_star_select_own" ON "public"."stargazer_core_star" FOR SELECT USING (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "stargazer_core_star_update_own" ON "public"."stargazer_core_star";
CREATE POLICY "stargazer_core_star_update_own" ON "public"."stargazer_core_star" FOR UPDATE USING (("auth"."uid"() = "user_id"));


-- ════════════════════════════════════════════════════════════════════
-- table: stargazer_resolved_types
-- ════════════════════════════════════════════════════════════════════

-- HISTORICAL shape: constellation_code のみ (constellation_label は元から無し)。
-- 20260330200000_rename_constellation_to_archetype.sql で
-- constellation_code → archetype_code に rename。
-- 20260330200000 line 134-142 のコメント参照:
--   「archetype_label may not exist on resolved_types
--    (original schema had no constellation_label)」
CREATE TABLE IF NOT EXISTS "public"."stargazer_resolved_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "constellation_code" "text",
    "top_matches" "jsonb",
    "axis_scores" "jsonb",
    "confidence" numeric(4,3),
    "stage2_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stargazer_resolved_types_pkey'
      AND conrelid = 'public.stargazer_resolved_types'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."stargazer_resolved_types"
    ADD CONSTRAINT "stargazer_resolved_types_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stargazer_resolved_types_user_id_key'
      AND conrelid = 'public.stargazer_resolved_types'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."stargazer_resolved_types"
    ADD CONSTRAINT "stargazer_resolved_types_user_id_key" UNIQUE ("user_id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stargazer_resolved_types_user_id_fkey'
      AND conrelid = 'public.stargazer_resolved_types'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."stargazer_resolved_types"
    ADD CONSTRAINT "stargazer_resolved_types_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");
  END IF;
END $$;

ALTER TABLE "public"."stargazer_resolved_types" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own resolved types" ON "public"."stargazer_resolved_types";
CREATE POLICY "Users can insert own resolved types" ON "public"."stargazer_resolved_types" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "Users can read own resolved types" ON "public"."stargazer_resolved_types";
CREATE POLICY "Users can read own resolved types" ON "public"."stargazer_resolved_types" FOR SELECT USING (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "Users can update own resolved types" ON "public"."stargazer_resolved_types";
CREATE POLICY "Users can update own resolved types" ON "public"."stargazer_resolved_types" FOR UPDATE USING (("auth"."uid"() = "user_id"));


-- ════════════════════════════════════════════════════════════════════
-- table: stargazer_orbit_snapshots
-- ════════════════════════════════════════════════════════════════════

-- HISTORICAL shape: constellation_code / constellation_label。
-- 20260330200000_rename_constellation_to_archetype.sql で
-- constellation_* → archetype_* に rename される。
CREATE TABLE IF NOT EXISTS "public"."stargazer_orbit_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "constellation_code" "text" NOT NULL,
    "constellation_label" "text" NOT NULL,
    "drift_index" numeric(4,3) DEFAULT 0 NOT NULL,
    "summary" "text",
    "core_traits_snapshot" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stargazer_orbit_snapshots_pkey'
      AND conrelid = 'public.stargazer_orbit_snapshots'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."stargazer_orbit_snapshots"
    ADD CONSTRAINT "stargazer_orbit_snapshots_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stargazer_orbit_snapshots_user_id_fkey'
      AND conrelid = 'public.stargazer_orbit_snapshots'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."stargazer_orbit_snapshots"
    ADD CONSTRAINT "stargazer_orbit_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE "public"."stargazer_orbit_snapshots" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_stargazer_orbit_user" ON "public"."stargazer_orbit_snapshots" USING "btree" ("user_id", "captured_at" DESC);

DROP POLICY IF EXISTS "stargazer_orbit_insert_own" ON "public"."stargazer_orbit_snapshots";
CREATE POLICY "stargazer_orbit_insert_own" ON "public"."stargazer_orbit_snapshots" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "stargazer_orbit_select_own" ON "public"."stargazer_orbit_snapshots";
CREATE POLICY "stargazer_orbit_select_own" ON "public"."stargazer_orbit_snapshots" FOR SELECT USING (("auth"."uid"() = "user_id"));



-- ════════════════════════════════════════════════════════════════════
-- post-function: 関数依存の wiring (base functions 20251231000000 以降)
-- ════════════════════════════════════════════════════════════════════

-- profiles.public_id の DEFAULT を関数 ref で設定
-- production: 既に同 default、 idempotent (実質 no-op)
-- staging: 初回 setting
ALTER TABLE "public"."profiles"
  ALTER COLUMN "public_id" SET DEFAULT "public"."generate_public_id"();
