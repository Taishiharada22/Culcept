"use client";

/**
 * TodayFlowStrip — 今日の流れ（事実ベース。予測曲線は置かない）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.4
 *  - 予定ブロック・移動・余白の時間帯表示（TimelineSpine の 3 カラム構造を簡略転用:
 *    時刻 w-12 / spine w-10 / card flex-1）
 *  - 夜の余白帯はハイライト
 *  - 時刻 HH:MM は事実表示として可
 */

import type { AlterBatteryViewModel } from "@/lib/plan/dayState/dayStateTypes";

export interface TodayFlowStripProps {
  flowTimeline: AlterBatteryViewModel["flowTimeline"];
}

type FlowSegment = AlterBatteryViewModel["flowTimeline"]["segments"][number];

function segmentVisual(seg: FlowSegment): { dotClass: string; title: string; sub?: string } {
  if (seg.kind === "event") {
    return { dotClass: "bg-indigo-400", title: seg.label ?? "予定" };
  }
  if (seg.kind === "travel") {
    return { dotClass: "bg-slate-300", title: "移動" };
  }
  if (seg.isEveningSlack) {
    return { dotClass: "bg-teal-300", title: "余白", sub: "夜の余白" };
  }
  return { dotClass: "bg-slate-200", title: "余白" };
}

export function TodayFlowStrip({ flowTimeline }: TodayFlowStripProps) {
  const segments = flowTimeline.segments;

  return (
    <section aria-label="今日の流れ">
      <h3 className="px-1 text-sm font-bold text-slate-700">今日の流れ</h3>
      {segments.length === 0 ? (
        <p className="mt-2 rounded-2xl border border-slate-100 bg-white/60 px-3 py-3 text-xs text-slate-400">
          今日の予定はまだ入っていません
        </p>
      ) : (
        <div className="mt-2 rounded-2xl border border-white/90 bg-white/60 px-1 py-2 shadow-sm backdrop-blur-sm">
          {segments.map((seg, i) => {
            const v = segmentVisual(seg);
            const isHighlight = seg.kind === "gap" && seg.isEveningSlack === true;
            return (
              <div key={`${seg.startHHMM}-${i}`} className="flex items-stretch">
                {/* 時刻カラム（w-12・tabular-nums = TimelineSpine 規約） */}
                <div className="w-12 shrink-0 pt-1.5 text-right text-xs font-medium tabular-nums text-slate-500">
                  {seg.startHHMM}
                </div>
                {/* spine カラム（w-10） */}
                <div className="relative w-10 shrink-0">
                  <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-slate-200" />
                  <div
                    className={`absolute left-1/2 top-2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-white shadow-sm ${v.dotClass}`}
                  />
                </div>
                {/* 内容カラム（flex-1） */}
                <div className="min-w-0 flex-1 py-1 pr-2">
                  <div
                    className={`rounded-xl px-3 py-1.5 ${
                      isHighlight
                        ? "border border-teal-200/80 bg-teal-50/80"
                        : seg.kind === "event"
                          ? "border border-indigo-100 bg-white/80"
                          : "bg-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${seg.kind === "travel" || (seg.kind === "gap" && !isHighlight) ? "text-slate-400" : "text-slate-700"}`}>
                        {v.title}
                      </span>
                      {v.sub && (
                        <span className="rounded-full border border-teal-200 bg-white/80 px-1.5 py-px text-[9px] font-medium text-teal-600">
                          {v.sub}
                        </span>
                      )}
                      <span className="ml-auto text-[10px] tabular-nums text-slate-400">
                        {seg.startHHMM}–{seg.endHHMM}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
