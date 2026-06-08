# A1-15 — Canary Entry Readiness closeout + A1-16 計画（★完全 stop case 到達）

> 2026-06-09 / Build Unit / pure helper・canary 非実行・production 非接触 ゆえ **main 直接着地**。flag 全 OFF。

---

## 実装した
- **canary entry readiness 判定（pure）** `lib/plan/mobility/personalPaceCanaryReadiness.ts`:
  - `buildCanaryReadiness({stability, dogfoodReadiness, activationReadyCount})` → 4 check → `ready_for_canary_assessment` / `not_ready_for_canary` + blockers + note。
  - check: 複数日 stable_safe / 観測日数 ≥7 / dogfood ready_for_dogfood / ready_for_activation 区間 ≥2。
  - ★**canary を実行しない・production block を解除しない・flag activation しない**（note 明示・assessment のみ）。
  - `DEFAULT_CANARY_READINESS_CONFIG = {minObservedDays:7, minActivationGroups:2}`。

## ★安全境界（CEO 方針・全クリア）
- canary 実行 / production block 解除 / flag activation は helper の外（CEO 判断の stop gate）。
- sparse / 単発 stable では ready にしない（複数日 + 複数区間を要求）。
- raw 数値（ratio/friction/座標）を出さない（status/件数のみ・test 担保）。
- pure / DB なし / calibration 値に触れない（凍結維持）。flag OFF で完全不変。

## テスト / tsc / lint
- 新規 **8 tests PASS**（全 pass→ready・各 fail→not_ready+blocker・note CEO 判断明示・raw 非出力・config）。
- mobility 全体 **439 PASS**。自変更 tsc footprint **0**（baseline 55・※dev server 残骸 `.next` を除去して確認）。eslint clean。

---

## A1-16 計画 + ★判断 = **完全 stop case（CEO 判断必須）**

### A1-16 候補: canary activation（少数公開への展開）
- 内容: dogfood で `ready_for_canary_assessment` を満たした後、**canary cohort に対して実 flag を ON**にして少数公開。

### ★自己判断 = 自律実装しない（完全 stop case）
- canary は **production の hard block（`isPersonalPaceReflectionEnabled` / `isPaceShadowActivationEnabled` の `process.env.NODE_ENV !== "production"`）を解除**する必要があり、**production 変更**そのもの。
- A1-14/CEO の stop gate「production / 実 flag ON / canary・broad に進む」に明確に該当。さらに cohort 配信機構（誰を canary にするか）= 新インフラ設計 + CEO/法務判断。
- → ★**A1-16（canary 実行）は自律で進めない。CEO 判断の完全 stop case**。

### ★これ以上の自律前進が無い理由（honest）
Second Self Map A1 系（pace activation）の **安全側で実装できる pure 基盤は出尽くした**:
capture→ratio→adapter→opt-in→readiness→shadow→shadow-activation→dogfood report→per-group gating→dogfood runbook→calibration readiness→safety journal→dogfood smoke(gate PASS)→canary readiness。
**残るのは全て実データ依存 or CEO 判断**:
1. **実 dogfood activation（flag ON）** — 実データ(capture)が貯まり stable_safe を満たして初めて・CEO 判断。
2. **canary（production block 解除）** — production 変更・CEO/法務。
3. **calibration（固定値調整）** — 十分データ + held-out 後・CEO 判断（凍結維持）。
→ いずれも **CEO の判断 or 実運用データ蓄積**が前提で、AI が安全に先行実装できる pure 層はもう無い。

## ★まとめ（CEO 判断をお願いしたい点）
A1 系の pure 基盤は完成し全 3 flag OFF で dormant。次は **実運用フェーズ**（本人 dogfood で capture を貯めて実 activation を試す）であり、これは CEO の意思決定領域。私の自律バッチはここで **完全停止** し、CEO の方針（実 dogfood を始めるか / 別テーマに移るか）を仰ぎます。
