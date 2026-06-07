# A1 actual pace capture 基盤 — closeout

> 2026-06-08 / Build Unit / commit `9692775f`（main 着地）。autonomous batch（A1-0 audit + A1-2 detector + A1-3 store）。

## 1. 実装した（main 着地済）
- **A1-0 GPS audit**（`docs/second-self-map-a1-0-gps-actual-pace-audit.md`）: GPT 7 項目を実コードで確認。★前回「GPS なし」誤監査を訂正。→ actual pace capture は**実現可能**。
- **A1-2 detector(pure)**（`lib/plan/mobility/movementEventDetector.ts`）: `detectMovement(samples, anchors, config)` = position sample 列 + anchor 座標(from/to) → 実出発/実到着/実所要 推定。geofence(150m) + dwell(3min) + accuracy gate(≤1000m)。出力 `DetectedMovement` は **derived only**（raw 座標を含まない）。疎/不足は null or confidence=low。`haversineMeters` も export。
- **A1-3 local store**（`lib/plan/mobility/movementEventStore.ts`）: `MovementEvent`(derived only) を per-day/per-leg 保存。`recordMovementEvent` は `isCaptureAllowed`（opt-in 許可 ∧ 非 sensitive）を満たす時だけ書く。parse は既知 field のみ採用（raw 座標混入を drop）。versioned key `aneurasync.plan.map.movementEvents.v1` + caps(60日/100leg) + fail-open。`buildMovementEventFromDetection`(ms→ISO)。

## 2. 実装していない（停止ゲート / 次バッチ）
- ⛔ **A1-6 実 GPS sampling 配線**（MapTab で getCurrentPosition を観測として sample 化 → detector → store）。live GPS + UI ＝ smoke/CEO 判断。
- ⛔ **到着確認 / 手動訂正 UI**（「到着したようです・記録しますか？/違う」）。UI gate。
- ⏭ **A1-4 personal pace ratio**（actualDurationMin vs estimate・readiness gate）pure（次）。
- ⏭ **A1-5 Day Rehearsal 反映**（soft hint・estimate を hard 上書きしない）設計（次）。
- detector + store は現状 **caller 不在で inert**（data 0）。A1-6 配線で初めて蓄積開始（A0-1 と同性質）。

## 3. テスト / tsc footprint
- 新規 **34 tests PASS**（detector 16 + store 18 系）。`npx vitest run tests/unit/plan/mobility/movementEvent*.test.ts`。
- tsc: my-file エラー **0**（test cast を `as unknown as` に修正）。baseline **55 維持**（56→55）。

## 4. production / DB / env / GitHub 非接触
- production / Vercel / deploy: **無接触**。DB / migration / RLS: **無接触**。env: **無変更**。
- GitHub push / PR / merge: **無**（local main worktree への commit のみ）。
- 実 GPS / background GPS / Google・external API / notification / Reality: **無接触**。raw GPS 永続: **無**（型で担保）。

## 5. 次プラン
1. **A1-4 personal pace ratio**（pure・actualDurationMin vs route estimate・readiness gate・enum 出力・捏造なし）。
2. **A1-5 Day Rehearsal 反映設計**（soft hint）。
3. **A1-6 sampling + 確認/訂正 UI**（停止ゲート・CEO 判断後）。

## 6. 停止ゲート該当
- ✅ **該当**: 次の A1-6（実 GPS sampling + 確認 UI）は live GPS + 大きめ UI ＝ **smoke / CEO 判断が要る停止ゲート**。本バッチはここで停止し報告。A1-4/A1-5（pure/設計）は CEO 方針確認後に自律可。
