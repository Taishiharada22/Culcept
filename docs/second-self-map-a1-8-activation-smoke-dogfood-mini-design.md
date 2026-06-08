# A1-8 — Activation Smoke / Dogfood（次フェーズ mini-design・★design only）

> 2026-06-08 / Build Unit / A1-7 の後続。**設計のみ・activation はしない**（CEO 指示）。
> 前提（実装済）: A1-2 detector / A1-3 store / A1-4 ratio / A1-5 adapter(flag OFF) / A1-6a 手動ログ / A1-6b GPS 自動捕捉(flag OFF) / A1-7 pace-capture opt-in + readiness(pure) + shadow(pure)。

---

## 0. ★前提を疑う
- 「activation = flag を ON にする」だけではない。安全な activation = **(1) data が貯まった(readiness) (2) 反映が害でない(shadow) (3) 人間が目視(dev-report) (4) 段階展開 + kill switch**。
- まだ「即 ON」しない。A1-8 は **観測可視化 → dogfood → canary → broad** の段取りを設計する（実装は別 GO）。

## 1. A1-8 で実装する範囲（別 GO・本書は設計のみ）
### 1-1. readiness / shadow の dev-report 可視化（render-only・三重ガード）
- reality A1-7-2/7-4 dev-report と同パターン（dev/staging 限定・fixtures or local・no-persist）。
- 表示: `buildPaceActivationReadiness` の group 一覧（odKey/mode/status/n/tendency・**raw ratio 非表示**）+ overall。`validatePaceShadow` の before/after（viability/peakStrain level/convergence count/anyConcern・**生数値は dev のみ**）。
- 目的: 有効化前に CEO/dev が「ready か・過悲観/explosion がないか」を目視。

### 1-2. dogfood activation smoke（本人のみ・flag ON）
- 手順: 本人環境で `DAY_REHEARSAL_GPS_CAPTURE_ENABLED=true` + opt-in banner で granted + permission granted → 数日 capture（手動ログ併用で seed）→ readiness が ready_for_shadow/activation に育つ → shadow で anyConcern=false 確認 → `DAY_REHEARSAL_PERSONAL_PACE_ENABLED=true`（rehearsal 反映）を本人のみ ON。
- 観測: 誤検出率 / 電池 / rehearsal が過悲観でないか / 「自分のペースを分かってる」納得感。
- kill switch: どちらの flag も OFF で即 degrade（手動ログは flag 非依存で生存）。

### 1-3. canary → broad（各段 CEO 判断・kill switch 維持）
- canary: 少数で同上観測 → 悪化なら flag OFF で即撤退。
- broad: 問題なければ既定 ON 化（CEO 判断）。

## 2. activation の前提条件（gate・全て満たすまで ON しない）
1. capture readiness: 対象 od×mode が ready_for_activation（A1-7 §Part2）。
2. shadow safety: validatePaceShadow が anyConcern=false（過悲観/explosion/過変化なし）。
3. dev-report で CEO 目視 PASS。
4. dogfood で実機 smoke PASS（誤検出/電池/納得感）。
- いずれか不成立 → activation しない（readiness 不足は shadow 止まり・concern ありは calibration へ）。

## 3. calibration（readiness 不足/concern 時・別 GO・凍結中）
- 固定値（A1-4: 1.15/0.70/minEst5/minObs3/est5/outlier・A1-5: damping0.6/0.35/clamp0.85-1.25・A1-7: minForActivation8）は **実データが閾値分布を語るまで凍結**（overfit 回避）。
- shadow で過悲観が頻発 → clamp/damping を保守側に。explosion → marker 抑制でなく原因(over-change)を damping で緩和。

## 4. metrics / rollback
- 成功: rehearsal の tight/breaks が実遅延と整合（held-out）/ 納得感（質的）。
- 失敗（撤退）: 過悲観多発 / 誤検出 prompt 多発 / 電池悪化 → flag OFF。
- rollback: 2 flag OFF で即 dormant（diff 0・手動ログ生存）。pace-capture opt-in も declined で停止。

## 5. 今回やらないこと（design only・遵守）
A1-8 の**実装**（dev-report 可視化 / dogfood activation / canary）に進まない。**flag activation しない**（DAY_REHEARSAL_GPS_CAPTURE_ENABLED / DAY_REHEARSAL_PERSONAL_PACE_ENABLED は OFF 維持）。DB/migration/persistence なし。production/Vercel/GitHub/push/PR なし。Google/external API なし。calibration（固定値変更）しない。
