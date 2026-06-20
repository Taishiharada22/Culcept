# SR S-geo — deterministic geometry calibration readiness（照合枠の live 復活・設計のみ）

> 状態: **readiness / mini design（実装なし）**。確認画面のセル hover→原稿該当セルを枠で囲む照合を、
> **VLM bbox でなく決定論的に**算出して live 経路で復活させる設計。**DB 非接触・pure 中心**。
> 前提: S-save 帯 staging 全検証完了（S-save-3/4A/4B PASS）。本書は照合 UX（保存前の人間確認精度）強化。
> **本書では実装しない**（geometry / ShiftReviewGrid / SourceImageHighlight 変更・VLM 再実行・保存・production は禁止）。

---

## 0. 既存 geometry 資産の調査結果（実コード trace・正本）

### geometry 契約（正本 = dev route で hover 枠が出ていた型・座標系）
`lib/plan/shift/shiftGridGeometry.ts`:
```ts
interface ShiftGridGeometry {
  imageWidth; imageHeight;   // 原画像 px
  gridLeft;   colWidth;      // day1 セル左端 x / 1 列幅 px  ← X 方向
  cropTop;    cropHeight;    // crop 縦帯 上端 y / 高さ px    ← Y 方向
}
cellCropRegion(geometry, day) = { x: gridLeft+(day-1)*colWidth(clamp), y: cropTop, width: colWidth, height: cropHeight }
sourceColumnForDay(day, blankDays) = [1..day] の非空日数（空日詰め描画の補正）
```
- `HARADA_SPRIX_JULY_GEOMETRY` = `{imageW:1860, imageH:846, gridLeft:275, colWidth:51.5, cropTop:298, cropHeight:52}`。
  **July SPRIX 専用の手動 calibration**（Playwright+canvas でヘッダ数字中心を実測した固定値）。

### consumer（`SourceImageHighlight.tsx`）
- 入力: `imageSrc`（**原画像** URL）/ `geometry` / `highlightDay` / `blankDays` / `displayWidth`。
- `scale = displayWidth / geometry.imageWidth` → `box = cellCropRegion(...) × scale` の emerald 枠を原画像上に描く。
- **座標系は全て原画像 px**。表示は原画像を displayWidth に縮尺（item 7 の scale 変換はここで完結）。

### 入力源（`assistedRowSelection.ts`）— **核心の gap**
`AssistedRowSelection = { imageW, imageH, headerBand:{top,bottom}, personRowBand:{top,bottom} }`。
- ✅ 提供: `imageW/imageH`、`cropTop`(=headerBand.top)、`cropHeight`(=personRowBand.bottom − headerBand.top)。
- ❌ **未提供: `gridLeft` / `colWidth`（X 方向）**。doc 明記「自動セル分割しない・**列方向は VLM に委ねる・y 方向のみ扱う**」。
- = assisted は **Y 帯だけ**を捕捉。**X（日列の左端と列幅）は一切持たない**。

### 関連資産（review geometry には不要）
- `combinedDraftImage.ts` / `assistedCropGenerator.ts`（chunk split 1-15/16-31・combined 画像）= **VLM 入力 crop 専用**。review は原画像を出すため **chunk 変換は照合枠に不要**（item 7 の結論）。
- `ShiftReviewGrid.tsx` L333 / `ShiftImportModal.tsx` L115 が `geometry={geometry}` を pass-through。`SourceCellCrop.tsx` は cell 単体 crop。

---

## 1. 現在どこまで geometry 情報が存在するか
- **型・算出関数は完成**（`ShiftGridGeometry` + `cellCropRegion` + `sourceColumnForDay`）。
- **値は固定 fixture 1 件のみ**（`HARADA_SPRIX_JULY_GEOMETRY`・July SPRIX 専用手動 calibration）。
- live の任意画像に対する geometry **生成器は存在しない**。

## 2. live flow で geometry がどこで落ちているか
- dev route（`DevShiftDraftClient`）は `HARADA_SPRIX_JULY_GEOMETRY` を `ShiftImportModal` に渡す → 枠が出た。
- **live 経路（`ShiftDraftInApp` → `ShiftImportModal`）は geometry を渡さない**（fixture は SPRIX 専用で任意画像に使えない・生成器が無い）。→ `SourceImageHighlight` 不発（imageSrc はあるが geometry=undefined）。
- = **落ちている地点 = ShiftDraftInApp（geometry を作って渡す処理が無い）**。S3A-2-4 の「原稿を表示して照合」は全体表示の代替で、セル枠ではない。

