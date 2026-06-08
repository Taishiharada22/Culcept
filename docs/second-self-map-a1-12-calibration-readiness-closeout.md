# A1-12 — Calibration Readiness Assessment closeout + A1-13 計画（★stop gate 到達）

> 2026-06-08 / Build Unit / pure・値変更なし ゆえ **main 直接着地**。flag 全 OFF。

---

## 実装した
- **calibration readiness 判定（pure）** `lib/plan/mobility/personalPaceCalibrationReadiness.ts`:
  - `buildCalibrationReadiness(ratios, config)` → per-group(`calibrationReady`) + overall(`not_enough` / `ready_to_assess`)。
  - calibration-ready = A1-4 ready かつ n≥`minForCalibration`(20)。ready group が ≥`minGroupsForCalibration`(3) で ready_to_assess。
  - ★**値を一切出さない・変えない・apply しない**（凍結維持）。`note` で明示。
  - `DEFAULT_PACE_CALIBRATION_CONFIG = {minForCalibration:20, minGroupsForCalibration:3}`（activation の 8 より厳しい＝閾値分布推定に十分なデータを要求）。

## ★安全境界（CEO 方針・全クリア）
- **calibration 値を変更しない**（凍結維持・apply なし・dry-run もしない）。
- sparse / activation 可(n=8)でも calibration は not_enough（閾値分離）。
- raw ratio / 固定値（1.15/0.70/damping/clamp）を出力に含まない（status/件数のみ・test で担保）。
- pure / flag 不要 / UI 追加なし / DB なし / flag OFF で完全不変。

## テスト / tsc / lint
- 新規 **10 tests PASS**（n≥20→calibrationReady・n<20/activation 可でも不足・≥3 group で ready_to_assess・sparse 不可・note 凍結明示・固定値非出力・閾値 activation>8）。
- mobility 全体（後述）。自変更 tsc footprint **0**（baseline 55）。eslint clean。

---

## A1-13 計画 + ★実装可否判断 → **stop gate 到達（CEO 判断を仰ぐ）**

### A1-13 候補: calibration dry-run proposal
- 内容: ready_to_assess のデータから「もし較正したら固定値をどの方向に動かすか」を **apply せず** structured に出す（reality PRM dry-run と同型）。

### ★自己判断（前提を疑った結果）= 自律実装しない
- A1-13 は **較正値を計算する**。CEO が繰り返し強調した原則「**calibration は凍結・固定値はいじらない**」の **境界**であり、A1-11 の「やらないこと」に **calibration値調整** が明記されている。
- dry-run（apply しない）でも、**凍結された固定値に対する変更方向を計算する**こと自体が凍結境界に触れる＝**stop gate**（「calibration値調整に進みそう」）。
- さらにこの先（実 dogfood activation = flag ON / calibration apply）は明確な stop gate。
- → ★**A1-13 は自律実装せず、CEO 判断を仰ぐのが integrity-correct**。

### CEO 判断をお願いしたい点
1. **(A) calibration 凍結を維持** — A1-13 dry-run proposal も作らず、実データ蓄積（dogfood activation で capture が増えてから）を待つ。
2. **(B) calibration dry-run proposal を許可** — apply せず・review 必須・値は出すが適用しない、で A1-13 を実装。
3. **(C) 別方向** — dogfood shadow の複数日観測ログ（calibration に触れず・activation 安全性の継続観測）等、凍結境界を避けた別の安全層。

→ 私の推奨は **(A) または (C)**：現状 dogfood 実データが無い（capture は手動ログ少数）ため、calibration proposal は推定対象データが不足（A1-12 も not_enough のはず）。実データが貯まる前の dry-run は overfit リスク。実 dogfood（flag ON）で capture が増えてから calibration を検討する順序が筋。

## ★まとめ
Second Self Map A1 系（capture→ratio→adapter→opt-in→readiness→shadow→report→per-group gating→dogfood runbook→calibration readiness）は全 pure 基盤が main 着地・全 flag OFF で dormant。**次の実質的前進（実 dogfood activation / calibration proposal）はいずれも CEO 判断の stop gate** ゆえ、A1-12 着地をもって自律バッチを停止し CEO に委ねる。
