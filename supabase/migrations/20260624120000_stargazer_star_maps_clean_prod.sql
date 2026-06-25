-- stargazer_star_maps — clean production 唯一の gap schema 補完（R4・2026-06-24）
--
-- 役割: login/baseline gate（requireBaseline.ts:29 / page.tsx:42）+ 初回観測 upsert（observations/route.ts:343,547・
--   onConflict:"user_id"）の対象 table。この table が無いと初回観測 upsert が失敗→保存 500→baseline 完了不可→login flow 破綻。
--
-- 列の出自（現コード由来・production legacy の未使用列は復活しない＝CEO「現コードが必要とする列だけで足りる」）:
--   書込: user_id / core_star(jsonb) / live_sky(jsonb) / updated_at  ← observations の3 upsert payload
--   read のみ（vestigial・現コード writer 無し・null 可だが select 対象ゆえ列は必須）:
--     id(requireBaseline.ts:30 / profile)・axis_beliefs(expansion-log:45・実体は stargazer_profiles 側)・
--     core_traits(oracle:57)・observation_depth(oracle:57 / psyche-signature:84)・created_at(expansion-log:45)
--   profile/route.ts:159 は select("*")。
-- 構造: production read-only index 確認 = PK + user_id unique のみ（追加 index 無し・同名規約）。
--
-- 適用先: local main / staging（昇格前）。**production への apply は B-7 rehabilitation + 別 CEO GO（本 migration は draft・未 apply）**。
-- 冪等: create table if not exists / add column if not exists / DO-block 制約 guard / drop policy if exists→create。

CREATE TABLE IF NOT EXISTS "public"."stargazer_star_maps" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL,
    "core_star" jsonb,
    "live_sky" jsonb,
    "axis_beliefs" jsonb,
    "core_traits" jsonb,
    "observation_depth" integer,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- 既存 table（drift 環境）でも列を冪等補完
ALTER TABLE "public"."stargazer_star_maps" ADD COLUMN IF NOT EXISTS "core_star" jsonb;
ALTER TABLE "public"."stargazer_star_maps" ADD COLUMN IF NOT EXISTS "live_sky" jsonb;
ALTER TABLE "public"."stargazer_star_maps" ADD COLUMN IF NOT EXISTS "axis_beliefs" jsonb;
ALTER TABLE "public"."stargazer_star_maps" ADD COLUMN IF NOT EXISTS "core_traits" jsonb;
ALTER TABLE "public"."stargazer_star_maps" ADD COLUMN IF NOT EXISTS "observation_depth" integer;
ALTER TABLE "public"."stargazer_star_maps" ADD COLUMN IF NOT EXISTS "created_at" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "public"."stargazer_star_maps" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();

-- PRIMARY KEY (id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stargazer_star_maps_pkey'
      AND conrelid = 'public.stargazer_star_maps'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."stargazer_star_maps"
      ADD CONSTRAINT "stargazer_star_maps_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

-- UNIQUE (user_id) — upsert onConflict:"user_id" に必須
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stargazer_star_maps_user_id_key'
      AND conrelid = 'public.stargazer_star_maps'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."stargazer_star_maps"
      ADD CONSTRAINT "stargazer_star_maps_user_id_key" UNIQUE ("user_id");
  END IF;
END $$;

-- FOREIGN KEY user_id -> auth.users ON DELETE CASCADE（privacy・account 削除で孤児化させない・兄弟 stargazer_core_star と同形）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stargazer_star_maps_user_id_fkey'
      AND conrelid = 'public.stargazer_star_maps'::regclass
  ) THEN
    ALTER TABLE ONLY "public"."stargazer_star_maps"
      ADD CONSTRAINT "stargazer_star_maps_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- RLS + owner-only policies（兄弟 stargazer_* 規約: auth.uid() = user_id）
ALTER TABLE "public"."stargazer_star_maps" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stargazer_star_maps_insert_own" ON "public"."stargazer_star_maps";
CREATE POLICY "stargazer_star_maps_insert_own" ON "public"."stargazer_star_maps"
  FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "stargazer_star_maps_select_own" ON "public"."stargazer_star_maps";
CREATE POLICY "stargazer_star_maps_select_own" ON "public"."stargazer_star_maps"
  FOR SELECT USING (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "stargazer_star_maps_update_own" ON "public"."stargazer_star_maps";
CREATE POLICY "stargazer_star_maps_update_own" ON "public"."stargazer_star_maps"
  FOR UPDATE USING (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "stargazer_star_maps_delete_own" ON "public"."stargazer_star_maps";
CREATE POLICY "stargazer_star_maps_delete_own" ON "public"."stargazer_star_maps"
  FOR DELETE USING (("auth"."uid"() = "user_id"));

-- Rollback（参考・本 migration は additive。clean rebuild では DROP 不要）:
--   DROP TABLE IF EXISTS "public"."stargazer_star_maps" CASCADE;
