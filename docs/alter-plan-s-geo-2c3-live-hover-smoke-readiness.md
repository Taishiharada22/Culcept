# SR S-geo-2C-3 — live hover smoke readiness（実画像 → 照合枠 目視検証・設計のみ）

> 状態: **readiness（smoke 実行なし）**。本 doc は手順と検証点を固定するのみ。
> **実行は CEO in the loop の別 GO**（実画像 + live VLM を使うため）。
> 保存・DB write・`PLAN_SHIFT_IMPORT_SAVE=true`・production・push は禁止。
> 前提 chain: S-geo-1（`buildShiftGridGeometry`）/ S-geo-2B（2点 X capture UI）/ S-geo-2C-1（selector geometry）/ S-geo-2C-2（ShiftDraftInApp wire・`a31d218c`）。

---

## 0. 目的（work backward from goal）
確認画面でカレンダーの日を hover/tap した時、**元画像の正しい日のセルに緑枠が乗る**かを CEO が実画像で目視確認する。
これは決定論的 geometry（VLM bbox 不使用）が実画像で機能することの最終検証。**読み取りまで**で、保存はしない。

## 1. 完成した配線（この smoke で初めて end-to-end が通る）
```
AssistedRowSelector（S-geo-2B）: header 上で day1中心 / 月末日中心を 2 点 tap → selection.dayColumns
  → reducer が cells_loaded まで selection を引き継ぐ（S-geo-2C-1 検証済）
  → selectImportModalProps が buildShiftGridGeometry で geometry 算出（S-geo-2C-1）
  → ShiftDraftInApp が geometry={modalProps.geometry} を ShiftImportModal へ（S-geo-2C-2・a31d218c）
  → ShiftImportModal → ShiftReviewGrid → SourceImageHighlight（既存 pass-through）
  → cellCropRegion(geometry, sourceColumnForDay(day, blankDays)) で枠描画
     ※ blankDays は ShiftReviewGrid が cells から自己算出（packing 補正の正本）
```

## 2. 必要 flag（inline 起動・`.env.local` は編集しない）
| flag | 値 | 役割 |
|------|----|----|
| `NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED` | `true` | 在app 入口（ShiftImportEntryInner → ShiftDraftInApp）表示。client-direct |
| `PLAN_SHIFT_DRAFT_LIVE_ENABLED` | `true` | live VLM 読み取り（server-only） |
| `PLAN_SHIFT_VLM_INPUT_MODE` | `combined` | combined 入力経路（B1b 運用前提） |
| `PLAN_SHIFT_IMPORT_SAVE` | **未設定（=false）** | **保存導線を出さない・DB 非接触**。絶対 true にしない |

起動例（実行は別 GO 時）:
```
NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED=true \
PLAN_SHIFT_DRAFT_LIVE_ENABLED=true \
PLAN_SHIFT_VLM_INPUT_MODE=combined \
npm run dev
```
- env rollback = **server 停止**（inline flag は消える・`.env.local` の `PLAN_SHIFT_IMPORT_SAVE=false` は dormant のまま）。

## 3. 手順（CEO 操作・別 GO 実行時）
1. 上記 flag で dev server 起動（Claude が起動完了を待って URL を提示）。
2. Plan → シフト取り込み入口 → 実画像（原田 SPRIX 等の月表）をアップロード。
3. AssistedRowSelector で **本人行帯（personRowBand）** を指定。
4. editTarget「日列の中心」で **1 日の列中心 → 月末日の列中心** を header 上で 2 点 tap（auto-sort）。CTA active を確認。
5. 「このヘッダとこの行を読み取る」→ live VLM 読み取り → 確認画面（ShiftImportModal）。
6. 確認画面で **カレンダーの日を hover/tap** → 元画像上の該当セルに緑枠が出るか目視。

## 4. 検証点（CEO 目視）
1. **枠位置が日付に対応**: hover した日の data セルに枠が乗る（ヘッダの日番号位置ではなく、データ行の該当セル）。
2. **packing 補正（blankDays）が効く**: **空欄日の直後の日**を hover し、枠が +1 列ずれない（空欄を飛ばして詰めた正しい列に乗る）。← 本 smoke の核心。
3. **header 整列 ⇄ data packing の整合**: 2 点 capture は header（calendar 整列）で取るが、枠は data の packed 列に置く。両者の x グリッドが一致して見えるか（決定論 geometry の load-bearing 仮定の実証）。
4. **fail-soft**: day列中心 X を指定せず読み取った場合（= dayColumns なし）→ 枠は出ないが「原稿を表示して照合」全体トグルは残り、確認画面は壊れない。
5. **複数日 / 月末**: 月初・中盤・月末の数日でずれが累積しないか。

## 5. 保存・DB 非接触の保証
- `PLAN_SHIFT_IMPORT_SAVE` 未設定 → 確認画面の保存 CTA は dormant placeholder（「反映（次段で有効化）」）。「この内容で保存」は出ない。
- import action（DB write）は呼ばれない。raw 画像 / base64 / VLM raw response は commit しない。
- smoke は **読み取り + 目視のみ**。結果は docs に**文章で**記録（画像添付・raw 添付なし）。

## 6. 想定される結果と分岐
- **PASS**: 枠が正しい日に乗り、packing 補正も効く → S-geo 帯クローズ判定へ（CEO）。
- **ズレ観測（枠が +N 列）**: 原因切り分け（①2点 capture 位置 ②blankDays 検出 ③data/header グリッド不一致）。修正は別 step（本 smoke では修正しない・観測のみ）。
- **枠出ない**: dayColumns 未捕捉 or geometry invalid（fail-soft）。capture やり直し or buildShiftGridGeometry の issues を確認。

## 7. scope / 禁止
- 🟢 本 readiness = docs-only。
- 🔴 **smoke 実行は別 GO**（CEO in the loop）。以下は禁止: smoke 即実行 / 保存 / DB write / `PLAN_SHIFT_IMPORT_SAVE=true` / production / push・PR・deploy / ShiftReviewGrid・SourceImageHighlight 変更 / blankDays 変更 / raw画像・base64・VLM raw response commit / `.env.local` 編集。

## 8. CEO 判断点
1. 本 readiness 受理 or 補正。
2. 受理なら **S-geo-2C-3 smoke 実行 GO**（CEO in the loop・実画像準備・Claude が flag inline で起動 → URL 提示 → CEO 操作 → 目視結果を口頭/テキストで Claude へ → docs 記録）。
3. smoke 結果（PASS / ズレ / 枠出ない）に応じて S-geo 帯クローズ or 追加 step 判断。
