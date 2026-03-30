-- Per-context exploration state (enum-style single state per context)
-- States: "inactive" | "active" | "paused"
ALTER TABLE public.rendezvous_profiles
  ADD COLUMN IF NOT EXISTS context_states jsonb
    NOT NULL DEFAULT '{"friend":"inactive","romance":"inactive","orbiter":"inactive","cocreation":"inactive"}'::jsonb;

-- Auto-standby settings
ALTER TABLE public.rendezvous_profiles
  ADD COLUMN IF NOT EXISTS auto_standby_threshold_hours int NOT NULL DEFAULT 4;
ALTER TABLE public.rendezvous_profiles
  ADD COLUMN IF NOT EXISTS standby_active boolean NOT NULL DEFAULT false;
ALTER TABLE public.rendezvous_profiles
  ADD COLUMN IF NOT EXISTS standby_activated_at timestamptz;

COMMENT ON COLUMN public.rendezvous_profiles.context_states IS 'Per-context exploration state: inactive/active/paused';
COMMENT ON COLUMN public.rendezvous_profiles.auto_standby_threshold_hours IS 'Hours of inactivity before auto-standby (0=off)';
