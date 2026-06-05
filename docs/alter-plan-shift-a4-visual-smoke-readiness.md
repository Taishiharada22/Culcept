# SR A4 — visual smoke readiness（docs-only・**実行は別 GO**）

> 区分: **readiness（docs-only）**。**実行しない**（browser/canvas が絡むため別 GO）。
> 目的: node 環境（renderToStaticMarkup・effect 非実行・`@testing-library/react` 不在）で静的に再現できない
>   **A4-3 の positive in-grid 挙動**を実ブラウザで確認する（banner 表示 / cell amber / 保存 CTA 維持 / fail-open）。
> 根拠: deterministic な metric 正当性は A4-1 実画像検証（day28=0.951→P1）で証明済。本 smoke は **UI 配線の発火**を見る。

---

## 0. 確認したいこと（GPT 5 目標）
1. imageSrc + geometry + 空欄セル（rawCode="" だが原稿に content）→ **source mismatch warning が表示**される。
2. 該当セルが **amber / 要確認**（`data-source-mismatch="true"` + amber dot）になる。
3. **保存 CTA は止まらない**（blockSave 非変更）。
4. **canvas taint / 画像 load 失敗 → fail-open**（banner なし・throw なし）。
5. raw 画像 / base64 / canvas data を **保存・commit しない**。

## 1. 重要な設計判断（深掘り）
- **VLM は不要**（既存状態/fixture で足りる）: smoke は **固定 fixture**（合成画像 + 固定 cells + geometry）で発火させる。VLM 抽出を回す必要はない（cells は手置き・content は canvas が合成画像から読む）。→ GPT の「VLM 再実行が必要か」への答え = **不要**。
- **原稿画像を使わない / commit しない**: fixture 画像は **runtime 生成の合成画像**（例: 小 canvas に「空欄」day のセル位置だけ色ブロックを描いて `toDataURL`）。CEO の原稿ロスターは使わず、raw 画像/base64 を**ファイル commit しない**。
- **auth 回避**: 既存 `dev-shift-draft` は triple-guard + auth gated（到達不可）。よって **dev preview route**（`dev-month-grid` と同型・auth なし・dev flag gating）で ShiftReviewGrid を fixture 描画する。

## 2. fixture 設計（合成・決定的）
- 合成画像: 横並び N 日分のセルを描いた小画像（例 幅 = N×40px・高さ 50px）。**「空欄」にする day の位置にだけ色ブロック**（= 原稿に content がある空欄を再現）、他は白。runtime に canvas で描画 → data URL。
- cells: その day を `rawCode=""`、他は通常コード。
- geometry: 合成画像に一致（gridLeft/colWidth/imageWidth/imageHeight/cropTop/cropHeight）。
- 期待: 空欄 day の region に色 → `readSourceCellContent` 高 score → **P1 発火** → banner + 該当セル amber。

## 3. 検証手順（Playwright・headless Chromium は canvas 対応）
| 目標 | 手順 |
|---|---|
| 1 banner | route 表示 → **debounce 250ms + async 待ち**（`shift-review-source-mismatch-warning` 出現を wait）→ `data-source-mismatch-days` に対象 day |
| 2 cell amber | `shift-review-cell-<day>` の `data-source-mismatch="true"` + amber dot（aria-label 要確認）|
| 3 保存 CTA | 保存ボタンが source 由来で disabled に**ならない**（saveEnabled fixture で active 確認）|
| 4 fail-open | imageSrc を壊れた data URL / cross-origin に差し替えた variant → **banner 出ない**・コンソール throw なし |
| 5 no-leak | network/payload に raw 画像・base64 が**乗らない**（preview は保存 disabled）・合成 fixture を **commit しない** |

## 4. 実装分割（各 step 別 GO）
- **V-1**: dev preview route（auth なし・dev flag gating）+ 合成 fixture 生成 + ShiftReviewGrid 描画。
- **V-2**: Playwright smoke script（目標 1-3 positive + 4 fail-open）。
- **V-3**: 実行 + 結果報告（**別 GO**）。

## 5. リスクと緩和
| # | リスク | 緩和 |
|---|---|---|
| R1 | debounce/async で flaky | 明示 `waitForSelector`（固定 sleep でなく条件待ち）|
| R2 | headless canvas 差異 | Playwright Chromium は getImageData 対応。差が出たら閾値は config |
| R3 | 合成 fixture は proxy（実紙質でない）| 実画像の正当性は A4-1 で証明済。本 smoke は **UI 発火**確認に限定 |
| R4 | dev route の本番混入 | dev flag gating + 非 production・preview は保存 disabled |

## 6. scope / 禁止
- **scope**: A4-3 UI 発火の実ブラウザ確認（banner/amber/保存維持/fail-open）。
- **非 scope**: VLM 抽出 / 実ロスター / 保存・DB / 精度再測定（A4-1 済）。
- **禁止（本 readiness 段階・実行も別 GO）**: VLM 再実行 / 保存再実行 / DB write / `PLAN_SHIFT_IMPORT_SAVE=true` / production / push・PR・deploy / raw 画像・base64・VLM raw response commit / 合成 fixture 画像の commit。

## 7. 結論
- A4-3 の positive UI 発火は node 環境で静的検証不可 → **dev preview route + 合成 fixture + Playwright** で確認するのが最善（VLM 不要・原稿画像不要・auth 不要）。
- **本書は readiness。実行は V-1→V-2→V-3 を別 GO で**。deterministic 正当性は A4-1 で確定済。
