-- profiles に公開ID (ANRS-XXXX-XXXX) を追加
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_id TEXT UNIQUE;

-- 既存ユーザーにランダムIDを付与
UPDATE public.profiles
SET public_id = 'ANRS-' ||
  UPPER(SUBSTR(MD5(RANDOM()::TEXT || id::TEXT), 1, 4)) || '-' ||
  UPPER(SUBSTR(MD5(RANDOM()::TEXT || id::TEXT || NOW()::TEXT), 1, 4))
WHERE public_id IS NULL;

-- NOT NULL に変更
ALTER TABLE public.profiles
  ALTER COLUMN public_id SET NOT NULL;

-- デフォルト値の関数を作成
CREATE OR REPLACE FUNCTION generate_public_id()
RETURNS TEXT AS $$
DECLARE
  new_id TEXT;
  exists_count INT;
BEGIN
  LOOP
    new_id := 'ANRS-' ||
      UPPER(SUBSTR(MD5(RANDOM()::TEXT || NOW()::TEXT), 1, 4)) || '-' ||
      UPPER(SUBSTR(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 4));
    SELECT COUNT(*) INTO exists_count FROM public.profiles WHERE public_id = new_id;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE public.profiles
  ALTER COLUMN public_id SET DEFAULT generate_public_id();

-- インデックス（検索用）
CREATE INDEX IF NOT EXISTS idx_profiles_public_id ON public.profiles(public_id);
