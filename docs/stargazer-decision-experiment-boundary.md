# Decision Engine / Experiment Engine / Reason Trace 責務分離

## 概要

Stargazer の「提案系」機能は以下の3つに分離する。混同禁止。

| 機能 | 一言定義 | 時間軸 | トリガー | 出力 |
|------|---------|--------|---------|------|
| **Decision Engine** | 今の迷いへの一手 | 秒〜分 | ユーザーが「迷った」と申告 | 選択肢ごとのシミュレーション |
| **Experiment Engine** | 今週の小さな試行 | 日〜週 | AIが固定パターンを検出 | 行動実験1件 + 結果報告フォーム |
| **Reason Trace** | なぜそう判断したか | （横断） | 全提案に付随 | 根拠の列挙 + 因果説明 |

---

## 1. Decision Engine（既存実装）

### 責務
ユーザーが「今どうするか」で迷った**その瞬間**に、選択肢ごとの予測を返す。

### 既存実装の所在
- ロジック: `lib/stargazer/decisionEngine.ts`
- UI: `components/stargazer/engine/DecisionEngineCard.tsx`
- API: `POST /api/stargazer/decision-engine`

### 入力
```typescript
SmallDecisionQuery {
  type: 'social' | 'reply' | 'rest' | 'priority' | 'purchase' | 'free'
  question: string        // ユーザーの迷い（自然言語）
  options?: string[]       // 選択肢（省略時はプリセット）
  context?: string         // 状況説明
  urgency?: 'low' | 'medium' | 'high'
}
```

### 出力
```typescript
DecisionEngineOutput {
  simulations: DecisionSimulation[]  // 選択肢ごとの5指標
  recommended: number | null         // 推奨インデックス（保留時null）
  withheld: boolean                  // 保留フラグ
  blindSpotWarning?: string          // 認知バイアス警告
  overallUncertainty: number         // 全体不確実度
}
```

### 5指標
- `compatibility` — 軸スコアとの適合度
- `exhaustionRisk` — 状態ベース疲労予測
- `regretProbability` — 過去パターンからの後悔確率
- `recoveryEase` — 選択の可逆性
- `uncertainty` — 予測の不確かさ

### 特性
- **ユーザー起点**（ユーザーが迷いを持ち込む）
- **単発完結**（結果を返して終わり。追跡しない）
- **今の状態に依存**（socialBattery, cognitiveLoad, energyLevel, stressLevel）
- **保留あり**（不確実性が高い場合は推奨を出さない）

---

## 2. Experiment Engine（新規）

### 責務
ユーザーの**固定化した傾向・回避パターン・盲点**に対し、小さな行動実験を提案し、結果をモデルに反映する。

### 既存実装
なし（新規設計）

### 入力
```typescript
ExperimentProposalInput {
  axisBeliefs: BeliefSet               // 現在の軸推定値
  contradictionMap: ContradictionMap    // 矛盾検出結果
  blindSpotHistory: BlindSpotDrop[]    // 直近の盲点ドロップ
  avoidancePatterns: AvoidancePattern[] // 回避行動パターン
  recentExperiments: PastExperiment[]  // 直近の実験履歴（重複防止）
  observationDepth: number             // 観測深度（提案難易度の調整）
  archetypeCode: string                // アーキタイプ
}
```

### 出力
```typescript
WeeklyExperiment {
  id: string
  weekStart: string                    // YYYY-MM-DD
  title: string                        // 「いつも断る誘いを1つ受ける」
  description: string                  // 背景説明（2-3文）
  targetAxis: string                   // 揺らす対象の軸
  targetPattern: 'avoidance' | 'fixation' | 'contradiction' | 'blind_spot'
  difficulty: 'micro' | 'small' | 'medium'  // 段階的
  expectedShift: { axis: string; direction: '+' | '-'; magnitude: number }
  reportPrompt: string                 // 結果報告時の質問
  status: 'proposed' | 'accepted' | 'completed' | 'skipped'
}
```

### 結果報告後の処理
```typescript
ExperimentResult {
  experimentId: string
  outcome: 'did_it' | 'tried_but_different' | 'could_not' | 'skipped'
  reflection: string                   // 自由記述
  surpriseLevel: 1 | 2 | 3 | 4 | 5   // 予想と違った度合い
}

// → 処理
ExperimentModelUpdate {
  axisUpdates: { axis: string; delta: number; newPrecision: number }[]
  contradictionUpdates: { axis: string; resolved: boolean }[]
  avoidanceUpdates: { pattern: string; weakened: boolean }[]
  prophecyAccuracyDelta: number        // 預言精度の変化量
  insightGenerated: string             // 発見テキスト
}
```

### 特性
- **AI起点**（ユーザーが頼むのではなく、AIが提案する）
- **週単位**（1週間に1実験。日次ではない）
- **結果がモデルに反映される**（Decision Engineは反映しない）
- **段階的難易度**（micro → small → medium、観測深度に応じて）
- **回避・固定に介入する**（Decision Engineは現状を前提に最適解を出す）

---

## 3. Reason Trace（新規・横断レイヤー）

### 責務
AIの判断根拠を、ユーザーが読める形で開示する。

### 既存実装
なし（新規設計）。ただし一部の機能に断片的な「理由」は存在する：
- `selfVsOracle.ts` の `oracleReason`（Oracleの予測理由テキスト）
- `decisionEngine.ts` の `narrative`（判断の物語的説明）
- `blindSpotDrop.ts` の `unlockHint`（盲点の手がかり）

