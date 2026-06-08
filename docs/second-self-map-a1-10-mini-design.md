# A1-10 — Per-group Dogfood Activation Smoke（次フェーズ mini-design・★design only）

> 2026-06-08 / Build Unit / A1-9 の後続。**設計のみ・実装に進まない / 実 activation しない**（CEO 指示）。
> 前提（実装済）: A1-7 opt-in+readiness+shadow / A1-8 shadow activation(orchestration) / A1-9 dogfood shadow report panel。全 flag OFF。

---

## 0. ★前提を疑う
- A1-9 で「shadow を読める」状態になった。次は「**ready_for_activation の od×mode だけ**、dogfood 本人に限り実診断へ反映してみる」smoke。
- 「activation = 全 group 一斉 ON」ではない。★**per-group gating**（成熟した od×mode だけ反映・未成熟は据置）が安全の核。

## 1. A1-10 で設計する範囲（別 GO・本書は設計のみ）
### 1-1. per-group activation gating（ready_for_activation のみ実反映）
- 現状 A1-5 adapter は A1-4 「ready」(n≥3) で反映。activation 時は **resolver を readiness で二段化**:
  `resolvePace` が返す前に当該 group が **ready_for_activation(n≥8)** か確認し、そうでなければ null（＝adapter fallback＝反映しない）。
- ＝**観測（ready_for_shadow）と実反映（ready_for_activation）の閾値を分離**。十分観測した od×mode だけ実診断に効く。
- 実装案: `buildRehearsalPaceResolver` に optional `requireActivationReady: boolean`（+ readiness）を渡し、true なら ready_for_activation group のみ非 null。pure・tests。

### 1-2. dogfood 限定 activation（本人のみ・実 reflection ON）
- 前提（全て満たすまで ON しない）: ①A1-9 dogfood report で anyConcern=false ②ready_for_activation の group がある ③本人が誤検出/電池/納得感を確認。
- 手順: 本人のみ `DAY_REHEARSAL_PERSONAL_PACE_ENABLED=true`（+ per-group gating ON）→ 実 rehearsal が ready group だけ soft 反映 → 過悲観でないか実機確認。
- ★dogfood 限定（自分の環境のみ）。canary / broad は **まだ別判断**。

### 1-3. rollback / kill switch
- kill: `DAY_REHEARSAL_PERSONAL_PACE_ENABLED` OFF で実反映即停止（diff 0）。`DAY_REHEARSAL_PACE_SHADOW_ENABLED` OFF で report も停止。
- per-group ゆえ問題 group は自然に外れる（readiness 低下 or pace-capture opt-in declined）。手動ログ/capture は flag 非依存で生存。
- rollback: 2 flag OFF で全 dormant・既存挙動完全不変。

### 1-4. OFF/ON 比較の確認手順
- A1-9 dogfood report で per-day の OFF/ON（viability/peakStrain level・概念 marker・4 懸念）を確認 → 数日 dogfood → 過悲観/explosion が出ないことを確認してから activation 判断。

### 1-5. ★activation 後も calibration 値はいじらない
- 固定値（A1-4 1.15/0.70/minEst5/minObs3/est5/outlier・A1-5 damping0.6/0.35/clamp0.85-1.25・A1-7 minForActivation8）は **dogfood activation 後も変更しない**（calibration は十分なデータ + held-out 検証後の別 GO・overfit 回避）。

## 2. 実装順（A1-10 GO 時・別判断）
1. per-group gating（1-1・pure resolver 二段化 + tests・flag OFF 不変）。
2. dogfood activation smoke（1-2・本人 flag ON・実機）→ A1-9 report で監視。
3. 問題なければ canary（別 CEO 判断）。broad は更に別。
4. calibration は据置（凍結）。

## 3. stop gate（A1-10 実装時に必ず止まる）
- sparse/ready_for_shadow を ready_for_activation 扱いする / 診断が過悲観 / raw 数値・GPS 座標を UI に出す / flag OFF で差分 / dogfood を超えて canary/broad/一般ユーザーに進みそう / calibration 値を触りそう。

## 4. 今回やらないこと（design only・遵守）
A1-10 の**実装**（per-group gating / dogfood activation / smoke）に進まない。**flag activation しない**（全 flag OFF 維持）。calibration 値を変更しない。canary/broad に進まない。DB/migration/production/Vercel/GitHub/push/PR/external API なし。
