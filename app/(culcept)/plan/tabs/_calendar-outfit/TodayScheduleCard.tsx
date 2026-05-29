/**
 * Slice 1 — section ③ 「今日の予定」 の 1 ブロック (presentational pure)
 *
 * 実 anchors から導出された CalendarOutfitScheduleItemVM を、横並びの連結ブロックとして描く。
 *   - 上: 時刻 / 中: カテゴリアイコン円 (前後を細線で連結) / 下: タイトル + 場所。
 *   - 固定予定は控えめバッジ。 警告色は使わない (= 中立 slate / violet)。
 *   - isFirst / isLast で左右コネクタの有無を制御。
 */

import type { CalendarOutfitScheduleItemVM } from "./types";

export function TodayScheduleCard({
  item,
  isFirst,
  isLast,
}: {
  item: CalendarOutfitScheduleItemVM;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div
      className="flex min-w-[84px] flex-1 flex-col items-center"
      data-testid={`plan-calendar-outfit-schedule-${item.id}`}
    >
      <span className="font-mono text-[11px] font-medium text-violet-600">{item.time}</span>

      {/* アイコン円 + 前後コネクタ */}
      <div className="relative mt-1 flex w-full items-center justify-center">
        {!isFirst && (
          <span
            className="absolute left-0 top-1/2 h-px w-1/2 -translate-y-1/2 bg-violet-200"
            aria-hidden="true"
          />
        )}
        {!isLast && (
          <span
            className="absolute right-0 top-1/2 h-px w-1/2 -translate-y-1/2 bg-violet-200"
            aria-hidden="true"
          />
        )}
        <span
          className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-violet-100 bg-violet-50 text-base"
          aria-hidden="true"
        >
          {item.icon}
        </span>
      </div>

      <div className="mt-1 flex flex-col items-center px-0.5 text-center">
        <span className="line-clamp-2 text-[11px] font-medium text-slate-700">{item.title}</span>
        {item.location && (
          <span className="mt-0.5 max-w-[80px] truncate text-[10px] text-slate-400" title={item.locationFull}>
            {item.location}
          </span>
        )}
        {item.rigid && (
          <span className="mt-0.5 rounded-full bg-slate-100 px-1.5 py-px text-[9px] text-slate-500">
            固定
          </span>
        )}
      </div>
    </div>
  );
}
