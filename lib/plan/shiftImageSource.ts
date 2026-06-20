/**
 * shiftImageSource — シフト表画像取り込み（shift_image）由来の判定 helper
 *
 * 背景:
 *   勤務 anchor（ExternalAnchor）は source_type を直接持たず、所属 source 経由でのみ
 *   取込由来を判別できる（anchor.sourceId → ExternalAnchorSource.sourceType）。
 *   一方 休み（PlanDayIndicator）は自前で sourceType を持つため source 不要。
 *
 *   本 module は sources[] から shift_image source の id 集合を 1 度だけ導出し、
 *   各 anchor の取込由来を O(1) で判定するための pure helper を提供する。
 *
 * 純粋関数のみ。UI / IO / DOM 非依存。
 */
import type { ExternalAnchor } from "./external-anchor";
import type { ExternalAnchorSource } from "./external-anchor-source";

/**
 * shift_image 由来 source の id 集合を導出する。
 *
 * @param sources GET /api/plan/anchors の sources[]（runtime で source_type='shift_image' を含む）
 * @returns shift_image source の id を集めた Set（該当なしは空 Set）
 */
export function shiftImageSourceIds(
  sources: readonly ExternalAnchorSource[]
): Set<string> {
  const ids = new Set<string>();
  for (const s of sources) {
    if (s.sourceType === "shift_image") ids.add(s.id);
  }
  return ids;
}

/**
 * anchor が shift_image（シフト取込）由来か。
 * sourceId が shift_image source 集合に含まれれば true。
 *
 * @param anchor sourceId を持つ anchor（ExternalAnchor）
 * @param shiftImageIds shiftImageSourceIds() の結果
 */
export function isImportedShiftAnchor(
  anchor: Pick<ExternalAnchor, "sourceId">,
  shiftImageIds: ReadonlySet<string>
): boolean {
  return shiftImageIds.has(anchor.sourceId);
}
