// app/(culcept)/calendar/_components/travel/locationNotes/views/ThemesView.tsx
// Concept 17 — Themes（テーマ）。テーマ hero ＋すべてのテーマ grid ＋このテーマの旅行/スポット。
"use client";

import * as React from "react";
import { T } from "../../concierge/primitives";
import { PhotoSlot } from "../../PhotoSlot";
import { ChevronRight } from "../../concierge/icons";
import { TripRowCard, SpotGridCard, SectionHeading, HScroll, Grid2, ThemeTile, EmptyState } from "../cards";
import type { LocationViewProps } from "../viewTypes";

export function ThemesView({ data, savedIds, onToggleSave, onAddToItinerary, onGoToAdd }: LocationViewProps) {
  const [activeKey, setActiveKey] = React.useState(data.themes[0]?.key ?? "");
  const active = data.themes.find((t) => t.key === activeKey) ?? data.themes[0];

  if (!active) {
    return <EmptyState title="テーマがありません" body="気分や目的でテーマを選んで、旅を探せます。" actionLabel="ノートを追加" onAction={onGoToAdd} />;
  }

  const themed = data.items.filter((i) => i.themeKeys.includes(active.key));
  const trips = themed.filter((i) => i.kind === "trip");
  const spots = themed.filter((i) => i.kind === "spot");

  return (
    <div className="space-y-6">
      {/* テーマ hero */}
      <div>
        <div className="mb-2">
          <h2 className="font-serif text-[14px]" style={{ color: T.ink, fontWeight: 600 }}>おすすめのテーマ</h2>
        </div>
        <div className="relative overflow-hidden rounded-[20px] border" style={{ borderColor: T.border }}>
          <PhotoSlot photo={active.photo} rounded="rounded-none" className="h-40 w-full" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(34,28,20,0.78) 0%, rgba(34,28,20,0.15) 65%)" }} />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="font-serif text-[22px] font-bold" style={{ color: "#fdf8ee" }}>{active.label}</div>
            <p className="mt-1 max-w-[80%] text-[11.5px] leading-relaxed" style={{ color: "rgba(253,248,238,0.86)" }}>{active.description}</p>
            <button onClick={() => trips[0] && onAddToItinerary(trips[0])} className="mt-3 inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-[12px] font-semibold" style={{ background: "rgba(253,248,238,0.92)", color: T.goldDeep }}>
              このテーマの旅行を見る <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* すべてのテーマ */}
      <section>
        <SectionHeading ja="すべてのテーマ" />
        <div className="grid grid-cols-3 gap-2">
          {data.themes.map((t) => (
            <ThemeTile key={t.key} theme={t} active={t.key === active.key} onClick={() => setActiveKey(t.key)} />
          ))}
        </div>
      </section>

      {/* このテーマの旅行/スポット */}
      {trips.length > 0 && (
        <section>
          <SectionHeading ja={`このテーマの旅行 · ${active.label}`} />
          <HScroll>
            {trips.map((it) => <TripRowCard key={it.id} item={it} saved={savedIds.has(it.id)} onToggleSave={() => onToggleSave(it.id)} onAddToItinerary={() => onAddToItinerary(it)} />)}
          </HScroll>
        </section>
      )}
      {spots.length > 0 && (
        <section>
          <SectionHeading ja={`このテーマのスポット · ${active.label}`} />
          <Grid2>
            {spots.map((it) => <SpotGridCard key={it.id} item={it} saved={savedIds.has(it.id)} onToggleSave={() => onToggleSave(it.id)} />)}
          </Grid2>
        </section>
      )}
      {themed.length === 0 && (
        <p className="py-6 text-center text-[12px]" style={{ color: T.ink3 }}>「{active.label}」のノートはまだありません。</p>
      )}
    </div>
  );
}
