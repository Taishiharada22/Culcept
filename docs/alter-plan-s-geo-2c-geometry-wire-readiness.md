# SR S-geo-2C — geometry wire readiness（ShiftDraftInApp → 照合枠 live 接続・設計のみ）

> 状態: **readiness / mini design（実装なし）**。S-geo-1（`buildShiftGridGeometry`）+ S-geo-2B（day列中心 X capture）を
> 繋ぎ、live 経路の確認画面でセル hover→原稿該当セル枠を出す配線を設計する。**実装しない**
> （ShiftDraftInApp geometry wire / ShiftImportModal wire 変更 / ShiftReviewGrid / SourceImageHighlight 変更 /
> VLM 再実行 / 保存 / DB / production / push は禁止）。
> 前提: S-geo-1（`c0780393`）/ S-geo-2B（`126df9cc`・`AssistedRowSelection.dayColumns` + capture UI）。

---

## 0. 接地（実コード trace）— cells_loaded に全入力が揃う
`devShiftDraftReducer.ts` の `cells_loaded` state（review 時）が geometry 入力を**すべて保持**:
| 入力 | 出所（cells_loaded） |
|------|---------------------|
| `imageW/imageH` | `imageMeta.imageW/imageH` |
| `personRowBand` | `selection.personRowBand` |
| `firstDayCenterX/lastDayCenterX` | **`selection.dayColumns`**（S-geo-2B で付与・row_selected→…→cells_loaded で `selection` 同一引き継ぎ） |
| `dayCount` | `daysInMonth(year, month)`（`year/month` は extracting→cells_loaded 引き継ぎ） |
| `blankDays` | `cells: ShiftReviewCell[]`（空セル日から導出） |
| `imageSrc`（原画像） | `imageObjectUrl`（image_loaded 以降同一・cells_loaded 維持） |

→ **新規取得は不要**。cells_loaded の既存データから geometry を pure 算出できる。

---

## 1. cells_loaded 時点で `selection.dayColumns` が確実に残っているか
- **残る**。reducer は `row_selected / crop_review / extracting / cells_loaded` の各 state で `selection: AssistedRowSelection` を**同一値で引き継ぐ**。`dayColumns` は selection の一部（S-geo-2B）ゆえ cells_loaded まで保持。
- ただし **X capture が未完了のまま extract された場合** `selection.dayColumns` は undefined。→ §5 の fail-soft で扱う（S-geo-2B の CTA gate が X 未完了の extract を防ぐが、防御的に undefined も許容）。

## 2. imageMeta imageW/imageH が残っているか
- **残る**。`imageMeta` は image_loaded 以降全 state が保持。cells_loaded の `imageMeta.imageW/imageH` をそのまま使う。

## 3. dayCount を year/month からどう取るか
- `cells_loaded.year / cells_loaded.month` → `daysInMonth(year, month)`（既存 `lib/plan/shift/targetMonth`・うるう年込み）。`handleExtract` と同じ取り方。

## 4. blankDays をどこから導出するか
- `cells_loaded.cells: ShiftReviewCell[]`（各 cell は `day` + `rawCode`）から、**空セル（記載なし）日**を blankDays に。
  概念: `blankDays = [1..dayCount] のうち、非空 cell が無い日`（原画像の「詰め描画」補正＝`sourceColumnForDay` が消費）。
- pure 導出関数（小・新規 or 既存 projection 流用）。raw 非依存（day 番号のみ）。

## 5. buildShiftGridGeometry が invalid を返した時の挙動（fail-soft）
- `buildShiftGridGeometry(...).ok === false`（dayColumns undefined / 範囲外 / span 不足 等）→ **geometry を渡さない（undefined）**。
- `SourceImageHighlight` は `imageSrc && geometry` の両方が要るため geometry 無で枠を出さない＝**S3A-2-4「原稿を表示して照合」全体トグルに degrade**（crash しない・枠が出ないだけ）。
- = 枠は **enhancement**。geometry hard 依存にしない。

