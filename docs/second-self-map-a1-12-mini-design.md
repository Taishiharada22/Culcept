# A1-12 — Calibration Readiness Assessment（mini-design → 安全なら実装）

> 2026-06-08 / Build Unit / A1-11 の後続。★**値は凍結のまま**「いつ較正を検討してよいか」を判定する pure helper。
> 前提（実装済・全 flag OFF）: A1-4 ratio / A1-7 readiness / A1-8-11 shadow+report+dogfood readiness / per-group gating。

---

## 0. ★前提を疑う
- これまで「固定値（A1-4 1.15/0.70/minEst5/minObs3/est5・A1-5 damping/clamp・A1-7 minForActivation8）は実データが閾値分布を語るまで凍結」と繰り返してきた。
- では「**いつ語れるようになるか**」を機械的に判定する層が無い。A1-12 = その **calibration readiness 判定**（値は一切変えない・apply しない・凍結のまま「準備できたか」だけ出す）。
- ★activation 弧の次（実 dogfood activation=flag ON）は stop gate なので、安全に自律継続できる **calibration 弧**（readiness→[A1-13]dry-run proposal→[stop gate]apply）に進む。

## 1. A1-12 で実装する範囲（pure・値変更なし）
- `lib/plan/mobility/personalPaceCalibrationReadiness.ts`（pure）:
  - `buildCalibrationReadiness({ratios, captureQuality, config})` → per-group + overall の calibration readiness。
  - calibration は activation(n≥8)より**多くの観測**が要る（閾値分布を推定するため）。例: per (od×mode) **valid 観測 ≥ minForCalibration(20)** + **calibration-ready group が ≥ minGroupsForCalibration(3)**。
  - status: `not_enough`（凍結継続）/ `ready_to_assess`（較正検討の土台あり・但し apply はしない）。
  - ★**値を出さない・変えない**（readiness status と件数のみ・raw ratio 非表示）。
- 既存 `DEFAULT_PACE_READINESS_CONFIG` と別に `DEFAULT_PACE_CALIBRATION_CONFIG = { minForCalibration: 20, minGroupsForCalibration: 3 }`。

## 2. 安全境界（CEO 方針・stop gate を踏まない）
- ★**calibration 値を変更しない**（固定値は凍結維持）。A1-12 は「準備判定」のみ。
- apply しない / dry-run proposal もしない（それは A1-13）。
- pure / flag 不要 / UI 追加なし（将来 dev report に status 表示は可）/ DB なし。
- sparse を ready 扱いしない（minForCalibration=20 は activation の 8 より厳しい）。

## 3. 実装可否判断（★自律）
- pure helper・値変更なし・apply なし・flag なし・UI 追加なし → **stop gate に該当せず・実装して main 直接着地可**。
- → A1-12 は **そのまま実装に進む**。

## 4. テスト / closeout
- tests: not_enough（観測<20）/ ready_to_assess（≥20 group が ≥3）/ sparse 不可 / 閾値 / 値を出さない。tsc footprint 0。closeout。
- 完了後 **A1-13 計画**（calibration dry-run proposal: 凍結値に対して「もし較正したらどの方向か」を **apply せず** structured に出す・reality PRM dry-run と同型）を出し、実装可否判断 → 安全なら実装。
- ★**apply / 実際の値変更 / flag ON は stop gate**＝そこで CEO 判断を仰ぐ。
