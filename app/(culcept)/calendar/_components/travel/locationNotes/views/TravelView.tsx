// app/(culcept)/calendar/_components/travel/locationNotes/views/TravelView.tsx
// Concept 13 — Travel。旅行プラン（行程）を 地元民から / 旅行者から / 人気の旅プラン で並べる。
"use client";

import * as React from "react";
import { HeroCard, TripRowCard, SectionHeading, HScroll, EmptyState } from "../cards";
import type { LocationViewProps } from "../viewTypes";
import type { LocationItem } from "../../../../_lib/travel/types";

const CLASS_LABEL: Record<LocationItem["classification"], string> = { classic: "王道", hidden: "穴場", standard: "定番" };

export function TravelView({ data, savedIds, isAdded, onToggleSave, onAddToItinerary, onOpenDetail, onGoToAdd }: LocationViewProps) {
  const trips = data.items.filter((i) => i.kind === "trip");
  if (trips.length === 0) {
    return <EmptyState title="旅行プランがまだありません" body="あなたの行程を旅行プランとして追加できます。" actionLabel="旅行プランを追加" onAction={onGoToAdd} />;
  }

  const hero = [...trips].sort((a, b) => (Number(b.classification === "classic") - Number(a.classification === "classic")) || b.rating - a.rating)[0];
  const rest = trips.filter((i) => i.id !== hero.id);
  const localTrips = rest.filter((i) => i.source === "local");
  const travelerTrips = rest.filter((i) => i.source === "traveler");
  const popular = [...trips].sort((a, b) => b.ratingCount - a.ratingCount);

  const row = (items: LocationItem[]) => (
    <HScroll>
      {items.map((it) => (
        <TripRowCard key={it.id} item={it} saved={savedIds.has(it.id)} added={isAdded(it.id)} onToggleSave={() => onToggleSave(it.id)} onAddToItinerary={() => onAddToItinerary(it)} onOpen={() => onOpenDetail(it)} />
      ))}
    </HScroll>
  );

  return (
    <div className="space-y-6">
      <HeroCard
        item={hero}
        badges={["旅行プラン", CLASS_LABEL[hero.classification]]}
        saved={savedIds.has(hero.id)}
        added={isAdded(hero.id)}
        onToggleSave={() => onToggleSave(hero.id)}
        onAddToItinerary={() => onAddToItinerary(hero)}
        onOpen={() => onOpenDetail(hero)}
      />

      {localTrips.length > 0 && (
        <section>
          <SectionHeading ja="地元民から" />
          {row(localTrips)}
        </section>
      )}
      {travelerTrips.length > 0 && (
        <section>
          <SectionHeading ja="旅行者から" />
          {row(travelerTrips)}
        </section>
      )}
      <section>
        <SectionHeading ja="人気の旅プラン" />
        {row(popular)}
      </section>
    </div>
  );
}
