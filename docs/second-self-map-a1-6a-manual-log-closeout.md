# A1-6a 手動ログ UI + resolver — closeout + dev smoke 観点

> 2026-06-08 / Build Unit / branch `feat/a1-6a-manual-log`（commit `b489db00`）。★main 着地は **CEO smoke PASS 後**。

---

## 実装した（branch・未 main 着地）
1. **schema additive 拡張**（`movementEventStore.ts`）: MovementEvent += `mode? / odKey? / estimateMin?`（後方互換・旧 event 不変・不正 additive は drop）。`buildMovementEventManual`（source=manual・confidence=high・dep/arr=null）。`removeMovementEvent`(pure)/`deleteMovementEvent`(client・可逆)。
2. **手動ログ UI**（`MobilityLegCard.tsx`）: footer「実績」を inline 化。`!readOnly && onLogActual` の時だけ「実際の所要を記録」→ inline 入力「実際に [N] 分くらいかかった」＋記録。記録済は「実績：N分」＋取消。**modal でない・任意・可逆**。
3. **MapTab handler**（`MapTab.tsx`）: legKey(anchorId ペア)+odKey(正規化 location)+selectedMode+estimateMin(目安) で MovementEvent を記録。**sensitive は onLogActual を渡さない**（affordance 非表示＝二重防御）。loggedActualMin を store から表示。
4. **resolver**（`personalPaceResolver.ts`・pure）: store→PaceObservation→ratios→lookup。
5. **CalendarTab 配線**: flag ON 時に ratios を odKey×mode で引き adapter へ（`() => null` を置換）。**flag default OFF のまま**。

## ★安全・誠実
- raw GPS 不使用（手動入力値のみ・derived event）。sensitive 除外（UI + gate 二重）。観測少→A1-4 が not_enough/unknown→adapter fallback（不変）。
- **flag OFF は完全不変**（`if (!FLAG) return rehearseDay(rehearsalInput)`）。mode/leg/od 混線なし（odKey×mode group）。
- 人格化しない（per-(od)×mode 傾向）。raw 数値を rehearsal UI に出さない（travelMin 内部反映のみ）。

## テスト / tsc / lint
- **527 tests PASS**（新 17: schema 後方互換・manual builder・delete・removeMovementEvent・resolver sparse/ready/mode 不一致）。
- tsc footprint **0**（baseline 55）。eslint **clean**（loggedActualMin の tick は明示参照で警告解消）。

## ★join（capture↔rehearsal・honest）
- legKey = `${fromAnchorId}__${toAnchorId}`（MapTab capture と CalendarTab rehearsal で同源＝EventNode.anchorId）。
- odKey = `${正規化from}__${正規化to}`（cross-day 蓄積単位・mobilityObservationStore と同 normalize）。
- mode = selectedModeStore（同 legKey）。dayKey = "YYYY-MM-DD"（両 tab 同形式・resolver は全 day 集約）。

## ★dev smoke 観点（CEO 確認用・PASS 後に main 着地）
事前: `DAY_REHEARSAL_PERSONAL_PACE_ENABLED` は OFF のまま smoke。
1. /plan → 地図 → **編集可（過去でない）leg を tap** → カード footer に「**実際の所要を記録**」が出る。
2. tap → inline「実際に [__] 分くらいかかった ［記録］」。数値入力 → 記録 → footer「**実績：N分** 取消」。
3. **取消** → 「実際の所要を記録」に戻る。leg を開き直して **実績が永続**（localStorage）。
4. **過去（readOnly）leg** → affordance 非表示（静的「実績：未記録」）。
5. **sensitive leg** → affordance 非表示。
6. **カレンダー（rehearsal）/ 既存 map 挙動が不変**（flag OFF）。console error なし。
7. （activation smoke・別途）flag ON + 同一 OD を 3 回以上記録 → rehearsal の travel が **soft に**変化（過剰でない・clamp 内）。← これは A1-6a 着地後の **別 CEO 判断**。

## 非実装（停止ゲート）
- **A1-6b GPS 自動捕捉**（`…-a1-6b-gps-auto-capture-mini-design.md` 参照）。実機 smoke/仕様判断ゆえ実装しない。
- flag activation（ON 既定化）は smoke 後の CEO 判断。
