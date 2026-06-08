# A1-10 — Per-group Activation Gating closeout

> 2026-06-08 / Build Unit / flag OFF / dogfood 限定 / per-group gated ゆえ **main 直接着地**（CEO「収まるなら止まらず着地」）。

---

## 実装した
- **per-group activation gating** `personalPaceResolver.ts` `buildRehearsalPaceResolver` += `activationReadyOnly?: boolean` + `minForActivation?: number`:
  - ★`activationReadyOnly=true` のとき **ready_for_activation(n≥minForActivation=8)** の od×mode **だけ** pace を返す。ready_for_shadow(A1-4 ready の 3-7) は null（反映しない）。
  - ＝**観測閾値(ready_for_shadow=3) と 実反映閾値(ready_for_activation=8) を分離**。
- **実反映 gate（production hard block）** `personalPaceAdapter.ts` `isPersonalPaceReflectionEnabled()` = `DAY_REHEARSAL_PERSONAL_PACE_ENABLED ∧ 非 production`（default OFF・dogfood/dev のみ・production ON 禁止）。
- **CalendarTab 配線**:
  - reflection memo: `if (!isPersonalPaceReflectionEnabled()) return rehearseDay(rehearsalInput)`（OFF/production: 完全不変）+ resolver `activationReadyOnly: true`。
  - shadow effect(A1-8): resolver `activationReadyOnly: true`＝**shadow も実 activation(ready_for_activation のみ)を正確に preview**（OFF/ON 比較が活性化実体と一致）。

## ★安全境界（CEO 方針・stop gate 自己点検 全クリア）
- **sparse を activation 対象にしない**: activationReadyOnly は n≥8 のみ・not_enough は ready に到達しない。
- **ready_for_shadow と ready_for_activation を混同しない**: 閾値分離（shadow=3・activation=8）。
- **診断が過悲観にならない**: 実 reflection は `isPersonalPaceReflectionEnabled()` default false で動かない（flag OFF）。
- **flag OFF で差分なし**: reflection memo は OFF で早期 return（不変）・shadow effect は OFF で no-op。両 flag OFF＝完全不変。
- **raw 数値 / GPS 座標を UI に出さない**: A1-10 は resolver logic + gate のみ（UI 不変・A1-9 panel も raw なし）。
- **broad activation なし**: production hard block + per-group + flag OFF。dogfood/dev 限定。

## rollback / kill switch
- `DAY_REHEARSAL_PERSONAL_PACE_ENABLED` OFF → 実反映即停止（diff 0）。`DAY_REHEARSAL_PACE_SHADOW_ENABLED` OFF → report 停止。
- production は `isPersonalPaceReflectionEnabled` の非 production 条件で常に OFF（hard block）。
- per-group ゆえ未成熟 group は自然に外れる。手動ログ/capture は flag 非依存で生存。

## テスト / tsc / lint
- 新規 **6 tests PASS**（isPersonalPaceReflectionEnabled default false・activationReadyOnly なし=ready 反映・あり=ready_for_activation のみ・閾値 8・minForActivation 下げで分離確認）。
- mobility + dayRehearsal **589 PASS**。tsc footprint **0**（baseline 55）。eslint clean。

## ★calibration いじらない
固定値（A1-4 1.15/0.70/minEst5/minObs3/est5/outlier・A1-5 damping0.6/0.35/clamp0.85-1.25・A1-7/A1-10 minForActivation8）は **変更していない**（凍結維持・overfit 回避）。

## 非実装（停止ゲート / 次）
- **flag activation**（全 flag OFF 維持・実 activation せず）。canary / broad に進まない。
- **A1-11**（dogfood activation runbook / metrics / canary readiness）＝mini-design のみ。

## 次フェーズ（design only・別 doc）
`…-a1-11-mini-design.md`。**実装しない・activation しない**。
