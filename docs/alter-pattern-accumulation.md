# Alter Pattern Accumulation — 判断傾向・状態パターン・反応パターンの蓄積

## 目的
ユーザーの判断における「癖」「傾向」「繰り返し」を検出・蓄積し、
「この AI は自分の判断パターンを理解している」という体験を作る。

## 3種のパターン

### 1. Decision Pattern（判断傾向）

ユーザーがどのような判断をする傾向があるかを蓄積。

| パターン | 検出方法 | 例 |
|---------|---------|---|
| protect_tendency | ActionShape が skip/defer_with_trigger の割合 | 「迷ったら守る」傾向 |
| expand_tendency | ActionShape が full_go/bounded_go の割合 | 「迷ったら動く」傾向 |
| domain_split | ドメイン別の ActionShape 分布差 | 仕事は攻め、恋愛は守り |
| regret_direction | followup の did_regret 方向 | 「やらなくて後悔」が多い |
| speed_preference | clarify 選択率 vs conclude 選択率 | 「考えるより先に動く」 |

#### 蓄積ロジック

```typescript
interface DecisionPatternEntry {
  pattern_key: string;
  // 直近30日の ActionShape 分布
  shape_distribution: Record<ActionShape, number>;
  // ドメイン別分布
  domain_distributions?: Record<string, Record<ActionShape, number>>;
  // followup 結果の集約
  regret_stats?: {
    did_and_regret: number;
    did_and_ok: number;
    didnt_and_regret: number;
    didnt_and_ok: number;
  };
  observation_count: number;
  confidence: number;
}
```

#### 活用方法

判断時のプロンプトに傾向を注入:

```
この人は仕事の判断では「まず動いてみる」傾向がある（直近10回中7回が go 系）。
ただし恋愛の判断では慎重（10回中8回が wait/no 系）。
この傾向を踏まえつつ、今回の相談に答える。
傾向を指摘するのではなく、提案のトーンに自然に反映する。
```

### 2. State Pattern（状態パターン）

時間帯・曜日ごとの心理状態の傾向を蓄積。

| パターン | 検出方法 | 例 |
|---------|---------|---|
| time_capacity | 時間帯別 psychological_capacity の平均 | 深夜は capacity が低い |
| weekday_load | 曜日別 emotional_load の平均 | 月曜は負荷が高い |
| session_fatigue | セッション内のターン数と cognitive_fatigue の相関 | 5ターン超えると疲れる |

#### 蓄積ロジック

```typescript
interface StatePatternEntry {
  pattern_key: string;
  // 時間帯別の State 平均（6時間ブロック）
  time_blocks: Record<"morning" | "afternoon" | "evening" | "night", {
    avg_capacity: number;
    avg_load: number;
    avg_fatigue: number;
    sample_count: number;
  }>;
  // 曜日別（任意）
  weekday_blocks?: Record<number, {
    avg_capacity: number;
    sample_count: number;
  }>;
  observation_count: number;
}
```

#### 活用方法

State 推定の事前確率として使用:

```typescript
// estimateUserState の拡張
function estimateUserStateWithPattern(
  message: string,
  history: Array<{ role: string; content: string }>,
  statePattern: StatePatternEntry | null,
): UserState {
  // Phase 1 のルールベース推定
  const baseState = estimateUserState(message, history);

  // パターンがあれば事前確率として統合
  if (statePattern) {
    const hour = new Date().getHours();
    const block = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
    const blockData = statePattern.time_blocks[block];

    if (blockData && blockData.sample_count >= 3) {
      // ベイズ的に統合: (ルールベース × 0.7) + (パターン × 0.3)
      baseState.psychological_capacity =
        baseState.psychological_capacity * 0.7 + blockData.avg_capacity * 0.3;
    }
  }

  return baseState;
}
```

### 3. Response Pattern（反応パターン）

Alter の提示に対するユーザーの反応パターンを蓄積。

| パターン | 検出方法 | 例 |
|---------|---------|---|
| insight_receptivity | Micro Insight への反応分布 | 「気づき」を受け入れやすい |
| clarify_tolerance | clarify 後の継続率 | 質問されると離脱しやすい |
| detail_preference | 長い回答 vs 短い回答への反応 | 短い方が反応がいい |

#### 蓄積ロジック

```typescript
interface ResponsePatternEntry {
  pattern_key: string;
  // 各提示タイプへの反応分布
  reaction_distribution: Record<string, {
    accepted: number;
    denied: number;
    ignored: number;
    explored: number;
  }>;
  // clarify 後の継続率
  clarify_continuation_rate?: number;
  observation_count: number;
}
```

## DB スキーマ

`stargazer_alter_patterns` テーブル（`alter-phase2-design.md` 参照）を使用。

### pattern_type 別の pattern_data 構造

| pattern_type | pattern_key 例 | pattern_data 構造 |
|-------------|----------------|-------------------|
| decision | protect_tendency | `{ shape_distribution, domain_distributions, regret_stats }` |
| state | time_capacity | `{ time_blocks, weekday_blocks }` |
| response | insight_receptivity | `{ reaction_distribution, clarify_continuation_rate }` |

## 蓄積タイミング

| イベント | 蓄積するパターン |
|---------|----------------|
| 判断完了（home_alter_judgment） | Decision Pattern: shape_distribution 更新 |
| followup 報告（home_alter_followup） | Decision Pattern: regret_stats 更新 |
| State 推定実行時 | State Pattern: time_blocks 更新 |
| Micro Insight 提示後 | Response Pattern: reaction_distribution 更新 |
| clarify 送信後の次メッセージ | Response Pattern: clarify_continuation_rate 更新 |

## 安全制約

### 最低観測数

| パターン活用 | 最低 observation_count |
|------------|---------------------|
| プロンプト注入 | 5 |
| State 事前確率 | 3（time_block 単位） |
| 提示調整 | 3（reaction_distribution 単位） |

### 減衰

- 30日以上更新のないパターンは `confidence` を 0.1 ずつ減衰
- `confidence < 0.2` になったパターンは判断に使用しない
- 90日以上更新なしで自動削除

### 分析の非暴露

パターンはプロンプトの「裏側」で使う。ユーザーに直接見せない。

NG: 「あなたは仕事の判断で守りに入る傾向があります」
OK: （守り傾向を踏まえて）「動いてみるのもありかも。前に似た場面で、結局やっておけばよかったってことなかったっけ？」

## 実装ステップ

1. **DB migration**: `stargazer_alter_patterns` テーブル作成
2. **Decision Pattern 記録**: `home_alter_judgment` analytics から shape_distribution を更新
3. **State Pattern 記録**: `estimateUserState` 実行時に time_block 別平均を更新
4. **State Pattern 活用**: `estimateUserState` の事前確率として統合
5. **Response Pattern 記録**: Micro Insight v2 の Reaction Learning と連動
6. **Decision Pattern 活用**: 判断プロンプトに傾向を注入
