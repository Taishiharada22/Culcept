"use client";

/**
 * TodayFlowStrip — 今日の流れ（v2: 横帯タイムバンド・事実ベース）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.4
 *  - 予測曲線は置かない。予定・移動・余白の時間帯を 06:00-24:00 の横帯に事実として配置（「簡略横帯」案）
 *  - 夜の余白帯はミントでハイライト
 *  - 時刻 HH:MM は事実表示として可。% / スコアは出さない
 */

import type { AlterBatteryViewModel } from "@/lib/plan/dayState/dayStateTypes";

export interface TodayFlowStripProps {
  flowTimeline: AlterBatteryViewModel["flowTimeline"];
}

const DAY_START_MIN = 6 * 60; // 06:00
const DAY_END_MIN = 24 * 60; // 24:00
const DAY_SPAN = DAY_END_MIN - DAY_START_MIN;
const HOUR_TICKS = ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00", "24:00"];

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function TodayFlowStrip({ flowTimeline }: TodayFlowStripProps) {
  const segments = flowTimeline.segments;

  return (
    <section
      aria-label="今日の流れ"
      className="rounded-3xl border border-white bg-gradient-to-b from-white to-indigo-50/30 p-3 shadow-[0_6px_18px_rgba(99,102,241,0.10)] backdrop-blur-sm"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-[12px] font-bold text-slate-700">今日の流れ</h3>
        <div className="ml-auto flex items-center gap-2 text-[8.5px] text-slate-400">
          <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-indigo-300" />予定</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-slate-300" />移動</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-teal-200" />夜の余白</span>
        </div>
      </div>

      {segments.length === 0 ? (
        <p className="mt-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-[10.5px] text-slate-400">
          今日の予定はまだ入っていません
        </p>
      ) : (
        <>
          {/* 横帯（事実のみ・予測曲線なし） */}
          <div className="relative mt-2.5 h-11 overflow-hidden rounded-xl border border-indigo-100/60 bg-gradient-to-b from-slate-100/80 to-indigo-50/60 shadow-inner">
            {segments.map((seg, i) => {
              const start = Math.max(toMin(seg.startHHMM), DAY_START_MIN);
              const end = Math.min(toMin(seg.endHHMM), DAY_END_MIN);
              if (end <= start) return null;
              const left = ((start - DAY_START_MIN) / DAY_SPAN) * 100;
              const width = ((end - start) / DAY_SPAN) * 100;
              const isSlack = seg.kind === "gap" && seg.isEveningSlack === true;
              const cls =
                seg.kind === "event"
                  ? "bg-gradient-to-b from-indigo-300 to-indigo-400/90"
                  : seg.kind === "travel"
                    ? "bg-slate-300/90"
                    : isSlack
                      ? "bg-gradient-to-b from-teal-200 to-teal-300/80"
                      : "bg-transparent";
              if (seg.kind === "gap" && !isSlack) return null;
              return (
                <div
                  key={`${seg.startHHMM}-${i}`}
                  className={`absolute bottom-1 top-1 rounded-lg ${cls}`}
                  style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%` }}
                  title={`${seg.startHHMM}–${seg.endHHMM}`}
                >
                  {seg.kind === "event" && width > 9 && (
                    <span className="absolute inset-x-1 top-1/2 -translate-y-1/2 truncate text-center text-[8.5px] font-semibold text-white">
                      {seg.label ?? "予定"}
                    </span>
                  )}
                  {isSlack && width > 10 && (
                    <span className="absolute inset-x-1 top-1/2 -translate-y-1/2 truncate text-center text-[8.5px] font-semibold text-teal-700">
                      夜の余白
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* 時刻軸（事実の時刻のみ） */}
          <div className="mt-1 flex justify-between text-[8px] tabular-nums text-slate-400">
            {HOUR_TICKS.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>

          {/* 帯の下に各区間の事実注記（時刻つき） */}
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {segments.map((seg, i) => {
              const isSlack = seg.kind === "gap" && seg.isEveningSlack === true;
              if (seg.kind === "gap" && !isSlack) return null;
              return (
                <span key={`n-${seg.startHHMM}-${i}`} className="text-[8.5px] tabular-nums text-slate-400">
                  <span className={isSlack ? "text-teal-500" : seg.kind === "event" ? "text-indigo-400" : "text-slate-400"}>●</span>{" "}
                  {seg.startHHMM}–{seg.endHHMM} {seg.kind === "event" ? (seg.label ?? "予定") : seg.kind === "travel" ? "移動" : "夜の余白"}
                </span>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
