// app/(culcept)/calendar/_components/travel/locationNotes/views/SearchView.tsx
// 検索タブ。キーワード＋種別/区分/視点フィルタで data.items をライブ絞り込み。
"use client";

import * as React from "react";
import { T } from "../../concierge/primitives";
import { Search } from "../../concierge/icons";
import { SpotGridCard, TripRowCard, Grid2, EmptyState } from "../cards";
import type { LocationViewProps } from "../viewTypes";
import type { LocationItem } from "../../../../_lib/travel/types";

type KindF = "all" | "trip" | "spot";
type ClassF = "all" | "classic" | "hidden";
type SourceF = "all" | "local" | "traveler";

function FilterRow<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { key: T; label: string }[] }) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={o.key} onClick={() => onChange(o.key)} className="rounded-full px-3 py-1.5 text-[11.5px] font-medium transition" style={on ? { background: `linear-gradient(135deg, ${T.gold}, ${T.goldDeep})`, color: "#fdf8ee" } : { background: T.cardAlt, color: T.ink2, border: `1px solid ${T.border}` }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SearchView({ data, savedIds, isAdded, onToggleSave, onAddToItinerary, onOpenDetail, onGoToAdd }: LocationViewProps) {
  const [q, setQ] = React.useState("");
  const [kind, setKind] = React.useState<KindF>("all");
  const [cls, setCls] = React.useState<ClassF>("all");
  const [src, setSrc] = React.useState<SourceF>("all");

  const results = React.useMemo(() => {
    const norm = q.trim().toLowerCase();
    return data.items.filter((i) => {
      if (kind !== "all" && i.kind !== kind) return false;
      if (cls !== "all" && i.classification !== cls) return false;
      if (src !== "all" && i.source !== src) return false;
      if (!norm) return true;
      const hay = [i.title, i.areaLabel, i.genre, ...i.tags, i.author.name].join(" ").toLowerCase();
      return hay.includes(norm);
    });
  }, [data.items, q, kind, cls, src]);

  const trips = results.filter((i) => i.kind === "trip");
  const spots = results.filter((i) => i.kind === "spot");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-2xl border px-3 py-2.5" style={{ borderColor: T.border, background: T.card }}>
        <Search size={17} style={{ color: T.ink3 }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="地名・テーマ・タグで検索（例：早朝、抹茶、嵐山）"
          className="w-full bg-transparent text-[13px] outline-none"
          style={{ color: T.ink }}
        />
        {q && <button onClick={() => setQ("")} className="text-[11px]" style={{ color: T.ink3 }}>クリア</button>}
      </div>

      <div className="space-y-2">
        <FilterRow value={kind} onChange={setKind} options={[{ key: "all", label: "すべて" }, { key: "trip", label: "旅行" }, { key: "spot", label: "スポット" }]} />
        <FilterRow value={cls} onChange={setCls} options={[{ key: "all", label: "区分すべて" }, { key: "classic", label: "王道" }, { key: "hidden", label: "穴場" }]} />
        <FilterRow value={src} onChange={setSrc} options={[{ key: "all", label: "視点すべて" }, { key: "local", label: "地元民" }, { key: "traveler", label: "旅行者" }]} />
      </div>

      <div className="text-[11px]" style={{ color: T.ink3 }}>{results.length} 件</div>

      {results.length === 0 ? (
        <EmptyState title="該当する発見がありません" body="条件を変えるか、新しいノートを追加してみましょう。" actionLabel="ノートを追加" onAction={onGoToAdd} />
      ) : (
        <div className="space-y-5">
          {trips.length > 0 && (
            <section>
              <div className="mb-2 font-serif text-[13px]" style={{ color: T.ink, fontWeight: 600 }}>旅行 {trips.length}</div>
              <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
                {trips.map((it: LocationItem) => <TripRowCard key={it.id} item={it} saved={savedIds.has(it.id)} added={isAdded(it.id)} onToggleSave={() => onToggleSave(it.id)} onAddToItinerary={() => onAddToItinerary(it)} onOpen={() => onOpenDetail(it)} />)}
              </div>
            </section>
          )}
          {spots.length > 0 && (
            <section>
              <div className="mb-2 font-serif text-[13px]" style={{ color: T.ink, fontWeight: 600 }}>スポット {spots.length}</div>
              <Grid2>
                {spots.map((it: LocationItem) => <SpotGridCard key={it.id} item={it} saved={savedIds.has(it.id)} onToggleSave={() => onToggleSave(it.id)} onOpen={() => onOpenDetail(it)} />)}
              </Grid2>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
