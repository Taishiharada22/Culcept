# Alter Micro Insight v2 — Cross-Session 収束 + Reaction Learning

## Phase 1 からの進化

| Phase 1 | Phase 2 |
|---------|---------|
| 単一セッション内でシグナル検知 | 複数セッションを跨いだシグナル結合 |
| 収束 → 1回提示して終了 | 提示 → 反応記録 → 次回の提示精度向上 |
| 4シグナルタイプ固定 | タイプ拡張可能な構造 |
| hasMultipleTurns で最低限の品質保証 | セッション多様性 + 時間的距離でスコアリング |

## 1. Cross-Session Convergence

### 現状の課題
Phase 1 の `checkSignalConvergence` は `previousSignals` を引数で受け取るが、
現在の route.ts では `previousSignals: []` で呼ばれている（過去シグナルの永続化がないため）。

### 解決策

#### シグナル永続化フロー
```
detectMicroSignals(message, history, previousSignals)
         │
         ▼ newSignals
    ┌────────────────┐
    │ DB に保存        │  ← stargazer_alter_patterns (pattern_type: "micro_signal")
    │ (fire-and-forget)│     または専用テーブル
    └────────┬───────┘
             │
             ▼ 次回セッション開始時
    ┌────────────────┐
    │ DB から読み込み   │  ← 直近7日以内のシグナルを取得
    │ → previousSignals│
    └────────┬───────┘
             │
             ▼
    checkSignalConvergence(allSignals, trustLevel)
```

#### 実装ポイント
- `route.ts` で `detectMicroSignals` 実行後、`newSignals` を `stargazer_analytics` に保存
  - event: `"alter_micro_signal"`
  - metadata: `{ signals: newSignals }`
- 次回セッション開始時（alter API 呼び出し時）に直近7日のシグナルを取得
  - `SELECT metadata->'signals' FROM stargazer_analytics WHERE event = 'alter_micro_signal' AND created_at > now() - interval '7 days'`
- 取得したシグナルを `previousSignals` として `detectMicroSignals` に渡す

### 収束スコアリング（Phase 2 拡張）

Phase 1 の `hasMultipleTurns` に加え、収束の質をスコアリング:

```typescript
interface ConvergenceScore {
  signal_count: number;        // シグナル数
  session_diversity: number;   // 異なるセッション数
  temporal_spread: number;     // 最初と最後のシグナル間の日数
  type_diversity: number;      // 異なるシグナルタイプ数
  combined_score: number;      // 総合スコア (0-1)
}
```

| combined_score | 提示判断 |
|----------------|---------|
| < 0.3 | 提示しない |
| 0.3-0.5 | casual_check のみ |
| 0.5-0.7 | observation まで |
| > 0.7 | gentle_inquiry まで |

## 2. Reaction Learning

### ユーザー反応の分類

Micro Insight を提示した後のユーザーの次メッセージから反応を推定:

| reaction | 検知パターン | 例 |
|----------|------------|---|
| accepted | 肯定的応答 / 深掘り開始 | 「確かに」「そうかも」「それは…」 |
| denied | 否定 / 訂正 | 「いや違う」「そういうことじゃない」 |
| ignored | 無関係な話題に移行 | 全く別の質問を開始 |
| explored | 提示されたテーマについて詳しく話し始める | 長文で背景を説明 |

### 反応の記録と活用

```typescript
// route.ts 内（次回のメッセージ処理時）
// 前回 micro insight を提示していたか確認
const lastInsight = await getLastMicroInsight(userId);
if (lastInsight) {
  const reaction = classifyReaction(message, lastInsight);
  await saveReaction(userId, lastInsight, reaction);
}
```

### 学習ルール

| 反応 | 次回への影響 |
|------|------------|
| accepted × 2回以上 | そのシグナルタイプの `required_trust` を1段下げる（より早く提示可能に） |
| denied × 2回以上 | そのシグナルタイプの `strength` を 0.2 下げる（収束しにくくなる） |
| ignored × 3回以上 | そのシグナルタイプを一時的に無効化（14日間） |
| explored | そのテーマの `topic_repetition` シグナルを自動生成 |

## 3. 提示タイミングの最適化

Phase 1 では「emotional_load < 0.75」のみのゲート。Phase 2 では:

```typescript
function shouldPresentInsight(
  insight: MicroInsightCandidate,
  state: UserState,
  conversationTurn: number,
  lastInsightTurn: number | null,
): boolean {
  // Phase 1 ルール（維持）
  if (state.emotional_load >= 0.75) return false;

  // 会話の最初の2ターンでは提示しない（信頼構築が先）
  if (conversationTurn < 3) return false;

  // 前回の提示から最低3ターンは空ける
  if (lastInsightTurn !== null && conversationTurn - lastInsightTurn < 3) return false;

  // 認知疲労が高い時は casual_check のみ
  if (state.cognitive_fatigue > 0.6 && insight.presentation_type !== "casual_check") return false;

  return true;
}
```

## 4. 新シグナルタイプ（Phase 2 追加候補）

| タイプ | 検知条件 | 提示例 |
|--------|---------|--------|
| avoidance_pattern | 特定の話題を毎回避ける（3セッション以上） | 「〇〇の話、自然と避けてる感じがする」 |
| decision_regret_loop | 同種の判断で後悔を繰り返す（followup データ） | 「前も似た場面で後から気になってたよね」 |
| self_contradiction | 本人の価値観と行動が矛盾（Stargazer 軸との乖離） | 「普段大事にしてることと、今の動き方が少し違う気がする」 |

**追加基準**: Phase 1 のシグナルと同じく、収束条件を2以上+複数セッション+NG表現フィルタを適用。

## 実装ステップ

1. **シグナル永続化**: `stargazer_analytics` にシグナルを保存し、次回取得する
2. **previousSignals の注入**: route.ts で DB から過去シグナルを取得し `detectMicroSignals` に渡す
3. **Reaction 検知**: 前回インサイト提示後の反応を分類・記録
4. **Reaction Learning**: 記録された反応からシグナル強度を調整
5. **タイミング最適化**: 会話ターン数・前回提示からの距離を考慮
6. **新シグナルタイプ**: avoidance_pattern を最初に追加（followup データ不要のため）
