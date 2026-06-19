// app/(culcept)/calendar/_components/travel/BudgetSnapshotScreen.tsx
// ⑤ budget.png — Budget Snapshot（TODAY / TRIP OVERVIEW / ドーナツ CATEGORY / DAY vs TRIP 棒 / CONCIERGE FORECAST）。
"use client";

import * as React from "react";
import type { TravelScreenProps } from "./screenProps";
import type { BudgetDonutCategory } from "../../_lib/travel/types";
import {
  T,
  ConciergeCard,
  ConciergeHeader,
  SectionLabel,
  ProgressBar,
} from "./concierge/primitives";
import { ChevronDown, ChevronRight, Crest, Leaf, Lightbulb, BedIcon, ForkKnife, TransportIcon, Sparkle, Camera2 } from "./concierge/icons";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const DONUT_TONES = ["#8a7038", "#a17f44", "#b2935a", "#c2a673", "#d1b98d", "#dccba6"];

function catIcon(key: string, size = 15) {
  switch (key) {
    case "accommodation":
      return <BedIcon size={size} />;
    case "food":
      return <ForkKnife size={size} />;
    case "transport":
      return <TransportIcon mode="bus" size={size} />;
    case "experiences":
      return <Crest size={size} />;
    case "shopping":
      return <Camera2 size={size} />;
    default:
      return <Sparkle size={size} />;
  }
}

