# SR S-geo-3 — Source Cell Zoom（該当セル crop 拡大 + 太枠）readiness（設計のみ）

> 状態: **readiness / mini design（実装なし）**。CEO 案A（2026-06-05 ライブ smoke 中）採用。
> 巨大なフル表に極小枠 → **hover/tap した日の source セルを crop して拡大表示し、太枠で囲う**。
> 前提: geometry 配線（S-geo-1/2B/2C 完了・`a31d218c`）+ band-interception 修正（capture 動作確認済）。

---

## 0. 背景（ライブ smoke で判明）
- capture 修正後、2点指定 → live VLM → 確認画面 → 原稿インライン表示まで**到達成功**（geometry 確定済）。
- しかし原稿は**全員分フル表（9 行 × 31 列）を ~600px に縮小**表示するため、1 セル分の緑枠が**極小でほぼ見えない**＝「四角く強調」体験になっていない。
- CEO 理想（明言）: **元画像の参照元が四角く強調される**。

## 1. 目的（work backward from goal）
hover/tap した日に対し、**原稿の該当セル（あなたの行・その日）だけを拡大し、くっきり太枠で囲った crop** を見せる。「この 1 マスが原稿のここ」と一目で分かり、位置精度も同時に検証できる。

## 2. 既存資産（新規計算は不要・全部ある）
| 必要物 | 既存 |
|------|------|
| 該当セルの矩形（原画像 px） | `cellCropRegion(geometry, col)` → `{x,y,width,height}`（`shiftGridGeometry.ts`） |
| packing 補正済の列番号 | `sourceColumnForDay(day, blankDays)`（空欄日詰め補正・正本） |
| geometry | selectImportModalProps → ShiftDraftInApp → ShiftReviewGrid（配線済） |
| blankDays | ShiftReviewGrid 自己算出（正本・S-geo-2C で確認） |
| 原画像 | `imageSrc`（ObjectURL） |
| hover/tap 状態 | `highlightDay = hoveredDay ?? selectedDay`（ShiftReviewGrid L150・配線済） |

→ crop+zoom は**既存の数値からの純粋な CSS 変換**で実現でき、新規 VLM/画像生成/canvas 不要。

## 3. 設計 — 新規 pure presentational `SourceCellZoom`
```
props: { imageSrc, geometry, highlightDay: number|null, blankDays?, displayWidth? }
算出（pure）:
  col      = sourceColumnForDay(highlightDay, blankDays)
  cell     = cellCropRegion(geometry, col)               // 原画像 px の該当セル矩形
  marginX  = cell.width  * CONTEXT_COLS (例 1.5)          // 左右に文脈列
  marginY  = cell.height * CONTEXT_ROWS (例 0.8)          // 上下に少し文脈
  view     = clampToImage({ x: cell.x-marginX, y: cell.y-marginY,
                            w: cell.width+2*marginX, h: cell.height+2*marginY })
  zoom     = displayWidth / view.w
描画（CSS のみ・canvas なし）:
  - 外側 div: width=displayWidth, height=view.h*zoom, overflow-hidden, rounded, 影
  - 背景: <img src=imageSrc> を transform: scale(zoom) + translate(-view.x, -view.y)
          （または background-image + background-size/position の同等手法）
  - 太枠 overlay: cell を view 内座標へ写像し emerald の太 ring + 半透明 fill
       frameLeft=(cell.x-view.x)*zoom, frameTop=(cell.y-view.y)*zoom,
       frameW=cell.width*zoom, frameH=cell.height*zoom
  - highlightDay==null → 何も描かない（hint テキストのみ任意）
```
- raw 画像非依存（src は呼出側 ObjectURL・base64 化しない）。pure（IO/Date/random なし）。
- **太枠で「参照元」がくっきり強調**＝CEO 理想に直結。

## 4. 配置（ShiftReviewGrid 内）
- 既存のフル原稿 `SourceImageHighlight`（全体俯瞰）は**残す**（俯瞰で「この辺り」を把握）。
- その**上または横に `SourceCellZoom` を主役として配置**（hover/tap で該当セルが拡大表示）。
- mount 条件は既存と同じ `imageSrc && geometry`（fail-soft 維持）。
- ※ 俯瞰が不要なら将来フル表示を畳む選択肢もあるが、v1 は併存（情報を削らない）。

## 5. fail-soft / 位置精度の二重効果
- geometry なし（dayColumns 未捕捉/invalid）→ `SourceCellZoom` 非表示（現行 fail-soft 維持・確認画面は壊れない）。
- **拡大表示は位置精度の検証も兼ねる**: 枠が別の人/別の日に乗っていれば拡大で即座に分かる → 未回答だった「位置精度」は本機能の smoke で確定できる（別の事前 live 検査は不要に）。

## 6. pure / test 方針
- crop+zoom 算出は純数値 → render contract（静的）で固定可:
  - valid geometry + highlightDay=N → zoom 矩形・太枠の left/top/width/height が期待値
  - highlightDay=null → 何も描かない
  - geometry なし → 非表示（fail-soft）
  - raw/base64 非混入（imageSrc 以外に画像データを持たない）
- 既存 `cellCropRegion`/`sourceColumnForDay` の単体 test は流用（packing 補正は実証済）。

## 7. scope / 禁止
- 🟢 本 readiness = docs-only。
- 🟡 本機能は **ShiftReviewGrid に新コンポーネントを足す**（S-geo-2C で凍結していた UI 改修を、CEO 案A 承認のもと解禁）。`SourceImageHighlight` は変更最小（併存）。
- 🔴 禁止継続: 保存 / `PLAN_SHIFT_IMPORT_SAVE=true` / DB write / RPC / production / push・PR・deploy / blankDays 算出ロジック変更（正本維持） / raw画像・base64・VLM raw response commit / `.env.local` 編集。

## 8. 実装分割
```
S-geo-3-1: SourceCellZoom.tsx（pure presentational・CSS crop+zoom+太枠）+ render contract test   ← UI 単体・DB/VLM 非接触
S-geo-3-2: ShiftReviewGrid に SourceCellZoom を配置（highlightDay/blankDays/geometry 受け渡し）+ render contract  ← 配線
S-geo-3-3: ライブ smoke（既存 :3001 セッションを Fast Refresh → hover で拡大枠が正しいセルに乗るか CEO 目視・保存なし）
```
- 各別 GO。3-1 は pure（最初）、3-2 は配線、3-3 は目視（**再アップロード不要** — cells_loaded 状態は保持されるので Fast Refresh だけで確認可）。

## 9. CEO 判断点
1. 本 readiness（案A 設計）受理 or 補正（CONTEXT_COLS/ROWS の文脈量、俯瞰フル表の併存 or 置換、zoom 倍率の方針）。
2. 受理なら **S-geo-3-1（SourceCellZoom pure + test・DB/VLM 非接触）GO**。
3. dev server :3001 は起動継続中（cells_loaded 状態保持）→ 3-2 後に Fast Refresh で即 smoke 可能。
