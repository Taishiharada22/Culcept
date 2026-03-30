# Experiment Engine 接続設計

> 設計のみ。実装はCEO承認後。

## 1. 概要

Experiment Engine（週1の行動実験）を既存システムに接続するための設計。
3つの問いに答える: **いつ提案するか / 何を入力にするか / どこに表示するか**

---

## 2. 呼び出し場所

### 2.1 提案（proposeWeeklyExperiment）

| タイミング | トリガー | 理由 |
|-----------|---------|------|
| **週次 cron（月曜AM）** | `cron/experiment-propose` | 最もシンプル。毎週月曜に全ユーザー分を生成 |
| **Home表示時（lazy）** | `GET /api/stargazer/experiment` | 未提案なら生成。cron 不要で運用が楽 |

**推奨: lazy 方式**（cron は初期段階では過剰。ユーザーがHomeを開いたときに生成すれば十分）

```
GET /api/stargazer/experiment
  → 今週の実験があるか確認（DB: stargazer_experiments）
  → なければ proposeWeeklyExperiment() で生成 → DB保存
  → あれば既存の実験を返す
```

### 2.2 結果報告（updateFromExperimentResult）

| タイミング | トリガー |
|-----------|---------|
| **ユーザー操作** | `POST /api/stargazer/experiment/report` |

ユーザーが実験カードで「やった / 違うことをした / できなかった / スキップ」を選択 → 報告送信。

### 2.3 モデル更新

報告 POST 内で `updateFromExperimentResult()` を呼び、BeliefSet を更新。
更新結果は `stargazer_profiles.axis_beliefs` に書き戻す。

---

## 3. 入力ソース

`ExperimentProposalInput` が要求するデータと取得元:

| フィールド | 取得元 | 備考 |
|-----------|--------|------|
| `axisBeliefs` | `stargazer_profiles.axis_beliefs` | BeliefSet（mu/precision/confidence） |
| `contradictionMap` | `stargazer_profiles.contradiction_map` | 二面性マップ |
| `archetypeCode` | `stargazer_profiles.archetype_code` | アーキタイプ |
| `avoidancePatterns` | **新規計算が必要** | 観測回答ログから回避パターンを検出 |
| `fixationPatterns` | **新規計算が必要** | precision高+変化なし期間から検出 |
| `blindSpotAxes` | `stargazer_profiles.blind_spot_axes` or 推論 | precision が低く観測回数も少ない軸 |
| `recentExperiments` | `stargazer_experiments` | 過去の実験（重複防止） |
| `observationDepth` | `stargazer_profiles.total_observations` | 観測深度（difficulty判定に使用） |
| `totalSessions` | 同上 | |

### 3.1 未整備の入力（Phase 1 での簡略化案）

**avoidancePatterns**: Phase 1 では空配列 `[]` で開始。
→ 回避検出ロジックは後から追加可能（priority は contradiction > blind_spot が先）

**fixationPatterns**: Phase 1 では空配列 `[]` で開始。
→ precision + 日数の検出ロジックを後から追加

**blindSpotAxes**: Phase 1 では precision が低い上位3軸を自動選出。
```ts
const blindSpotAxes = Object.entries(beliefs)
  .filter(([, b]) => b.precision < 2.0)
  .sort((a, b) => a[1].precision - b[1].precision)
  .slice(0, 3)
  .map(([k]) => k as TraitAxisKey);
```

---

## 4. 表示場所

### 4.1 Home（主表示）

`app/(culcept)/page.tsx` → `AneurasyncHome.tsx` の Instrument Rail セクションに
**ExperimentCard** を追加。

表示条件:
- 今週の実験が未完了 → 「今週のチャレンジ」カードを表示
- 完了済み → 「結果」と「モデル更新の要約」を表示
- まだ提案なし → 提案ローディング → カード表示

### 4.2 Stargazer Engine ページ（補助表示）

`app/(immersive)/stargazer/engine/EngineClient.tsx` に
DecisionEngineCard と SelfVsOracleCard の間に配置。

```
DailyInterventionCard  ← 今日の状態
ExperimentCard         ← 今週の実験（NEW）
DecisionEngineCard     ← 判断相談
SelfVsOracleCard       ← 自己予測
```

### 4.3 カードUI構成

```
┌──────────────────────────────┐
│ 🧪 今週のチャレンジ           │  ← GlassBadge
│                              │
│ [実験タイトル]                │  ← 太字
│ [実験の説明文]                │  ← 本文
│                              │
│ 難易度: ●○○ / ターゲット: 矛盾  │  ← メタ情報
│                              │
│ ▸ なぜこの実験？              │  ← ReasonTracePanel
│                              │
│ ┌─────┐ ┌─────┐ ┌─────┐     │
│ │やった │ │違った │ │できず│     │  ← 結果報告ボタン
│ └─────┘ └─────┘ └─────┘     │
│                              │
│ ▸ スキップ                    │  ← 小さく
└──────────────────────────────┘
```

報告後:
```
┌──────────────────────────────┐
│ ✓ 実験完了                    │
│                              │
│ 驚きレベル: ★★★☆☆            │  ← 1-5選択
│ また試したい？ [はい] [いいえ]  │
│                              │
│ モデルの変化:                  │
│ 「内向/外向」が +0.02 調整     │  ← insightGenerated
│                              │
│ ▸ なぜこの変化？              │  ← ReasonTracePanel
└──────────────────────────────┘
```

---

## 5. API エンドポイント設計

### GET /api/stargazer/experiment

```ts
Response: {
  experiment: WeeklyExperiment | null;
  status: "proposed" | "accepted" | "completed" | "no_experiment";
}
```

### POST /api/stargazer/experiment/accept

```ts
Body: { experimentId: string }
Response: { ok: true }
```

### POST /api/stargazer/experiment/report

```ts
Body: ExperimentReport
Response: {
  modelUpdate: ExperimentModelUpdate;
  reasonTrace: ReasonTrace;
  insightMessage: string;
}
```

---

## 6. DB テーブル

`stargazer_experiments` と `stargazer_experiment_reports` は
`docs/stargazer-experiment-engine-spec.md` で定義済み。
migration 作成は実装フェーズで行う。

---

## 7. 週次運用フロー

```
月曜朝
  ユーザーがHome表示
  → GET /api/stargazer/experiment
  → 今週分なし → proposeWeeklyExperiment() → DB保存 → カード表示
  → ユーザーがカードを見る（自動 accept）

火〜日
  ユーザーが実験を実行
  → 結果報告（Home or Engine ページ）
  → POST /api/stargazer/experiment/report
  → updateFromExperimentResult() → BeliefSet 更新
  → 更新サマリーを表示

翌週月曜
  → 新しい実験を提案（前回の結果を考慮）
```

---

## 8. Phase 1 スコープ

| やること | やらないこと |
|---------|-------------|
| lazy 生成（cron なし） | avoidance/fixation パターン検出 |
| Home + Engine ページにカード | 通知・リマインダー |
| 結果報告 → BeliefSet 更新 | 実験の難易度自動調整 |
| ReasonTrace 付き | reflection テキスト分析 |
| blindSpotAxes 自動選出 | 複数実験の同時提案 |

---

## 9. 実装順序（CEO承認後）

1. `GET /api/stargazer/experiment` — lazy 生成 + DB 保存
2. `POST /api/stargazer/experiment/report` — 結果報告 + BeliefSet 更新
3. `ExperimentCard.tsx` — UI コンポーネント（提案/報告/完了の3フェーズ）
4. Engine ページへの配置
5. Home ページへの配置
6. DB migration
