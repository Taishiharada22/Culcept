-- ④-A: Common Baseline — profiles テーブルにベースラインフィールドを追加
-- gender, date_of_birth, prefecture を Rendezvous 専用から共通プロフィールに昇格
-- Alter の文脈正規化（deriveBaselineContext）で使用

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text
    CHECK (gender IN ('male', 'female', 'non_binary', 'prefer_not_to_say')),
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS prefecture text,
  ADD COLUMN IF NOT EXISTS baseline_completed_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.profiles.gender IS
  'ユーザーの性別。prefer_not_to_say は完全尊重（推論なし）。Alter ベースラインコンテキストで使用。';
COMMENT ON COLUMN public.profiles.date_of_birth IS
  '生年月日。ライフステージ導出に使用。直接表示しない。';
COMMENT ON COLUMN public.profiles.prefecture IS
  '居住都道府県。エリアタイプ導出に使用。user_weather_settings.prefecture と同期すべき。';
COMMENT ON COLUMN public.profiles.baseline_completed_at IS
  'ベースライン収集完了タイムスタンプ。NULL = 未収集。登録直後の必須ステップ。';

-- baseline_completed_at の部分インデックス（「収集済みか？」の高速判定）
CREATE INDEX IF NOT EXISTS idx_profiles_baseline_completed
  ON public.profiles (baseline_completed_at)
  WHERE baseline_completed_at IS NOT NULL;
