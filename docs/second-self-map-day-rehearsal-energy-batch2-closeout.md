# Day Rehearsal Batch 2 — InnerWeather energy（状態次元）closeout

> 2026-06-08 / Build Unit / CEO・GPT GO（activation）
> 原典ロードマップ §2: Batch1 full-path 精度 → **Batch2 InnerWeather energy** → Batch3 marker 精緻化 → Batch4 What-if UI。
> 関連: `second-self-map-day-rehearsal-fullpath-batch1-closeout.md` / `second-self-map-calibration-backlog.md`。

---

## 1. 目的
Day Rehearsal（「未来の自分が先に今日を試す」read-only 診断層）に **状態次元（energy）** を導入。
予定密度・移動・余白という「外形」だけでなく、**今日のあなたの energy** で strain budget を仮説的に補正し、
「同じ予定でも、エネルギーが低い日は少し際どく見える」を穏やかに表現する。★最適化でも予定変更でもない。

## 2. 実装（flag-gated・additive・最小）
- **canonical energy source**: `InnerWeather.energyLevel`（**-1〜1**・`useInnerWeather()` hook = GET `/api/stargazer/inner-weather`・client cache・read-only・**DB write なし**）。
  - GET route が DB `energy_level`(0-1) を `×2−1` して **-1〜1** を返す（route.ts L208 で直接確認済）。
- **正規化（MANDATORY）**: `normalizeInnerWeatherEnergy(rawMinus1to1) = clamp((e+1)/2, 0, 1)`（-1〜1 → 0-1）。
  - 省くと負値が潰れ系統的 over-pessimism → EN1-EN4 で正規化方向を test 固定。
- **過悲観回避**: `DEFAULT_REHEARSAL_CONFIG.energyBudgetWeight = 0.5`（1→0.5）。
  - `strainBudget = baseBudget × (1 − weight×(1−clamp(e,0,1))×0.5)` → weight=0.5 のとき e=0 でも **0.75×baseBudget**（最大 −25%・自然下限）。floor は冗長ゆえ**不採用**（最小・同効果。監査の 3 層提案を 1 層に refine）。
- **null degrade**: energy 未供給（未記録・flag OFF）→ `strainBudget` が `baseBudget` 短絡 → **既存挙動完全不変**（安全側）。
- **flag**: `DAY_REHEARSAL_ENERGY_ENABLED`。
  - Batch 2 OFF 着地: main `d5e88970`（default false・既存挙動不変）。
  - **activation 着地: main `deef2b45`（親 `069c8ca7`・default true・2026-06-08）**。
- **配線**: `CalendarTab` で `useInnerWeather()` → `normalizeInnerWeatherEnergy` → `opts.baseEnergyLevel`（flag ON 時のみ・null は budget 不変）→ `buildRehearsalInputFull`/`buildRehearsalInputFromDisplay`。

## 3. ★監査 — energy は過悲観の原因ではない（実エンジン再現で実測）
CEO が /plan smoke のスクショ（6/8 packed な実在の日）を送付。energy は UI に出さない設計（leak 禁止）ゆえ画面で直接見えない → **実エンジンで energy 寄与を切り分け**た。

### 再現結果（同一 input を energy=null(OFF)/1.0/0.5/0.0(最悪) で比較）
| 日 | energy | outlook | convergence | strain |
|---|---|---|---|---|
| 6/8 packed | null/1.0/0.5/0.0 **全て同一** | breaks | 3 | 全 high（peak score 7.34） |
| moderate | null/1.0/0.5 | tight | 0 | low,moderate,high（peak 2.50） |
| moderate | 0.0（最悪） | **tight（不変）** | **0（不変）** | low,**high**,high |

### 読み取り
- ★**6/8 の「重さ」は energy を OFF にしても完全に同一** = energy 由来ではない。この日は strain が high 閾値（highMin×budget = 0.67×3 = **2.01**）の **3.6 倍（7.34）に飽和**し、−25% budget では level が動かない。
- energy が効くのは strain が閾値近傍の中程度の日のみ。しかも **最悪値（InnerWeather=−1 → energy=0）** で初めて中間 step 1 つが moderate→high に動くだけで、**outlook も convergence marker も peakStrain も不変**（= UI 表示は変わらない）。
- 中立〜良好 energy（InnerWeather 0〜+1）は **OFF と完全同一**。
- 結論: energy は**有界（−25%）かつ非常に保守的**。過悲観ゲートは決定的に PASS（むしろ控えめすぎるほど安全側）。

## 4. 検証
- **62 tests PASS**（EN1-EN6 + FP1-FP6 + dayRehearsal 全体）。EN5 を `false` assert → **`true` assert に更新**（activation）。
- **tsc footprint 0**（my files）/ **total 55**（baseline 不変）。
- main worktree で **62 PASS 再確認**（zero-loss）。
- **zero-conflict**: main↔activation branch の差分は flag 3 行のみ（A1-6-7 等の混入なし・明示パス commit）。

## 5. ethos 適合
- energy 数値・診断感・断定を UI に**一切出さない**（内部 budget のみ）。outlook/marker は従来通り仮説トーン。
- read-only 診断（最適化・予定変更・apply・save なし）。null degrade で「未記録を低 energy 扱いしない」（捏造しない）。

## 6. ★Batch 3 へ引き継ぐ baseline 所見（energy 非依存・full-path 自体の課題）
スクショが露呈した「重さ」は energy でなく **full-path baseline の marker/copy/calibration 課題**。calibration backlog に追記済。Batch 3 の主対象:
- **(A) strain 飽和**: 忙しい日は peak が high 閾値の 3.6 倍に達し全 step が high → 動的レンジ消失（情報量低下）。
- **(B) copy mismatch**: 「余白 145 分（sufficient）」でも strain_high+friction_high の 2 factor で marker が出て、見出し「**この前後は予定が重なりやすい**」が余白と矛盾して見える（why 行は正直）。
- **(C) marker 密度**: 3/3 transition が全部フラグ → 「警告だらけ」の認知負荷。本当に効く点が埋もれる。
- **(D) convergence magnitude**: marker は有無のみで強度を出していない（CEO 当初狙い「magnitude + recovery per-marker なぜ」）。

## 7. ブランチ
- code branch: `claude/dr-energy`（HEAD `b3b3c2b8` = activation・保持）。
- main 着地: Batch2 OFF `d5e88970` → activation `deef2b45`。

## 8. 状態
- **Batch 2 完了**（実装 + 監査 + main activation + closeout）。
- 次: **Batch 3 marker 精緻化 / convergence 較正**（計画を deep research で起案 → CEO 提示 → GO 後に実装）。
- HOLD（production 不可）: Reality/介入層 track。push/Vercel/GitHub 禁止遵守。
