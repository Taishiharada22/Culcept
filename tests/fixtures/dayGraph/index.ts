/**
 * DayGraph representative scenarios — Phase 3-K (= K-1e fixtures)。
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §11
 *
 * 役割:
 *   各種代表的な 1 日 anchor シナリオ fixture。
 *   K の test + 将来 K-2 UI 統合 test + 後 phase の Layer 1/2/3 test で再利用。
 *
 * 不変原則:
 *   - immutable (= as const、 readonly)
 *   - 同 fixture を複数 test で参照可能
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";

const DATE = "2026-05-22";

function anchor(
  partial: Partial<ExternalAnchor> & { id: string; startTime: string },
): ExternalAnchor {
  return {
    id: partial.id,
    userId: "user_test",
    title: partial.title ?? "test",
    startTime: partial.startTime,
    endTime: partial.endTime,
    locationText: partial.locationText,
    locationCategory: partial.locationCategory,
    rigidity: partial.rigidity ?? "soft",
    sourceId: "src",
    confirmedAt: "2026-05-22T10:00:00.000Z",
    anchorKind: "one_off",
    date: partial.date ?? DATE,
    sensitiveCategory: partial.sensitiveCategory,
  } as ExternalAnchor;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenarios
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Empty day (= anchor 0、 dayMood=recovery、 density=sparse) */
export const EMPTY_DAY_ANCHORS: ReadonlyArray<ExternalAnchor> = [];

/** Single anchor (= dayMood=light、 density=sparse) */
export const SINGLE_DAY_ANCHORS: ReadonlyArray<ExternalAnchor> = [
  anchor({
    id: "single_a",
    title: "カフェ",
    startTime: "14:00",
    endTime: "15:00",
    locationText: "渋谷",
    locationCategory: "cafe",
  }),
];

/** Light day (= 2-3 anchors、 dayMood=light、 density=balanced) */
export const LIGHT_DAY_ANCHORS: ReadonlyArray<ExternalAnchor> = [
  anchor({
    id: "light_a",
    title: "ランチ",
    startTime: "12:00",
    endTime: "13:00",
    locationText: "新宿",
    locationCategory: "cafe",
  }),
  anchor({
    id: "light_b",
    title: "ジム",
    startTime: "19:00",
    endTime: "20:00",
    locationText: "渋谷",
    locationCategory: "outdoor",
  }),
];

/** Heavy day (= 5+ anchors、 dayMood=heavy、 density=packed) */
export const HEAVY_DAY_ANCHORS: ReadonlyArray<ExternalAnchor> = [
  anchor({ id: "heavy_a", title: "朝会議", startTime: "09:00", endTime: "10:00", locationText: "オフィス", locationCategory: "office" }),
  anchor({ id: "heavy_b", title: "商談", startTime: "11:00", endTime: "12:00", locationText: "オフィス", locationCategory: "office" }),
  anchor({ id: "heavy_c", title: "ランチ", startTime: "12:30", endTime: "13:30", locationText: "新宿", locationCategory: "cafe" }),
  anchor({ id: "heavy_d", title: "面接", startTime: "14:00", endTime: "15:00", locationText: "オフィス", locationCategory: "office", rigidity: "hard" }),
  anchor({ id: "heavy_e", title: "夜会議", startTime: "17:00", endTime: "18:00", locationText: "オフィス", locationCategory: "office" }),
];

/** Sensitive day (= medical / legal 含む、 redaction 検証用) */
export const SENSITIVE_DAY_ANCHORS: ReadonlyArray<ExternalAnchor> = [
  anchor({
    id: "sens_med",
    title: "MRI 予約",
    startTime: "10:00",
    endTime: "11:00",
    locationText: "○○病院",
    sensitiveCategory: "medical",
  }),
  anchor({
    id: "sens_legal",
    title: "弁護士相談",
    startTime: "15:00",
    endTime: "16:00",
    locationText: "××法律事務所",
    sensitiveCategory: "legal",
  }),
  anchor({
    id: "normal",
    title: "カフェ",
    startTime: "18:00",
    endTime: "19:00",
    locationText: "渋谷",
    locationCategory: "cafe",
  }),
];

/** Overlap day (= 時刻重なり anchor、 hasOverlap=true 検証) */
export const OVERLAP_DAY_ANCHORS: ReadonlyArray<ExternalAnchor> = [
  anchor({
    id: "overlap_a",
    title: "会議 A",
    startTime: "14:00",
    endTime: "16:00",
    locationText: "オフィス",
    locationCategory: "office",
  }),
  anchor({
    id: "overlap_b",
    title: "会議 B",
    startTime: "15:00",
    endTime: "15:30",
    locationText: "オフィス",
    locationCategory: "office",
  }),
];

/** Movement day (= 場所変化 anchor、 transitions 生成検証) */
export const MOVEMENT_DAY_ANCHORS: ReadonlyArray<ExternalAnchor> = [
  anchor({
    id: "move_morning",
    title: "ランチ",
    startTime: "12:00",
    endTime: "13:00",
    locationText: "渋谷",
    locationCategory: "cafe",
  }),
  anchor({
    id: "move_afternoon",
    title: "カフェ",
    startTime: "15:00",
    endTime: "16:00",
    locationText: "新宿",
    locationCategory: "cafe",
  }),
  anchor({
    id: "move_evening",
    title: "ジム",
    startTime: "19:00",
    endTime: "20:00",
    locationText: "新宿",
    locationCategory: "outdoor",
  }),
];

/** Invalid anchors (= warnings 検証用) */
export const INVALID_DAY_ANCHORS: ReadonlyArray<ExternalAnchor> = [
  anchor({ id: "valid", title: "valid", startTime: "14:00", endTime: "15:00" }),
  anchor({ id: "bad_time", title: "x", startTime: "abc", endTime: "15:00" }),
  anchor({ id: "outside", title: "x", startTime: "03:00", endTime: "04:00" }),
  anchor({ id: "end_before", title: "x", startTime: "16:00", endTime: "15:00" }),
];
