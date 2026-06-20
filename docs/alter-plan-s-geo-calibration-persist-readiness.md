# SR S-geo 校正値 恒久化 readiness（設計のみ・実装なし）

> 状態: **readiness / mini design（実装に入らない）**。CEO 方針（2026-06-05）。
> 目的: 校正済み `gridLeft` / `colWidth` を**画面ローカル state だけで終わらせず、同じ画像・同じ確認フロー内で再利用**できる形にする。
> 前提: S-geo 校正帯クローズ済（`56af9831`・decision-log `19f63e0c`）。
> **禁止**: production / DB write / 保存再実行 / `PLAN_SHIFT_IMPORT_SAVE=true` / VLM 再実行 / push・PR・deploy / raw画像・base64・VLM raw response commit / **校正値の即実装**。

---

## 0. 重要な設計判断（CEO 指定・最優先）
恒久化の対象は **raw画像ではなく座標値だけ**。
- **保存してよい**: `gridLeft` / `colWidth` / `source="manual_overlay"`（context として `dayCount` / `imageW` / `imageH` は既存場所から参照可・gridCalibration には最小限）。
- **保存してはいけない**: raw image / base64 / dataURI / Blob / ArrayBuffer / canvas bitmap / VLM raw response。
- 既存の S-geo-2B 不変条件（`AssistedRowSelection` は画像本体を型で構造的に含まない）を継承する。

## 1. 現在どこで calibration state を持っているか
`ShiftReviewGrid.tsx` の**ローカル `useState`**（L153-164）:
```
const [gridLeftAdj, setGridLeftAdj] = useState(0);
const [colWidthAdj, setColWidthAdj] = useState(0);
const calibratedGeometry = { ...geometry, gridLeft: geometry.gridLeft+gridLeftAdj, colWidth: geometry.colWidth+colWidthAdj }
```
= geometry（dayColumns 由来）への**差分（delta）**を ShiftReviewGrid が一時保持。geometry 正本は `selectImportModalProps`（`selection.dayColumns` → buildShiftGridGeometry）。

## 2. reload / remount / close で何が消えるか
- `gridLeftAdj` / `colWidthAdj`（ShiftReviewGrid local state）→ **remount / 確認画面 close→再open / リロードで全消失**。次に開くと未校正の dayColumns 由来 geometry に戻る。
- `selection`（dayColumns 含む）は reducer state + localStorage（`AssistedRowSelectionStored`）に永続なので残る。**校正だけが揮発**。

## 3. 何を永続化するか
**最終 calibrated geometry の絶対値**: `gridLeft` / `colWidth`（delta ではなく確定値）+ `source="manual_overlay"`。
- delta でなく絶対値にする理由: dayColumns 由来 geometry が将来変わっても校正値が一意・解釈が明確（混ざらない）。

## 4. 何を永続化しないか
raw image / base64 / dataURI / Blob / ArrayBuffer / canvas bitmap / VLM raw response / cropTop・cropHeight（= personRowBand 由来で別途持つ・X 校正の対象外）。

## 5. AssistedRowSelection に持たせるか、別型にするか — **Option A 推奨**
**A（推奨）: `AssistedRowSelection` に `gridCalibration` を追加**
```
AssistedRowSelection.gridCalibration?: {
  gridLeft: number;
  colWidth: number;
  source: "manual_overlay";
}
```
- 理由: 画像選択に紐づく構造化座標 / 既存 stored payload と相性良 / raw非保存方針維持 / dayColumns と同じく画像座標だけ。
- B（dayColumns を補正後中心点に上書き）: `firstDayCenterX=gridLeft+colWidth/2` / `lastDayCenterX=gridLeft+colWidth*(dayCount-0.5)` で表現は可能だが、**元 tap 値と校正後値が混ざり意味が曖昧** → 不採用。
- C（DB 保存）: **今回は不要・時期尚早**（review UX 固め優先）。

## 6. dayColumns と gridCalibration の関係（3 層モデル）
```
dayColumns        = 初期 geometry を作るための 2 点（ヘッダ tap・原データ）
gridCalibration   = overlay で全列合わせ込んだ最終 geometry（gridLeft, colWidth）
effectiveGeometry = gridCalibration があればそれを優先、なければ dayColumns 由来
```
責務分離: dayColumns は**入力**、gridCalibration は**確定校正**、effectiveGeometry は**消費時の解決結果**。

