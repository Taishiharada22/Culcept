# Alter Micro Insight 提示設計

## 原則
**検知精度より提示の形が10倍重要。** 分析結果を見せるのではなく、自然な関心として出す。

## シグナル一覧

| シグナル | 検知条件 | 偽陽性対策 |
|---------|---------|-----------|
| energy_action_gap | 元気表現（「元気だ」等） + 行動停止（「進まない」等） | 「大丈夫」を除外（社交辞令のため） |
| behavior_mismatch | 「大丈夫」+ 重い内容2語以上 | 重い単語1つでは発火しない |
| behavior_mismatch | 「忙しい」+ 250字超 + 相談シグナル | 長文閾値UP + 相談意図の共起を要求 |
| topic_repetition | 同一テーマが会話内で3回以上言及 | previousSignals で重複防止 |
| sentiment_shift | 特定人物への感情極性の反転 | 「母音」等の誤マッチ防止パターン |

## 収束条件

| パターン | 最低シグナル数 | Trust要件 |
|---------|--------------|----------|
| energy_gap + behavior_mismatch | 2 | T1+ |
| topic_repetition | 2（異なるセッション） | T1+ |
| sentiment_shift | 2 | T1+ |

**重要**: 単発シグナルでは絶対に収束しない。

## 提示形式

| 型 | 用途 | Trust 要件 | 例 |
|---|------|-----------|---|
| casual_check | さりげない確認 | T1+ | 「そういえば、〇〇の件どうなった？」 |
| observation | 観察の共有 | T1+ | 「最近、仕事の話が多いね」 |
| gentle_inquiry | 問いとしての気づき | T2+ | 「体力の問題じゃないなら、気持ちで止まってるものがあるかもね」 |
| connection | つながりの示唆 | T3+ | 「前も似たようなこと言ってたけど…」 |

## 注入条件

全てを満たす場合のみプロンプトに注入:
1. 収束が検知されている（`microInsight != null`）
2. responseMode が clarify でない
3. Trust Level が `required_trust` 以上
4. emotional_load < 0.75（感情的に重い時は気づきを差し込まない）

## NG表現集

| NG | 理由 |
|---|------|
| 「あなたは行動と意欲が乖離しています」 | 断定 + 分析の暴露 |
| 「3つのシグナルからストレス状態と推定されます」 | 分析の暴露 + 診断風 |
| 「パターンが見えます」 | メタ分析 |
| 「データによると〜」 | 分析根拠の暴露 |

## OK表現集

| OK | 型 |
|---|---|
| 「体力の問題じゃないなら、どこか気持ちで止まってるものがあるかもね」 | gentle_inquiry |
| 「最近、その話題のとき少し言葉を選んでる感じがする」 | observation |
| 「そういえば、〇〇の件どうなった？」 | casual_check |
| 「前も似たようなこと言ってたけど、何かあった？」 | connection |

## 1会話1回制限
構造的に保証されている: `microInsight` 変数は1回のみ設定され、プロンプト注入も1回。

## 計測
```sql
-- micro insight の注入率と presentation type 分布
SELECT
  metadata->'micro_insight'->>'presentation' AS type,
  COUNT(*)
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND metadata->'micro_insight' IS NOT NULL
GROUP BY 1;
```
