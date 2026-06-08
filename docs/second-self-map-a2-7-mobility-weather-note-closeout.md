# A2-7 — Mobility leg weather note（今日の天気を区間仮説に）closeout

> 2026-06-09 / Build Unit / A2-6 weather を mobility hypothesis に接続。**mode は変えない・dev/dogfood のみ・後方互換**。

A2-6 で取得した今日の天気を、MapTab の区間仮説（Mobility Hypothesis Surface）の contextNote に効かせる。

---

## 前提（既存資産の再利用）
- `mobilityHypothesis.buildMobilityHypothesis(belief, ctx)` は **既に** weather→contextNote ロジックを持つ（屋外露出 habitual mode[walk/bicycle] × rain/heat のときだけ「負担かも」注意・★mode は変えない）。
- だが `mobilityGuidance.ts:58` が `buildMobilityHypothesis(belief, {})` で **weather を渡していなかった**。A2-7 はこの 1 点を繋ぐだけ。
- WeatherKind→DecisionContext 変換は A2-2 の `contextToDecisionContext`（cold→normal・unknown-source 除外）を再利用。

## 実装した
- **`mobilityGuidance.ts`**: `MobilityGuidanceInput` に optional `weather?` を additive 追加（不在→`{}`＝後方互換）。`resolveMobilityGuidance` が weather を `buildMobilityHypothesis` に渡す。
- **`MapTab.tsx`**: `useTodayWeather()`（A2-6 hook）→ `contextToDecisionContext` で投影 → `mobilityCardData` memo の `resolveMobilityGuidance` に `weather` 供給（deps 追加）。

## ★安全境界（全 stop gate 準拠）
- **★自動 dev-gating**: `useTodayWeather` は `isContextModifierEnabled()`（flag ON ∧ 非 production）のときだけ fetch、それ以外 null。→ **production/flag OFF では weather=null → contextNote なし → mobility 仮説は完全不変**。weather の production 露出なし。
- **mode を変えない**: contextNote は「注意」のみ。`todayLikelyMode`/`surfacedMode` は belief 由来のまま（雨でも bicycle のまま）。既存 guardrail 保持。
- 後方互換: weather 不在で既存 8 tests 全 pass。surface gate（necessity）は不変＝出す/沈黙の判断は weather に依らない。
- belief/DB/external API: A2-7 自体は pure 配線（weather source は A2-6 の route・本ステップは新規 fetch なし）。sensitive-free（WeatherKind のみ）。

## テスト / tsc / lint
- mobilityGuidance に A2-7 4 tests 追加（weather なし→note なし / rain×bicycle→note 出る・mode 不変 / rain×train→note なし / normal→note なし）。計 **12 PASS**。mobility 全体回帰 PASS。
- eslint clean（MapTab exhaustive-deps 含む）。tsc footprint **0**。

## smoke 観点（dev/dogfood）
flag ON で /plan Map、habitual が自転車/徒歩の区間 × 雨/猛暑の日に「今日は雨なので…少し負担かも」注意が出る（mode は変わらない）。穏やか/非屋外 mode/取得失敗は注意なし。production では出ない。

## 次
A2 は day-level 文脈 reason（A2-1〜6）+ leg-level 天気注意（A2-7）まで dogfood 稼働。残=天気 personal 化（条件×行動捕捉）/履歴 baseline（DB）/production 露出＝CEO 判断 or 新規データ。
