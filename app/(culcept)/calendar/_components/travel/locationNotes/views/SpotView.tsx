// app/(culcept)/calendar/_components/travel/locationNotes/views/SpotView.tsx
// Concept 14 — Spots。単体スポットを 地元民のスポット / 旅行者の発見 で並べ、エリアから探す（絞り込み）。
"use client";

import * as React from "react";
import { T, FOCUS_RING } from "../../concierge/primitives";
import { MapPin } from "../../concierge/icons";
import { HeroCard, SpotGridCard, SectionHeading, Grid2, EmptyState } from "../cards";
import type { LocationViewProps } from "../viewTypes";

export function SpotView({ data, savedIds, isAdded, onToggleSave, onAddToItinerary, onOpenDetail, onGoToAdd }: LocationViewProps) {
  const [area, setArea] = React.useState<string | null>(null);
  const spots = data.items.filter((i) => i.kind === "spot");
  if (spots.length === 0) {
    return <EmptyState title="スポットがまだありません" body="お気に入りの場所を、単体スポットとして追加できます。" actionLabel="スポットを追加" onAction={onGoToAdd} />;
  }

  const hero = [...spots].sort((a, b) => (b.matchPct ?? 0) - (a.matchPct ?? 0) || b.rating - a.rating)[0];
  const matchArea = (areaLabel: string) => !area || areaLabel.includes(area);
  const rest = spots.filter((i) => i.id !== hero.id && matchArea(i.areaLabel));
  const localSpots = rest.filter((i) => i.source === "local");
  const travelerSpots = rest.filter((i) => i.source === "traveler");

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2">
          <h2 className="font-serif text-[14px]" style={{ color: T.ink, fontWeight: 600 }}>おすすめのスポット</h2>
        </div>
        <HeroCard
          item={hero}
          badges={["スポット", hero.classification === "hidden" ? "穴場" : hero.classification === "classic" ? "王道" : "注目"]}
          saved={savedIds.has(hero.id)}
          added={isAdded(hero.id)}
          onToggleSave={() => onToggleSave(hero.id)}
          onAddToItinerary={() => onAddToItinerary(hero)}
          onOpen={() => onOpenDetail(hero)}
        />
      </div>

      {area && (
        <button
          onClick={() => setArea(null)}
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium ${FOCUS_RING}`}
          style={{ background: T.goldBg, color: T.goldDeep }}
        >
          絞り込み中: {area} <span aria-hidden>✕</span>
        </button>
      )}

      {localSpots.length > 0 && (
        <section>
          <SectionHeading ja="地元民のスポット" />
          <Grid2>
            {localSpots.map((it) => <SpotGridCard key={it.id} item={it} saved={savedIds.has(it.id)} onToggleSave={() => onToggleSave(it.id)} onOpen={() => onOpenDetail(it)} />)}
          </Grid2>
        </section>
      )}
      {travelerSpots.length > 0 && (
        <section>
          <SectionHeading ja="旅行者の発見" />
          <Grid2>
            {travelerSpots.map((it) => <SpotGridCard key={it.id} item={it} saved={savedIds.has(it.id)} onToggleSave={() => onToggleSave(it.id)} onOpen={() => onOpenDetail(it)} />)}
          </Grid2>
        </section>
      )}
      {area && localSpots.length === 0 && travelerSpots.length === 0 && (
        <p className="py-6 text-center text-[12px]" style={{ color: T.ink3 }}>「{area}」エリアのスポットはまだありません。</p>
      )}

      <section>
        <SectionHeading ja="エリアから探す" />
        <div className="flex flex-wrap gap-2">
          {data.areaChips.map((a) => {
            const on = area === a.label;
            return (
              <button
                key={a.label}
                onClick={() => setArea(on ? null : a.label)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition active:scale-95 ${FOCUS_RING} ${on ? "" : "hover:bg-[#efe7d6]"}`}
                style={on ? { borderColor: T.goldDeep, background: T.goldBg, color: T.goldDeep } : { borderColor: T.border, background: T.card, color: T.ink2 }}
              >
                <span className="font-medium" style={{ color: on ? T.goldDeep : T.ink }}>{a.label}</span>
                {a.count != null && <span className="text-[10px]" style={{ color: T.ink3 }}>{a.count}</span>}
              </button>
            );
          })}
        </div>
        <div className="relative mt-2.5 h-28 overflow-hidden rounded-2xl border" style={{ borderColor: T.border, background: T.cardSunk, backgroundImage: "linear-gradient(rgba(180,166,136,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(180,166,136,0.18) 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
          <MapPin size={18} style={{ color: T.gold, position: "absolute", left: "26%", top: "38%" }} />
          <MapPin size={18} style={{ color: T.gold, position: "absolute", left: "58%", top: "30%" }} />
          <MapPin size={18} style={{ color: T.gold, position: "absolute", left: "44%", top: "62%" }} />
          <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2">
            <span className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium shadow" style={{ background: T.card, color: T.ink2 }}>
              <MapPin size={12} /> 地図で探す（サンプル）
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
