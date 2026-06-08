# A1-8 — Personal Pace Dogfood Shadow Activation closeout

> 2026-06-08 / Build Unit / shadow-only / flag default OFF / UI 非表示 ゆえ **main 直接着地**（CEO「収まるなら止まらず着地」）。

---

## 実装した
- **orchestration（pure）** `lib/plan/mobility/paceShadowActivation.ts`:
  - `runPaceShadowActivation({rehearsalInput, ratios, resolvePace, config})` → readiness ゲート + shadow 比較 + 懸念検出。
  - ★readiness が **not_enough（sparse）なら走らせない**（ran=false）。ready_for_shadow/activation のときだけ shadow。
  - 懸念: **over-pessimism**（viability 悪化）/ **marker explosion**（convergence 急増）/ **diagnostic worsening**（peakStrain level 悪化）/ **over-change**（leg friction 過剰）。anyConcern。
  - flag `DAY_REHEARSAL_PACE_SHADOW_ENABLED`（**default OFF**）+ `isPaceShadowActivationEnabled()`（flag ∧ **非 production**＝production hard block）。
- **DRY resolver** `personalPaceResolver.ts` に `buildRehearsalPaceResolver`（A1-5 反映 / A1-8 shadow 共用・transition→ready pace・legKey=anchorId ペア / odKey=正規化 location）。A1-5 memo も本 helper に統一。
- **CalendarTab dogfood 配線**: `useEffect`（isPaceShadowActivationEnabled() のときだけ）shadow を走らせ `console.debug("[pace-shadow]", report)` で **structured 出力（UI なし）**。
  - ★実 reflection はしない（dayRehearsal memo は `DAY_REHEARSAL_PERSONAL_PACE_ENABLED`（別 flag・OFF）のまま）。

## ★安全境界（CEO 方針・stop gate 自己点検 全クリア）
- **flag OFF で差分が出ない**: shadow flag OFF→effect 即 return / reflection flag OFF→memo 早期 return（不変）。両 flag OFF＝既存挙動完全不変。
- **sparse を ready 扱いしない**: readiness が not_enough を弾く。
- **診断が過悲観にならない**: shadow は**検出/報告のみ**で実診断を変えない（reflection OFF）。過悲観は concern として検出するだけ。
- **raw GPS 保存の可能性なし**: A1-8 は pure shadow + console のみ（GPS/store write なし）。
- **broad activation に進まない**: dogfood/dev 限定・default OFF・production hard block。
- **user-facing UI なし**: console.debug のみ（dev）。
- kill switch / rollback: shadow flag OFF で即停止（diff 0）。reflection flag は別・OFF 維持。

## テスト / tsc / lint
- 新規 **10 tests PASS**（flag default OFF/enabled false・not_enough→ran false・ready→shadow・null resolver 懸念なし・longer は clamp で過変化せず・閾値極小で over-change 検出・buildRehearsalPaceResolver mode 一致/未選択/範囲外）。
- mobility 全体 **388 PASS**。tsc footprint **0**（baseline 55）。eslint clean。

## 非実装（停止ゲート / 次）
- **A1-9**（dogfood shadow report 確認 UI / activation smoke / ready_for_activation 時の実診断反映手順 / rollback・calibration backlog）＝**mini-design のみ**。
- **flag activation**（DAY_REHEARSAL_PACE_SHADOW_ENABLED / DAY_REHEARSAL_PERSONAL_PACE_ENABLED は OFF 維持）。

## 次フェーズ（design only・別 doc）
`…-a1-9-mini-design.md`。**実装しない**。
