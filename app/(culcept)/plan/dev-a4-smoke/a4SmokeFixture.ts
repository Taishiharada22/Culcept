/**
 * SR A4 visual smoke — 合成 fixture（pure data + browser-only draw）
 *
 * 目的: 「空欄セル(rawCode="")だが原稿に content がある」状態を **合成**で再現し、A4-3 の warning/cell amber を
 *   実ブラウザで発火させる。**実ロスター画像・外部画像・base64 を一切含まない**（最小の合成セルのみ）。
 *   合成画像は client が runtime に canvas → Blob → ObjectURL で生成する（commit しない）。
 */

import type { ShiftReviewCell } from "../components/ShiftReviewGrid";
import {
  cellCropRegion,
  sourceColumnForDay,
  type ShiftGridGeometry,
  type CropRegion,
} from "@/lib/plan/shift/shiftGridGeometry";

/** 空欄 target（P1 を発火させる day）。 */
export const A4_SMOKE_TARGET_DAY = 3;

/** 合成画像と一致する geometry（7 列 × 40px）。 */
export const A4_SMOKE_GEOMETRY: ShiftGridGeometry = {
  imageWidth: 280,
  imageHeight: 50,
  gridLeft: 0,
  colWidth: 40,
  cropTop: 0,
  cropHeight: 50,
};

/** day3 = rawCode ""（target blank・原稿に content がある状態を合成画像側で再現）。 */
export const A4_SMOKE_CELLS: ShiftReviewCell[] = [
  { day: 1, date: "2025-07-01", rawCode: "N", confidence: 1 },
  { day: 2, date: "2025-07-02", rawCode: "G", confidence: 1 },
  { day: 3, date: "2025-07-03", rawCode: "", confidence: 1 },
  { day: 4, date: "2025-07-04", rawCode: "L", confidence: 1 },
  { day: 5, date: "2025-07-05", rawCode: "N", confidence: 1 },
  { day: 6, date: "2025-07-06", rawCode: "G", confidence: 1 },
  { day: 7, date: "2025-07-07", rawCode: "L", confidence: 1 },
];

export const A4_SMOKE_BLANK_DAYS: number[] = [A4_SMOKE_TARGET_DAY];

/** hook が target blank day を読む source region（pure・draw と read を一致させる単一の真実）。 */
export function a4SmokeContentRegion(): CropRegion {
  return cellCropRegion(
    A4_SMOKE_GEOMETRY,
    sourceColumnForDay(A4_SMOKE_TARGET_DAY, A4_SMOKE_BLANK_DAYS)
  );
}

/**
 * 合成画像を canvas に描く（browser-only・ctx は client が渡す）。
 * 白地 + target blank day の read region にだけ色ブロック = 「空欄だが原稿に content」を再現。
 * 外部画像・実ロスター・base64 は一切含まない。
 */
export function drawA4SmokeImage(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, A4_SMOKE_GEOMETRY.imageWidth, A4_SMOKE_GEOMETRY.imageHeight);
  const r = a4SmokeContentRegion();
  ctx.fillStyle = "#3b82f6"; // 青ブロック = content
  ctx.fillRect(r.x + 4, r.y + 4, Math.max(1, r.width - 8), Math.max(1, r.height - 8));
}
