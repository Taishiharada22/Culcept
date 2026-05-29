/**
 * Slice 1 — section ⑥ ワードローブ分析の stat 1 枚 (presentational pure、 compact)
 *
 * 縦積み: アイコン (上) + ラベル + 状態値 (tone で色分け) + 任意 caption。
 *   tone の色 class は STATUS_TONE_TEXT 経由 (caution=amber は palette に閉じる)。
 */

import type { CalendarOutfitStatVM } from "./types";
import { STATUS_TONE_TEXT } from "./_palette";

export function WardrobeStatCard({ stat }: { stat: CalendarOutfitStatVM }) {
  const tone = stat.tone ?? "neutral";
  return (
    <div
      className="flex w-[100px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-violet-100/60 bg-white/80 px-3 py-3.5 text-center"
      data-testid={`plan-calendar-outfit-stat-${stat.id}`}
    >
      {stat.icon && (
        <span className="text-2xl leading-none" aria-hidden="true">
          {stat.icon}
        </span>
      )}
      <span className="text-[11px] leading-tight text-slate-400">{stat.label}</span>
      <span className={`text-sm font-semibold leading-tight ${STATUS_TONE_TEXT[tone]}`}>
        {stat.value}
      </span>
      {stat.caption && <span className="text-[10px] leading-tight text-slate-300">{stat.caption}</span>}
    </div>
  );
}
