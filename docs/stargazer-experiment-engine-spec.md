# Experiment Engine 最小仕様書

## 目的

ユーザーの**固定化した傾向・回避パターン・盲点**を検出し、小さな行動実験を週1で提案する。
実験結果をモデルに反映し、観測→インサイト→行動→再観測のループを閉じる。

### Decision Engine との違い

| | Decision Engine | Experiment Engine |
|---|---|---|
| **トリガー** | ユーザーが迷いを持ち込む | AIがパターンを検出して提案 |
| **時間軸** | 今この瞬間 | 今週中 |
| **目的** | 最適な一手を出す | 固定パターンを揺らす |
| **モデル更新** | しない（読み取り専用） | する（実験結果で軸を再推定） |
| **ユーザーの姿勢** | 受動的（答えをもらう） | 能動的（実験して報告する） |
| **頻度** | 随時（ユーザーが使いたい時） | 週1回 |
| **失敗の意味** | 推奨が外れた＝精度問題 | 実験できなかった＝それ自体がデータ |

---

## 入力

### 実験提案に必要なデータ

```typescript
interface ExperimentProposalInput {
  // 現在のモデル状態
  axisBeliefs: BeliefSet                    // 45軸の推定値+精度
  contradictionMap: ContradictionMap         // 矛盾検出結果
  archetypeCode: string                     // 3文字アーキタイプ

  // パターン検出結果
  avoidancePatterns: AvoidancePattern[]     // 回避行動の検出
  fixationPatterns: FixationPattern[]       // 固定化の検出
  blindSpotAxes: string[]                   // 盲点として検出された軸

  // 履歴（重複防止・段階調整）
  recentExperiments: PastExperiment[]       // 直近8週分
  observationDepth: number                  // 累計観測数
  totalSessions: number                     // 累計セッション数
}
```

### パターン検出の定義

```typescript
interface AvoidancePattern {
  axisId: string                    // 対象軸
  evidenceType: 'skip' | 'fast_dismiss' | 'neutral_cluster'
  frequency: number                 // 直近N回中の出現回数
  since: string                     // 最初の検出日
  confidence: number                // 0-1
}
// 検出条件:
// - skip: 特定軸に関連する質問を3回以上連続スキップ
// - fast_dismiss: 回答時間が全体平均の50%以下が3回以上
// - neutral_cluster: 同一軸で回答が中央値（±0.1）に5回以上集中

interface FixationPattern {
  axisId: string
  fixedValue: number                // 固定されている値 (-1〜+1)
  precision: number                 // 異常に高い精度（＝動かない）
  duration: number                  // 固定が続いている日数
  confidence: number
}
// 検出条件:
// - precision > 30 かつ credible interval width < 0.15 が14日以上継続
// - ただし、観測深度50未満では検出しない（データ不足の可能性）
```

---

## 提案ロジック

### Step 1: 介入対象の選定

優先順位（上から順に評価）:

1. **矛盾が強い軸**（contradictionStrength > 0.6）
   - 二面性がある＝揺らしやすい＝実験効果が高い
   - 例: 「自由↔安定」が bimodal → 普段選ばない方を試す

2. **回避パターンがある軸**（avoidancePattern.confidence > 0.7）
   - 避けている＝触れると新しいデータが出る
   - 例: 社交場面を3週連続回避 → 1回だけ参加してみる

3. **固定化している軸**（fixationPattern.duration > 21日）
   - 動かない＝精度は高いが実態と乖離している可能性
   - 例: 「論理寄り」に固定 → 直感で1つ判断してみる

4. **盲点軸**（blindSpotAxes に含まれる）
   - 三面鏡の乖離が大きい軸
   - 例: 自己認識と行動が乖離 → 行動側に寄せた実験

### Step 2: 実験テンプレートの選択

各介入対象に対して、テンプレートプールから選択する。

```typescript
interface ExperimentTemplate {
  id: string
  targetPattern: 'avoidance' | 'fixation' | 'contradiction' | 'blind_spot'
  applicableAxes: string[]          // 適用可能な軸群
  difficulty: 'micro' | 'small' | 'medium'
  titleTemplate: string             // 「{axis_label}の逆を1回だけ試す」
  descriptionTemplate: string       // 背景説明テンプレート
  reportPromptTemplate: string      // 結果報告時の質問テンプレート
  minObservationDepth: number       // 最低観測深度
}
```

#### 難易度の段階

| 難易度 | 条件 | 例 |
|--------|------|-----|
| **micro** | 観測深度 0-29 | 「いつもと違う順番で朝の準備をする」 |
| **small** | 観測深度 30-69 | 「普段断る誘いを1つ受ける」 |
| **medium** | 観測深度 70+ | 「1週間、判断を直感だけで行う」 |

