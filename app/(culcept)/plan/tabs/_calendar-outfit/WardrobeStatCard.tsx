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
  // 独立した小カード。 アイコン左 + 右に「カテゴリ名 / 状態」の 2 段縦積み。
  // hover / focus(click) でアイコンが少し拡大し、 補足（状態 + 点数）をツールチップ表示。
  const desc = stat.caption ? `${stat.label} ${stat.value}・${stat.caption}` : `${stat.label} ${stat.value}`;
  return (
    <div
      className="group relative flex cursor-default items-center gap-1.5 rounded-xl border border-violet-100/60 bg-white/80 px-2.5 py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
      tabIndex={0}
      data-testid={`plan-calendar-outfit-stat-${stat.id}`}
    >
      <span className="shrink-0 transition-transform duration-150 group-hover:scale-110 group-focus-within:scale-110">
        {svgIcon ? (
          <CalIcon name={svgIcon} size={18} className={STATUS_TONE_TEXT[tone]} />
        ) : stat.icon ? (
          <span className="text-base leading-none" aria-hidden="true">
            {stat.icon}
          </span>
        ) : null}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[10px] text-slate-400">{stat.label}</p>
        <p className={`truncate text-[11px] font-semibold ${STATUS_TONE_TEXT[tone]}`}>{stat.value}</p>
      </div>
      <span className="pointer-events-none absolute -top-8 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-[10px] font-medium text-white shadow-md group-hover:block group-focus-within:block">
        {desc}
      </span>
    </div>
  );
}