## 3. ShiftReviewGrid / SourceImageHighlight が必要とする geometry 形状
- `ShiftGridGeometry`（§0）。SourceImageHighlight は `imageWidth`(scale 用) + `cellCropRegion` が使う `gridLeft/colWidth/cropTop/cropHeight` を必要とする。
- + `blankDays`（空日詰め補正）+ `highlightDay`。

## 4. AssistedRowSelection の imageW/imageH/headerBand/personRowBand をどう使うか
| geometry field | assisted 由来 | 状態 |
|----|----|----|
| `imageWidth` | `imageW` | ✅ そのまま |
| `imageHeight` | `imageH` | ✅ そのまま |
| `cropTop` | `headerBand.top` | ✅（数字+本人行を含む帯の上端） |
| `cropHeight` | `personRowBand.bottom − headerBand.top` | ✅（header〜personRow を縦に包む） |
| `gridLeft` | — | ❌ **assisted に無い** |
| `colWidth` | — | ❌ **assisted に無い** |
→ **Y と寸法は assisted から導出可。X（gridLeft/colWidth）が唯一の欠落**。

## 5. day column の x 座標をどう計算するか（**本設計の核心・独立補正**）
**CEO/GPT 案A「列幅 = schedule grid width / days」は X grid 範囲を要するが、assisted は Y のみで X を持たない。**
**証拠（naive 失敗）**: HARADA は `gridLeft=275(≠0)`, `colWidth=51.5`。`imageW/days = 1860/31 = 60 ≠ 51.5`（**約 17% 過大**）。
名前列が左 0〜275 を占め、日列は sub-region。よって **`colWidth=imageW/days` は不可**（progressive にずれる）。

→ **X を取る 3 路線**（決定論・VLM bbox 不使用）:
- **案A-1（推奨・最小）**: assisted に **X capture を 1 手追加**（schedule grid の左端 x と右端 x を tap/drag、または day1 中心と day-last 中心を 2 tap）。`gridLeft=left`、`colWidth=(right−left)/days`（または隣接間隔）。決定論・CV 不要・assisted の Y 帯 UX と同型。**X 入力は UI slice（pure model はそれを引数に取る）**。
- **案A.5（中・gesture 不要）**: `headerBand` の画素を canvas 解析し、**日番号の列中心 x を検出**（HARADA 手動実測を自動化）。narrow band の決定論 CV。追加 gesture 無し・実装は重い。
- **案B（重・将来）**: 表全体の格子線検出で row/col 補正（左端/右端/名前列除外）。精度高だが重く脆い。

**推奨**: **案A-1 から開始**（X capture を最小 gesture で取り、pure model は `{imageW,imageH,bands,gridLeft,gridRight,days,blankDays}` から geometry を組む）。案A.5 / 案B は拡張余地として残す（案B への発展を構造的に阻害しない型にする）。
**重要**: 「pure geometry model だけ」では X 不足で完成しない。**X 入力（案A-1 gesture or 案A.5 検出）が前提**。これを readiness の最重要論点として CEO 判断を仰ぐ。

## 6. 月日数（31/30/28-29）をどう扱うか
- `days` を月から決定（既存 `daysInMonth(year,month)` 流用・うるう年込み）。`colWidth=(gridRight−gridLeft)/days`。
- 枠は `cellCropRegion(geometry, col)` が `clamp` 済 → day=days でも画像内に収まる。月日数違いは `days` パラメタ化で吸収。

## 7. chunk split / image / displayed image の scale 変換
- **review 照合枠に chunk 変換は不要**。review は **原画像**（`imageSrc`=原 ObjectURL）を出し、geometry も原画像 px。`combinedDraftImage`（chunk 1-15/16-31）は **VLM 入力 crop 専用**で review に出ない。
- scale 変換は `SourceImageHighlight` の `scale=displayWidth/imageWidth` のみ（原画像 px → 表示 px）。実装時に「review の imageSrc が原画像であること」を再確認（S3A-2-4 で原 ObjectURL を確認済）。

## 8. 原画像「詰め」（空日 packing）月をどう扱うか
- `sourceColumnForDay(day, blankDays)` が既存（[1..day] の非空数 = 物理列）。
- `blankDays` = 抽出で空だった日（projection の empty cell / 未抽出日）から導出。live flow は cells を持つ → 1..days で cell が無い日 = blankDays。
- geometry の `colWidth` は**非空列の物理間隔**である点に注意（案A-1 で day1/day-last を取るなら「非空の」端を取るか、ヘッダ数字（規則正しく 1..days 並ぶ）を基準にするか確定が必要）。**ヘッダ数字基準を推奨**（ヘッダは詰めず規則正しい → gridLeft/colWidth はヘッダ列、`sourceColumnForDay` が描画時に詰め補正）。HARADA も「ヘッダ数字中心」で calibration した（§0）。