## 7. effectiveGeometry の優先順位
`selectImportModalProps`（`computeReviewGeometry`）を拡張:
```
if (selection.gridCalibration) {
  // 直接 geometry を組む（gridLeft/colWidth は校正値、cropTop/cropHeight は personRowBand 由来、imageW/H は selection）
  geometry = { imageWidth, imageHeight, gridLeft: cal.gridLeft, colWidth: cal.colWidth, cropTop, cropHeight }
} else {
  geometry = buildShiftGridGeometry({ ...dayColumns 由来 }).geometry  // 現行
}
```
= **effectiveGeometry を selector で解決**し、ShiftReviewGrid は受け取った geometry をそのまま使う（local delta を廃止 or 初期値に反映）。

## 8. reset の意味
- 「校正リセット」= `gridCalibration` を破棄して **dayColumns 由来 geometry に戻す**。
- UI: 校正パネルに「リセット」。state では gridCalibration=undefined。dayColumns は不変（再校正の土台が残る）。

## 9. storage payload の変更
`AssistedRowSelectionStored` に `gridCalibration?: { gridLeft, colWidth, source }` を追加。`toStoredPayload` は valid 時のみ同梱（**座標 + source のみ**）、`parseStoredPayload` は number/literal だけ読む（raw/base64/blob を捨てる）。S-geo-2B の dayColumns と同じ扱い。

## 10. raw画像 / base64 非保存の保証
- gridCalibration は number×2 + source literal のみ（画像データ構造を型で持てない）。
- 既存 contract test（「raw/base64/blob を捨て座標のみ通す」）を gridCalibration にも拡張。

## 11. test 方針
```
pure（assistedRowSelection）: gridCalibration validate / toStored・parseStored が座標+source のみ通す（raw 捨て）
selector: gridCalibration あり → effectiveGeometry=校正値 / なし → dayColumns 由来（既存）/ 両方 fail-soft
render/flow: 校正→保存→remount/reopen で gridCalibration から geometry が復元される（calibratedGeometry 再現）
reset: gridCalibration 破棄で dayColumns 由来に戻る
```

## 12. 実装分割（Persist-1/2/3）
```
Persist-1: 型 + storage contract + pure helper
  - AssistedRowSelection / Stored に gridCalibration 追加 + validateGridCalibration + toStored/parseStored 拡張 + 単体 test（pure・DB/UI 非接触）
Persist-2: calibration state を selection.gridCalibration に反映
  - 校正パネルの調整を gridCalibration として selection へ commit（ShiftReviewGrid → 上位 reducer/localStorage へ lift up or callback）
  - selectImportModalProps が effectiveGeometry を解決（gridCalibration 優先）
  - reset 配線
Persist-3: remount/reopen 復元の render contract / smoke
  - 校正→close→reopen で gridCalibration 由来 geometry が復元されることを固定（render contract）+ 必要なら live smoke
```

## 13. 未解決の設計論点（Persist-2 着手前に CEO 判断）
- **calibration state の持ち場所**: 現状 ShiftReviewGrid local。恒久化するなら selection を持つ上位（ShiftDraftInApp / reducer）へ lift up するか、callback で bubble up するか。→ Persist-2 readiness で確定。
- **同一画像の判定**: gridCalibration は imageFingerprint に紐づけるか（別画像で誤適用しない）。dayColumns と同じ単位で扱えば自然。
- **保存 payload への波及**: 本保存（`import_shift_roster`）は cells（rawCode）のみ送る設計で geometry/gridCalibration は送らない（review 専用）。= 恒久化は **localStorage / reducer のみ**、DB 非接触を維持。

## 14. scope / 禁止（再掲）
- 🟢 本 readiness = docs-only。
- 🔴 実装は Persist-1 以降の別 GO。production / DB write / 保存 / VLM / push / raw・base64・VLM raw commit は禁止。校正値の即実装も禁止。

## 15. CEO 判断点
1. 本 readiness 受理 or 補正（特に §5 Option A・§7 effectiveGeometry 優先順位・§13 持ち場所）。
2. 受理なら **Persist-1（型 + storage contract + pure helper・DB/UI 非接触）GO**。