function Donut({ segments, usagePct }: { segments: BudgetDonutCategory[]; usagePct: number }) {
  const C = 2 * Math.PI * 40;
  let offset = 0;
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" stroke={T.cardSunk} strokeWidth="11" />
        {segments.map((s, i) => {
          const len = (s.pct / 100) * C;
          const el = (
            <circle
              key={s.key}
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={DONUT_TONES[i % DONUT_TONES.length]}
              strokeWidth="11"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Crest size={16} className="opacity-60" style={{ color: T.gold }} />
        <span className="mt-0.5 text-[9px]" style={{ color: T.ink3 }}>使用率</span>
        <span className="font-serif text-[18px]" style={{ color: T.ink, fontWeight: 600 }}>{usagePct}%</span>
      </div>
    </div>
  );
}

export default function BudgetSnapshotScreen({ trip, day, onClose }: TravelScreenProps) {
  const b = day.budget;
  const maxDay = Math.max(...b.dayComparison.map((d) => d.amount), 1);

  return (
    <div className="min-h-full">
      <ConciergeHeader
        title="Budget Snapshot"
        latinTitle
        subLabel="予算管理"
        onBack={onClose}
        right={
          <span className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium" style={{ borderColor: T.border, background: T.cardAlt, color: T.ink2 }}>
            {trip.title} <ChevronDown size={13} />
          </span>
        }
      />

      <div className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 pb-6 pt-3">
        {/* TODAY'S BUDGET */}
        <ConciergeCard className="relative overflow-hidden p-4">
          <Crest size={68} className="absolute -right-2 -top-2 opacity-10" style={{ color: T.gold }} />
          <SectionLabel en="Today's Budget" ja="本日の予算" />
          <div className="mt-1 font-serif text-[30px]" style={{ color: T.ink, fontWeight: 600 }}>
            {yen(b.todayBudget)}<span className="ml-1 text-[12px] font-sans" style={{ color: T.ink3 }}>/日</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px]" style={{ color: T.ink2 }}>
            <span>本日の使用額 <b style={{ color: T.ink }}>{yen(b.todaySpend)}</b></span>
            <span>残り <b style={{ color: T.goldDeep }}>{yen(b.todayRemaining)}</b></span>
          </div>
          <ProgressBar pct={(b.todaySpend / b.todayBudget) * 100} className="mt-1.5" />
        </ConciergeCard>

        {/* TRIP BUDGET OVERVIEW */}
        <ConciergeCard className="p-4">
          <SectionLabel en="Trip Budget Overview" ja="旅の予算サマリー" className="mb-3" />
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { en: "TOTAL BUDGET", ja: "総予算", val: yen(b.totalBudget), sub: "" },
              { en: "SPENT SO FAR", ja: "使用額", val: yen(b.spentSoFar), sub: `(${b.spentPct.toFixed(1)}%)` },
              { en: "REMAINING", ja: "残り", val: yen(b.remaining), sub: `(${b.remainingPct.toFixed(1)}%)` },
            ].map((c) => (
              <div key={c.en}>
                <div className="text-[8px] uppercase tracking-[0.12em]" style={{ color: T.ink3 }}>{c.en}</div>
                <div className="text-[9px]" style={{ color: T.ink3 }}>{c.ja}</div>
                <div className="mt-1 font-serif text-[15px]" style={{ color: T.ink, fontWeight: 600 }}>{c.val}</div>
                {c.sub && <div className="text-[10px]" style={{ color: T.ink3 }}>{c.sub}</div>}
              </div>
            ))}
          </div>
          <ProgressBar pct={b.spentPct} className="mt-3" markers={[0.25, 0.5, 0.75]} />
        </ConciergeCard>

        {/* CATEGORY BREAKDOWN */}
        <ConciergeCard className="p-4">
          <SectionLabel en="Category Breakdown" ja="カテゴリ別の内訳" className="mb-3" />
          <div className="flex items-center gap-4">
            <Donut segments={b.donut} usagePct={b.progressPct} />
            <div className="min-w-0 flex-1 space-y-2">
              {b.donut.map((c, i) => (
                <div key={c.key} className="flex items-center gap-2">
                  <span style={{ color: DONUT_TONES[i % DONUT_TONES.length] }}>{catIcon(c.key)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[10px] font-semibold uppercase tracking-wide" style={{ color: T.ink2 }}>{c.labelEn}</div>
                    <div className="truncate text-[9px]" style={{ color: T.ink3 }}>{c.labelJa}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-semibold tabular-nums" style={{ color: T.ink }}>{yen(c.amount)}</div>
                    <div className="text-[9px] tabular-nums" style={{ color: T.ink3 }}>{c.pct}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border py-2 text-[11px] font-medium" style={{ borderColor: T.border, background: T.cardAlt, color: T.ink2 }}>
            すべてのカテゴリーを表示 <ChevronRight size={13} />
          </button>
        </ConciergeCard>

        {/* DAY VS TRIP COMPARISON */}
        <ConciergeCard className="p-4">
          <SectionLabel en="Day vs Trip Comparison" ja="日別 vs 旅行全体の比較" className="mb-3" />
          <div className="flex gap-4">
            <div className="flex flex-1 items-end gap-2" style={{ height: 96 }}>
              {b.dayComparison.map((d) => (
                <div key={d.label} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <div
                    className="w-full rounded-t"
                    style={{ height: `${Math.max(6, (d.amount / maxDay) * 78)}px`, background: d.isToday ? `linear-gradient(180deg, ${T.gold}, ${T.goldDeep})` : T.goldSoft, opacity: d.isToday ? 1 : 0.55 }}
                  />
                  <span className="text-[8px]" style={{ color: d.isToday ? T.goldDeep : T.ink3, fontWeight: d.isToday ? 700 : 400 }}>{d.label}</span>
                </div>
              ))}
            </div>
            <div className="w-24 shrink-0 space-y-2">
              <div className="rounded-lg p-2" style={{ background: T.cardAlt }}>
                <div className="text-[8px]" style={{ color: T.ink3 }}>1日あたりの平均</div>
                <div className="font-serif text-[14px]" style={{ color: T.ink, fontWeight: 600 }}>{yen(b.dailyAverage)}</div>
              </div>
              <div className="rounded-lg p-2" style={{ background: T.cardAlt }}>
                <div className="text-[8px]" style={{ color: T.ink3 }}>予算に対する進捗</div>
                <div className="font-serif text-[14px]" style={{ color: T.ink, fontWeight: 600 }}>{b.progressPct}%</div>
                <div className="mt-0.5 inline-flex items-center gap-0.5 text-[9px]" style={{ color: T.green }}>
                  <Leaf size={10} /> {b.progressLabel}
                </div>
              </div>
            </div>
          </div>
        </ConciergeCard>

        {/* CONCIERGE FORECAST */}
        <ConciergeCard className="p-4">
          <SectionLabel en="Concierge Forecast" ja="コンシェルジュ予測" className="mb-3" />
          <div className="flex items-center gap-4">
            <p className="flex-1 text-[12px] leading-relaxed" style={{ color: T.ink2 }}>
              このままのペースでいくと、ご旅行全体で <b style={{ color: T.goldDeep }}>{yen(b.forecast.predictedRemaining)}</b> 程度の余裕が生まれる見込みです。
            </p>
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
              <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke={T.cardSunk} strokeWidth="8" />
                <circle cx="50" cy="50" r="42" fill="none" stroke={T.gold} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${0.72 * 2 * Math.PI * 42} ${2 * Math.PI * 42}`} />
              </svg>
              <Leaf size={12} className="absolute left-1 top-8 opacity-50" style={{ color: T.goldSoft }} />
              <Leaf size={12} className="absolute right-1 top-8 -scale-x-100 opacity-50" style={{ color: T.goldSoft }} />
              <div className="flex flex-col items-center text-center">
                <span className="text-[7px]" style={{ color: T.ink3 }}>予測残額</span>
                <span className="font-serif text-[14px]" style={{ color: T.ink, fontWeight: 600 }}>{yen(b.forecast.predictedRemaining)}</span>
                <span className="inline-flex items-center gap-0.5 text-[8px]" style={{ color: T.green }}><Leaf size={8} /> {b.forecast.statusLabel}</span>
              </div>
            </div>
          </div>
          <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-[11px] font-medium" style={{ borderColor: T.border, background: T.cardAlt, color: T.goldDeep }}>
            <Lightbulb size={13} /> 節約のヒントをみる <ChevronRight size={12} />
          </button>
        </ConciergeCard>
      </div>
    </div>
  );
}
