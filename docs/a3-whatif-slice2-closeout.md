# A3 What-if slice 2（inverse what-if）closeout + slice 3 設計更新

> 2026-06-09 / Build Unit。slice 2 着地（`898ccb45`）。UI 表示 / Day Rehearsal 実反映は**まだ停止**。

## 1. slice 2 結果（inverse what-if・着地）
- `inverseWhatIf.ts`: 「この保護を守らないと何が悪化しそうか」を `rehearseDay` の counterfactual 再シミュレーションで読む。
- ★CEO 補正を全て反映:
  - **typed scenario**（without_protect_buffer / without_recovery_window / without_leave_earlier / without_lightening）。`input.steps.map` で **immutable に新 input**・実 store/予定/UI/入力を一切 mutate しない（test で確認）。
  - **coherence gate（強化）**: ★**独立した day-level 信号**（outlook 悪化 / peakStrain level 悪化 / convergencePoints 件数増 / recoveryWindows 件数減）が **≥2 整合**した時のみ `protect_matters`。同一因果の二重計上を避けた（設計中に recovery 削除が局所 conv と recovery を二重計上する問題を発見し day-level 件数比較へ修正）。
  - **出力＝守る意味の説明**（hedge・「この余白を外すと…中程度…慌ただしくなりそうです」）。★数字/%/「悪化/失敗/壊れる/危険/X分」を出さない（test で保証）。
- ★**honesty 機構（数値捏造なし）**: buffer "sufficient"→"insufficient"（anyInsufficient=boolean で outlook を動かす）/ recovery slack→null（rehearseDay が累積 strain から recovery を引かなくなる）。**category/level ロジックが悪化を計算**。leave_earlier/lightening は base から honest に表現できず→沈黙。
- status: `protect_matters` / `resilient`（弱い差は沈黙）/ `insufficient`（対象不適は沈黙）。flag `DAY_REHEARSAL_INVERSE_ENABLED=false`。
- 10 tests PASS・tsc footprint 0・dayRehearsal 206 PASS・node_modules 0。**未配線**（UI/Day Rehearsal 反映なし）。

### ★設計中の重要な learning（honesty）
- 「保護を外す」を**数値捏造なしの category 変更**で表現でき、rehearseDay の boolean/level が悪化を計算する＝偽の悪化を作らずに済む。
- coherence は **独立 day-level 指標**で数える（同一因果の二重計上回避）。小さい recovery 削除は 1 信号→resilient（沈黙）と正しく出る＝**悪化を作りに行かない**が機能。

## 2. slice 3（candidate comparison・守り/楽/攻め）実装可否
- ★**SAFE に pure 実装可**（slice 2 と同じ機構が再利用できる）。
  - stance input modifier: defensive=recovery/buffer を守る / balanced=現状 / aggressive=recovery を消費（★**event duration は sacred・add/remove/reschedule しない**・buffer/recovery/travel の category/null のみ変更＝数値捏造なし）。
  - `rehearseDay` × 3 stance → **定性比較**（level/件数のみ・delta 数字禁止）。
  - ★**contrast gate**: 3 stance の outlook/peakStrain/convergence/recovery が**全て同一なら emit しない**（`identical`・無情報ノイズ回避）。data 薄では全 stance 同一になりがち→沈黙が正常。
  - 出力: 定性比較（「守りの方がこの前後の重なりは少なめ」）・evidence trace・status（compared / identical / insufficient）。flag `DAY_REHEARSAL_SCENARIO_COMPARISON_ENABLED=false`。
- ★リスク: stance modifier が event を触らない厳守（sacred）/ aggressive が「悪化を作りに行く」道具にならないよう、aggressive も**観測 category の範囲内**（recovery 消費=既存 gap を埋める仮想）に限定。contrast gate で無差は沈黙。
- → **slice 2 の機構が proven ゆえ slice 3 も同じ pure/数字なし/UI なし/反映なしの範囲で安全に実装可能**。

## 3. ★停止事項（CEO 制約）
- UI 表示 / Day Rehearsal 実反映は **まだ停止**（次判断まで）。slice 2/3 とも未配線・flag OFF。
- 実反映・候補本配線・production・DB・external・Life Ops は触らない。

## 次
slice 3（candidate comparison）を pure/数字なし/UIなし/反映なしで実装（CEO 認可範囲）or CEO 判断。
