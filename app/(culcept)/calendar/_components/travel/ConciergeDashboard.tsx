// app/(culcept)/calendar/_components/travel/ConciergeDashboard.tsx
// ① travel.png — Concierge Dashboard（旅の1日の大元。各詳細はここから派生）。
"use client";

import * as React from "react";
import type { TravelScreenProps } from "./screenProps";
import { PhotoSlot } from "./PhotoSlot";
import { RouteMapPreview } from "./RouteMapPreview";
import {
  T,
  ConciergeCard,
  SectionLabel,
  ProgressBar,
  WeatherGlyph,
  ReservationCategoryIcon,
} from "./concierge/primitives";
import { Bell, ChevronLeft, ChevronRight, Crest, Pencil, TransportIcon } from "./concierge/icons";
import { useMergedSchedule } from "./state/ItineraryContext";

const STEP_GOAL = 10000; // 標準的な1日の目標歩数（honest な基準値）

export default function ConciergeDashboard({ trip, day, onNavigate, onClose, onOpenMap, onToast }: TravelScreenProps) {
  const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
  const featuredMeal = day.meal.alternatives[0] ?? null;
  const schedule = useMergedSchedule(day);
  const previewSchedule = schedule.slice(0, 6); // preview は最大6件（追加で肥大化させない）
  const extraCount = schedule.length - previewSchedule.length;
  const walkPct = Math.min(100, (day.walking.steps / STEP_GOAL) * 100);

  return (
    <div className="min-h-full">
      {/* トップバー（trip タイトル＋通知） */}
      <div
        className="sticky top-0 z-20 flex items-center gap-1 px-3 py-3"
        style={{ background: `${T.bg}f0`, backdropFilter: "blur(8px)", borderBottom: `1px solid ${T.borderSoft}` }}
      >
        <button onClick={onClose} aria-label="閉じる" className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-black/[0.04] active:scale-90" style={{ color: T.ink2 }}>
          <ChevronLeft size={22} />
        </button>
        <div className="font-serif text-[17px]" style={{ color: T.ink, fontWeight: 600 }}>
          {trip.title}
        </div>
        <div className="ml-auto">
          <button onClick={() => onToast("通知はまだありません")} aria-label="通知" className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-black/[0.04] active:scale-90" style={{ color: T.ink2 }}>
            <Bell size={20} />
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 pb-6 pt-3">
        {/* HERO */}
        <div className="relative">
          <PhotoSlot photo={day.heroPhoto} className="h-44 w-full" rounded="rounded-[22px]" />
          {day.heroPhoto && (
            <div
              className="pointer-events-none absolute inset-0 rounded-[22px]"
              style={{ background: "linear-gradient(180deg, rgba(40,28,12,0.04) 35%, rgba(40,28,12,0.62) 100%)" }}
            />
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4" style={{ color: "#fdf8ee" }}>
            <div>
              <div className="font-serif text-[40px] leading-none" style={{ fontWeight: 600 }}>
                {day.dayIndex}日目
              </div>
              <div className="mt-1 text-[14px] opacity-95">
                {day.monthDayLabel} ({day.weekdayLabel})
              </div>
            </div>
            <div className="text-right text-[12px] leading-tight opacity-95">
              <div className="flex items-center justify-end gap-1">
                <WeatherGlyph icon={day.weather.icon} size={15} /> {day.weather.current}°C
              </div>
              <div className="mt-0.5">
                最高 {day.weather.tempMax}°C / 最低 {day.weather.tempMin}°C
              </div>
            </div>
          </div>
        </div>

        {/* THEME */}
        <ConciergeCard interactive onClick={() => onNavigate("schedule")} ariaLabel="テーマと旅程を見る" className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ color: T.gold, background: T.goldBg }}>
            <Crest size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: T.ink3 }}>
              Theme
            </div>
            <div className="truncate font-serif text-[15px]" style={{ color: T.ink, fontWeight: 600 }}>
              {day.theme}
            </div>
          </div>
          <ChevronRight size={18} style={{ color: T.ink3 }} />
        </ConciergeCard>

        {/* 2カラム：SCHEDULE / RESERVATIONS + ROUTE MAP */}
        <div className="grid grid-cols-2 gap-3">
          {/* 左：SCHEDULE */}
          <ConciergeCard className="p-3">
            <SectionLabel en="Schedule" className="mb-2" />
            <ol className="relative space-y-2.5">
              <span className="absolute left-[33px] top-1 bottom-1 w-px" style={{ background: T.line }} aria-hidden />
              {previewSchedule.map((it) => (
                <li key={it.id} className="relative flex gap-2">
                  <div className="w-7 shrink-0 pt-0.5 text-[10px] font-semibold tabular-nums" style={{ color: T.ink2 }}>
                    {it.startTime}
                  </div>
                  <span className="relative z-10 mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: T.gold, boxShadow: `0 0 0 2px ${T.card}` }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold" style={{ color: T.ink }}>
                      {it.name}
                    </div>
                    {it.subtitle && (
                      <div className="truncate text-[10px]" style={{ color: T.ink3 }}>
                        {it.subtitle}
                      </div>
                    )}
                  </div>
                  {it.photo !== undefined && (
                    <PhotoSlot photo={it.photo} className="h-9 w-9" rounded="rounded-lg" />
                  )}
                </li>
              ))}
            </ol>
            <button
              onClick={() => onNavigate("schedule")}
              className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border py-2 text-[11px] font-medium"
              style={{ borderColor: T.border, color: T.ink2, background: T.cardAlt }}
            >
              {day.dayIndex}日目の詳細を見る{extraCount > 0 ? `（他${extraCount}件）` : ""} <ChevronRight size={13} />
            </button>
          </ConciergeCard>

          {/* 右：RESERVATIONS + ROUTE MAP */}
          <div className="space-y-3">
            <ConciergeCard className="p-3">
              <SectionLabel en="Your Reservations" className="mb-2" />
              <div className="space-y-2">
                {day.reservations.slice(0, 3).map((r) => (
                  <div key={r.id} className="flex items-start gap-1.5">
                    <span className="mt-0.5" style={{ color: T.gold }}>
                      <ReservationCategoryIcon category={r.category} size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-semibold" style={{ color: T.ink }}>
                        {r.name}
                      </div>
                      <div className="truncate text-[10px]" style={{ color: T.ink3 }}>
                        {r.timeLabel ?? r.transitDepart ?? ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => onNavigate("reservations")}
                className="mt-2.5 flex w-full items-center justify-center gap-1 text-[10px] font-medium"
                style={{ color: T.goldDeep }}
              >
                すべての予約を確認 <ChevronRight size={12} />
              </button>
            </ConciergeCard>

            <ConciergeCard className="p-3">
              <SectionLabel en="Route Map" className="mb-2" />
              <RouteMapPreview stops={day.routeStops} height={104} onOpen={() => onOpenMap()} />
            </ConciergeCard>
          </div>
        </div>

        {/* 3カード：MEAL / WALKING / BUDGET */}
        <div className="grid grid-cols-3 gap-3">
          {/* MEAL */}
          <ConciergeCard className="flex flex-col p-3">
            <SectionLabel en="Meal" className="mb-2" />
            <PhotoSlot photo={featuredMeal?.photo ?? null} className="mb-2 h-12 w-full" rounded="rounded-lg" />
            <div className="truncate text-[11px] font-semibold" style={{ color: T.ink }}>
              {featuredMeal?.name ?? "—"}
            </div>
            <div className="truncate text-[9px]" style={{ color: T.ink3 }}>
              {featuredMeal?.category ?? ""}
            </div>
            <button onClick={() => onNavigate("meal")} className="mt-auto flex items-center gap-0.5 pt-2 text-[9px] font-medium" style={{ color: T.goldDeep }}>
              他のおすすめ <ChevronRight size={11} />
            </button>
          </ConciergeCard>

          {/* WALKING */}
          <ConciergeCard className="flex flex-col p-3">
            <SectionLabel en="Walking" className="mb-2" />
            <div className="flex items-center gap-1" style={{ color: T.goldDeep }}>
              <TransportIcon mode="walk" size={22} />
            </div>
            <div className="mt-1 font-serif text-[20px] leading-none" style={{ color: T.ink, fontWeight: 600 }}>
              {day.walking.steps.toLocaleString("ja-JP")}
              <span className="ml-0.5 text-[10px] font-sans" style={{ color: T.ink3 }}>歩</span>
            </div>
            <div className="mt-0.5 text-[9px]" style={{ color: T.ink3 }}>
              約 {day.walking.distanceKm} km
            </div>
            <ProgressBar pct={walkPct} height={5} className="mt-2" />
            <button onClick={() => onNavigate("move")} className="mt-auto flex items-center gap-0.5 pt-2 text-[9px] font-medium" style={{ color: T.goldDeep }}>
              移動詳細 <ChevronRight size={11} />
            </button>
          </ConciergeCard>

          {/* BUDGET */}
          <ConciergeCard className="flex flex-col p-3">
            <SectionLabel en="Budget" className="mb-2" />
            <dl className="space-y-0.5 text-[9px]" style={{ color: T.ink2 }}>
              <div className="flex justify-between">
                <dt>本日の予算</dt>
                <dd className="font-semibold tabular-nums" style={{ color: T.ink }}>{yen(day.budget.todayBudget)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>使用額</dt>
                <dd className="tabular-nums">{yen(day.budget.todaySpend)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>残り</dt>
                <dd className="font-semibold tabular-nums" style={{ color: T.goldDeep }}>{yen(day.budget.todayRemaining)}</dd>
              </div>
            </dl>
            <ProgressBar pct={(day.budget.todaySpend / day.budget.todayBudget) * 100} height={5} className="mt-2" />
            <button onClick={() => onNavigate("budget")} className="mt-auto flex items-center gap-0.5 pt-2 text-[9px] font-medium" style={{ color: T.goldDeep }}>
              全体の予算 <ChevronRight size={11} />
            </button>
          </ConciergeCard>
        </div>

        {/* MEMORIES NOTE */}
        <ConciergeCard className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5" style={{ color: T.ink2 }}>
              <Pencil size={13} />
              <SectionLabel en="Memories Note" />
            </div>
            <button onClick={() => onToast("メモの編集は接続後に対応します")} className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium transition hover:bg-black/[0.04] active:scale-95" style={{ color: T.goldDeep }}>
              <Pencil size={12} /> 編集する
            </button>
          </div>
          <div className="flex gap-3">
            <PhotoSlot photo={day.memories.photo} className="h-14 w-14 shrink-0" rounded="rounded-xl" />
            <p className="text-[12px] leading-relaxed" style={{ color: T.ink2 }}>
              {day.memories.text}
            </p>
          </div>
        </ConciergeCard>
      </div>
    </div>
  );
}
