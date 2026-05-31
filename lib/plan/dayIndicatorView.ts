/**
 * 休み/希望休 day-level indicator の view 変換（pure / no React）— SR #216 D2
 *
 * PlanDayIndicator（DB 由来 domain）を /plan 描画用 view model に写す。
 * **H / BD / HREQ を潰さず区別**するのが要件（CEO/GPT 2026-05-31）:
 *   - H    = 公休（off, countsAsPublicHoliday=true）  → public_holiday
 *   - BD   = 休み / blank day（off, counts=false）      → off
 *   - HREQ = 希望休（off_request）                      → requested_off（控えめ tone）
 *
 * 不変原則:
 *   - anchor（timeline event）とは別レイヤー。day-level metadata に徹する（時間枠を持たない）。
 *   - 副作用なし・throw しない。manual / shift_image は表示同一（sourceType は保持）。
 */

import type { PlanDayIndicator } from "./planDayIndicatorReader";

/** 休みの種別（描画 tone を決める）。 */
export type DayIndicatorVariant = "public_holiday" | "off" | "requested_off";

export interface DayIndicatorViewModel {
  /** YYYY-MM-DD */
  date: string;
  /** 公休 / 休み / 希望休 を分ける種別 */
  variant: DayIndicatorVariant;
  /** 表示ラベル（record の label を尊重。空なら variant 既定） */
  label: string;
  /** 希望休（off_request）= true → 控えめ・未確定 tone */
  isTentative: boolean;
  /** 公休カウント対象か（月の公休数監査・表示補助） */
  countsAsPublicHoliday: boolean;
  /** 由来（MVP 表示は同一、provenance 保持） */
  sourceType: "manual" | "shift_image";
}

const DEFAULT_LABEL: Record<DayIndicatorVariant, string> = {
  public_holiday: "公休",
  off: "休み",
  requested_off: "希望休",
};

/** PlanDayIndicator → variant（H=公休 / BD=休み / HREQ=希望休）。 */
export function toDayIndicatorVariant(
  ind: PlanDayIndicator
): DayIndicatorVariant {
  if (ind.kind === "off_request") return "requested_off"; // HREQ
  return ind.countsAsPublicHoliday ? "public_holiday" : "off"; // H : BD
}

/** PlanDayIndicator → view model（H/BD/HREQ を区別）。 */
export function toDayIndicatorViewModel(
  ind: PlanDayIndicator
): DayIndicatorViewModel {
  const variant = toDayIndicatorVariant(ind);
  const label = ind.label.trim() !== "" ? ind.label : DEFAULT_LABEL[variant];
  return {
    date: ind.date,
    variant,
    label,
    isTentative: variant === "requested_off",
    countsAsPublicHoliday: ind.countsAsPublicHoliday,
    sourceType: ind.sourceType,
  };
}

/**
 * date → DayIndicatorViewModel の Map（1 日 1 印 = DB の UNIQUE(user_id,date)）。
 * 万一の同日重複は last-wins（DB 制約で通常発生しない）。
 */
export function dayIndicatorsByDate(
  indicators: PlanDayIndicator[]
): Map<string, DayIndicatorViewModel> {
  const out = new Map<string, DayIndicatorViewModel>();
  for (const ind of indicators) {
    out.set(ind.date, toDayIndicatorViewModel(ind));
  }
  return out;
}
