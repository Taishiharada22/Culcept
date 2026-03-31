# Alter 理解更新アーキテクチャ設計書

## 承認: 2026-03-31 CEO GO

## 北極星
Alterの本質は「応答の質」ではなく「理解の更新速度と精度」にある。
応答は理解の表面に過ぎない。理解が深ければ、応答は自然に個別化される。

## 設計原則
1. 観測 → 仮説 → 反証 → 更新 が全ての中心
2. アーキタイプは事前分布（prior）、事後分布（posterior）ではない
3. わからないことを明示的に持つ
4. 精度より誠実さ
5. 理解の表出は抑制的に（知っていることの10%だけ表出）

## 理解レイヤー
- L0: 構造的傾向（Stargazer軸スコア）— 数週間〜数ヶ月で更新
- L1: 環境文脈（仕事・金銭・健康・人間関係）— 日〜週で更新
- L2: 関係マップ（重要人物・関係の質）— 言及ごとに更新
- L3: 一時的状態（エネルギー・認知負荷）— セッションごと（揮発性）
- L4: 仮説プール（検証待ちの理解）— 毎セッション
- L5: 個別ベースライン（この人の「いつも」）— セッションごとに移動平均

## 実装フェーズ
### P0: アーキタイプ重み漸減 ✅ (2026-03-31)
- `computeArchetypeWeight(observationCount)` で事前分布の影響を漸減
- `TaggedFact.source` で fact の由来を追跡
- `rankFactsForCategory` で archetype facts を観測量に応じて低優先化

### P1: 環境文脈の facts レイヤー注入 ✅ (2026-03-31)
- 既存 `extractLifeContextSignals` + `stargazer_alter_context` を活用
- 蓄積された環境文脈を `buildTaggedFacts` に注入
- `FactTag: "environment"` を全カテゴリの優先度リストに追加
- 段階的開示（system prompt）+ facts レイヤー（判断根拠）の二重注入

### P2: Micro Insight / Small Signal（未着手）
- 個別ベースラインの構築
- ズレ検出パイプライン
- 提示のトーン・頻度制御

### P3: トリガーベースの深掘り質問（未着手）
- 質問プール（意図は固定設計、表現はLLM生成）
- 5つのトリガー条件による自然な発火

## 変更ファイル（P0/P1）
- `lib/stargazer/alterHomeAdapter.ts` — TaggedFact.source, computeArchetypeWeight, env facts, ranking
- `app/api/stargazer/alter/route.ts` — observationCount注入, activeLifeContext接続
- `lib/stargazer/alter.ts` — AlterPersonality 7フィールド追加（前回の修正）
