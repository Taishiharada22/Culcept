# A1-7 — Personal Pace Activation / Calibration Readiness（次フェーズ mini-design・★design only）

> 2026-06-08 / Build Unit / A1-6b safe 実装の後続。**設計のみ・実装に進まない**（CEO 指示）。
> 前提: A1-2 detector / A1-3 store / A1-4 ratio / A1-5 adapter(flag OFF) / A1-6a 手動ログ / A1-6b GPS 自動捕捉(flag OFF) は実装済。

---

## 0. ★前提を疑う（A1-7 の本質）
- 誤解1「activation = flag を ON にするだけ」→ 実際は **data 品質 + shadow 検証 + 段階展開**のゲート群。ON にして過悲観/誤反映が出れば信頼を失う。
- 誤解2「calibration = 固定値を実データで調整」→ **sparse data での早期較正は overfit**。較正は readiness（最低観測数/分布）を満たすまで凍結。
- よって A1-7 = 「いつ・どの条件で pace を現実に効かせ始めるか」の **readiness ゲート設計**。捏造せず・観測>推論・段階的・撤退可。

## 1. 現状の 2 つの OFF flag（activation 対象）
- `DAY_REHEARSAL_PERSONAL_PACE_ENABLED`（A1-5・rehearsal 反映）
- `DAY_REHEARSAL_GPS_CAPTURE_ENABLED`（A1-6b・GPS 自動捕捉）
- A1-6a 手動ログは flag なし（常時・任意）＝**capture は手動で先行起動済**。

## 2. A1-7 で設計する readiness ゲート（実装は別 GO）
### 2-1. capture readiness（観測が貯まったか）
- per (odKey×mode) の **valid 観測数**が A1-4 の minObservations(3)/established(5) に届く OD が一定数あるか。
- 指標（pure 集計・dev 限定）: ready な pace group 数 / 全 group 数 / median 観測数。
- ★これは dev-report で**観測のみ**（PRM/DB 不要・localStorage 集計）。

### 2-2. reflection safety readiness（反映が安全か）
- A1-5 adapter を flag ON にしたとき rehearsal が **過悲観に振れないか**（clamp[0.85,1.25] 内・viability が holds→breaks に過剰反転しない）。
- shadow 比較: 同一日を flag OFF/ON で rehearseDay し、viability/peakStrain/convergence の差分を**観測のみ**（予定変更なし・表示なし）。
- ★Batch 2 energy で確立した「過悲観回避」原則を継承（−25% 上限の思想）。

### 2-3. calibration readiness（較正してよいか）
- 固定値（A1-4: 1.15/0.70/minEst5/minObs3/est5/outlier0.25-4・A1-5: damping0.6/0.35/clamp0.85-1.25）は **実データが閾値分布を語れるまで凍結**（CEO 原則「固定値→実データ後較正」継承）。
- 較正可能条件: 十分な観測（例 OD×mode ごと ≥20）+ held-out で predicted(adjusted) vs actual の誤差が OFF より縮む実証。
- ★足りなければ **較正しない**（overfit 回避・sparse は not_enough のまま）。

## 3. shadow validation（activation 前の目視・dev 限定）
- reality A1-7-2/7-4 の dev-report パターン踏襲（三重ガード・fixtures or local・render-only・no-persist）。
- 表示候補（pure 集計）: ready pace group 一覧（odKey/mode/tendency/strength/n・**raw ratio は出さない**）/ OFF↔ON rehearsal 差分 / capture 件数（manual vs gps）/ confidence 分布。
- 目的: CEO/dev が「pace が妥当か・過悲観でないか・誤反映がないか」を**永続化/有効化前に**目視。

## 4. 段階的 activation（各段 kill switch・撤退可）
1. **dogfood**: 本人のみ flag ON（A1-6b sampling + A1-5 reflection）→ 実機で誤検出率/電池/反映の妥当性。
2. **canary**: 少数 → 同上を観測。悪化なら flag OFF で即撤退。
3. **broad**: 問題なければ既定 ON 化（CEO 判断）。
- 各段で kill switch（flag OFF）= 手動ログのみに即 degrade（A1-6a は flag 非依存ゆえ生存）。

## 5. 成功/失敗の指標（honest）
- 成功: rehearsal の tight/breaks 予測が実際の遅延と整合（held-out）/ user の「自分のペースを分かってる」納得感（質的）。
- 失敗（撤退）: 過悲観（holds→breaks 誤反転多発）/ 誤検出 prompt の多発 / 電池悪化 / 信頼低下。
- ★raw 数値を user に出さない原則は維持（tendency/level のみ）。

## 6. 実装に進む場合の stop gate（A1-7 GO 時・別判断）
1. pure readiness 集計層（capture/reflection/calibration readiness・dev-report 観測）→ 実装。
2. shadow validation dev-report（三重ガード・no-persist）→ 実装。
3. CEO が dev-report で妥当性 review → PASS。
4. dogfood activation（flag ON・本人）→ 実機 smoke → 観測。
5. canary → broad（各段 CEO 判断・kill switch 維持）。
6. 較正は readiness 条件を満たしてから（別 GO・overfit 回避）。

## 7. 今回やらないこと（design only・遵守）
A1-7 の**実装**（readiness 集計層 / shadow dev-report / activation）に進まない。flag activation しない。DB/migration/persistence なし。production/Vercel/GitHub/push/PR なし。Google/external API なし。calibration（固定値変更）しない。
