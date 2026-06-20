// app/(culcept)/calendar/_components/travel/locationNotes/views/HiddenView.tsx
// Concept 16 — Hidden Gems（穴場）。なぜ特別/なぜ知られていない を備えた hero ＋穴場の旅程/スポット＋隠れたヒント。
"use client";

import * as React from "react";
import { T } from "../../concierge/primitives";
import { HeroCard, TripRowCard, SpotGridCard, SectionHeading, HScroll, Grid2, EmptyState } from "../cards";
import type { LocationViewProps } from "../viewTypes";

export function HiddenView({ data, savedIds, onToggleSave, onAddToItinerary, onGoToAdd }: LocationViewProps) {
  const hidden = data.items.filter((i) => i.classification === "hidden");
  if (hidden.length === 0) {
    return <EmptyState title="穴場がまだありません" body="まだ知られていない、とっておきの発見を追加しましょう。" actionLabel="穴場を追加" onAction={onGoToAdd} />;
  }
  // なぜ特別/なぜ知られていない を持つ穴場を優先 hero（Concept 16 の主役表現）。
  const hero = [...hidden].sort((a, b) => (Number(Boolean(b.whySpecial)) - Number(Boolean(a.whySpecial))) || b.rating - a.rating)[0];
  const trips = hidden.filter((i) => i.kind === "trip" && i.id !== hero.id);
  const spots = hidden.filter((i) => i.kind === "spot" && i.id !== hero.id);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2">
          <h2 className="font-serif text-[14px]" style={{ color: T.ink, fontWeight: 600 }}>まだ知られていない、とっておきの発見</h2>
        </div>
        <HeroCard item={hero} badges={["穴場", hero.kind === "trip" ? "旅行プラン" : "スポット"]} showWhy saved={savedIds.has(hero.id)} onToggleSave={() => onToggleSave(hero.id)} onAddToItinerary={() => onAddToItinerary(hero)} />
      </div>

      {trips.length > 0 && (
        <section>
          <SectionHeading ja="穴場の旅程" />
          <HScroll>
            {trips.map((it) => <TripRowCard key={it.id} item={it} saved={savedIds.has(it.id)} onToggleSave={() => onToggleSave(it.id)} onAddToItinerary={() => onAddToItinerary(it)} />)}
          </HScroll>
        </section>
      )}
      {spots.length > 0 && (
        <section>
          <SectionHeading ja="穴場のスポット" />
          <Grid2>
            {spots.map((it) => <SpotGridCard key={it.id} item={it} saved={savedIds.has(it.id)} onToggleSave={() => onToggleSave(it.id)} />)}
          </Grid2>
        </section>
      )}

      <section>
        <SectionHeading ja="隠れたヒント" />
        <div className="flex flex-wrap gap-2">
          {data.hiddenHints.map((h) => (
            <span key={h} className="inline-flex items-center rounded-full border px-3 py-1.5 text-[12px]" style={{ borderColor: T.goldSoft, background: T.goldBg, color: T.goldDeep }}>
              {h}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