## 9. selected/hover cell → source image rect の対応
- 既存のまま: `highlightDay`（hover/選択日）→ `sourceColumnForDay(day, blankDays)` → `cellCropRegion` → 原画像 rect → scale → emerald 枠。
- S-geo は **geometry の生成だけ**を足し、この対応関係（既に動く部分）は変えない。

## 10. 誤差許容 / padding / border
- ヘッダ基準 calibration の許容: HARADA は box 中心と数字中心が <0.5px 一致（§0）。案A-1 の手動 X は ±数 px の誤差 → 枠が「該当列を含む」ことが目的なので **colWidth に小さな padding（例 +2px 各側）** を許容。
- 縦は `cropTop/cropHeight` を header〜personRow に取り、文脈（数字+本人セル）を含める（HARADA は cropHeight=52）。
- border は既存 `ring-2`（pointer-events-none）。geometry 生成は padding/border を持たず、描画側（SourceImageHighlight）が視覚 margin を持つ。

## 11. test 方針
**pure geometry model のみ**を unit test（DB/canvas/DOM 非接触）:
- `buildGeometryFromAssisted(input)`（新 pure 関数）の固定:
  1. imageW/H → geometry.imageWidth/Height 透過。
  2. cropTop=headerBand.top / cropHeight=personRowBand.bottom−headerBand.top。
  3. gridLeft=入力 left / colWidth=(right−left)/days（案A-1 入力契約）。
  4. days=31/30/28/29 で colWidth が日数に応じ変わる。
  5. `cellCropRegion(buildGeometryFromAssisted(...), day)` が画像内に clamp（day=1, day=days）。
  6. **HARADA 入力を与えると HARADA_SPRIX_JULY_GEOMETRY に近い値**（回帰: gridLeft≈275, colWidth≈51.5 を ±許容で再現）= 正本との整合。
  7. blankDays 経由の `sourceColumnForDay` 既存 test は不変（本 model は触らない）。
- **raw 画像/base64/canvas を test に持ち込まない**（pure 数値のみ）。

## 12. 実装分割案
```
S-geo-1: pure geometry model（buildGeometryFromAssisted）+ unit test     ← DB/UI 非接触・最初
         入力契約: { imageW,imageH, headerBand,personRowBand, gridLeft,gridRight, days } → ShiftGridGeometry
S-geo-2: X capture UI（案A-1: schedule grid 左右 or day1/day-last 2 tap）  ← assisted に X gesture 追加
S-geo-3: live wire（ShiftDraftInApp が geometry を組み ShiftImportModal→ShiftReviewGrid→SourceImageHighlight へ）+ smoke
S-geo-4（任意・将来）: 案A.5 ヘッダ band 検出で gesture レス化 / 案B 全格子検出
```
- **S-geo-1 は pure + test のみ**（CEO の「pure geometry model + test から」に合致）。ただし X 入力契約を含むため、§5 の X 路線（案A-1）を先に CEO 確定する必要がある。

---

## 13. scope / 禁止（S-geo 全体）
- 🟢 pure geometry model（新規ファイル `lib/plan/shift/buildShiftGridGeometry.ts` 想定）+ unit test。DB 非接触。
- 🔴 **本 readiness では実装しない**。geometry 実装 / ShiftReviewGrid・SourceImageHighlight 変更 / VLM 再実行 / 保存 / DB write / production / M3-c auto-open seam / push・PR / raw画像・base64・VLM raw commit。

## 14. 推奨と CEO 判断点
- **推奨**: 案A-1（X を最小 gesture で capture）から開始。理由: 決定論・CV 脆性なし・assisted の Y 帯 UX と同型・小さく刻める・案B 拡張余地を残せる。
- **CEO 判断が要る最重要点（§5）**: **X（gridLeft/colWidth）の取得路線**を確定する必要がある（assisted は Y のみ）。
  - (a) 案A-1: 手動 X gesture を 1 手足す（推奨・最小）。
  - (b) 案A.5: ヘッダ band 画素検出で gesture レス（中・CV）。
  - (c) 案B: 全格子検出（重・将来）。
- 確定後、**S-geo-1（pure geometry model + test）GO** をいただければ着手します（その時の入力契約は選んだ X 路線に従う）。

## 15. 次工程順序（S-save-4B 後・CEO 既定）
```
S-geo readiness（本書）              ← docs-only
S-geo-1 pure geometry model + test  ← X 路線確定後・CEO GO
S-geo-2 X capture UI
S-geo-3 live wire + smoke
（その後）/plan 月 navigation / 取り込み後確認導線 → production-enablement readiness
```