- 初期は micro のみ提案。観測が浅い段階で heavy な実験は逆効果
- 直近の実験を skipped した場合、次回は同等以下の難易度に下げる

### Step 3: 重複排除

- 同一軸への実験は最低4週間空ける
- 同一テンプレートは最低8週間空ける
- skipped が2連続した場合、targetPattern を変更する

### Step 4: 実験の生成

```typescript
interface WeeklyExperiment {
  id: string
  userId: string
  weekStart: string                         // ISO date (月曜日)
  title: string                             // 実験タイトル
  description: string                       // 背景説明（なぜこの実験か）
  targetAxis: string                        // 対象軸
  targetPattern: 'avoidance' | 'fixation' | 'contradiction' | 'blind_spot'
  difficulty: 'micro' | 'small' | 'medium'
  expectedShift: {
    axis: string
    direction: '+' | '-'
    magnitude: number                       // 予想される変化量
  }
  reportPrompt: string                      // 報告時の質問
  reportDeadline: string                    // ISO date (日曜日)
  status: 'proposed' | 'accepted' | 'completed' | 'skipped'
  reasonTrace?: ReasonTrace                 // なぜこの実験を提案したか
}
```

---

## 結果報告

### ユーザーの報告フォーム

```typescript
interface ExperimentReport {
  experimentId: string
  outcome: 'did_it' | 'tried_but_different' | 'could_not' | 'skipped'
  reflection: string                        // 自由記述（任意、最大500字）
  surpriseLevel: 1 | 2 | 3 | 4 | 5        // 予想と違った度合い
  wouldRepeat: boolean                      // もう一度やるか
  reportedAt: string                        // ISO datetime
}
```

### outcome の意味

| outcome | 意味 | モデルへの影響 |
|---------|------|-------------|
| `did_it` | 実験を実行した | 軸の再推定 + 回避パターン弱化 |
| `tried_but_different` | やろうとしたが違う形になった | 軸の微調整 + 新パターン検出 |
| `could_not` | やろうとしたができなかった | 回避パターン強化（ただしネガティブに扱わない） |
| `skipped` | 意図的にスキップした | 変更なし（次回の難易度調整のみ） |

---

## モデル更新

### 更新ロジック

実験結果は `bayesianAxisUpdater.ts` の既存パスを利用するが、**ソース種別を区別する**。

```typescript
// bayesianAxisUpdater.ts に追加するパス
function updateFromExperimentResult(
  beliefs: BeliefSet,
  experiment: WeeklyExperiment,
  report: ExperimentReport
): { updatedBeliefs: BeliefSet; updates: AxisUpdate[] }
```

#### 更新ルール

1. **`did_it` の場合**
   - 対象軸の mu を expectedShift.direction に `magnitude × surpriseLevel × 0.1` だけ移動
   - precision を一時的に下げる（新情報が入ったため不確実性が増す）
   - `evidencePrecision` は `EXPERIMENT_SOURCE_MULTIPLIER = 1.5`（日次観測より高い）
   - 矛盾マップの対象軸を再計算

2. **`tried_but_different` の場合**
   - 上記の 60% の強度で同様の更新
   - 追加: reflection テキストから新しいパターンを検出（将来的にNLP）

3. **`could_not` の場合**
   - 軸の mu は動かさない
   - 回避パターンの confidence を +0.1（上限 0.95）
   - 次回の実験難易度を1段階下げるフラグを立てる

4. **`skipped` の場合**
   - モデル変更なし
   - 2連続 skip で targetPattern を変更

#### surpriseLevel の扱い

- `1`（予想通り）: magnitude × 0.3（確認的データ、小さな更新）
- `2-3`（やや違った）: magnitude × 0.6-1.0（標準的な更新）
- `4-5`（全然違った）: magnitude × 1.2-1.5 + precision を大きく下げる（モデルの不確実性が上がる）

**surpriseLevel が高い = モデルが間違っていた可能性がある**ため、precision を下げて「学び直し」モードに入る。

---

## 提案タイミングと表示場所

### タイミング
- **毎週月曜朝**に新しい実験を生成
- 前週の実験が未報告の場合、報告を先に促す
- 報告期限: 日曜 23:59（ローカルタイム）

### 表示場所
- **Home**: Experiment カードとして表示（Zone 3 付近、Connection の隣）
- **Stargazer**: Engine タブ内に Experiment セクション
- **Push通知**: 月曜朝に「今週の実験」、金曜夕方に「実験の結果はどうでしたか？」

