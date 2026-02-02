/**
 * Phase 4: 最適化 & 本番準備
 *
 * 4-1. パフォーマンス最適化（キャッシュ）
 * 4-2. A/Bテスト基盤
 * 4-3. モニタリング & アラート
 * 4-4. ドキュメント整備
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// 4-1. パフォーマンス最適化
// ============================================================

function createCacheLayer() {
  console.log('\n' + '='.repeat(60));
  console.log('⚡ Phase 4-1: パフォーマンス最適化');
  console.log('='.repeat(60));

  const libDir = '/Users/haradataishi/Culcept/lib';

  const cacheCode = `/**
 * キャッシュレイヤー
 *
 * メモリキャッシュ + Supabase recommendation_cache テーブルを使用
 * Redis は将来的にオプションで追加可能
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// メモリキャッシュ（サーバーレスでは限定的だが、同一リクエスト内では有効）
const memoryCache = new Map<string, CacheEntry<unknown>>();

// デフォルトTTL（秒）
const DEFAULT_TTL = 60 * 5; // 5分

/**
 * キャッシュキーを生成
 */
export function createCacheKey(prefix: string, ...parts: (string | number | undefined)[]): string {
  return [prefix, ...parts.filter(Boolean)].join(':');
}

/**
 * メモリキャッシュから取得
 */
function getFromMemory<T>(key: string): T | null {
  const entry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * メモリキャッシュに保存
 */
function setToMemory<T>(key: string, data: T, ttlSeconds: number = DEFAULT_TTL): void {
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Supabaseキャッシュから取得
 */
async function getFromSupabase<T>(key: string): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from('recommendation_cache')
      .select('payload, expires_at')
      .eq('cache_key', key)
      .single();

    if (error || !data) return null;

    if (new Date(data.expires_at) < new Date()) {
      // 期限切れは削除
      await supabase.from('recommendation_cache').delete().eq('cache_key', key);
      return null;
    }

    return data.payload as T;
  } catch {
    return null;
  }
}

/**
 * Supabaseキャッシュに保存
 */
async function setToSupabase<T>(key: string, data: T, ttlSeconds: number = DEFAULT_TTL): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    await supabase
      .from('recommendation_cache')
      .upsert({
        cache_key: key,
        payload: data,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      });
  } catch (error) {
    console.error('Cache write error:', error);
  }
}

/**
 * キャッシュから取得（メモリ → Supabase の順）
 */
export async function get<T>(key: string): Promise<T | null> {
  // 1. メモリキャッシュ
  const memoryResult = getFromMemory<T>(key);
  if (memoryResult !== null) return memoryResult;

  // 2. Supabase キャッシュ
  const supabaseResult = await getFromSupabase<T>(key);
  if (supabaseResult !== null) {
    // メモリキャッシュにも保存
    setToMemory(key, supabaseResult);
    return supabaseResult;
  }

  return null;
}

/**
 * キャッシュに保存（メモリ + Supabase）
 */
export async function set<T>(key: string, data: T, ttlSeconds: number = DEFAULT_TTL): Promise<void> {
  setToMemory(key, data, ttlSeconds);
  await setToSupabase(key, data, ttlSeconds);
}

/**
 * キャッシュを削除
 */
export async function del(key: string): Promise<void> {
  memoryCache.delete(key);
  await supabase.from('recommendation_cache').delete().eq('cache_key', key);
}

/**
 * パターンに一致するキャッシュを削除
 */
