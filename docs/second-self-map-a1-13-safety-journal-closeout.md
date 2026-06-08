# A1-13 — Dogfood Safety Journal closeout

> 2026-06-08 / Build Unit / local-only / derived summary / calibration 非接触 ゆえ **main 直接着地**。flag 全 OFF。

---

## 実装した
- **dogfood safety journal（local-only）** `lib/plan/mobility/dogfoodSafetyJournal.ts`:
  - `summarizeShadowToObservation(...)` → 1 日の **derived summary**（date / readiness status / dogfood status / blockers / 4 concern booleans / verdict / activation候補有無）。★**raw GPS / pace ratio / friction を一切含まない**。
  - store: `recordDogfoodObservation`（client・冪等＝1 日 1 entry）/ `loadDogfoodJournal` / parse（既知 field のみ採用＝raw 混入を構造的に排除・fail-open・versioned・60 日上限）。
  - `assessDogfoodStability(journal)` → **insufficient / unstable / stable_safe**（≥3 日観測 ∧ 懸念ゼロ で stable_safe・1 日でも懸念で unstable）。
- **CalendarTab 配線**: shadow が走った日だけ（`report.ran`）derived summary を記録 + stability 判定 → dev report パネルに表示（isPaceShadowActivationEnabled のみ）。

## ★安全境界（CEO 方針・stop gate 自己点検 全クリア）
- ★**raw GPS / raw pace ratio / friction を保存しない**（derived summary のみ・test で field を限定検証）。
- ★**calibration 値を出さない・提案しない**（journal に calibration 概念なし）。
- ★**sparse から activation 判断しない**（journal は懸念の有無の観測のみ・activation gating は A1-10 の per-group ready_for_activation）。
- dogfood を超えて canary/broad に進まない（local 観測のみ）。実 flag ON 不要（記録は shadow flag ON 時のみ＝**flag OFF では記録ゼロ＝完全不変**）。
- local-only（localStorage）/ production・DB なし。

## テスト / tsc / lint
- 新規 **10 tests PASS**（summarize derived only/raw field なし・stability insufficient/stable_safe/unstable・冪等上書き・parse fail-open/raw 排除・record→load）。
- mobility 全体 **431 PASS**。自変更 tsc footprint **0**（baseline 55）。eslint clean。

## 非実装（停止ゲート / 次）
- **実 dogfood activation（flag ON で 1 日だけ ON）**＝CEO 判断（stop gate「実 flag ON が必要」）。
- **A1-14**（dogfood activation を実際に 1 日 ON にする手順）＝mini-design のみ。

## 次フェーズ（design・別 doc）
`…-a1-14-mini-design.md`。
