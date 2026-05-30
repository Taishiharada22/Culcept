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
}: {
  item: CalendarOutfitScheduleItemVM;
}) {
  // 理想画像準拠: アイコン左 + 右に「時刻 / 予定名 / 要約(場所)」を縦に詰める（横並び・低い高さ）。
  return (
    <div
      className="flex w-full items-center gap-1.5"
      data-testid={`plan-calendar-outfit-schedule-${item.id}`}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-violet-100 bg-violet-50 text-sm"
        aria-hidden="true"
      >
        {item.icon}
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-medium leading-tight text-violet-600">{item.time}</p>
        <p className="truncate text-[12px] font-medium leading-tight text-slate-700">{item.title}</p>
        {item.location && (
          <p
            className="truncate text-[10px] leading-tight text-slate-400"
            title={item.locationFull}
          >
            {item.location}
          </p>
        )}
      </div>
    </div>
  );
}
