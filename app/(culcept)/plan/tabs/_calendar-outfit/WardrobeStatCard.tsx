/**
 * Slice 1 — section ⑥ ワードローブ分析の stat 1 枚 (presentational pure、 compact)
 *
 * 縦積み: アイコン (上) + ラベル + 状態値 (tone で色分け) + 任意 caption。
 *   tone の色 class は STATUS_TONE_TEXT 経由 (caution=amber は palette に閉じる)。
 */

import type { CalendarOutfitStatVM } from "./types";
import { STATUS_TONE_TEXT } from "./_palette";
import { CalIcon, WARDROBE_ICON } from "./icons";

export function WardrobeStatCard({ stat }: { stat: CalendarOutfitStatVM }) {
  const tone = stat.tone ?? "neutral";
  const svgIcon = WARDROBE_ICON[stat.id];
  return (
    <div
      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-violet-100/60 bg-white/80 px-3 py-2"
      data-testid={`plan-calendar-outfit-stat-${stat.id}`}
    >
      {svgIcon ? (
        <CalIcon name={svgIcon} size={15} className={STATUS_TONE_TEXT[tone]} />
      ) : stat.icon ? (
        <span className="text-base leading-none" aria-hidden="true">
          {stat.icon}
        </span>
      ) : null}
      <span className="text-xs leading-tight text-slate-500">{stat.label}</span>
      <span className={`text-xs font-semibold leading-tight ${STATUS_TONE_TEXT[tone]}`}>
        {stat.value}
      </span>
    </div>
  );
}
