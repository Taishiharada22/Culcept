# A1-11 — Dogfood Activation Runbook / Metrics / Canary Readiness（次フェーズ mini-design・★design only）

> 2026-06-08 / Build Unit / A1-10 の後続。**設計のみ・実装に進まない / 実 activation しない**（CEO 指示）。
> 前提（実装済・全 flag OFF）: A1-7 opt-in+readiness+shadow / A1-8 shadow activation / A1-9 dogfood report panel / A1-10 per-group activation gating(activationReadyOnly + isPersonalPaceReflectionEnabled production block)。

---

## 0. ★前提を疑う
- A1-10 で「ready_for_activation の od×mode **だけ** flag ON 時に実反映」できる土台が揃った。次は「**本人 dogfood で実際に flag を ON にして安全に観測 → 撤退判断する手順（runbook）と指標**」。
- 「activation = 永続 ON」ではない。dogfood は **本人・dev・期間限定の試行**。canary/broad は更に別 GO。

## 1. A1-11 で設計する範囲（別 GO・本書は設計のみ）
### 1-1. dogfood activation runbook（本人・dev・手順書）
- 前提（全て満たすまで ON しない）: ①A1-9 report で対象日 anyConcern=false ②ready_for_activation の od×mode が存在 ③数日 shadow を観測し過悲観/explosion が出ない。
- 手順: 本人環境で `DAY_REHEARSAL_PERSONAL_PACE_ENABLED=true`（dev のみ・production は isPersonalPaceReflectionEnabled が block）→ 実 rehearsal が ready_for_activation group だけ soft 反映 → A1-9 report と実 viability を毎日確認 → 違和感あれば即 flag OFF。
- ★期間限定（例 1-2 週）・本人のみ・記録（観測ログ）。

### 1-2. metrics（成功/失敗の判定指標・観測のみ）
- 成功: rehearsal の tight/breaks 予測が実際の遅延体感と整合 / 「自分のペースを分かってる」納得感（質的）。
- 失敗（撤退）: 過悲観多発（holds→breaks 誤反転）/ 誤検出 prompt 多発 / 電池悪化 / 違和感。
- ★raw 数値を出さない原則維持（A1-9 report は level/badge/件数のみ）。metrics 集計も dev console / dogfood report 内（UI 非公開）。

### 1-3. canary readiness（dogfood の次・更に別 GO）
- dogfood で成功指標を満たす → canary（少数）への拡大を CEO 判断。canary は production block を外す必要があり別設計（本書では設計せず・dogfood の出口条件のみ定義）。
- canary 前提: dogfood で複数 od×mode が ready_for_activation + anyConcern=false の継続 + 撤退手順の確立。

### 1-4. rollback / kill switch（再掲・runbook 内）
- kill: 2 flag OFF で即 dormant（diff 0・手動ログ生存）。production は hard block で常時 OFF。
- per-group ゆえ問題 od×mode は readiness 低下 or pace-capture opt-in declined で自然に外れる。

## 2. ★activation 後も calibration 値はいじらない
固定値は dogfood activation 中も**変更しない**（calibration は十分データ + held-out 検証後の別 GO・overfit 回避）。dogfood で過悲観なら calibration でなく **flag OFF で撤退**し原因を観測してから設計。

## 3. 実装順（A1-11 GO 時・別判断）
1. dogfood activation runbook 文書化 + 観測ログ（dev console / report）。
2. 本人 dogfood（flag ON・期間限定）→ metrics 観測。
3. 成功なら canary readiness を CEO 判断（production block 解除は別設計）。
4. calibration は据置（凍結）。

## 4. stop gate（A1-11 実装時に必ず止まる）
- sparse/ready_for_shadow を activation 対象にする / 診断が過悲観 / raw 数値・GPS 座標を UI に出す / flag OFF で差分 / dogfood を超えて canary/broad/一般ユーザーに進む / calibration 値を触る / production の hard block を外す。

## 5. 今回やらないこと（design only・遵守）
A1-11 の**実装**（runbook 実行 / dogfood activation / metrics 集計）に進まない。**flag activation しない**（全 flag OFF 維持）。calibration 値を変更しない。canary/broad・production block 解除に進まない。DB/migration/production/Vercel/GitHub/push/PR/external API なし。