## 6. ShiftImportModal → ShiftReviewGrid → SourceImageHighlight の既存 pass-through 確認
- 3 component とも **既に `geometry?` prop を持ち pass-through 済**（`ShiftImportModal` L115 / `ShiftReviewGrid` L333 → `SourceImageHighlight`）。`blankDays?` も同経路で渡せる（SourceImageHighlight が受ける）。
- → **これら 3 component は変更しない**。配線の起点 `ShiftDraftInApp`（現状 geometry 未指定）だけが新規に geometry/blankDays を渡す。

## 7. 配線方針（推奨: pure selector に寄せる）
- **`lib/plan/shift/devShiftDraftModalSelector.ts`（pure `selectImportModalProps`）を拡張**: cells_loaded 時に
  `geometry = buildShiftGridGeometry({imageW,imageH,personRowBand,dayCount,firstDayCenterX,lastDayCenterX}).geometry ?? undefined` と
  `blankDays`（cells から導出）を計算して modalProps に載せる（pure・testable）。
- **`ShiftDraftInApp.tsx`**: `<ShiftImportModal ... geometry={modalProps.geometry} blankDays={modalProps.blankDays} />` を渡すだけ（最小改変）。
- 利点: 算出ロジックを pure selector に集約 → render contract（geometryあり/なし）を静的に固定できる。ShiftDraftInApp は受け渡しのみ。

## 8. geometry あり/なしの render contract（test 方針）
- pure selector test: cells_loaded + **valid dayColumns** → `modalProps.geometry` defined（gridLeft/colWidth 妥当）/ **dayColumns 無 or invalid** → `geometry` undefined（fail-soft）。`blankDays` が空セル日を反映。
- ShiftDraftInApp render contract: geometry 有 → `SourceImageHighlight`（`source-image-highlight`）が出る / 無 → 出ない（全体トグルは残る）。
- raw/canvas を test に持ち込まない（pure 数値 + 既存 fixture）。

## 9. VLM 再実行なし / 保存・DB 非接触
- geometry は **既存 cells_loaded データの pure 算出**＝VLM を呼ばない。保存/DB/action に触れない（review 表示のみ）。
- ObjectURL lifecycle 不変（geometry は座標・新規 image なし）。

---

## 10. 実装分割（S-geo-2C 内）
```
2C-1: selectImportModalProps 拡張（geometry + blankDays 算出）+ blankDays 導出 pure + selector test  ← pure・DB/UI 非接触
2C-2: ShiftDraftInApp が geometry/blankDays を ShiftImportModal へ渡す + render contract            ← 最小 UI wire・保存なし
2C-3: ShiftReviewGrid hover smoke（live: 実画像→2点指定→読み取り→確認画面で枠表示を CEO 目視・保存しない）
```
- 各別 GO。2C-1 は pure（最初）、2C-2 は UI 受け渡し、2C-3 は目視 smoke（読み取りのみ・保存なし）。

## 11. scope / 禁止
- 🟢 本 readiness = docs-only。
- 🔴 実装は **2C-1 以降の別 GO**。ShiftDraftInApp geometry wire / ShiftImportModal wire 変更 / ShiftReviewGrid / SourceImageHighlight 変更 / VLM 再実行 / 保存 / DB write / production / push / raw・base64・VLM raw commit は禁止。
- stage しない: `supabase/.temp/*` / `dev-month-grid/*` / `.env.local` / raw・crop・base64・VLM log / runner / demo。

## 12. 申し送り（独立判断・rule ②）
- **3 component（Modal/ReviewGrid/Highlight）は変更不要**（既に geometry pass-through）。新規配線は ShiftDraftInApp + pure selector のみ＝surgical。
- **算出は pure selector に寄せる**（ShiftDraftInApp に計算を持たせない）＝render contract で geometry あり/なしを静的固定でき、回帰検出が容易。
- fail-soft 必須（X 未完了 / invalid → 枠なし・全体トグル維持）。geometry を「読み取り/保存の gate」にしない（S-geo-2B の CTA gate は extract の話・review は enhancement）。

## 13. CEO 判断点
1. 本 readiness 受理 or 補正。
2. 配線方針（**pure selector 拡張**〔推奨〕 vs ShiftDraftInApp で直接算出）。
3. 受理なら **S-geo-2C-1（selector 拡張 + blankDays pure + test・DB/UI 非接触）GO**。