export async function delByPattern(pattern: string): Promise<void> {
  // メモリキャッシュから削除
  for (const key of memoryCache.keys()) {
    if (key.includes(pattern)) {
      memoryCache.delete(key);
    }
  }

  // Supabaseから削除
  await supabase
    .from('recommendation_cache')
    .delete()
    .like('cache_key', \`%\${pattern}%\`);
}

/**
 * キャッシュ付きで関数を実行
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL
): Promise<T> {
  const cached = await get<T>(key);
  if (cached !== null) return cached;

  const result = await fn();
  await set(key, result, ttlSeconds);
  return result;
}

/**
 * 全キャッシュをクリア（開発用）
 */
export async function clearAll(): Promise<void> {
  memoryCache.clear();
  await supabase.from('recommendation_cache').delete().neq('cache_key', '');
}

export default {
  createCacheKey,
  get,
  set,
  del,
  delByPattern,
  withCache,
  clearAll,
};
`;

  fs.writeFileSync(path.join(libDir, 'cache.ts'), cacheCode);
  console.log(`✅ 作成: ${libDir}/cache.ts`);
}

// ============================================================
// 4-2. A/Bテスト基盤
// ============================================================

function createABTestFramework() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Phase 4-2: A/Bテスト基盤');
  console.log('='.repeat(60));

  const libDir = '/Users/haradataishi/Culcept/lib';

  const abTestCode = `/**
 * A/Bテスト基盤
 *
 * experiment_assignments テーブルを活用
 * アルゴリズム別の効果測定
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface Experiment {
  id: string;
  name: string;
  variants: string[];
  weights: number[]; // 各variantの割り当て確率
  isActive: boolean;
  startDate: Date;
  endDate?: Date;
}

export interface Assignment {
  experimentId: string;
  userId: string;
  variant: string;
  assignedAt: Date;
}

/**
 * ユーザーをvariantに割り当て
 */
export async function assignVariant(
  experimentId: string,
  userId: string,
  variants: string[],
  weights?: number[]
): Promise<string> {
  // 既存の割り当てを確認
  const { data: existing } = await supabase
    .from('experiment_assignments')
    .select('variant')
    .eq('experiment_id', experimentId)
    .eq('user_id', userId)
    .single();

  if (existing) {
    return existing.variant;
  }

  // 新規割り当て
  const normalizedWeights = weights || variants.map(() => 1 / variants.length);
  const random = Math.random();
  let cumulative = 0;
  let selectedVariant = variants[0];

  for (let i = 0; i < variants.length; i++) {
    cumulative += normalizedWeights[i];
    if (random < cumulative) {
      selectedVariant = variants[i];
      break;
    }
  }

  // 保存
  await supabase.from('experiment_assignments').insert({
    experiment_id: experimentId,
    user_id: userId,
    variant: selectedVariant,
    assigned_at: new Date().toISOString(),
  });

  return selectedVariant;
}

/**
 * ユーザーの割り当てを取得
 */
export async function getAssignment(
  experimentId: string,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('experiment_assignments')
    .select('variant')
    .eq('experiment_id', experimentId)
    .eq('user_id', userId)
    .single();

  return data?.variant || null;
}

/**
 * 実験結果を集計
 */
export async function getExperimentResults(experimentId: string): Promise<{
  variant: string;
  users: number;
  impressions: number;
  actions: number;
  saves: number;
  ctr: number;
}[]> {
  // 各variantのユーザー数を取得
  const { data: assignments } = await supabase
    .from('experiment_assignments')
    .select('variant, user_id')
    .eq('experiment_id', experimentId);

  if (!assignments) return [];

  const variantUsers = new Map<string, Set<string>>();
  assignments.forEach(a => {
    if (!variantUsers.has(a.variant)) {
      variantUsers.set(a.variant, new Set());
    }
    variantUsers.get(a.variant)!.add(a.user_id);
  });

  const results: {
    variant: string;
    users: number;
    impressions: number;
    actions: number;
    saves: number;
    ctr: number;
  }[] = [];

  for (const [variant, userIds] of variantUsers) {
    const userIdArray = [...userIds];

    // インプレッション数
    const { count: impressions } = await supabase
      .from('recommendation_impressions')
      .select('*', { count: 'exact', head: true })
      .in('user_id', userIdArray);

    // アクション数
    const { data: actions } = await supabase
      .from('recommendation_actions')
      .select('action')
      .in('user_id', userIdArray);

    const saves = actions?.filter(a => a.action === 'save').length || 0;
    const totalActions = actions?.length || 0;

    results.push({
      variant,
      users: userIds.size,
      impressions: impressions || 0,
      actions: totalActions,
      saves,
      ctr: impressions && impressions > 0 ? (saves / impressions) * 100 : 0,
    });
  }

  return results;
}

/**
 * 推薦アルゴリズムA/Bテスト
 */
export async function getRecommendationAlgorithm(userId: string): Promise<string> {
  const experimentId = 'rec_algorithm_v1';
  const variants = ['hybrid', 'collaborative', 'content_based', 'random'];
  const weights = [0.4, 0.2, 0.2, 0.2]; // hybridを40%に

  return assignVariant(experimentId, userId, variants, weights);
}

export default {
  assignVariant,
  getAssignment,
  getExperimentResults,
  getRecommendationAlgorithm,
};
`;

  fs.writeFileSync(path.join(libDir, 'ab-test.ts'), abTestCode);
  console.log(`✅ 作成: ${libDir}/ab-test.ts`);

  // マイグレーションSQL生成
  const migrationSql = `-- experiment_assignments テーブル（存在しない場合のみ作成）
CREATE TABLE IF NOT EXISTS experiment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  variant TEXT NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(experiment_id, user_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_experiment_assignments_experiment
  ON experiment_assignments(experiment_id);
CREATE INDEX IF NOT EXISTS idx_experiment_assignments_user
  ON experiment_assignments(user_id);
`;

  const migrationDir = '/Users/haradataishi/Culcept/supabase/migrations';
  if (!fs.existsSync(migrationDir)) {
    fs.mkdirSync(migrationDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  fs.writeFileSync(
    path.join(migrationDir, `${timestamp}_experiment_assignments.sql`),
    migrationSql
  );
  console.log(`✅ 作成: ${migrationDir}/${timestamp}_experiment_assignments.sql`);
}

// ============================================================
// 4-3. モニタリング & アラート
// ============================================================

function createMonitoring() {
  console.log('\n' + '='.repeat(60));
  console.log('📡 Phase 4-3: モニタリング & アラート');
  console.log('='.repeat(60));

  const libDir = '/Users/haradataishi/Culcept/lib';

  const monitoringCode = `/**
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
      \`:warning: *no_cards アラート*\\n\` +
      \`過去1時間で \${metrics.noCardsEvents} 件のno_cardsイベントが発生しました。\\n\` +
      \`閾値: \${threshold} 件\`
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
        \`:chart_with_downwards_trend: *CTR低下アラート*\\n\` +
        \`現在のCTR: \${ctr.toFixed(1)}%\\n\` +
        \`閾値: \${minCTR}%\`
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
  console.log(\`Timestamp: \${metrics.timestamp.toISOString()}\`);
  console.log(\`Impressions (1h): \${metrics.totalImpressions}\`);
  console.log(\`Actions (1h): \${metrics.totalActions}\`);
  console.log(\`no_cards Events: \${metrics.noCardsEvents}\`);
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
`;

  fs.writeFileSync(path.join(libDir, 'monitoring.ts'), monitoringCode);
  console.log(`✅ 作成: ${libDir}/monitoring.ts`);

  // APIエンドポイント作成
  const apiDir = '/Users/haradataishi/Culcept/app/api/health';
  if (!fs.existsSync(apiDir)) {
    fs.mkdirSync(apiDir, { recursive: true });
  }

  const healthApiCode = `import { NextResponse } from 'next/server';
import monitoring from '@/lib/monitoring';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const metrics = await monitoring.runHealthCheck();

    return NextResponse.json({
      status: 'ok',
      metrics,
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: String(error) },
      { status: 500 }
    );
  }
}
`;

  fs.writeFileSync(path.join(apiDir, 'route.ts'), healthApiCode);
  console.log(`✅ 作成: ${apiDir}/route.ts`);
}

// ============================================================
// 4-4. ドキュメント整備
// ============================================================

function createDocumentation() {
  console.log('\n' + '='.repeat(60));
  console.log('📚 Phase 4-4: ドキュメント整備');
  console.log('='.repeat(60));

  const docsDir = '/Users/haradataishi/Culcept/docs';
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // 推薦システムドキュメント
  const recSystemDoc = `# Culcept 推薦システム

## 概要

Culceptの推薦システムは、複数のアルゴリズムを組み合わせたハイブリッド推薦を提供します。

## アーキテクチャ

\`\`\`
┌─────────────────────────────────────────────────────────┐
│                      クライアント                        │
│  (BuyerSwipeClient / SwipeFeed)                        │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              API Layer (/api/recommendations)           │
│  - キャッシュチェック                                     │
│  - A/Bテスト割り当て                                     │
│  - アルゴリズム選択                                       │
└───────────────────────┬─────────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Collaborative│ │Content-Based │ │   Hybrid     │
│  Filtering   │ │   (Tags)     │ │   Engine     │
└──────────────┘ └──────────────┘ └──────────────┘
          │             │             │
          └─────────────┴─────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    Supabase                             │
│  - curated_cards                                        │
│  - recommendation_impressions                           │
│  - recommendation_actions                               │
│  - recommendation_cache                                 │
│  - experiment_assignments                               │
└─────────────────────────────────────────────────────────┘
\`\`\`

## アルゴリズム

### 1. 協調フィルタリング (collaborative.ts)

似たユーザーの行動パターンを分析し、まだ見ていないアイテムを推薦。

\`\`\`typescript
import { getCollaborativeRecommendations } from '@/lib/recommendations';

const cardIds = await getCollaborativeRecommendations(userId, 20);
\`\`\`

### 2. コンテンツベース推薦 (content-based.ts)

ユーザーが「いいね」したカードのタグを分析し、類似したコンテンツを推薦。

\`\`\`typescript
import { getContentBasedRecommendations } from '@/lib/recommendations';

const cards = await getContentBasedRecommendations(userId, 20);
\`\`\`

### 3. ハイブリッド推薦 (hybrid.ts)

複数のアルゴリズムを組み合わせ、重み付け調整可能。

\`\`\`typescript
import { recommend } from '@/lib/recommendations';

const cards = await recommend(userId, {
  limit: 20,
  weights: {
    collaborative: 0.3,
    contentBased: 0.3,
    diversity: 0.2,
    popularity: 0.2,
  },
});
\`\`\`

## API仕様

### GET /api/recommendations

推薦カードを取得。

**パラメータ:**
- \`v\` (number): APIバージョン（デフォルト: 2）
- \`role\` (string): buyer | seller
- \`stream\` (string): cards | drops | insights
- \`limit\` (number): 取得件数（デフォルト: 20）
- \`algorithm\` (string): hybrid | collaborative | content_based | random

**レスポンス:**
\`\`\`json
{
  "items": [
    {
      "impressionId": "uuid",
      "role": "buyer",
      "recType": "cards",
      "targetType": "card",
      "targetId": "card_id",
      "payload": {
        "card_id": "bomber_jacket_black",
        "image_url": "/cards/bomber_jacket_black.png",
        "tags": ["jacket", "outerwear", "bomber", "black"]
      }
    }
  ]
}
\`\`\`

### POST /api/recommendations/action

ユーザーアクションを記録。

**ボディ:**
\`\`\`json
{
  "impressionId": "uuid",
  "action": "like" | "dislike" | "skip"
}
\`\`\`

### GET /api/health

システムヘルスチェック。

## モニタリング

### Slack通知設定

\`\`\`bash
# .env.local
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
\`\`\`

### アラート条件

- **no_cards**: 1時間に10件以上発生
- **CTR低下**: CTRが5%を下回った場合

## A/Bテスト

### 新しい実験を開始

\`\`\`typescript
import { assignVariant } from '@/lib/ab-test';

const variant = await assignVariant(
  'new_algorithm_test',
  userId,
  ['control', 'treatment_a', 'treatment_b'],
  [0.5, 0.25, 0.25]
);
\`\`\`

### 結果集計

\`\`\`typescript
import { getExperimentResults } from '@/lib/ab-test';

const results = await getExperimentResults('new_algorithm_test');
console.log(results);
// [
//   { variant: 'control', users: 100, impressions: 500, saves: 50, ctr: 10 },
//   { variant: 'treatment_a', users: 50, impressions: 250, saves: 30, ctr: 12 },
// ]
\`\`\`

## 開発コマンド

\`\`\`bash
# 開発サーバー起動
npm run dev

# カード一覧
npm run cards:list

# ヘルスチェック
curl http://localhost:3000/api/health

# ダッシュボード
open http://localhost:3000/admin/metrics
\`\`\`
`;

  fs.writeFileSync(path.join(docsDir, 'recommendation-system.md'), recSystemDoc);
  console.log(`✅ 作成: ${docsDir}/recommendation-system.md`);

  // API仕様書
  const apiDoc = `# Culcept API仕様書

## Base URL

\`\`\`
開発: http://localhost:3000/api
本番: https://culcept.vercel.app/api
\`\`\`

## 認証

Supabase Auth を使用。リクエストヘッダーに認証トークンを含める。

\`\`\`
Authorization: Bearer <access_token>
\`\`\`

## エンドポイント一覧

### 推薦系

| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | /recommendations | 推薦カード取得 |
| POST | /recommendations/action | アクション記録 |
| POST | /recommendations/rating | 評価記録 |
| POST | /recommendations/reset-seen | 既読リセット |

### カード系

| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | /swipe/cards | カード直接取得 |

### 管理系

| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | /health | ヘルスチェック |

## エラーレスポンス

\`\`\`json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
\`\`\`

### エラーコード

| コード | 説明 |
|--------|------|
| UNAUTHORIZED | 認証エラー |
| NOT_FOUND | リソースが見つからない |
| VALIDATION_ERROR | バリデーションエラー |
| RATE_LIMITED | レート制限 |
| INTERNAL_ERROR | 内部エラー |
`;

  fs.writeFileSync(path.join(docsDir, 'api-specification.md'), apiDoc);
  console.log(`✅ 作成: ${docsDir}/api-specification.md`);
}

// ============================================================
// メイン実行
// ============================================================

async function main() {
  console.log('='.repeat(60));
  console.log('🚀 Phase 4: 最適化 & 本番準備');
  console.log('='.repeat(60));

  try {
    // 4-1. パフォーマンス最適化
    createCacheLayer();

    // 4-2. A/Bテスト基盤
    createABTestFramework();

    // 4-3. モニタリング & アラート
    createMonitoring();

    // 4-4. ドキュメント整備
    createDocumentation();

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Phase 4 完了！');
    console.log('='.repeat(60));
    console.log('\n📝 作成されたファイル:');
    console.log('  - lib/cache.ts (キャッシュレイヤー)');
    console.log('  - lib/ab-test.ts (A/Bテスト基盤)');
    console.log('  - lib/monitoring.ts (モニタリング)');
    console.log('  - app/api/health/route.ts (ヘルスチェックAPI)');
    console.log('  - docs/recommendation-system.md');
    console.log('  - docs/api-specification.md');
    console.log('  - supabase/migrations/xxx_experiment_assignments.sql');
    console.log('\n📝 次のステップ:');
    console.log('1. マイグレーション実行: npx supabase db push');
    console.log('2. SLACK_WEBHOOK_URL を .env.local に設定');
    console.log('3. Vercelにデプロイ');
  } catch (error) {
    console.error('❌ エラー:', error);
    process.exit(1);
  }
}

main();
