# A1-9 — Dogfood Shadow Report UI / Pace Activation Smoke（次フェーズ mini-design・★design only）

> 2026-06-08 / Build Unit / A1-8 の後続。**設計のみ・実装に進まない / activation しない**（CEO 指示）。
> 前提（実装済）: A1-2〜A1-6 / A1-7 opt-in+readiness(pure)+shadow(pure) / A1-8 shadow activation(orchestration+dev console・flag OFF)。

---

## 0. ★前提を疑う
- A1-8 は shadow を console に出すだけ。次に必要なのは「人間が **読める形** で shadow を確認」→「ready_for_activation の所だけ **慎重に実反映**」→「rollback/calibration」。
- 「activation = 全部 ON」ではなく **per-group（ready_for_activation の od×mode だけ）反映**が安全（sparse/未成熟 group は据置）。

## 1. A1-9 候補（別 GO・本書は設計のみ）
### 1-1. dogfood shadow report 確認 UI（dev/staging 限定・render-only・三重ガード）
- reality A1-7-2/7-4 dev-report と同パターン（dev guard→notFound・fixtures or local・no-persist・no-route write）。
- 表示: A1-8 `runPaceShadowActivation` の report を可視化 — readiness group 一覧（od/mode/status/n/tendency・**raw ratio 非表示**）+ shadow（viability before/after・peakStrain level・convergence count・**concerns（過悲観/explosion/診断悪化/過変化）**）。
- 目的: console でなく画面で「ready か・懸念が出ていないか」を CEO/dev が目視（activation 前の最終確認）。

### 1-2. personal pace activation smoke（dogfood・段階）
- 前提条件（全て満たすまで ON しない）: ①readiness ready_for_activation の group がある ②shadow anyConcern=false ③1-1 dev-report で CEO 目視 PASS ④本人 dogfood で誤検出/電池/納得感 OK。
- 手順: 本人のみ `DAY_REHEARSAL_PERSONAL_PACE_ENABLED=true`（実 reflection）→ rehearsal が pace 反映で過悲観でないか実機確認 → canary → broad（各段 CEO 判断・kill switch=flag OFF）。

### 1-3. ★ready_for_activation の時だけ実診断へ反映する手順（per-group gating）
- 現状 A1-5 adapter は A1-4 「ready」(n≥3) で反映。activation 時は **より保守的に ready_for_activation(n≥8) の group だけ反映**するのが安全。
- 設計: resolver を readiness で二段化 — `resolvePace` が返す前に `buildPaceActivationReadiness` で当該 group が ready_for_activation か確認し、そうでなければ null（＝adapter fallback＝反映しない）。これで「十分観測した od×mode だけ実反映」。
- shadow（A1-8）は ready_for_shadow でも走る（観測用）が、**実反映は ready_for_activation のみ**＝観測と反映の閾値を分離（honest）。

### 1-4. rollback / calibration backlog
- rollback: 2 flag（shadow / reflection）OFF で即 dormant（diff 0・手動ログ生存）。pace-capture opt-in declined で capture 停止。per-group gating ゆえ問題 group だけ自然に外れる。
- calibration backlog（凍結中・別 GO）: 固定値（A1-4 1.15/0.70/minEst5/minObs3/est5/outlier・A1-5 damping0.6/0.35/clamp0.85-1.25・A1-7 minForActivation8）は **実データが閾値分布を語るまで凍結**（overfit 回避）。shadow で過悲観頻発→clamp/damping 保守化・explosion→damping で over-change 緩和（marker 抑制でなく原因対処）。

## 2. 実装順（A1-9 GO 時・別判断）
1. dev-report UI（1-1・dev 限定 render-only）→ CEO 目視。
2. per-group activation gating（1-3・pure resolver 二段化 + tests）。
3. dogfood activation smoke（1-2・本人 flag ON・実機）→ canary → broad（各段 CEO・kill switch）。
4. calibration は readiness 条件後（凍結解除は別 GO）。

## 3. 今回やらないこと（design only・遵守）
A1-9 の**実装**（dev-report UI / per-group gating / activation smoke）に進まない。**flag activation しない**。DB/migration/persistence なし。production/Vercel/GitHub/push/PR なし。Google/external API なし。calibration（固定値変更）しない。
