# Alter Clarify 再定義 — 設計書

## 概要
clarify を「情報不足の補完」から「理解深化のための問い」へ拡張する。
既存の情報補完型 clarify はそのまま維持し、新たに理解深化型を追加する。

## 2系統の clarify

### A. `missing_info`（情報補完型・既存）
**目的**: 判断に必要な最低限の情報を得る
**発火条件**:
- `clarify_high_ambiguity_high_stake`: ambiguity ≥ 0.83 + 高リスク + 対象不明
- `clarify_relational_unknown`: 対人判断で相手が誰か不明

**質問形式**:
- 「仕事の相手ですか、それとも個人的な相手ですか？」
- 「はい/いいえ」か「AかBか」で答えられる形

### B. `understanding`（理解深化型・新規）
**目的**: 表面情報は足りているが、判断の核（動機・引っかかり・本当の望み）が見えない
**発火条件**:
- `clarify_understanding_motive`: 対人判断で相手は分かるが目的が不明
  - ambiguity ≥ 0.67 + info < 0.2 + involves_other + target_role既知 + purpose不明
- `clarify_understanding_context`: 非対人でも判断対象と背景が両方不明
  - ambiguity ≥ 0.67 + info < 0.2 + target_type不明 + emotional_stake が high でない

**質問形式**（尋問を避ける3形式）:
- 選択肢型: 「それって、仕事内容の問題？ 人間関係？ それとも待遇寄り？」
- 許可型: 「もう少し聞いてもいい？」
- 軽い仮説型: 「体力の問題というより、どこか気持ちが引っかかってる感じ？」

## clarify 条件表

| reason | type | 条件 | 質問の方向 |
|--------|------|------|-----------|
| clarify_high_ambiguity_high_stake | missing_info | ambiguity≥0.83 + 高リスク + 対象不明 | 何について判断するか |
| clarify_relational_unknown | missing_info | involves_other + target_role不明 | 相手は誰か |
| clarify_understanding_motive | understanding | ambiguity≥0.67 + info<0.2 + 相手既知 + 目的不明 | なぜそうしたいのか |
| clarify_understanding_context | understanding | ambiguity≥0.67 + info<0.2 + 対象不明 + 非高感情 | 何が引っかかっているか |

## 制約ルール

1. **1会話1問制限**: 既存のループ防止ロジックで保証（前回 clarify + 今回も clarify → conclude 強制）
2. **State-aware**: `prefer_conclude_over_clarify = true` の時は全 clarify を抑制
3. **重い話題は受け取り優先**: emotional_stake が high → understanding_context は発火しない
4. **2行以内**: LLM の出力制約として維持

## NG表現（理解深化型で禁止）
- 「あなたの動機は〜」（分析的）
- 「パターンとして〜」（観察の押し付け）
- 「なぜ〜ですか？」（尋問調）
- 2つ以上の質問

## Before / After 例

### Before（情報補完のみ）
ユーザー: 「上司にどう伝えたらいいか分からない」
→ clarify: 「何を伝えたいですか？（謝りたい/要望/退職/相談 など）」

### After（理解深化型が発火する場合）
ユーザー: 「上司にどう伝えたらいいか分からない」
→ clarify: 「それって、伝え方の問題？ それとも、伝えること自体にどこか迷いがある感じ？」

## 実装ファイル

| ファイル | 変更内容 |
|---------|---------|
| `lib/stargazer/alterHomeAdapter.ts` | `ModeDecisionReason` に2種追加、`ClarifyType` 型、`getClarifyType()` 関数、`buildClarifyFormatSection` 2系統対応、`buildHomeAlterPromptWithContext` に clarifyType パラメータ追加 |
| `app/api/stargazer/alter/route.ts` | `getClarifyType` インポート、clarifyType をプロンプト構築に渡す、analytics に `clarify_type` 記録 |

## analytics での計測
```sql
-- clarify の type 別発火率
SELECT
  metadata->>'clarify_type' AS type,
  metadata->>'mode_decision_reason' AS reason,
  COUNT(*)
FROM stargazer_analytics
WHERE event = 'home_alter_clarify'
GROUP BY 1, 2 ORDER BY 3 DESC;
```
