/**
 * DayIndicatorBadge — 休み/希望休 の day-level バッジ（SR #216 D3 / presentation）
 *
 * anchor（timeline event）とは別レイヤーの day-level metadata を小さなバッジで表示する。
 * H / BD / HREQ を潰さず区別:
 *   - public_holiday（H 公休）  → rose
 *   - off（BD 休み）            → slate（中立）
 *   - requested_off（HREQ 希望休）→ violet + dashed（控えめ・未確定 tone）
 *
 * 不変原則: 副作用なし・timeline event 化しない。amber/orange/red は使わない（feasibility 色と分離）。
 */

import type {
  DayIndicatorViewModel,
  DayIndicatorVariant,
} from "@/lib/plan/dayIndicatorView";

const VARIANT_CLASS: Record<DayIndicatorVariant, string> = {
  // 公休 = rose（CalendarTab の日曜と同系の確定休み tone）
  public_holiday: "bg-rose-50 text-rose-600 border-rose-200",
  // 休み = slate（中立）
  off: "bg-slate-100 text-slate-500 border-slate-200",
  // 希望休 = violet + dashed（控えめ・未確定）
  requested_off: "bg-violet-50 text-violet-500 border-violet-200 border-dashed",
};

export function DayIndicatorBadge({
  indicator,
}: {
  indicator: DayIndicatorViewModel;
}) {
  return (
    <span
      data-testid="plan-day-indicator-badge"
      data-variant={indicator.variant}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${VARIANT_CLASS[indicator.variant]}`}
      aria-label={
        indicator.isTentative ? `${indicator.label}（希望）` : indicator.label
      }
    >
      {indicator.label}
    </span>
  );
}
