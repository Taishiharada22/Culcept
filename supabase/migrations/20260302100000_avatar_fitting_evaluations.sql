-- Avatar Fitting Evaluations & Feedback tables

CREATE TABLE IF NOT EXISTS avatar_fitting_evaluations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url text,
  extracted_attributes jsonb NOT NULL DEFAULT '{}',
  overall_match numeric NOT NULL CHECK (0 <= overall_match AND overall_match <= 100),
  band text NOT NULL CHECK (band IN ('green','yellow','red')),
  size_score numeric,
  visual_score numeric,
  color_score numeric,
  preference_score numeric,
  confidence numeric CHECK (0 <= confidence AND confidence <= 1),
  avatar_comment text,
  details jsonb DEFAULT '{}',
  layer_coverage jsonb DEFAULT '{}',
  weights_used jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS avatar_fitting_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id uuid REFERENCES avatar_fitting_evaluations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_rating int CHECK (1 <= user_rating AND user_rating <= 5),
  size_satisfaction int CHECK (1 <= size_satisfaction AND size_satisfaction <= 5),
  visual_satisfaction int CHECK (1 <= visual_satisfaction AND visual_satisfaction <= 5),
  purchased boolean DEFAULT false,
  comment text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(evaluation_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_avatar_fitting_evaluations_user_id ON avatar_fitting_evaluations(user_id);
CREATE INDEX IF NOT EXISTS idx_avatar_fitting_evaluations_created_at ON avatar_fitting_evaluations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_avatar_fitting_feedback_user_id ON avatar_fitting_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_avatar_fitting_feedback_evaluation_id ON avatar_fitting_feedback(evaluation_id);

-- RLS
ALTER TABLE avatar_fitting_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_fitting_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own evaluations"
  ON avatar_fitting_evaluations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own evaluations"
  ON avatar_fitting_evaluations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own feedback"
  ON avatar_fitting_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback"
  ON avatar_fitting_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);
