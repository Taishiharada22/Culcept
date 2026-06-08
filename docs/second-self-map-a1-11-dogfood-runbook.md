# A1-11 — Dogfood Activation Runbook / Readiness closeout

> 2026-06-08 / Build Unit / pure helper + dev report + runbook ゆえ **main 直接着地**（CEO「収まるなら止まらず着地」）。flag 全 OFF。

---

## 実装した
- **dogfood activation 前チェック集約（pure）** `lib/plan/mobility/personalPaceDogfoodReadiness.ts`:
  - `buildPersonalPaceDogfoodReadiness({readiness, shadowReport, optInState, captureQuality})` → 4 check を集約 → `ready_for_dogfood` / `not_ready` + blockers + runbook（watch/rollback）。
  - `summarizeCaptureQuality(store)` → 件数サマリ（totalEvents/taggedEvents/nonLowConfidence/bySource・★raw pace 値なし）。
- **dev report 表示** `PaceShadowReportPanel` に dogfood checklist（4 check ✓/✗ + detail + verdict + 未充足理由）。CalendarTab が shadow effect 内で算出し dev のみ描画。

## ★dogfood activation の判定（ONにしてよい条件＝4 check 全 pass）
| check | pass 条件 |
|---|---|
| opt_in | pace capture opt-in が granted |
| activation_ready_groups | ready_for_activation(n≥8) の od×mode が **1 つ以上** |
| shadow_confirmed_safe | shadow が走り **anyConcern=false**（過悲観/marker爆発/診断悪化/過剰変化 なし） |
| capture_quality | tag 付き記録 ≥8 件 かつ 非低信頼 >0 |

→ ★いずれか fail なら **ONにしない**（not_ready + blockers 表示）。sparse・懸念ありは構造的に弾く。

## ★観測項目（dogfood 中・DOGFOOD_WATCH_ITEMS）
過悲観（holds→breaks 誤反転）/ 誤検出 prompt の多発 / 電池の悪化 / 自分の感覚とのペースの違和感。

## ★撤退条件（DOGFOOD_ROLLBACK_CONDITIONS・撤退は flag OFF・calibration いじらない）
過悲観が複数日続く→flag OFF / 誤検出頻発→flag OFF / 電池悪化→flag OFF / shadow 懸念継続→flag OFF（原因観測してから再設計・calibration は変えない）。

## ★rollback / kill switch
- `DAY_REHEARSAL_PERSONAL_PACE_ENABLED` OFF → 実反映即停止（diff 0）。`DAY_REHEARSAL_PACE_SHADOW_ENABLED` OFF → report 停止。
- production は `isPersonalPaceReflectionEnabled` の非 production 条件で常時 OFF（hard block）。per-group ゆえ未成熟 group は自然に外れる。手動ログ/capture は flag 非依存で生存。

## ★安全境界（CEO 方針・stop gate 自己点検 全クリア）
- flag ON を main に入れない（**全 flag OFF**）/ production canary に進まない / sparse を activation 可にしない（readiness gate）/ rollback 条件を明文化 / dogfood と broad の境界明確（broad は production block 解除＝別設計）/ raw 数値・GPS 座標を UI に出さない（件数・status のみ）/ 実診断の ON は不要（本 helper は判定のみ）。
- **flag OFF で完全不変**: dev panel は isPaceShadowActivationEnabled() のときだけ・checklist も同条件。**calibration 値不変（凍結維持）**。

## テスト / tsc / lint
- 新規 **17 tests PASS**（4 check pass→ready/各 fail→not_ready+blocker・raw 値非表示・summarizeCaptureQuality 集約・panel checklist render/後方互換）。
- mobility 全体（後述で確認）。自変更 tsc footprint **0**（baseline 55）。eslint clean。

## 非実装（停止ゲート / 次）
- **実 dogfood activation（flag ON）**＝CEO 判断（stop gate「flag ON を main に入れそう」）。canary/broad に進まない。
- **A1-12**（calibration readiness assessment・pure・★値は凍結のまま「いつ較正可能か」を判定）＝mini-design 提出 → 安全なら実装。

## 次フェーズ（design・別 doc）
`…-a1-12-mini-design.md`。
