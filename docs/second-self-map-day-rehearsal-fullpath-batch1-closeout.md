# Day Rehearsal Batch 1 — full-path（実 transport + raw feasibility）closeout（flag-gated・main 着地・default OFF）

> 2026-06-07 / **実装 → branch → main 着地 完了（flag default OFF＝既存挙動不変）。** local-only 完遂方針。production/Reality 介入層は HOLD。
> 目的: 原典 Day Rehearsal mini-design §3 の意図入力モデル（DayGraph + feasibility + **Transport**）を完遂。Option D（status-only degrade・既知 stopgap）を full-path（実値）に格上げ。

---

## 0. 状態
- **main 着地済**（squash・main HEAD `bcfca834`・親 `dedaaf1d`）・zero-loss・diff surgical（4 files）。code branch `claude/dr-fullpath`（HEAD `731a4574`）保持。
- ★**flag `DAY_REHEARSAL_FULL_PATH_ENABLED` = false（既定）→ 既存 Option D 挙動完全不変**。full-path は実装+logic 検証済だが **未 activate**（activation は local smoke 後の follow-up）。
- 予定変更/repair/optimize/Reality 接続 なし。read-only 診断層のまま。

## 1. 実装
- `lib/plan/dayRehearsal/dayRehearsal.ts`:
  - `RehearsalTravelView = { travelMin, mode, travelKnown }`。
  - `buildRehearsalInputFull(dayGraph, rawByTransitionIndex, travelByTransitionIndex, opts)`: 真の slack/shortfall（raw feasibility）+ 実 travel を埋める。raw 不在=not_applicable / travel 不在=unknown（捏造しない・honest degrade）。
  - `DAY_REHEARSAL_FULL_PATH_ENABLED`（module const・default false・client 評価ゆえ PLAN_FLAGS でない）。
- `app/(culcept)/plan/tabs/_useCalendarTabFeasibilityDisplay.ts`: hook が **計算済だが discard していた overlay（transport）** から実 travel を additive surface（`travelByTransitionIndex`）。resolved segment のみ（unresolved 不在）・overlay mode(walking/driving/transit/flight)→rehearsal mode(walk/car/public_transit/unknown) 写像・`manual_user` のみ travelKnown=true（heuristic は inferred）。display/raw 既存戻りは不変。
- `app/(culcept)/plan/tabs/CalendarTab.tsx`: flag で `buildRehearsalInputFromDisplay`(OFF) ↔ `buildRehearsalInputFull`(ON) を分岐（travel/raw を渡す）。

## 2. full-path が解禁するもの（flag ON 時）
- **friction が実移動で可変**（Option D は travelMin null → 一律 moderate だった）。
- **convergence/recovery が正確**（真の slack/shortfall + 実 travel friction）。
- **protect_buffer 到達可**（非 insufficient で friction_high が立ちうる＝Option D で dead だった候補が生きる）。
- bufferMin が実値（将来の定量検討の素地・但し UI は no-number/仮説トーン維持）。

## 3. 検証
- unit: 新規 **FP1-FP6**（実 slack/travel 反映 / raw 不在→not_applicable / travel 不在→unknown / insufficient+shortfall→bufferMin 実値 / 決定論 / flag 既定 false）+ dayRehearsal dir **56 PASS**。
- **plan suite 5070 PASS**（hook/CalendarTab 配線含む・回帰なし）。
- **tsc footprint 0**（total 55 baseline 不変）。zero-loss（main↔branch・無競合）。
- ★tsc で 2 段階の型ズレを発見・修正: ①OverlayTransitionOutcome は `{ok, segment}` ネスト（narrowing 修正）②TransportMode が 2 種（overlay≠rehearsal）→ 写像追加。

## 4. ethos 照合
- read-only 診断のまま（予定変更しない）・honest degrade（unknown は null・捏造しない）・**生数値は UI に出さない**（full-path は内部精度向上＝仮説トーン UI は不変）。flag-gated で安全段階導入。

## 5. 次（activation + Batch 2 へ）
- **activation（flag ON）= local smoke 検証後**: /plan（CalendarTab・home と違い到達可）で flag ON にし、実日の outlook/marker/candidate が full-path で sensible か CEO 視覚確認 → OK なら default ON 化。
- **Batch 2**: InnerWeather（energy）integration（§6 state evolution の核・S5 との差別化）。
- Batch 3: marker 精緻化（recovery per-marker + convergence magnitude）。Batch 4: What-if Preview UI（案B）。
