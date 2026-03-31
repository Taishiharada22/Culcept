# Alter Understanding System — 設計書

## 北極星
「この人の第二の自己として、まだ言語化されていない傾向・揺れ・矛盾に気づき、自然に差し出す」

**ChatGPT/Gemini との決定的差異**: 一般的に正しい回答 → **この人にとって正しい回答**

## レイヤー構造

```
Layer 0: Trust Gate（開示制御）
Layer 1: Trait（Stargazer 45軸 — 既存）
Layer 2: State（今この瞬間の心理的状態）    ← NEW
Layer 3: Life Context（重要人物・環境の蓄積） ← NEW
Layer 4: Narrative（人生文脈）               ← 将来
Layer 5: Cross-Context（文脈横断パターン）   ← 将来
Layer 6: Decision（ForceBalance + ActionShape — 既存）
```

横断機能: **Micro Insight Engine**（小さなシグナルの蓄積と収束検知）

## Phase 0 実装内容（今回）

### 1. UnderstandingUnit（知識の4軸タグ）
全ての「理解」に付与する品質タグ。「わかったつもり」を防ぐ。
- **source**: user_stated / user_implied / behavior_observed / alter_inferred / contradicted
- **temporality**: momentary / situational / persistent / structural
- **confidence**: 0.0-1.0
- **freshness**: last_confirmed + possibly_stale フラグ

### 2. Trust Gate（開示制御）
5段階の信頼レベルに応じて、Alter が何を表に出せるかを制御。
- T0 (初回): 反復・表層のみ
- T1 (3回〜): 観察・穏やかな問い
- T2 (信頼0.4+): パターン指摘
- T3 (信頼0.7+): 矛盾・深層接続
- T4 (信頼0.85+): 核心的問いかけ

提示スタイルも段階に応じて変化（reflect → observe → hypothesize → connect → state）。

### 3. State Layer（ゼロコスト状態推定）
ルールベース（LLM不使用）で心理的状態を推定：
- **psychological_capacity**: 心理的余力 0.0-1.0
- **emotional_load**: 感情的負荷 0.0-1.0
- **cognitive_fatigue**: 認知疲労 0.0-1.0

推定根拠: 時間帯 / 曜日 / 話題の重さ / 言語シグナル / 明示的発言

#### State → 判断エンジンへの影響
- capacity 低 → protect_pressure 増加、action_shape 1段階ダウングレード
- emotional_load 高 → clarify 抑制（まず受け取る）、結論優先
- cognitive_fatigue 高 → 応答シンプル化

### 4. Micro Insight Engine（小さなシグナルの蓄積）
4種のシグナルを検知し、analytics に蓄積：
- **energy_action_gap**: 「疲れた」と言いながら行動している（またはその逆）
- **behavior_mismatch**: 「〇〇が嫌」と言いつつ繰り返す
- **topic_repetition**: 同じトピックが繰り返し登場
- **sentiment_shift**: 感情の極性が急変

収束条件: 同一トピックで2+シグナルが蓄積 → MicroInsightCandidate 生成

#### 提示の型（検知精度 < 提示の形）
- **casual_check**: 「そういえば、〇〇さんとはどう？」
- **observation**: 「最近、仕事の話が多いね」
- **gentle_inquiry**: 「〇〇のとき、ちょっと迷ってない？」
- **connection**: 「前も似たようなこと言ってたけど…」

### 5. 新 ActionShape
既存6形に2形追加：
- **trial_then_decide**: 「まず小さく試してから決める」
- **delegate_or_request**: 「誰かに頼む・相談する」

### 6. 理解駆動型 Clarify 強化
- 閾値を 0.83 → 0.67 に引き下げ（ambiguity ≥ 0.67 + info < 0.2 + involves_other + purpose 不明）
- State-aware: emotional_load 高い時は clarify を抑制し conclude を優先

### 7. Life Context 抽出
会話内容から人物・環境のシグナルを自動抽出し analytics に蓄積：
- 家族（母/父/兄弟姉妹）、パートナー、上司/同僚/先輩/後輩、友人
- 仕事環境（転職活動中、リモートワーク、繁忙期）

## ファイル構成

| ファイル | 役割 |
|---------|------|
| `lib/stargazer/alterUnderstanding.ts` | 全型定義 + State Layer + Trust Gate + Micro Insight + Life Context |
| `lib/stargazer/alterHomeAdapter.ts` | ActionShape拡張 + clarify強化 + StateForceAdjustment統合 |
| `app/api/stargazer/alter/route.ts` | 統合ポイント: State推定→Shape調整→Prompt注入→Analytics永続化 |
| `components/home/AskHero.tsx` | 新ActionShape対応のCTA/遷移先 |

## 3つの理解経路

- **経路A（主軸）**: 相談駆動 — ユーザーが相談する → 会話の中から人物・環境を自然に蓄積
- **経路B**: Micro Insight 駆動 — シグナル収束で Alter から問いかけ → 新しい理解
- **経路C（稀）**: 構造的ギャップ補完 — 重要な空白に気づいて聞く（Trust Level 3+）

## 将来フェーズ

### Phase 1: Narrative Layer
- 人生の物語構造（転換点、未解決テーマ、成長パターン）
- 経路C の発動

### Phase 2: Cross-Context Layer
- 「仕事では慎重だが恋愛では衝動的」のようなドメイン間パターン
- 既存の relationship_mode_split と統合

### Phase 3: 予測 → 処方 → ACTION
- 理解 → 「こういう場面で困るはず」→ 「こういう環境が合う」→ 具体的提案
- Human OS のビジョンに接続

## 設計原則

1. **全既存資産を土台にして昇華する** — 既存の ForceBalance, ActionShape, Ambiguity Engine, Relational Lens は全て保持
2. **ゼロコスト優先** — State Layer はルールベース、Micro Insight は既存 analytics テーブルに蓄積
3. **検知精度より提示の形** — Micro Insight は「見ている」質感が10倍重要
4. **わかったつもり禁止** — UnderstandingUnit の4軸タグで全ての理解を管理
5. **State-aware 応答** — 心理的余力が低い時は質問しない、シンプルに結論を出す
