-- P3-6: stargazer_health_reports — Layer 1 構造監査レポートの永続化テーブル
-- scanAllAxes の JSON 出力を保存し、時系列で構造変化を追跡する。
-- Layer 2 (runtime) は Phase 3 後半で列追加予定。
--
-- period_key: UTC 日付文字列 (例: '2026-04-08')。Vercel Cron が UTC で動作するため UTC 基準。
-- UNIQUE(period_key, report_type) により同日再実行は UPSERT で上書き（冪等性保証）。

CREATE TABLE IF NOT EXISTS stargazer_health_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 期間キー: UTC 日付 (YYYY-MM-DD)。日次粒度
  period_key    text NOT NULL,
  -- レポート種別: 'layer1_structural' (現在) / 'layer2_runtime' (Phase 3後半)
  report_type   text NOT NULL DEFAULT 'layer1_structural',
  -- サマリー（HealthSummary をそのまま格納）
  summary       jsonb NOT NULL,
  -- 軸別レポート配列（AxisHealthReport[] をそのまま格納）
  axes          jsonb NOT NULL,
  -- レポート生成元: 'ci' / 'cron' / 'manual'
  trigger_source text NOT NULL DEFAULT 'manual',
  -- axis_registry_version（スキーマ変更の追跡用）
  registry_version text NOT NULL DEFAULT '1.0.0',
  -- タイムスタンプ
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 冪等性制約: 同一期間・同一種別のレポートは1行のみ
ALTER TABLE stargazer_health_reports
  ADD CONSTRAINT uq_health_reports_period_type UNIQUE (period_key, report_type);

-- 時系列クエリ用インデックス（UNIQUE制約がperiod_keyをカバーするため、created_at単独のみ）
CREATE INDEX IF NOT EXISTS idx_health_reports_created
  ON stargazer_health_reports (created_at DESC);

-- RLS: サービスロール（cron/CI）のみ書き込み可
ALTER TABLE stargazer_health_reports ENABLE ROW LEVEL SECURITY;

-- 読み取り: 認証済みユーザー（CEO ダッシュボード等）
CREATE POLICY "health_reports_read"
  ON stargazer_health_reports FOR SELECT
  TO authenticated
  USING (true);

-- 書き込み: service_role のみ（API route / cron から）
CREATE POLICY "health_reports_insert_service"
  ON stargazer_health_reports FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPSERT 用: service_role に UPDATE も許可
CREATE POLICY "health_reports_update_service"
  ON stargazer_health_reports FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
