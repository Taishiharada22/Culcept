-- Life Profile インサイトの永続化
-- LLM 生成インサイトを life_profile_meta.latest_insight に JSONB でキャッシュ
-- リロード時に再生成せず、キャッシュから表示。エントリ変更時に再生成。

ALTER TABLE public.life_profile_meta
  ADD COLUMN IF NOT EXISTS latest_insight jsonb;

COMMENT ON COLUMN public.life_profile_meta.latest_insight IS
  'LLM生成インサイト: { id, type, title, body, relatedEntryIds, generatedAt, source }';
