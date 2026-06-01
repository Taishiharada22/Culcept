/**
 * M2-1: 既存 item の背景再処理（reprocess）用 pure helper。
 *
 * 役割:
 *   - canReprocessItem            — item が再処理可能か（使える原画 dataURL があるか）
 *   - getReprocessSourceUrl       — 再処理に使う原画 URL を選ぶ（imageUrl 優先 → originalUrl fallback → null）
 *   - mergeCutoutDraftIntoItem    — BackgroundRemover の CutoutDraft を item に merge（cutout 系 4 field のみ）
 *   - buildReprocessWardrobeUpdater — setState 用 updater factory（対象 id だけ更新）
 *
 * 不変原則（CEO 補正・M2 共通）:
 *   - imageUrl / originalUrl は **絶対に上書きしない**（原画・fallback 表示の生命線。 壊すと白抜き事故/復旧不能）。
 *   - 更新してよいのは cutoutUrl / cutoutStatus / cutoutMethod / cutoutConfidence の **4 field のみ**。
 *   - originalUrl を新たに生成・復旧・推測しない（**読むだけ**）。
 *   - failed / skipped draft（cutout 未生成）では既存 cutout を壊さない（no-op）。
 *   - pure: 入力 item / state を mutate しない。 変化が無ければ **同一参照**を返す（再描画ゼロ）。
 *
 * CORS 安全性:
 *   - 再処理 source は **dataURL のみ**許可。 remote http(s) URL は getImageData が tainted で失敗するため、
 *     source 候補から除外する（canReprocessItem=false）。 imageUrl は登録時 `toDataURL` 由来で dataURL。
 */

import type { SavedState, WardrobeItem } from "./types";
import { cutoutDraftToItemFields, type CutoutDraft } from "./cutoutBrowser";

/** 非空の dataURL（"data:…"）か。 remote URL / 空文字 / undefined は false。 */
function isUsableDataUrl(url: string | undefined | null): url is string {
  return typeof url === "string" && url.startsWith("data:");
}

/**
 * 再処理に使う原画 URL を選ぶ（pure）。
 * 優先順位: originalUrl(dataURL) → imageUrl(dataURL) → null。
 * ※ M4 で順序を更新（originalUrl があるならそれが「処理前の正本」なので優先）。
 * ※ どちらも **読むだけ**。 生成・復旧・推測しない。
 */
export function getReprocessSourceUrl(item: WardrobeItem): string | null {
  const orig = item.originalUrl;
  if (isUsableDataUrl(orig)) return orig;
  const img = item.imageUrl;
  if (isUsableDataUrl(img)) return img;
  return null;
}

/** item が背景再処理可能か（使える原画 dataURL があるか）。 */
export function canReprocessItem(item: WardrobeItem): boolean {
  return getReprocessSourceUrl(item) !== null;
}

/**
 * BackgroundRemover の CutoutDraft を item に merge する（pure）。
 * - 更新するのは cutoutUrl / cutoutStatus / cutoutConfidence / cutoutMethod の **4 field のみ**。
 * - imageUrl / originalUrl / name / category / attributes 等は **一切触らない**（spread base が item）。
 * - draft が cutout を生成しない（failed/skipped、 または dataUrl 欠落）→ item を **そのまま返す**
 *   （既存 cutout を壊さない・imageUrl も不変）。
 */
export function mergeCutoutDraftIntoItem(item: WardrobeItem, draft: CutoutDraft): WardrobeItem {
  const fields = cutoutDraftToItemFields(draft);
  const cutoutUrl = fields.cutoutUrl;
  // cutout を生成できなかった draft では何も変えない（既存 success cutout / imageUrl を保護）。
  if (typeof cutoutUrl !== "string" || cutoutUrl.trim().length === 0) return item;
  return {
    ...item,
    cutoutUrl,
    cutoutStatus: fields.cutoutStatus,
    cutoutConfidence: fields.cutoutConfidence,
    cutoutMethod: fields.cutoutMethod,
  };
}

/**
 * setState 用 updater factory（pure）。 対象 id の item だけに draft を merge する。
 * - 対象 id が存在しない / merge が no-op → prev を **同一参照**で返す（state を壊さない・再描画ゼロ）。
 * - prev / wardrobe / 他 item を mutate しない。 他 item は同一参照のまま維持。
 */
export function buildReprocessWardrobeUpdater(
  itemId: string,
  draft: CutoutDraft,
): (prev: SavedState) => SavedState {
  return (prev) => {
    let changed = false;
    const wardrobe = prev.wardrobe.map((entry) => {
      if (entry.id !== itemId) return entry;
      const next = mergeCutoutDraftIntoItem(entry, draft);
      if (next !== entry) changed = true;
      return next;
    });
    if (!changed) return prev;
    return { ...prev, wardrobe };
  };
}
