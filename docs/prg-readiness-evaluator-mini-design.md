# PRG Dogfood Readiness / Safety Evaluator — mini-design + pure layer（v0・未配線）

> 2026-06-09 / Build Unit / PRG 横断 meta 層。pure・read-only・新規データ/DB/UI/external なし。

PRG 各軸を作り込んだ後、「**どの軸がデータ不足か / dogfood 中か / activation 候補か / 沈黙すべきか / 懸念ありか**」を **1 つの基準で横断判定** する meta 層。秘書 OS / operator が「どの軸を信頼してよいか」を一望するための土台。

---

## 1. なぜ今これか（CEO 判断）
- PRG pure-local 軸を多数構築した（pace / tolerance / place / context / energy rhythm）。
- 次の新軸は全て stop gate（Recovery=DB+speculative / Social=DB+sensitive / Past Regret=新データ）。
- → 新軸より、**既存軸の状態を横断把握する基盤**が必要。これは **status aggregator であって予測器でない**ため
  データが薄くても **今日意味ある報告**を返す（各軸の readiness は今存在する）。non-speculative。

## 2. ★状態モデル（5 値・CEO の 4 bucket + safety 拡張）
| state | 条件 | CEO bucket |
|---|---|---|
| `dormant` | flag OFF | （surface していない） |
| `accumulating` | flag ON ∧ data 不足 | 「データ不足」「沈黙すべき」 |
| `dogfooding` | flag ON ∧ ready ∧ stability 信号なし | 「dogfood 中」 |
| `needs_attention` | flag ON ∧ ready ∧ **concern(unstable)** | ★safety: activation せず review |
| `activation_candidate` | flag ON ∧ ready ∧ stable_safe | 「activation 候補」 |

- ★`needs_attention` は「Safety Evaluator」の核（rollback/懸念を surface・activation 阻止）。
- ★**stability 証拠なしに activation 候補と呼ばない**（honesty）。現状 stability journal を持つのは
  **place affinity のみ** → 他軸は ready でも `dogfooding` 止まり。他軸の stability journal は次設計。

## 3. 設計（pure・decoupled）
`lib/plan/mobility/prgReadinessEvaluator.ts`:
- ★**core は input-driven**（各エンジン API に結合しない）: `evaluatePrgReadiness(PrgAxisInput[])` → `{axes, counts}`。
  `PrgAxisInput = {axis, flagOn, dataReady, stable: true|false|null, observed}`。`derivePrgAxisState` が 5 値を決定論導出。
- **collector**（pure・loaded data を受ける）: `collectMobilityObservationAxes({observations, flags, placeAffinityStable?})`
  = MobilityObservation を共有する 3 軸（movement tolerance / energy rhythm / place affinity）を既存 readiness
  builder 再利用（DRY）で正規化。
- ★raw 値なし（status + boolean + 件数のみ）・pure / Date 不使用 / DB・network なし・新規データなし。

## 4. coverage と honesty
- v0 = MobilityObservation 系 **3 軸**（mt / er / place affinity）。
- **personal pace**（movementEvent 系・独自の rich readiness stack `not_ready|ready_for_dogfood`）は generic
  `PrgAxisInput` 経路で呼び側が渡せる（v0 collector には入れない＝次設計で専用 collector）。
- **context modifier(A2)** は除外（決定時 modifier であって **data 蓄積軸でない**＝readiness の概念が合わない）。
- flagOn の実効値（`flag ∧ NODE_ENV!==production`）は **呼び側が決める**（core は boolean のみ・prod hard block は呼び側）。

## 5. 次設計（★UI/operator surface は stop gate・実装は CEO）
- **operator console / dashboard**: report を dev console / 運用画面に出す（A1-8 shadow 型・operator surface = UI stop gate）→ 設計のみ。
- **per-axis stability journal**: movement tolerance / energy rhythm にも place affinity 型の safety journal を足し、
  activation_candidate / needs_attention に到達可能にする（pure 可・次増分）。
- **personal pace collector**: 独自 readiness stack を PrgAxisInput に正規化（pure 可・次増分）。
- **readiness-gated activation**: activation_candidate を満たした軸だけ自動で活性化（★実反映＝CEO stop gate）。

## ★stop gate
operator/UI surface 表示 / readiness による実 activation / 新規データ保存 / production / DB / 人格診断 → 停止。
pure/readiness/mini-design は自律可。

## 次
evaluator pure layer 着地（未配線）→ 次増分（per-axis stability journal or pace collector）or operator surface mini-design。
