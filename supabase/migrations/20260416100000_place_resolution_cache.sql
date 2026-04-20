-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- place_resolution_cache — 場所解決キャッシュの永続化テーブル
--
-- 目的: in-memory Map<string, PlaceResolutionCacheEntry> を Supabase に移行し、
--       プロセス再起動後もキャッシュを保持する。
--
-- 設計:
--   - キー: user_id + place_text + coarse_area（GPT推奨の3要素キー）
--   - 値: resolved_name, address, place_id, confidence, source, lat/lng
--   - TTL: 30日（last_used_at ベース）
--   - low confidence は保存しない（アプリケーション層で制御）
--
-- Phase:
--   - Phase B-1: テーブル作成（in-memory と並行稼働、段階移行）
--   - Phase C: lat/lng を route 計算に活用
--
-- ステータス: CEO承認待ち（未実行）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE place_resolution_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ━━ Cache Key（3要素キー） ━━
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_text TEXT NOT NULL,             -- ユーザーが言った場所名（正規化済み小文字）
  coarse_area TEXT DEFAULT 'unknown',   -- ユーザーエリア（正規化済み小文字）

  -- ━━ Resolution Result ━━
  resolved_name TEXT NOT NULL,          -- 正式名称（「マクドナルド 甲府店」等）
  address TEXT,                         -- 住所
  place_id TEXT,                        -- Google Place ID
  place_type TEXT NOT NULL              -- exact_proper_noun / chain_brand / generic_place
    CHECK (place_type IN ('exact_proper_noun', 'chain_brand', 'generic_place')),
  confidence TEXT NOT NULL              -- high / medium（low は保存しない）
    CHECK (confidence IN ('high', 'medium')),
  source TEXT NOT NULL                  -- web_search / places_api
    CHECK (source IN ('web_search', 'places_api', 'cache')),

  -- ━━ Location（Phase C で route 計算に使用） ━━
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,

  -- ━━ Usage Tracking ━━
  use_count INTEGER DEFAULT 1,

  -- ━━ Timestamps ━━
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now(),

  -- ━━ Unique Constraint（cache key） ━━
  UNIQUE(user_id, place_text, coarse_area)
);

-- Fast lookup by cache key
CREATE INDEX idx_place_cache_lookup
  ON place_resolution_cache(user_id, place_text, coarse_area);

-- TTL management（30日経過エントリの定期削除用）
CREATE INDEX idx_place_cache_ttl
  ON place_resolution_cache(last_used_at);

-- ━━ RLS: ユーザーは自分のキャッシュのみアクセス可能 ━━
ALTER TABLE place_resolution_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own place cache"
  ON place_resolution_cache FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own place cache"
  ON place_resolution_cache FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own place cache"
  ON place_resolution_cache FOR UPDATE
  USING (auth.uid() = user_id);

-- Note: DELETE は定期バッチジョブで TTL 超過エントリを削除
-- Example: DELETE FROM place_resolution_cache WHERE last_used_at < now() - interval '30 days';
