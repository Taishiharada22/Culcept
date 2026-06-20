// app/(culcept)/calendar/_components/travel/ScheduleDetailScreen.tsx
// ④ detail.png — 1日目の詳細（hero に DAY バッジ＋テーマ overlay、タイムラインカード＋交通コネクタ）。
"use client";

import * as React from "react";
import type { TravelScreenProps } from "./screenProps";
import { PhotoSlot } from "./PhotoSlot";
import {
  T,
  ConciergeCard,
  ConciergeHeader,
  CategoryChip,
  DurationBadge,
  WeatherGlyph,
} from "./concierge/primitives";
import { Bookmark, Share, Crest, ChevronDown, Lightbulb, TransportIcon } from "./concierge/icons";

export default function ScheduleDetailScreen({ day, onClose }: TravelScreenProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="min-h-full">
      <ConciergeHeader
        title={`${day.dayIndex}日目の詳細`}
        sansTitle
        onBack={onClose}
        right={
          <>
            <button aria-label="保存" className="flex h-9 w-9 items-center justify-center"><Bookmark size={18} /></button>
            <button aria-label="共有" className="flex h-9 w-9 items-center justify-center"><Share size={18} /></button>
          </>
        }
      />

      <div className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 pb-6 pt-3">
        {/* HERO（DAY バッジ＋テーマ） */}
        <div className="relative">
          <PhotoSlot photo={day.heroPhoto} className="h-52 w-full" rounded="rounded-[22px]" />
          {day.heroPhoto && (
            <div className="pointer-events-none absolute inset-0 rounded-[22px]" style={{ background: "linear-gradient(180deg, rgba(40,28,12,0.10) 0%, rgba(40,28,12,0.66) 100%)" }} />
          )}
          <div className="absolute inset-0 flex flex-col justify-between p-4" style={{ color: "#fdf8ee" }}>
            <div className="flex items-start justify-between">
              <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wider" style={{ background: "rgba(0,0,0,0.35)" }}>
                DAY {day.dayIndex}
              </span>
              <div className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px]" style={{ background: "rgba(0,0,0,0.3)" }}>
                <WeatherGlyph icon={day.weather.icon} size={13} /> {day.weather.current}°C / {day.weather.tempMax}°C
              </div>
            </div>
            <div>
              <div className="text-[13px] opacity-95">{day.monthDayLabel} ({day.weekdayLabel})</div>
              <h2 className="mt-1 font-serif text-[22px] leading-snug" style={{ fontWeight: 600 }}>
                {day.theme}
              </h2>
              {day.themeSubtitle && <p className="mt-1 text-[12px] opacity-90">{day.themeSubtitle}</p>}
            </div>
          </div>
        </div>

        {/* THEME ピル */}
        <ConciergeCard className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ color: T.gold, background: T.goldBg }}>
            <Crest size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: T.ink3 }}>Theme</div>
            <div className="truncate font-serif text-[15px]" style={{ color: T.ink, fontWeight: 600 }}>{day.theme}</div>
          </div>
        </ConciergeCard>

        {/* タイムライン */}
        <ol>
          {day.schedule.map((it, idx) => {
            const isOpen = expanded.has(it.id);
            const last = idx === day.schedule.length - 1;
            return (
              <li key={it.id} className="flex gap-2">
                {/* 時刻 */}
                <div className="w-11 shrink-0 pt-2 text-right text-[12px] font-semibold tabular-nums" style={{ color: T.ink2 }}>
                  {it.startTime}
                </div>
                {/* コネクタ */}
                <div className="relative flex w-4 shrink-0 flex-col items-center">
                  <span className="z-10 mt-2.5 h-2.5 w-2.5 rounded-full" style={{ background: T.gold, boxShadow: `0 0 0 2px ${T.card}` }} />
                  {!last && <span className="absolute top-3 bottom-0 w-px" style={{ background: T.line }} />}
                </div>
                {/* 内容 */}
                <div className="min-w-0 flex-1 pb-3">
                  <ConciergeCard className="flex gap-3 p-3">
                    <PhotoSlot photo={it.photo} className="h-16 w-16 shrink-0" rounded="rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <div className="font-serif text-[15px] leading-tight" style={{ color: T.ink, fontWeight: 600 }}>
                        {it.name}
                      </div>
                      {it.description && (
                        <p className="mt-1 text-[11px] leading-relaxed" style={{ color: T.ink2 }}>
                          {it.description}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {it.categories.map((c) => (
                          <CategoryChip key={c}>{c}</CategoryChip>
                        ))}
                      </div>
                    </div>
                    {typeof it.durationMin === "number" && <DurationBadge minutes={it.durationMin} />}
                  </ConciergeCard>

                  {/* 交通コネクタ行 */}
                  {it.transportToNext && (
                    <div className="mt-2">
                      <button
                        onClick={() => toggle(it.id)}
                        className="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-medium"
                        style={{ borderColor: T.borderSoft, background: T.cardAlt, color: T.ink2 }}
                      >
                        <span style={{ color: T.goldDeep }}>
                          <TransportIcon mode={it.transportToNext.mode} size={15} />
                        </span>
                        {it.transportToNext.label}
                        <ChevronDown
                          size={14}
                          className="ml-auto transition-transform"
                          style={{ transform: isOpen ? "rotate(180deg)" : undefined }}
                        />
                      </button>
                      {isOpen && (
                        <div className="mt-1 flex gap-4 rounded-lg px-3 py-2 text-[11px]" style={{ background: T.cardSunk, color: T.ink2 }}>
                          {it.transportToNext.distanceText && <span>距離 {it.transportToNext.distanceText}</span>}
                          <span>運賃 {it.transportToNext.fareText ?? "—"}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {/* コンシェルジュのひとこと（情報カード・遷移なし） */}
        <ConciergeCard className="flex items-center gap-3 p-4" style={{ background: T.cardAlt }}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ color: T.gold, background: T.goldBg }}>
            <Lightbulb size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: T.ink3 }}>
              HIRAMATSU コンシェルジュのひとこと
            </div>
            <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: T.ink2 }}>
              清水寺の朝は比較的空いていておすすめです。澄んだ空気と静けさの中で、より深い京都の魅力を感じられます。
            </p>
          </div>
        </ConciergeCard>
      </div>
    </div>
  );
}
