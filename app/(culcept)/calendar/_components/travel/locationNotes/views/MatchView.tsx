// app/(culcept)/calendar/_components/travel/locationNotes/views/MatchView.tsx
// Concept 12 — Match。あなたに最適なおすすめ（hero）＋好み chips ＋マッチした旅行プラン/スポット＋合う理由。
"use client";

import * as React from "react";
import { T } from "../../concierge/primitives";
import { Sparkle } from "../../concierge/icons";
import { HeroCard, TripRowCard, SpotGridCard, SectionHeading, HScroll, Grid2, EmptyState } from "../cards";
import type { LocationViewProps } from "../viewTypes";

export function MatchView({ data, savedIds, onToggleSave, onAddToItinerary, onGoToAdd }: LocationViewProps) {
  const trips = data.items.filter((i) => i.kind === "trip");
  const spots = data.items.filter((i) => i.kind === "spot");
  const ranked = [...data.items].filter((i) => i.matchPct != null).sort((a, b) => (b.matchPct ?? 0) - (a.matchPct ?? 0));
  const hero = ranked[0] ?? data.items[0];

  if (!hero) {
    return <EmptyState title={`${data.items.length === 0 ? "この都道府県のノートはまだありません" : "おすすめがありません"}`} body="あなただけの発見を追加して、最初のノートを作りましょう。" actionLabel="ノートを追加" onAction={onGoToAdd} />;
  }

  const matchedTrips = trips.filter((i) => i.id !== hero.id).sort((a, b) => (b.matchPct ?? 0) - (a.matchPct ?? 0) || b.rating - a.rating);
  const matchedSpots = spots.filter((i) => i.id !== hero.id).sort((a, b) => (b.matchPct ?? 0) - (a.matchPct ?? 0) || b.rating - a.rating);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <Sparkle size={14} style={{ color: T.gold }} />
          <h2 className="font-serif text-[14px]" style={{ color: T.ink, fontWeight: 600 }}>あなたに最適なおすすめ</h2>
        </div>
        <HeroCard
          item={hero}
          badges={[hero.kind === "trip" ? "旅行プラン" : "スポット", "Match"]}
          reasons={hero.matchReasons}
          prefChips={data.preferenceChips}
          saved={savedIds.has(hero.id)}
          onToggleSave={() => onToggleSave(hero.id)}
          onAddToItinerary={() => onAddToItinerary(hero)}
        />
      </div>

      {matchedTrips.length > 0 && (
        <section>
          <SectionHeading ja="あなたにマッチした旅行プラン" />
          <HScroll>
            {matchedTrips.map((it) => (
              <TripRowCard key={it.id} item={it} saved={savedIds.has(it.id)} onToggleSave={() => onToggleSave(it.id)} onAddToItinerary={() => onAddToItinerary(it)} />
            ))}
          </HScroll>
        </section>
      )}

      {matchedSpots.length > 0 && (
        <section>
          <SectionHeading ja="あなたにマッチしたスポット" />
          <Grid2>
            {matchedSpots.slice(0, 6).map((it) => (
              <SpotGridCard key={it.id} item={it} saved={savedIds.has(it.id)} onToggleSave={() => onToggleSave(it.id)} />
            ))}
          </Grid2>
        </section>
      )}

      <section>
        <SectionHeading ja="さらにあなたの好みに合う理由" />
        <div className="space-y-2 rounded-2xl border p-3.5" style={{ borderColor: T.border, background: T.card }}>
          {data.matchReasons.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-[12px] leading-relaxed" style={{ color: T.ink2 }}>
              <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold" style={{ background: T.goldBg, color: T.goldDeep }}>{i + 1}</span>
              {r}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
