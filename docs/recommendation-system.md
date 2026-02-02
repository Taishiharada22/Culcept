# Culcept 推薦システム

## 概要

Culceptの推薦システムは、複数のアルゴリズムを組み合わせたハイブリッド推薦を提供します。

## アーキテクチャ

```
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
```

## アルゴリズム

### 1. 協調フィルタリング (collaborative.ts)

似たユーザーの行動パターンを分析し、まだ見ていないアイテムを推薦。

```typescript
import { getCollaborativeRecommendations } from '@/lib/recommendations';

const cardIds = await getCollaborativeRecommendations(userId, 20);
```

### 2. コンテンツベース推薦 (content-based.ts)

ユーザーが「いいね」したカードのタグを分析し、類似したコンテンツを推薦。

```typescript
import { getContentBasedRecommendations } from '@/lib/recommendations';

const cards = await getContentBasedRecommendations(userId, 20);
```

### 3. ハイブリッド推薦 (hybrid.ts)

複数のアルゴリズムを組み合わせ、重み付け調整可能。

```typescript
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
```

## API仕様

### GET /api/recommendations

推薦カードを取得。

**パラメータ:**
- `v` (number): APIバージョン（デフォルト: 2）
- `role` (string): buyer | seller
- `stream` (string): cards | drops | insights
- `limit` (number): 取得件数（デフォルト: 20）
- `algorithm` (string): hybrid | collaborative | content_based | random

**レスポンス:**
```json
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
```

### POST /api/recommendations/action

ユーザーアクションを記録。

**ボディ:**
```json
{
  "impressionId": "uuid",
  "action": "like" | "dislike" | "skip"
}
```

### GET /api/health

システムヘルスチェック。

## モニタリング

### Slack通知設定

```bash
# .env.local
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
```

### アラート条件

- **no_cards**: 1時間に10件以上発生
- **CTR低下**: CTRが5%を下回った場合

## A/Bテスト

### 新しい実験を開始

```typescript
import { assignVariant } from '@/lib/ab-test';

const variant = await assignVariant(
  'new_algorithm_test',
  userId,
  ['control', 'treatment_a', 'treatment_b'],
  [0.5, 0.25, 0.25]
);
```

### 結果集計

```typescript
import { getExperimentResults } from '@/lib/ab-test';

const results = await getExperimentResults('new_algorithm_test');
console.log(results);
// [
//   { variant: 'control', users: 100, impressions: 500, saves: 50, ctr: 10 },
//   { variant: 'treatment_a', users: 50, impressions: 250, saves: 30, ctr: 12 },
// ]
```

## 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# カード一覧
npm run cards:list

# ヘルスチェック
curl http://localhost:3000/api/health

# ダッシュボード
open http://localhost:3000/admin/metrics
```
