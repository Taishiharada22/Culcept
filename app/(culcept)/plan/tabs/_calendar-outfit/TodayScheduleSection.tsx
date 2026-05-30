/**
 * Slice 1 — section ③ 「今日の予定」 (実 anchors から runtime 生成)
 *
 * CEO Slice 1 DO: 「実 anchors から TodayScheduleSection 用の予定カード生成」。
 *   - mock ではなく **実 ExternalAnchor** を、 既存 pure helper で当日分に絞って描画する。
 *   - 使用 helper: anchorsForDay / formatTime / categoryOf / CATEGORY_META (../_helpers)、
 *     formatLocationDisplayParts。 いずれも pure。 engine / network / DB には触れない。
 *   - 予定は 1 枚の白カード内に横並び連結ブロックで表示。 無い日は静かな空状態 (煽らない)。
 *   - 右肩リンク「タイムラインで確認」で既存タイムライン (退避済み) を開く。
 */

import { Fragment } from "react";

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { formatLocationDisplayParts } from "@/lib/plan/anchor-detail-format";

import { anchorsForDay, categoryOf, CATEGORY_META, formatTime, isoDate, utcMidnight } from "../_helpers";
import type { CalendarOutfitScheduleItemVM } from "./types";
import { CAL_OUTFIT_PALETTE } from "./_palette";
import { SectionHeader } from "./SectionHeader";
import { TodayScheduleCard } from "./TodayScheduleCard";

function toScheduleItems(
  anchors: ExternalAnchor[],
  dayObj: Date,
): CalendarOutfitScheduleItemVM[] {
  return anchorsForDay(anchors, dayObj).map((anchor) => {
    const { primary, fullLabel } = formatLocationDisplayParts(anchor);
    return {
      id: anchor.id,
      time: formatTime(anchor.startTime),
      title: anchor.title,
      icon: CATEGORY_META[categoryOf(anchor)].emoji,
      ...(primary ? { location: primary } : {}),
      ...(fullLabel ? { locationFull: fullLabel } : {}),
      rigid: anchor.rigidity === "hard",
    };
  });
}

/** 「前 / 今 / 次」の中央 index を決める（当日は直近に開始した予定を中央、 当日以外は先頭付近）。 */
function centerIndex(items: CalendarOutfitScheduleItemVM[], now: Date, isToday: boolean): number {
  if (items.length === 0) return 0;
  if (!isToday) return Math.min(1, items.length - 1);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = (t: string): number => {
    const m = /(\d{1,2}):(\d{2})/.exec(t);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  };
  const started = items.filter((it) => startMin(it.time) <= nowMin).length;
  return started === 0 ? 0 : Math.min(started - 1, items.length - 1);
}

export function TodayScheduleSection({
  anchors,
  dayObj,
  now,
  onOpenTimeline,
}: {
  anchors: ExternalAnchor[];
  dayObj: Date;
  now: Date;
  onOpenTimeline?: () => void;
}) {
  const items = toScheduleItems(anchors, dayObj);
  const showTimelineLink = items.length > 0 && onOpenTimeline !== undefined;
  const isToday = isoDate(utcMidnight(now)) === isoDate(dayObj);
  const center = centerIndex(items, now, isToday);
  // 前 / 今 / 次 の 3 スロット（横スクロールではなく 1 枠に固定）。 不在は空スロット。
  const slots: Array<CalendarOutfitScheduleItemVM | null> = [
    items[center - 1] ?? null,
    items[center] ?? null,
    items[center + 1] ?? null,
  ];

  return (
    <section data-testid="plan-calendar-outfit-schedule-section">
      <SectionHeader
        title="今日の予定"
        {...(showTimelineLink
          ? { action: { label: "タイムラインで確認", onClick: onOpenTimeline } }
          : items.length > 0
          ? { hint: `${items.length} 件` }
          : {})}
      />
      {items.length === 0 ? (
        <div
          className={`${CAL_OUTFIT_PALETTE.cardSoft} flex flex-col items-center gap-1.5 px-5 py-5 text-center`}
          data-testid="plan-calendar-outfit-schedule-empty"
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100/70 text-lg"
            aria-hidden="true"
          >
            🗓️
          </span>
          <p className={`text-[13px] font-medium ${CAL_OUTFIT_PALETTE.heading}`}>
            この日の予定はまだありません
          </p>
          <p className={`max-w-[15rem] text-[11px] leading-relaxed ${CAL_OUTFIT_PALETTE.subtle}`}>
            予定を入れると、時間帯・場所・移動量に合わせて装いを提案します
          </p>
        </div>
      ) : (
        // 角張った枠（rounded-xl）。 前 / 今 / 次 を均等幅で固定し、 間に「・ー」連結を入れる（横スクロール無し）。
        <div className="rounded-xl border border-violet-100/70 bg-white/85 p-3 shadow-[0_4px_20px_-8px_rgba(91,33,182,0.15)]">
          <div className="flex items-center">
            {slots.map((item, i) => (
              <Fragment key={item?.id ?? `empty-${i}`}>
                {i > 0 && (
                  <span className="flex shrink-0 items-center gap-0.5 px-1" aria-hidden="true">
                    <span className="h-1 w-1 rounded-full bg-violet-200" />
                    <span className="h-px w-4 bg-violet-200" />
                  </span>
                )}
                <div className={`min-w-0 flex-1 ${i === 1 ? "" : "opacity-60"}`}>
                  {item ? <TodayScheduleCard item={item} /> : <div className="h-10" aria-hidden="true" />}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
