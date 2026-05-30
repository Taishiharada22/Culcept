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
  // 理由カードと同一構造: アイコン左 + 右に「カテゴリ名 / 状態」の 2 段縦積み（囲み無し）。
  return (
    <div className="flex items-center gap-1.5" data-testid={`plan-calendar-outfit-stat-${stat.id}`}>
      {svgIcon ? (
        <CalIcon name={svgIcon} size={18} className={`shrink-0 ${STATUS_TONE_TEXT[tone]}`} />
      ) : stat.icon ? (
        <span className="shrink-0 text-base leading-none" aria-hidden="true">
          {stat.icon}
        </span>
      ) : null}
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[10px] text-slate-400">{stat.label}</p>
        <p className={`truncate text-[11px] font-semibold ${STATUS_TONE_TEXT[tone]}`}>{stat.value}</p>
      </div>
    </div>
  );
}