### 構造
```typescript
ReasonTrace {
  traceId: string
  targetType: 'decision' | 'experiment' | 'prophecy' | 'blind_spot' | 'oracle' | 'axis_update' | 'archetype_change'
  targetId: string                     // 対象のID
  evidences: Evidence[]                // 根拠リスト
  reasoning: string                    // 因果説明テキスト（2-4文）
  confidence: number                   // この説明自体の確信度
}

Evidence {
  type: 'observation' | 'response_time' | 'contradiction' | 'origin_entry' | 'pattern' | 'mirror_divergence' | 'state'
  source: string                       // 例: "2026-03-15 観測 Q12"
  value: string                        // 例: "回答: A（1.2秒）"
  weight: number                       // この根拠の寄与度 0-1
  humanLabel: string                   // 例: "3/15に即答でAを選んだ"
}
```

### 特性
- **独立機能ではない**（単独のページやカードを持たない）
- **全提案に付随する**（Decision, Experiment, Prophecy, BlindSpot, SelfVsOracle）
- **表示はオプション**（デフォルト非表示、「なぜ？」タップで展開）
- **既存の `narrative` / `oracleReason` / `unlockHint` を統一フォーマットに収束させる**

---

## 混同しやすいポイントと判別基準

### Q1: ユーザーが「今週、人付き合いを増やすべき？」と聞いてきた

**判別**: ユーザー起点の迷い → **Decision Engine**
- 「増やすなら exhaustionRisk は○○、regretProbability は○○」を返す

**NG**: Experiment として「今週、誘いを受けてみよう」を出す
- ユーザーが迷っている時に実験を提案するのは文脈違い

### Q2: AIが「この人は社交場面を3週連続で回避している」と検出した

**判別**: AI起点のパターン検出 → **Experiment Engine**
- 「今週の実験: 1回だけ誘いに乗ってみる」を提案

**NG**: Decision Engine で「次の誘いは受けるべき」と出す
- Decision Engine は**迷いがある時**にしか起動しない

### Q3: Prophecy が「今日は人付き合いを避ける（確信度 72%）」と出した

**判別**: 預言自体は Prophecy Engine の管轄
- Reason Trace が「なぜ72%か」を説明する

**NG**: これを Decision や Experiment として扱う
- 預言は観測であって提案ではない

### Q4: 実験結果の報告後にモデルが更新された

**判別**: モデル更新は Experiment Engine の後処理
- Reason Trace が「なぜこの軸が動いたか」を説明する

**NG**: Decision Engine がモデルを更新する
- Decision Engine の出力でモデルは変わらない（読み取り専用）

---

## 接続ポイント

```
                    ┌─────────────┐
                    │ Reason Trace│ ← 全機能に付随
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                   │
   ┌─────▼─────┐   ┌──────▼──────┐   ┌───────▼───────┐
   │  Decision  │   │  Experiment │   │   Prophecy    │
   │  Engine    │   │  Engine     │   │   / BlindSpot │
   │            │   │             │   │   / SvO       │
   └─────┬─────┘   └──────┬──────┘   └───────┬───────┘
         │                 │                   │
         │ (読み取り)       │ (読み書き)         │ (読み取り)
         │                 │                   │
   ┌─────▼─────────────────▼───────────────────▼─────┐
   │              BeliefSet (45軸モデル)                │
   │         ContradictionMap / AvoidancePatterns       │
   └───────────────────────────────────────────────────┘
```

### データフロー

| 機能 | BeliefSet | ContradictionMap | pastDecisions | experimentHistory |
|------|-----------|-----------------|---------------|-------------------|
| Decision Engine | 読む | 読む | 読む | - |
| Experiment Engine | **読み書き** | **読み書き** | - | **読み書き** |
| Prophecy | 読む | 読む | - | - |
| BlindSpot | 読む | 読む | - | - |
| Self vs Oracle | 読む | 読む | - | - |
| Reason Trace | 読む | 読む | 読む | 読む |

**重要**: BeliefSet を**書き換える**のは以下のみ:
1. `bayesianAxisUpdater.ts`（観測回答から）
2. Experiment Engine（実験結果から）← 新規
3. Onboarding（初回のみ）

Decision Engine は BeliefSet を**参照するだけ**で書き換えない。

---

## ファイル配置（予定）

```
lib/stargazer/
├── decisionEngine.ts          # 既存・変更なし
├── experimentEngine.ts        # 新規
├── reasonTrace.ts             # 新規
├── bayesianAxisUpdater.ts     # 既存・Experiment結果からの更新パスを追加
├── contradictionEngine.ts     # 既存・変更なし
├── dailyProphecy.ts           # 既存・ReasonTrace対応を追加
├── blindSpotDrop.ts           # 既存・ReasonTrace対応を追加
└── selfVsOracle.ts            # 既存・ReasonTrace対応を追加

components/stargazer/engine/
├── DecisionEngineCard.tsx     # 既存・ReasonTrace展開UIを追加
├── ExperimentCard.tsx         # 新規
└── ReasonTracePanel.tsx       # 新規（共通展開パネル）

app/api/stargazer/
├── decision-engine/route.ts   # 既存
├── experiment/route.ts        # 新規
└── reason-trace/route.ts      # 新規（任意のtargetのTrace取得）
```
