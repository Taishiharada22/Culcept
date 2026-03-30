-- face_phenotype テーブル作成
-- 顔まわり10カテゴリのアセスメント結果を保存
-- phenotype JSONB に Group A (骨格系) + Group B (印象系) + 顔全体印象を格納
-- Hair は既存 localStorage (culcept_hair_recipe_v1) を維持

CREATE TABLE IF NOT EXISTS public.face_phenotype (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phenotype jsonb NOT NULL DEFAULT '{}'::jsonb,
  photo_url text,
  completed_categories text[] DEFAULT '{}',
  version integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.face_phenotype ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own face_phenotype"
  ON public.face_phenotype FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own face_phenotype"
  ON public.face_phenotype FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own face_phenotype"
  ON public.face_phenotype FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_face_phenotype_user_id
  ON public.face_phenotype (user_id);
