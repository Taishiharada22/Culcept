/**
 * B-2 source marker visual smoke — synthetic fixture（DB/VLM/save 非接触）
 *
 * shift_image 由来の「取込」marker を週/日/月 view で目視確認するための合成データ。
 * GPT 指定の 5 ケースを内包:
 *   1. shift_image source の勤務 anchor（夜勤 6/10 → 取込・月 chip N）
 *   2. non-shift_image source の勤務 anchor（歯医者 6/11 → marker なし）
 *   3. shift_image day_indicator（休み 6/12 → 取込）
 *   4. non-shift_image day_indicator（休み 6/13 → marker なし）
 *   5. 同じ日に複数表示（6/10: 夜勤[shift] + 面談[manual] → 夜勤のみ取込・崩れ確認）
 *
 * now=2026-06-10(水)。週 strip = 6/7(日)〜6/13(土) / flow range = 6/10〜6/16 / month = June。
 * → 6/10〜6/13 が 3 view すべてに出る。
 *
 * 純粋データのみ。IO/DOM/DB/保存なし。
 */
import type {
  ExternalAnchor,
  OneOffExternalAnchor,
} from "@/lib/plan/external-anchor";
import type { ExternalAnchorSource } from "@/lib/plan/external-anchor-source";
import type { DayIndicatorViewModel } from "@/lib/plan/dayIndicatorView";
import { shiftImageSourceIds } from "@/lib/plan/shiftImageSource";

/** test 用固定時刻（now）。water 水曜・週/日/月 すべてに fixture 日が出る基準 */
export const SMOKE_NOW = new Date("2026-06-10T09:00:00.000Z");

const SHIFT_SOURCE_ID = "src-shift-smoke";
const MANUAL_SOURCE_ID = "src-manual-smoke";

/** sources: shift_image 1 + manual 1（importedShiftSourceIds の元） */
export const SMOKE_SOURCES: ExternalAnchorSource[] = [
  {
    id: SHIFT_SOURCE_ID,
    userId: "smoke-user",
    sourceType: "shift_image",
    capturedAt: "2026-06-01T00:00:00.000Z",
    rawRetention: "discarded",
  },
  {
    id: MANUAL_SOURCE_ID,
    userId: "smoke-user",
    sourceType: "manual",
    capturedAt: "2026-06-01T00:00:00.000Z",
    rawRetention: "discarded",
  },
];

function oneOff(
  id: string,
  date: string,
  title: string,
  sourceId: string,
  startTime: string
): OneOffExternalAnchor {
  return {
    id,
    userId: "smoke-user",
    sourceId,
    confirmedAt: `${date}T00:00:00.000Z`,
    title,
    startTime,
    rigidity: "hard",
    anchorKind: "one_off",
    date,
  };
}

/** anchors: shift_image 勤務 + 同日 manual（multi-display）+ 別日 manual */
export const SMOKE_ANCHORS: ExternalAnchor[] = [
  // 6/10: shift_image 勤務（夜勤 → 月 chip N・取込）
  oneOff("smk-shift-0610", "2026-06-10", "夜勤", SHIFT_SOURCE_ID, "21:00"),
  // 6/10: 同日 manual 予定（面談・取込なし → multi-display で崩れ確認）
  oneOff("smk-manual-0610", "2026-06-10", "面談", MANUAL_SOURCE_ID, "14:00"),
  // 6/11: manual 勤務（歯医者・取込なし）
  oneOff("smk-manual-0611", "2026-06-11", "歯医者", MANUAL_SOURCE_ID, "10:00"),
];

function offIndicator(
  date: string,
  sourceType: DayIndicatorViewModel["sourceType"]
): DayIndicatorViewModel {
  return {
    date,
    variant: "off",
    label: "休み",
    isTentative: false,
    countsAsPublicHoliday: false,
    sourceType,
    rawCode: "BD",
  };
}

/** day_indicators: shift_image 休み（取込）+ manual 休み（取込なし） */
export const SMOKE_DAY_INDICATORS: ReadonlyMap<string, DayIndicatorViewModel> =
  new Map([
    ["2026-06-12", offIndicator("2026-06-12", "shift_image")],
    ["2026-06-13", offIndicator("2026-06-13", "manual")],
  ]);

/** importedShiftSourceIds（本番と同じ helper で導出） */
export const SMOKE_IMPORTED_SOURCE_IDS = shiftImageSourceIds(SMOKE_SOURCES);
