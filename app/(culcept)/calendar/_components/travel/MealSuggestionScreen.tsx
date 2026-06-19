// app/(culcept)/calendar/_components/travel/MealSuggestionScreen.tsx
// ② suggestion.png — Meal Suggestion（CONCIERGE'S PICK ＋ ALTERNATIVE OPTIONS ＋ 近くのエリア）。
"use client";

import * as React from "react";
import type { TravelScreenProps } from "./screenProps";
import type { MealAltCategory } from "../../_lib/travel/types";
import { PhotoSlot } from "./PhotoSlot";
import { RouteMapPreview } from "./RouteMapPreview";
import {
  T,
  ConciergeCard,
  ConciergeHeader,
  SectionLabel,
  CategoryChip,
  PriceLevelText,
} from "./concierge/primitives";
import { Map as MapGlyph, Star, Clock, Yen, Check, TransportIcon, User } from "./concierge/icons";

const FILTERS: ("すべて" | MealAltCategory)[] = ["すべて", "カフェ", "スイーツ", "ランチ", "ディナー"];

function Rating({ value, count }: { value: number; count: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: T.ink2 }}>
      <Star size={13} filled style={{ color: T.gold }} />
      <span className="font-semibold" style={{ color: T.ink }}>{value.toFixed(1)}</span>
      <span style={{ color: T.ink3 }}>({count})</span>
    </span>
  );
}

export default function MealSuggestionScreen({ trip, day, onClose, onOpenMap }: TravelScreenProps) {
  const [filter, setFilter] = React.useState<"すべて" | MealAltCategory>("すべて");
  const { pick } = day.meal;
  const alts = filter === "すべて" ? day.meal.alternatives : day.meal.alternatives.filter((a) => a.category === filter);

  const infoCols = [
    { icon: <TransportIcon mode="walk" size={16} />, label: "徒歩", value: pick.walkText.replace("徒歩 ", "") },
    { icon: <Clock size={15} />, label: "おすすめ時間帯", value: pick.recommendTime },
    { icon: <Yen size={15} />, label: "予算の目安", value: pick.priceLevel },
    { icon: <Check size={15} />, label: "空席", value: pick.availability },
  ];

  return (
    <div className="min-h-full">
      <ConciergeHeader
        title="Meal Suggestion"
        latinTitle
        subLabel="食のおすすめ"
        onBack={onClose}
        right={<button aria-label="地図" onClick={() => onOpenMap({ title: day.meal.areaLabel })} className="flex h-9 w-9 items-center justify-center"><MapGlyph size={18} /></button>}
      />

      <div className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 pb-6 pt-3">
        <div className="text-[12px]" style={{ color: T.ink2 }}>
          {trip.title} ｜ {day.dayIndex}日目 {day.monthDayLabel} ({day.weekdayLabel}) のおすすめ
        </div>

        {/* CONCIERGE'S PICK */}
        <ConciergeCard className="overflow-hidden">
          <div className="relative">
            <PhotoSlot photo={pick.photo} className="h-44 w-full" rounded="rounded-none" />
            <span className="absolute left-3 top-3 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ background: "rgba(0,0,0,0.42)", color: "#fdf8ee" }}>
              Concierge's Pick
            </span>
            {pick.badge && (
              <span className="absolute right-3 top-3 rounded-md px-2 py-1 text-[10px] font-medium" style={{ background: `${T.card}e6`, color: T.ink2 }}>
                {pick.badge}
              </span>
            )}
          </div>

          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-serif text-[17px]" style={{ color: T.ink, fontWeight: 600 }}>{pick.name}</h3>
              <Rating value={pick.rating} count={pick.ratingCount} />
            </div>
            <p className="mt-1 text-[12px] leading-relaxed" style={{ color: T.ink2 }}>{pick.whyFitsYou.split("。")[0]}。</p>

            {/* 4情報列 */}
            <div className="mt-3 grid grid-cols-4 gap-2 border-y py-3" style={{ borderColor: T.borderSoft }}>
              {infoCols.map((c) => (
                <div key={c.label} className="text-center">
                  <span className="inline-flex" style={{ color: T.goldDeep }}>{c.icon}</span>
                  <div className="mt-1 text-[9px]" style={{ color: T.ink3 }}>{c.label}</div>
                  <div className="text-[10px] font-semibold leading-tight" style={{ color: T.ink }}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* タグ */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {pick.tags.map((t) => (
                <CategoryChip key={t}>{t}</CategoryChip>
              ))}
            </div>

            {/* WHY IT FITS YOU */}
            <div className="mt-3 rounded-xl p-3" style={{ background: T.cardAlt }}>
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: T.goldDeep }}>Why it fits you</div>
              <div className="mt-1 flex items-start gap-2">
                <p className="flex-1 text-[12px] leading-relaxed" style={{ color: T.ink2 }}>{pick.whyFitsYou}</p>
                <div className="flex shrink-0 flex-col items-center">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: T.goldBg, color: T.gold }}><User size={16} /></span>
                  <span className="mt-0.5 text-[8px] text-center leading-tight" style={{ color: T.ink3 }}>{pick.conciergeName}</span>
                </div>
              </div>
            </div>
          </div>
        </ConciergeCard>

        {/* ALTERNATIVE OPTIONS */}
        <div>
          <SectionLabel en="Alternative Options" className="mb-2" />
          <div className="mb-3 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const on = filter === f;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="rounded-full border px-3 py-1.5 text-[11px] font-medium transition"
                  style={on
                    ? { background: T.goldBg, borderColor: T.goldSoft, color: T.goldDeep }
                    : { background: T.card, borderColor: T.border, color: T.ink2 }}
                >
                  {f}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {alts.map((a) => (
              <ConciergeCard key={a.id} className="overflow-hidden">
                <div className="relative">
                  <PhotoSlot photo={a.photo} className="h-24 w-full" rounded="rounded-none" />
                  <span className="absolute left-2 top-2 rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ background: `${T.card}e6`, color: T.ink2 }}>
                    {a.category}
                  </span>
                </div>
                <div className="p-2.5">
                  <div className="flex items-start justify-between gap-1">
                    <div className="truncate text-[12px] font-semibold" style={{ color: T.ink }}>{a.name}</div>
                  </div>
                  <div className="mt-0.5"><Rating value={a.rating} count={a.ratingCount} /></div>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed" style={{ color: T.ink3 }}>{a.description}</p>
                  <div className="mt-1.5 flex items-center justify-between text-[10px]" style={{ color: T.ink2 }}>
                    <span className="inline-flex items-center gap-0.5"><TransportIcon mode="walk" size={11} /> {a.walkText.replace("徒歩", "")}</span>
                    <span>{a.hours}</span>
                    <PriceLevelText level={a.priceLevel} />
                  </div>
                </div>
              </ConciergeCard>
            ))}
          </div>
        </div>

        {/* 近くのおすすめエリア */}
        <ConciergeCard className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <SectionLabel en="Nearby Area" ja={day.meal.areaLabel} />
            </div>
            <button onClick={() => onOpenMap({ title: day.meal.areaLabel })} className="rounded-lg border px-3 py-1.5 text-[11px] font-medium" style={{ borderColor: T.border, background: T.cardAlt, color: T.ink2 }}>
              エリアを表示
            </button>
          </div>
          <RouteMapPreview stops={day.routeStops} height={96} />
        </ConciergeCard>
      </div>
    </div>
  );
}
