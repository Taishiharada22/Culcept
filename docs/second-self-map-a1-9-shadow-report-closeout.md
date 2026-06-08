# A1-9 — Dogfood Shadow Report Panel closeout + dev smoke 観点

> 2026-06-08 / Build Unit / branch `feat/a1-9-shadow-report`。★main 着地は **CEO smoke PASS 後**。flag default OFF。

---

## 実装した（branch・未 main 着地）
- **dogfood/dev 限定 shadow report パネル** `components/plan/PaceShadowReportPanel.tsx`:
  - A1-8 `runPaceShadowActivation` の report（readiness + shadow OFF/ON 差分 + 懸念）を読める形で描画。
  - ★**raw 数値を出さない**（pace ratio / friction score / GPS 座標は非表示）。status / level / 件数 / 懸念 badge のみ。
  - ★**sparse（not_enough）は shadow 比較を出さない**（「観測不足」のみ）。
  - ★**「確認のみ（実反映なし）」を明示**。過悲観 / marker爆発 / 診断悪化 / 過剰変化 を 4 badge で明確化 + verdict（懸念あり/なし）。
- **CalendarTab 配線**: A1-8 effect を `setShadowReport(report)` に変更（console→state）+ `isPaceShadowActivationEnabled() && shadowReport` のときだけ DayOutlookBanner 下にパネル描画。

## ★安全境界（CEO 方針・stop gate 自己点検 全クリア）
- **flag OFF で差分なし**: パネルは `isPaceShadowActivationEnabled()`（flag DAY_REHEARSAL_PACE_SHADOW_ENABLED ∧ **非 production**）のときだけ。OFF→effect が setShadowReport(null)→パネル非描画＝既存挙動完全不変。
- **dogfood を超えて一般ユーザーに出ない**: 同 flag + production hard block。一般ユーザーは永久に非表示。
- **raw 数値 / GPS 座標を UI に出さない**: パネルは medianRatio/friction/座標を一切描画しない（render test で担保）。
- **sparse を ready 扱いしない**: not_enough は比較非表示。
- **診断が過悲観にならない**: 実 reflection は OFF（`DAY_REHEARSAL_PERSONAL_PACE_ENABLED` OFF 維持）・パネルは観測のみ。
- **broad activation なし**: 実 activation せず（観測のみ）。

## テスト / tsc / lint
- 新規 **5 render tests PASS**（ran=readiness/懸念/viability/verdict 表示・raw 数値[medianRatio/friction/ratio]非表示・実反映なし明示・懸念なし verdict・not_enough は観測不足のみで比較非表示）。
- mobility 全体 **393 PASS**。tsc footprint **0**（baseline 55）。eslint clean。

## 非実装（停止ゲート）
- **main 着地**（CEO smoke PASS 後）。**flag activation**（全 flag OFF 維持）。
- **A1-10**（per-group activation gating / dogfood activation smoke）＝mini-design のみ。

## ★dev smoke 観点（CEO 確認用・PASS 後 main 着地）
事前: 一時的に `DAY_REHEARSAL_PACE_SHADOW_ENABLED=true`（dev のみ）。
1. /plan カレンダー（選択日に rehearsal が出る日）で **DayOutlookBanner の下に「pace shadow report」debug パネル**が出る（破線枠・dogfood）。
2. movement event が少ない（sparse）→ **「観測不足（readiness: not_enough）」のみ**・shadow 比較は出ない。
3. movement event を ready まで seed（手動ログ等で同一 od×mode を ≥3）→ **readiness / viability before→after(level) / 4 懸念 badge / verdict** が出る。
4. ★**raw な pace 比率や friction 値は出ない**（badge / level / 件数のみ）。
5. **flag false に戻すと パネルは消える・カレンダー既存挙動不変**。
6. （console には出さない＝UI パネルが出力先）。

## 次フェーズ（design only・別 doc）
`…-a1-10-mini-design.md`（per-group activation gating / dogfood activation smoke / rollback・kill switch / calibration 凍結）。**実装しない・activation しない**。
