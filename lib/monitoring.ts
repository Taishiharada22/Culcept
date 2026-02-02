/**
 * モニタリング & アラート
 *
 * エラー率監視、no_cards発生時のSlack通知
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface HealthMetrics {
  timestamp: Date;
  totalImpressions: number;
  totalActions: number;
  noCardsEvents: number;
  errorRate: number;
  avgResponseTime: number;
}

/**
 * Slack通知を送信
 */
export async function sendSlackAlert(message: string, channel?: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('SLACK_WEBHOOK_URL not configured');
    console.log('[Alert]', message);
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: channel || '#alerts',
        text: message,
        username: 'Culcept Monitor',
        icon_emoji: ':warning:',
      }),
    });
  } catch (error) {
    console.error('Failed to send Slack alert:', error);
  }
}

/**
 * 健全性メトリクスを収集
 */
export async function collectHealthMetrics(): Promise<HealthMetrics> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // インプレッション数
  const { count: impressions } = await supabase
    .from('recommendation_impressions')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', oneHourAgo);

  // アクション数
  const { count: actions } = await supabase
    .from('recommendation_actions')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', oneHourAgo);

  // no_cardsイベント数（payloadにno_cardsフラグがある場合）
  const { count: noCards } = await supabase
    .from('recommendation_impressions')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', oneHourAgo)
    .eq('target_type', 'no_cards');

  return {
    timestamp: new Date(),
    totalImpressions: impressions || 0,
    totalActions: actions || 0,
    noCardsEvents: noCards || 0,
    errorRate: 0, // エラーログから別途計算
    avgResponseTime: 0, // APMから別途計算
  };
}

/**
 * no_cards発生時のアラート
 */
export async function checkNoCardsAlert(threshold: number = 10): Promise<void> {
  const metrics = await collectHealthMetrics();

  if (metrics.noCardsEvents > threshold) {
    await sendSlackAlert(
      `:warning: *no_cards アラート*\n` +
      `過去1時間で ${metrics.noCardsEvents} 件のno_cardsイベントが発生しました。\n` +
      `閾値: ${threshold} 件`
    );
  }
}

/**
 * CTR低下アラート
 */
export async function checkCTRAlert(minCTR: number = 5): Promise<void> {
  const metrics = await collectHealthMetrics();

  if (metrics.totalImpressions > 100) {
    // サンプル数が十分な場合のみ
    const ctr = (metrics.totalActions / metrics.totalImpressions) * 100;

    if (ctr < minCTR) {
      await sendSlackAlert(
        `:chart_with_downwards_trend: *CTR低下アラート*\n` +
        `現在のCTR: ${ctr.toFixed(1)}%\n` +
        `閾値: ${minCTR}%`
      );
    }
  }
}

/**
 * 定期ヘルスチェック（cron用）
 */
export async function runHealthCheck(): Promise<HealthMetrics> {
  const metrics = await collectHealthMetrics();

  console.log('='.repeat(40));
  console.log('Health Check Report');
  console.log('='.repeat(40));
  console.log(`Timestamp: ${metrics.timestamp.toISOString()}`);
  console.log(`Impressions (1h): ${metrics.totalImpressions}`);
  console.log(`Actions (1h): ${metrics.totalActions}`);
  console.log(`no_cards Events: ${metrics.noCardsEvents}`);
  console.log('='.repeat(40));

  // アラートチェック
  await checkNoCardsAlert();
  await checkCTRAlert();

  return metrics;
}

export default {
  sendSlackAlert,
  collectHealthMetrics,
  checkNoCardsAlert,
  checkCTRAlert,
  runHealthCheck,
};
