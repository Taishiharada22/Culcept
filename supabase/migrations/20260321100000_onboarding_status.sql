-- Add onboarding tracking to profiles table
-- onboarded_at: NULL = not yet onboarded, timestamp = completed onboarding

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz DEFAULT NULL;

-- Index for fast "has user onboarded?" checks
CREATE INDEX IF NOT EXISTS idx_profiles_onboarded_at
  ON public.profiles (onboarded_at)
  WHERE onboarded_at IS NOT NULL;

COMMENT ON COLUMN public.profiles.onboarded_at IS
  'Timestamp when user completed the onboarding flow (Origin Light + Stargazer First Touch). NULL = not yet onboarded.';
