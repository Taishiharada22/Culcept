-- My Style 関連テーブルのマイグレーション追跡
-- これらのテーブルは本番DBに既に存在するが、migrations/ で追跡されていなかった。
-- CREATE TABLE IF NOT EXISTS を使い、既存環境では no-op。

-- 1. user_style_summary — スタイル要約 + quiz_result JSONB (SavedState 格納先)
CREATE TABLE IF NOT EXISTS public.user_style_summary (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  style_tags text[],
  wardrobe_colors text[],
  wardrobe_categories text[],
  quiz_result jsonb,
  mood_keywords text[],
  favorite_colors text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_style_summary ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own style summary"
    ON public.user_style_summary FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own style summary"
    ON public.user_style_summary FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own style summary"
    ON public.user_style_summary FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. pref_profile — スタイル嗜好プロファイル (silhouette, material, detail, pattern)
CREATE TABLE IF NOT EXISTS public.pref_profile (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  silhouette jsonb,
  material jsonb,
  detail jsonb,
  pattern jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pref_profile ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own pref profile"
    ON public.pref_profile FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own pref profile"
    ON public.pref_profile FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own pref profile"
    ON public.pref_profile FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. taste_layers_cache — テイストレイヤーキャッシュ (7日/30日のスナップショット)
CREATE TABLE IF NOT EXISTS public.taste_layers_cache (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  layer_7d jsonb,
  layer_30d jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.taste_layers_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own taste layers"
    ON public.taste_layers_cache FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own taste layers"
    ON public.taste_layers_cache FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own taste layers"
    ON public.taste_layers_cache FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. user_style_vector — スタイルDNA ベクトル (PC season, JP type, face/hair)
CREATE TABLE IF NOT EXISTS public.user_style_vector (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pc_season text,
  pc_base text,
  jp_3type text,
  jp_7type text,
  face_type text,
  hair_length text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_style_vector ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own style vector"
    ON public.user_style_vector FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own style vector"
    ON public.user_style_vector FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own style vector"
    ON public.user_style_vector FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
