-- eye_profile テーブル作成 + eye_color カラム
-- 目の形と色の分析結果を保存

CREATE TABLE IF NOT EXISTS public.eye_profile (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  eye_type text NOT NULL,
  eye_color text,
  confidence numeric DEFAULT 0,
  selection_method text DEFAULT 'manual',
  is_flipped boolean DEFAULT false,
  inner_corner_x numeric,
  inner_corner_y numeric,
  outer_corner_x numeric,
  outer_corner_y numeric,
  eye_width_px numeric,
  eye_height_px numeric,
  aspect_ratio numeric,
  version integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.eye_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own eye_profile"
  ON public.eye_profile FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own eye_profile"
  ON public.eye_profile FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own eye_profile"
  ON public.eye_profile FOR UPDATE
  USING (auth.uid() = user_id);

-- eye_type CHECK
ALTER TABLE public.eye_profile
ADD CONSTRAINT eye_profile_eye_type_check
CHECK (eye_type IN ('armond', 'kirenaga', 'tsurime', 'tareme', 'marume', 'yanagiba'));

-- eye_color CHECK
ALTER TABLE public.eye_profile
ADD CONSTRAINT eye_profile_eye_color_check
CHECK (eye_color IS NULL OR eye_color IN (
  'dark_brown', 'brown', 'light_brown', 'hazel', 'gray_brown', 'amber'
));
