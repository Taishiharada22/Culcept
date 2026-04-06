-- profiles に city（市区町村）カラムを追加
-- ベースライン収集で都道府県+市区町村の両方を取得し、
-- より精密な天気連動・地域特性分析に使用

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city text;

COMMENT ON COLUMN public.profiles.city IS
  '市区町村名。ベースライン収集で都道府県と合わせて取得。天気連動・地域特性分析に使用。';

-- user_weather_settings にも city を追加
ALTER TABLE public.user_weather_settings
  ADD COLUMN IF NOT EXISTS city text;

COMMENT ON COLUMN public.user_weather_settings.city IS
  '市区町村名。profiles.city と同期。天気精度向上に使用。';
