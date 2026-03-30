-- ============================================================
-- ai_semantic_cache: DB実態と migration 定義の不整合を正式解消
--
-- 背景: テーブルが Dashboard/手動で先に作成されたため
-- CREATE TABLE IF NOT EXISTS が既存テーブルをスキップし、
-- migration SQL で定義されたカラムの一部が欠落していた。
-- 一方、手動で追加された有用カラム（updated_at, hit_count, expires_at）
-- も正式に残す。
-- ============================================================

-- 1. migration で定義されていたがDB上に無かったカラム（前回 ALTER で追加済み → IF NOT EXISTS で冪等に）
alter table ai_semantic_cache add column if not exists prompt_text text;
alter table ai_semantic_cache add column if not exists system_prompt text;

-- 2. 手動で追加され、コードでは使わないが将来有用なカラムの default 保証
--    （既に存在する場合は SET DEFAULT のみ）
alter table ai_semantic_cache add column if not exists updated_at timestamptz not null default now();
alter table ai_semantic_cache add column if not exists hit_count int not null default 0;
alter table ai_semantic_cache add column if not exists expires_at timestamptz default (now() + interval '1 hour');

-- 3. expires_at の NOT NULL 制約はコードが渡さないため nullable に統一（前回実施済み → 冪等）
alter table ai_semantic_cache alter column expires_at drop not null;

-- 4. model のデフォルトを揃える（手動DBでは '' default 付き NOT NULL）
alter table ai_semantic_cache alter column model set default '';
alter table ai_semantic_cache alter column model set not null;

-- 5. cache_key の UNIQUE 制約を保証
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_semantic_cache_cache_key_key'
      and conrelid = 'ai_semantic_cache'::regclass
  ) then
    alter table ai_semantic_cache add constraint ai_semantic_cache_cache_key_key unique (cache_key);
  end if;
end
$$;