### 表示の原則
- 1週間に1実験のみ。複数同時に出さない
- 受諾は任意。「やらない」を選んでもペナルティなし
- ただし、Reason Trace で「なぜこの実験か」を常に表示し、やる動機を作る

---

## DB テーブル設計（概要）

```sql
-- 実験の記録
CREATE TABLE stargazer_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  week_start DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target_axis TEXT NOT NULL,
  target_pattern TEXT NOT NULL CHECK (target_pattern IN ('avoidance','fixation','contradiction','blind_spot')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('micro','small','medium')),
  expected_shift JSONB NOT NULL,           -- { axis, direction, magnitude }
  report_prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','completed','skipped')),
  reason_trace JSONB,                      -- ReasonTrace object
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, week_start)             -- 1週間に1実験
);

-- 実験結果の報告
CREATE TABLE stargazer_experiment_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES stargazer_experiments(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('did_it','tried_but_different','could_not','skipped')),
  reflection TEXT,
  surprise_level INT NOT NULL CHECK (surprise_level BETWEEN 1 AND 5),
  would_repeat BOOLEAN NOT NULL DEFAULT false,
  model_updates JSONB,                     -- ExperimentModelUpdate の記録
  reported_at TIMESTAMPTZ DEFAULT now()
);

-- パターン検出結果のキャッシュ
CREATE TABLE stargazer_behavior_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('avoidance','fixation')),
  axis_id TEXT NOT NULL,
  evidence_type TEXT,
  confidence NUMERIC(3,2) NOT NULL,
  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,                 -- 実験で解消された場合
  UNIQUE (user_id, pattern_type, axis_id)
);
```

---

## Reason Trace との接続

Experiment Engine の全出力に Reason Trace を付与する。

### 提案時の Reason Trace 例

```json
{
  "targetType": "experiment",
  "evidences": [
    {
      "type": "pattern",
      "source": "直近3週間の観測",
      "value": "社交場面の質問を3回連続スキップ",
      "weight": 0.8,
      "humanLabel": "社交に関する質問を避ける傾向"
    },
    {
      "type": "contradiction",
      "source": "矛盾マップ individual_vs_social",
      "value": "bimodality: 0.72, poles: [-0.6, +0.4]",
      "weight": 0.6,
      "humanLabel": "一人が好きと言いつつ、人といたい面もある"
    }
  ],
  "reasoning": "社交に関する質問を避け続けていますが、矛盾マップでは「人といたい」側のシグナルも出ています。回避しているのは「嫌い」ではなく「怖い」かもしれません。小さな試行で確かめてみませんか。"
}
```

### 結果報告後の Reason Trace 例

```json
{
  "targetType": "experiment",
  "evidences": [
    {
      "type": "observation",
      "source": "実験報告 2026-03-28",
      "value": "outcome: did_it, surpriseLevel: 4",
      "weight": 1.0,
      "humanLabel": "実験を実行し、予想と大きく違った"
    }
  ],
  "reasoning": "「誘いを受けてみたら意外と楽しかった」という報告から、individual_vs_social 軸を +0.06 更新しました。回避傾向の confidence を 0.75 → 0.55 に下げました。あなたの「一人が好き」は、実は「準備なしの社交が苦手」に近いかもしれません。"
}
```

---

## 実装しないこと（スコープ外）

- 実験テンプレートの自動生成（初期はハードコード）
- reflection テキストのNLP解析（将来課題）
- 実験結果のソーシャル共有（Genome Card経由で将来的に）
- 複数同時実験（常に1週1実験を維持）
- 長期実験（2週間以上の実験は設計しない）

---

## 既存実装との衝突回避

### bayesianAxisUpdater.ts
- `updateFromExperimentResult()` を新規追加。既存の `updateFromDailyObservation()` とは別パス
- `EXPERIMENT_SOURCE_MULTIPLIER = 1.5` を定数追加（`DAILY_SOURCE_MULTIPLIER = 1.0` と並列）
- 既存の `updateAxisBelief()` は変更しない（内部で呼ぶだけ）

### contradictionEngine.ts
- 変更なし。Experiment Engine が結果を読み取るのみ
- 実験後の矛盾再計算は、次回の日次観測時に自動的に行われる

### decisionEngine.ts
- 変更なし。Experiment Engine とは独立
- Decision Engine が `experimentHistory` を参照することはない

### blindSpotDrop.ts / dailyProphecy.ts / selfVsOracle.ts
- 変更なし（Reason Trace の付与は別途対応）
