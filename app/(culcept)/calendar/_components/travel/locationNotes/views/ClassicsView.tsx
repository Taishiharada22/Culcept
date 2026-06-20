// app/(culcept)/calendar/_components/travel/locationNotes/views/ClassicsView.tsx
// Concept 15 — Classics（王道）。王道の旅程＋王道のスポット＋人気の情報ソース。
"use client";

import * as React from "react";
import { T } from "../../concierge/primitives";
import { Search } from "../../concierge/icons";
import { HeroCard, TripRowCard, SpotGridCard, SectionHeading, HScroll, Grid2, EmptyState } from "../cards";
import type { LocationViewProps } from "../viewTypes";

export function ClassicsView({ data, savedIds, onToggleSave, onAddToItinerary, onGoToAdd }: LocationViewProps) {
  const classics = data.items.filter((i) => i.classification === "classic");
  if (classics.length === 0) {
    return <EmptyState title="王道がまだありません" body="定番の名所やルートを王道として追加できます。" actionLabel="王道を追加" onAction={onGoToAdd} />;
  }
  const hero = [...classics].sort((a, b) => b.rating - a.rating)[0];
  const trips = classics.filter((i) => i.kind === "trip" && i.id !== hero.id);
  const spots = classics.filter((i) => i.kind === "spot" && i.id !== hero.id);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2">
          <h2 className="font-serif text-[14px]" style={{ color: T.ink, fontWeight: 600 }}>はじめての京都におすすめ</h2>
        </div>
        <HeroCard item={hero} badges={["王道", hero.kind === "trip" ? "旅行プラン" : "スポット"]} saved={savedIds.has(hero.id)} onToggleSave={() => onToggleSave(hero.id)} onAddToItinerary={() => onAddToItinerary(hero)} />
      </div>

      {trips.length > 0 && (
        <section>
          <SectionHeading ja="王道の旅程" />
          <HScroll>
            {trips.map((it) => <TripRowCard key={it.id} item={it} saved={savedIds.has(it.id)} onToggleSave={() => onToggleSave(it.id)} onAddToItinerary={() => onAddToItinerary(it)} />)}
          </HScroll>
        </section>
      )}
      {spots.length > 0 && (
        <section>
          <SectionHeading ja="王道のスポット" />
          <Grid2>
            {spots.map((it) => <SpotGridCard key={it.id} item={it} saved={savedIds.has(it.id)} onToggleSave={() => onToggleSave(it.id)} />)}
          </Grid2>
        </section>
      )}

      <section>
        <SectionHeading ja="人気の情報ソース" />
        <div className="grid grid-cols-2 gap-2">
          {data.infoSources.map((s) => (
            <div key={s.label} className="flex items-center gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: T.border, background: T.card }}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: T.goldBg, color: T.goldDeep }}><Search size={13} /></span>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold" style={{ color: T.ink }}>{s.label}</div>
                <div className="truncate text-[10px]" style={{ color: T.ink3 }}>{s.channel}{s.note ? ` · ${s.note}` : ""}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
