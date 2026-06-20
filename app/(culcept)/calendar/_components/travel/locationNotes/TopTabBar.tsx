// app/(culcept)/calendar/_components/travel/locationNotes/TopTabBar.tsx
// Location Notes 上部タブバー（Concept 7 形式）。
// [都道府県 ▾] | Match 旅行 スポット 王道 穴場 テーマ 検索 | ＋
// 都道府県は dropdown で切替（後ろのコンテンツに反映）。active タブは gold pill。横スクロール。
"use client";

import * as React from "react";
import { T } from "../concierge/primitives";
import { ChevronDown, Search, Plus, Check } from "../concierge/icons";

export type LocationTab = "match" | "travel" | "spot" | "classic" | "hidden" | "theme" | "search" | "add";

const TABS: { key: LocationTab; label: string; latin?: boolean; icon?: boolean }[] = [
  { key: "match", label: "Match", latin: true },
  { key: "travel", label: "旅行" },
  { key: "spot", label: "スポット" },
  { key: "classic", label: "王道" },
  { key: "hidden", label: "穴場" },
  { key: "theme", label: "テーマ" },
  { key: "search", label: "検索", icon: true },
];

export function TopTabBar({
  active,
  onSelect,
  prefecture,
  prefectures,
  onPrefectureChange,
}: {
  active: LocationTab;
  onSelect: (tab: LocationTab) => void;
  prefecture: string;
  prefectures: string[];
  onPrefectureChange: (p: string) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="sticky top-0 z-20" style={{ background: `${T.bg}f4`, backdropFilter: "blur(8px)", borderBottom: `1px solid ${T.borderSoft}` }}>
      <div className="flex items-center gap-2 overflow-x-auto px-3 py-2" style={{ scrollbarWidth: "none" }}>
        {/* 都道府県セレクタ */}
        <div className="relative shrink-0">
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-semibold"
            style={{ borderColor: T.goldSoft, background: T.goldBg, color: T.goldDeep }}
          >
            {prefecture}
            <ChevronDown size={13} />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
              <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-40 overflow-hidden rounded-xl border py-1 shadow-lg" style={{ borderColor: T.border, background: T.card }}>
                {prefectures.map((p) => {
                  const on = p === prefecture;
                  return (
                    <button
                      key={p}
                      onClick={() => { onPrefectureChange(p); setOpen(false); }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px]"
                      style={{ color: on ? T.goldDeep : T.ink2, background: on ? T.goldBg : "transparent", fontWeight: on ? 700 : 500 }}
                    >
                      {p}
                      {on && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <span className="h-5 w-px shrink-0" style={{ background: T.line }} aria-hidden />

        {/* コンテンツタブ */}
        {TABS.map((tab) => {
          const on = active === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onSelect(tab.key)}
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 transition ${tab.latin ? "font-serif-latin text-[15px]" : "text-[12.5px]"}`}
              style={on
                ? { background: `linear-gradient(135deg, ${T.gold}, ${T.goldDeep})`, color: "#fdf8ee", fontWeight: 700, boxShadow: "0 2px 8px rgba(138,112,56,0.22)" }
                : { color: T.ink2, fontWeight: 500 }}
            >
              {tab.icon && <Search size={13} />}
              {tab.label}
            </button>
          );
        })}

        {/* ＋ 追加 */}
        <button
          onClick={() => onSelect("add")}
          aria-label="ノートを追加"
          className="ml-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition active:scale-90"
          style={active === "add"
            ? { background: `linear-gradient(135deg, ${T.gold}, ${T.goldDeep})`, borderColor: T.goldDeep, color: "#fdf8ee" }
            : { borderColor: T.goldSoft, background: T.card, color: T.goldDeep }}
        >
          <Plus size={17} />
        </button>
      </div>
    </div>
  );
}
