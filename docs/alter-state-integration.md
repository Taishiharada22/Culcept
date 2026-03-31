# Alter State Integration — 設計書

## 概要
State Layer の推定結果を、応答モード選択・判断骨格・プロンプトの3箇所に実効反映する。

## State → 各層への反映マップ

### 1. モード選択（selectResponseModeWithReason + route.ts）

| State 条件 | 反映 | 実装 |
|-----------|------|------|
| emotional_load > 0.65 | clarify 抑制（prefer_conclude） | alterHomeAdapter.ts: computeStateAdjustment |
| cognitive_fatigue > 0.6 | branch → conclude 降格 | route.ts: State-driven mode downgrade |
| emotional_load > 0.7 | branch → conclude 降格 | route.ts: State-driven mode downgrade |

### 2. 判断骨格（JudgmentSkeleton）

| State 条件 | 反映 | 実装 |
|-----------|------|------|
| simplify_response = true (capacity < 0.35) | action_shape 1段階ダウングレード | route.ts: SHAPE_DOWNGRADE テーブル |

ダウングレードチェーン:
```
full_go → bounded_go → trial_then_decide → prepare_then_go → observe_first
```

### 3. Wording（プロンプト制約）

| State 条件 | 文体ルール |
|-----------|-----------|
| capacity < 0.4 | 短文優先、「まずこれだけ」、提案は1つだけ |
| emotional_load > 0.6 | やさしく短く、「〜だよね」「無理しなくていい」、押さない |
| cognitive_fatigue > 0.6 | 箇条書き禁止、1文で次の一手、抽象的な問いかけ禁止 |

**重要**: 相手に「疲れてるんだね」等と状態を指摘しない。内部調整のみ。

## Trust Gate

State hints のプロンプト注入は **Trust Level 1+**（sessions ≥ 2 または trustLevel ≥ 0.15）の場合のみ。

理由: 初回ユーザーに対して状態推定を適用すると、不正確な推定に基づく不自然な文体変化が起きるリスクがある。

## 禁止事項

1. **State だけで人格を固定化しない** — 一時的状態を persistent な理解に昇格させない
2. **微小変化で毎回文体を大きく変えない** — 閾値を設けて「明確に状態が偏っている」場合のみ
3. **State を相手に伝えない** — 「疲れてるね」「大変そうだね」は Alter の推定を暴露すること

## 値の安全ガード

| 値 | 最小 | 最大 | 根拠 |
|----|------|------|------|
| psychological_capacity | 0.15 | 1.0 | 0 だと全ての提案が潰れる |
| emotional_load | 0.0 | 0.85 | 天井飽和防止 |
| cognitive_fatigue | 0.0 | 0.85 | 天井飽和防止 |

## 実装ファイル

| ファイル | 変更内容 |
|---------|---------|
| `lib/stargazer/alterUnderstanding.ts` | estimateUserState の clamp 値調整 |
| `app/api/stargazer/alter/route.ts` | branch→conclude 降格、trust gate、wording 制約強化 |
