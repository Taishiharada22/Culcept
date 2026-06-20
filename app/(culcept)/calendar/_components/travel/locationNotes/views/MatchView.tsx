// app/(culcept)/calendar/_components/travel/locationNotes/views/MatchView.tsx
// Concept 12 — Match。あなたに最適なおすすめ（専用 hero: 写真＋理由の2カラム）＋マッチした旅行/スポット＋合う理由。
"use client";

import * as React from "react";
import { T, ELEV, FOCUS_RING, GOLD_GRADIENT } from "../../concierge/primitives";
import { PhotoSlot } from "../../PhotoSlot";
import { Sparkle, MapPin, Plus, Heart, Check } from "../../concierge/icons";
import { HeartButton, ClassChip, TripRowCard, SpotGridCard, SectionHeading, HScroll, Grid2, EmptyState } from "../cards";
import type { LocationItem, PreferenceChip } from "../../../../_lib/travel/types";
import type { LocationViewProps } from "../viewTypes";

/** Match 専用 hero（Concept 12）：写真＋バッジ｜おすすめの理由 の2カラム → タイトル/説明/エリア → 好み → CTA。 */
function MatchHero({
  item, prefChips, reasons, saved, added, onToggleSave, onAddToItinerary, onOpen,
}: {
  item: LocationItem;
  prefChips: PreferenceChip[];
  reasons: string[];
  saved: boolean;
  added: boolean;
  onToggleSave: () => void;
  onAddToItinerary: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[20px] border" style={{ borderColor: T.border, background: T.card, boxShadow: ELEV.e2 }}>
      <div className="p-3.5">
        {/* 上段：写真（左）＋ おすすめの理由（右） */}
        <div className="flex gap-2.5">
          <div
            onClick={onOpen}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
            aria-label={`${item.title} の詳細を見る`}
            className={`relative w-[46%] shrink-0 cursor-pointer overflow-hidden rounded-2xl ${FOCUS_RING}`}
          >
            <PhotoSlot photo={item.photo} rounded="rounded-2xl" className="h-[124px] w-full" />
            <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
              <ClassChip label={item.kind === "trip" ? "旅行プラン" : "スポット"} tone="ink" />
              <ClassChip label="Match" tone="gold" />
            </div>
            <div className="absolute right-1.5 top-1.5"><HeartButton active={saved} onClick={onToggleSave} size={14} /></div>
          </div>

          <div className="flex-1 rounded-xl p-2.5" style={{ background: T.cardSunk }}>
            <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: T.ink3 }}>おすすめの理由</div>
            <ul className="space-y-1.5">
              {reasons.slice(0, 3).map((r) => (
                <li key={r} className="flex items-start gap-1.5 text-[10.5px] leading-snug" style={{ color: T.ink2 }}>
                  <span className="mt-[1px] shrink-0" style={{ color: T.gold }}><Check size={11} strokeWidth={2.4} /></span>
                  <span className="line-clamp-2">{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* タイトル / 説明 / エリア */}
        <h2 className="mt-3 font-serif text-[18px] leading-snug" style={{ color: T.ink, fontWeight: 700 }}>{item.title}</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: T.ink2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.description}</p>
        <div className="mt-1.5 flex items-center gap-1 text-[12px]" style={{ color: T.ink2 }}><MapPin size={12} /> {item.areaLabel}</div>

        {/* あなたの好み */}
        {prefChips.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[10px]" style={{ color: T.ink3 }}>あなたの好み</div>
            <div className="flex flex-wrap gap-1.5">
              {prefChips.map((c) => (
                <span key={c.label} className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={c.active ? { background: T.goldBg, color: T.goldDeep } : { background: T.cardAlt, color: T.ink3, border: `1px solid ${T.border}` }}>{c.label}</span>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onAddToItinerary}
            disabled={added}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold transition active:scale-[0.98] ${FOCUS_RING}`}
            style={added ? { background: T.greenBg, color: T.green } : { background: GOLD_GRADIENT, color: "#fdf8ee", boxShadow: "0 3px 12px rgba(138,112,56,0.25)" }}
          >
            {added ? <><Check size={15} /> 旅程に追加済み</> : <><Plus size={15} /> 旅程に追加</>}
          </button>
          <button onClick={onToggleSave} aria-pressed={saved} className={`flex items-center justify-center gap-1.5 rounded-xl border px-5 py-2.5 text-[13px] font-medium transition active:scale-[0.98] ${FOCUS_RING}`} style={{ borderColor: T.border, background: saved ? T.goldBg : T.card, color: saved ? T.goldDeep : T.ink2 }}>
            <Heart size={15} filled={saved} /> {saved ? "保存済み" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MatchView({ data, savedIds, isAdded, onToggleSave, onAddToItinerary, onOpenDetail, onOpenTab, onGoToAdd }: LocationViewProps) {
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
        <MatchHero
          item={hero}
          prefChips={data.preferenceChips}
          reasons={hero.matchReasons ?? []}
          saved={savedIds.has(hero.id)}
          added={isAdded(hero.id)}
          onToggleSave={() => onToggleSave(hero.id)}
          onAddToItinerary={() => onAddToItinerary(hero)}
          onOpen={() => onOpenDetail(hero)}
        />
      </div>

      {matchedTrips.length > 0 && (
        <section>
          <SectionHeading ja="あなたにマッチした旅行プラン" onMore={() => onOpenTab("travel")} />
          <HScroll>
            {matchedTrips.map((it) => (
              <TripRowCard key={it.id} item={it} saved={savedIds.has(it.id)} added={isAdded(it.id)} onToggleSave={() => onToggleSave(it.id)} onAddToItinerary={() => onAddToItinerary(it)} onOpen={() => onOpenDetail(it)} />
            ))}
          </HScroll>
        </section>
      )}

      {matchedSpots.length > 0 && (
        <section>
          <SectionHeading ja="あなたにマッチしたスポット" onMore={() => onOpenTab("spot")} />
          <Grid2>
            {matchedSpots.slice(0, 6).map((it) => (
              <SpotGridCard key={it.id} item={it} saved={savedIds.has(it.id)} onToggleSave={() => onToggleSave(it.id)} onOpen={() => onOpenDetail(it)} />
            ))}
          </Grid2>
        </section>
      )}

      <section>
        <SectionHeading ja="さらにあなたの好みに合う理由" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {data.matchReasons.map((r, i) => (
            <div key={i} className="flex items-start gap-2 rounded-2xl border p-3 text-[11.5px] leading-relaxed sm:flex-col sm:gap-1.5" style={{ borderColor: T.border, background: T.card, color: T.ink2 }}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: T.goldBg, color: T.goldDeep }}><Sparkle size={11} /></span>
              {r}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
