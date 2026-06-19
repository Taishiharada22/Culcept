// app/(culcept)/calendar/_components/travel/RouteMapPreview.tsx
// 静的風 ROUTE MAP プレビュー（外部 API 不使用・コスト0）。番号ピン＋経路線（＋move は経路上に交通アイコン）。
// 「地図を開く / 地図で見る」押下で初めて実 Google 地図（TravelMapModal）を lazy 起動する＝コスト抑制。
"use client";

import * as React from "react";
import type { RouteStop } from "../../_lib/travel/types";
import { T, GOLD_GRADIENT } from "./concierge/primitives";
import { TransportIcon, Map as MapGlyph } from "./concierge/icons";

const STREETS: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(120,100,60,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(120,100,60,0.06) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

/** coords を 0..100(%) のピン位置へ正規化。coords 欠落は均等配置に fallback。 */
function computePositions(stops: RouteStop[]): { x: number; y: number }[] {
  const withCoords = stops.filter((s) => s.coords);
  if (withCoords.length < 2) {
    return stops.map((_, i) => ({ x: 12 + (i * 76) / Math.max(1, stops.length - 1), y: 50 + (i % 2 === 0 ? -8 : 8) }));
  }
  const lats = withCoords.map((s) => s.coords!.lat);
  const lngs = withCoords.map((s) => s.coords!.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;
  const PAD = 14;
  return stops.map((s, i) => {
    if (!s.coords) return { x: 12 + (i * 76) / Math.max(1, stops.length - 1), y: 50 };
    const x = PAD + ((s.coords.lng - minLng) / spanLng) * (100 - 2 * PAD);
    const y = PAD + (1 - (s.coords.lat - minLat) / spanLat) * (100 - 2 * PAD);
    return { x, y };
  });
}

export function RouteMapPreview({
  stops,
  className = "",
  onOpen,
  openLabel = "地図を開く",
  showTransportIcons = false,
  height = 150,
}: {
  stops: RouteStop[];
  className?: string;
  onOpen?: () => void;
  openLabel?: string;
  showTransportIcons?: boolean;
  height?: number;
}) {
  const pos = React.useMemo(() => computePositions(stops), [stops]);
  const linePts = pos.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl ${className}`}
      style={{ height, background: "linear-gradient(180deg, #efe7d6 0%, #e8dec9 100%)" }}
    >
      <div className="absolute inset-0" style={STREETS} aria-hidden />
      {/* 川（装飾） */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path d="M18 -5 C 22 30, 10 55, 16 105" stroke="#b9cdd8" strokeWidth="2.4" fill="none" opacity="0.7" />
      </svg>
      {/* 経路線 */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <polyline points={linePts} fill="none" stroke={T.gold} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 2.4" opacity="0.9" />
      </svg>

      {/* 経路上の交通アイコン（move のみ） */}
      {showTransportIcons &&
        stops.map((s, i) => {
          if (!s.modeToNext || i >= pos.length - 1) return null;
          const mx = (pos[i].x + pos[i + 1].x) / 2;
          const my = (pos[i].y + pos[i + 1].y) / 2;
          return (
            <div
              key={`t${i}`}
              className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
              style={{ left: `${mx}%`, top: `${my}%`, background: T.card, color: T.goldDeep, boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}
            >
              <TransportIcon mode={s.modeToNext} size={13} />
            </div>
          );
        })}

      {/* 番号ピン */}
      {pos.map((p, i) => (
        <div
          key={i}
          className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold"
          style={{ left: `${p.x}%`, top: `${p.y}%`, background: GOLD_GRADIENT, color: "#fdf8ee", boxShadow: "0 2px 6px rgba(80,60,20,0.3)" }}
        >
          {stops[i]?.order ?? i + 1}
        </div>
      ))}

      {/* 地図を開く（ここで初めて実 API） */}
      {onOpen && (
        <button
          onClick={onOpen}
          className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium"
          style={{ background: `${T.card}f0`, color: T.ink2, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
        >
          <MapGlyph size={13} /> {openLabel}
        </button>
      )}
    </div>
  );
}
