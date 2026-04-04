-- ImplicitSignal ライフサイクル管理
-- 手動実行: psql -f scripts/cleanup-implicit-signals.sql
-- 将来: pg_cron で日次実行

-- 1. 昇格済み + 30日経過 → DELETE
DELETE FROM stargazer_implicit_signals
WHERE promoted_to_insight = true
  AND created_at < now() - interval '30 days';

-- 2. 低信頼 (< 0.3) + 14日経過 → DELETE
DELETE FROM stargazer_implicit_signals
WHERE confidence < 0.3
  AND created_at < now() - interval '14 days';

-- 3. 未昇格 + 90日経過 → DELETE
DELETE FROM stargazer_implicit_signals
WHERE promoted_to_insight = false
  AND created_at < now() - interval '90 days';

-- 4. 同一 user × axis × type が 50件超 → 古い方から DELETE（最新30件を残す）
DELETE FROM stargazer_implicit_signals
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, related_axis, signal_type
             ORDER BY created_at DESC
           ) as rn
    FROM stargazer_implicit_signals
  ) ranked
  WHERE rn > 30
);
