# Alter Phase 0 観測健全性チェック

## 実施日: 2026-03-30

## 監査方法
コードパス静的解析 + パターンマッチ検証

---

## 発見した問題と対応

### CRITICAL（修正済み）

| # | 問題 | 場所 | 対応 |
|---|------|------|------|
| C1 | `checkSignalConvergence` で topic_repetition が1シグナルで収束発火 | alterUnderstanding.ts:654 | `>= 2` に変更 |
| C2 | `checkSignalConvergence` で sentiment_shift が1シグナルで収束発火 | alterUnderstanding.ts:666 | `>= 2` に変更 |
| C3 | `detectMicroSignals` で「大丈夫」が energy_action_gap の偽陽性 | alterUnderstanding.ts:497 | 「大丈夫」を除外、明確な元気表現のみに |
| C4 | `detectMicroSignals` で「忙しい+長文」が behavior_mismatch の偽陽性 | alterUnderstanding.ts:527-536 | 閾値250字 + 相談シグナル共起を要求 |
| C5 | Sentiment Shift の人物パターンが「母音」「父性」等に誤マッチ | alterUnderstanding.ts:577-583 | 助詞が続くパターンに修正 |
| C6 | `microInsight.suggested_prompt` がサニタイズなしで systemPrompt に注入 | route.ts:1001 | 改行除去 + 100文字制限 |

### MEDIUM（修正済み）

| # | 問題 | 場所 | 対応 |
|---|------|------|------|
| M1 | `estimateUserState` で複数シグナルが同時発火すると capacity が 0.0 に崩壊 | alterUnderstanding.ts:326-331 | capacity 最低値 0.15、load/fatigue 最大値 0.85 に制限 |
| M2 | behavior_mismatch: 重い内容判定が単語1つで発火 | alterUnderstanding.ts:515 | 重い単語2つ以上の合致を要求 |
| M3 | `extractLifeContextSignals` の人物パターンも誤マッチリスク | alterUnderstanding.ts:690-704 | Sentiment Shift と同じパターン修正を適用 |

### LOW（Phase 1 で対応）

| # | 問題 | 場所 | Phase 1 対応方針 |
|---|------|------|-----------------|
| L1 | Life Context 抽出にレート制限なし | route.ts:1595-1609 | 同一 session での重複排除を Step 5 で実装 |
| L2 | previousSignals の取得が全期間（stale blocking）| route.ts:822 | 7日以内フィルタを追加 |
| L3 | 環境パターンが過去形にもマッチ（「昔転職を考えていた」→ 現在扱い）| alterUnderstanding.ts:775 | Step 5 の epistemic 管理で temporality 検証を強化 |
| L4 | State hints が trust gate なしで prompt 注入 | route.ts:985-997 | Step 3 で trust level gate を追加 |

---

## Phase 1 に進む前の確認事項

**全 CRITICAL / MEDIUM 修正完了。**

LOW 項目は Phase 1 の各 Step で自然に対応される設計。

### 残存リスク
- 実ユーザーデータがない状態での静的解析のため、パターンの実際の発火率は β運用で要観測
- 推奨: β期間中に以下の SQL で定点観測
  ```sql
  -- micro signal の発火率
  SELECT metadata->>'type' AS signal_type, COUNT(*)
  FROM stargazer_analytics
  WHERE event = 'home_alter_micro_signal'
  GROUP BY 1 ORDER BY 2 DESC;

  -- life context の抽出率
  SELECT metadata->>'category' AS category, COUNT(*)
  FROM stargazer_analytics
  WHERE event = 'home_alter_life_context'
  GROUP BY 1 ORDER BY 2 DESC;

  -- state 分布
  SELECT
    ROUND((metadata->'user_state'->>'psychological_capacity')::numeric, 1) AS capacity_bucket,
    COUNT(*)
  FROM stargazer_analytics
  WHERE event = 'home_alter_judgment' AND metadata->'user_state' IS NOT NULL
  GROUP BY 1 ORDER BY 1;
  ```
