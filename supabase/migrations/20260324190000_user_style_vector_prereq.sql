-- =============================================================================
-- user_style_vector Prereq — 20260324200000 ALTER 前置 historical shape
-- =============================================================================
-- 起草日: 2026-05-27
-- 親 phase: migration-debt-phase → migration-debt-repair → Stage R3 staging replay
-- CEO 確定: 2026-05-27 (B base、 historical shape 適用、 Layer 1 と同一原則)
--
-- 目的:
--   後続 20260324200000_rendezvous_appearance_expansion.sql の
--   `ALTER TABLE user_style_vector ADD COLUMN IF NOT EXISTS` が解決する前提条件として
--   user_style_vector を historical shape (= 20260324200000 直前 shape) で前置する。
--
-- Historical shape の根拠 (focused drift audit、 2026-05-27):
--   1. 20260324200000 が ADD COLUMN するのは以下 3 列のみ:
--        face_type_primary text
--        hair_length       text
--        hair_texture      text
--   2. 20260326300000_my_style_tables.sql (後付け追跡 file) の CREATE TABLE が
--      post-ALTER shape を表しているが、 face_type_primary / hair_texture を
--      tracking 漏れしている。 これは 20260324200000 の ADD COLUMN IF NOT EXISTS が
--      後で補完するので最終 shape には影響しない。
--   3. したがって 20260324200000 直前 shape =
--      20260326300000 の CREATE shape − { hair_length }
--      ≒ user_id (PK FK) / pc_season / pc_base / jp_3type / jp_7type /
--        face_type / created_at / updated_at
--
-- 順序:
--   この migration (20260324190000_user_style_vector_prereq.sql)
--     → 20260324200000 (ALTER ADD COLUMN face_type_primary / hair_length / hair_texture)
--     → 20260326300000 (CREATE TABLE IF NOT EXISTS = no-op、 RLS + POLICY 設定)
--
-- 最終 shape (全 migration 適用後):
--   user_id (PK FK) / pc_season / pc_base / jp_3type / jp_7type /
--   face_type / face_type_primary / hair_length / hair_texture /
--   created_at / updated_at
--   + RLS enabled + 3 policy (read / insert / update own)
--
-- 安全性:
--   既存環境 (production / staging-pre-reset): IF NOT EXISTS で no-op
--   staging (clean reset): 本 file が CREATE、 後段で columns + RLS + POLICY 追加
--
-- sanitize 7 ルール準拠:
--   1. CREATE TABLE → IF NOT EXISTS  ✓
--   2-7. (該当なし — 本 file は CREATE TABLE のみ)
--
-- 関連 doc:
--   docs/alter-plan-migration-debt-stage-r3-staging-replay-readiness.md
-- =============================================================================

CREATE TABLE IF NOT EXISTS "public"."user_style_vector" (
    "user_id" "uuid" PRIMARY KEY REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "pc_season" "text",
    "pc_base" "text",
    "jp_3type" "text",
    "jp_7type" "text",
    "face_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
