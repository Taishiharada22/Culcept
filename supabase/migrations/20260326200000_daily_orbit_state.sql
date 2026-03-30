-- Daily Orbit のサーバー永続化
-- origin_profiles に JSONB カラムを追加し、DailyOrbitStore 全体を保存する
-- localStorage からの移行期間中は両方に書き込み、サーバーを正とする

ALTER TABLE public.origin_profiles
  ADD COLUMN IF NOT EXISTS daily_orbit_state jsonb;

COMMENT ON COLUMN public.origin_profiles.daily_orbit_state IS
  'DailyOrbitStore (v2): entries, orbitLaws, selfResolution, threads, turningPoints, surpriseObservations, discoveryUnlocked, streak etc.';
