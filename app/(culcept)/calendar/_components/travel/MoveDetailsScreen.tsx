// app/(culcept)/calendar/_components/travel/MoveDetailsScreen.tsx
// ⑥ move.png — 移動詳細（出発/到着タイムライン＋距離・運賃／ROUTE MAP（経路上アイコン）／移動サマリー）。
"use client";

import * as React from "react";
import type { TravelScreenProps } from "./screenProps";
import { PhotoSlot } from "./PhotoSlot";
import { RouteMapPreview } from "./RouteMapPreview";
import {
  T,
  ConciergeCard,
  ConciergeHeader,
  SectionLabel,
  TripSummaryCard,
} from "./concierge/primitives";
import { Bookmark, Flag, TransportIcon } from "./concierge/icons";

export default function MoveDetailsScreen({ trip, day, onClose, onOpenMap }: TravelScreenProps) {
  const { legs, summary } = day.move;

  return (
    <div className="flex h-full flex-col">
      <ConciergeHeader
        title="移動詳細"
        subLabel="Move Details"
        subCaps
        onBack={onClose}
        right={<button aria-label="保存" className="flex h-9 w-9 items-center justify-center"><Bookmark size={18} /></button>}
      />

      <div className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 pb-6 pt-3">
        <TripSummaryCard
          thumb={<PhotoSlot photo={day.heroPhoto} className="h-12 w-16" rounded="rounded-lg" />}
          title={trip.title}
          meta={`${day.monthDayLabel} (${day.weekdayLabel}) ${day.dayIndex}日目`}
        />

        {/* ヒント */}
        <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[12px]" style={{ borderColor: T.borderSoft, background: T.cardAlt, color: T.ink2 }}>
          <span style={{ color: T.goldDeep }}><TransportIcon mode="walk" size={16} /></span>
          移動はすべて最適な手段でご案内しています。
        </div>

        {/* タイムライン */}
        <ConciergeCard className="p-3">
          <ol>
            {legs.map((leg, idx) => {
              const last = idx === legs.length - 1;
              return (
                <li key={leg.id} className="flex gap-2">
                  {/* 時刻＋出発/到着 */}
                  <div className="w-11 shrink-0 pt-2 text-right">
                    <div className="text-[12px] font-semibold tabular-nums" style={{ color: T.ink }}>{leg.time}</div>
                    <div className="text-[9px]" style={{ color: T.ink3 }}>{leg.endpointKind === "depart" ? "出発" : "到着"}</div>
                  </div>
                  {/* コネクタ */}
                  <div className="relative flex w-4 shrink-0 flex-col items-center">
                    <span className="z-10 mt-2.5 h-2.5 w-2.5 rounded-full" style={{ background: leg.isDestination ? T.goldDeep : T.gold, boxShadow: `0 0 0 2px ${T.card}` }} />
                    {!last && <span className="absolute top-3 bottom-0 w-px" style={{ background: T.line }} />}
                  </div>
                  {/* 名前＋移動 */}
                  <div className="flex flex-1 items-start justify-between gap-2 border-b py-2.5" style={{ borderColor: last ? "transparent" : T.borderSoft }}>
                    <div className="min-w-0">
                      <div className="font-serif text-[14px] leading-tight" style={{ color: T.ink, fontWeight: 600 }}>{leg.name}</div>
                      {leg.sub && <div className="text-[10px]" style={{ color: T.ink3 }}>{leg.sub}</div>}
                    </div>
                    {leg.isDestination ? (
                      <div className="flex shrink-0 items-center gap-1 text-[11px] font-medium" style={{ color: T.goldDeep }}>
                        <Flag size={14} /> 目的地
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-3 text-right">
                        <div>
                          <div className="flex items-center justify-end gap-1 text-[11px]" style={{ color: T.ink2 }}>
                            {leg.mode && <span style={{ color: T.goldDeep }}><TransportIcon mode={leg.mode} size={14} /></span>}
                            {leg.modeLabel}
                          </div>
                          <div className="text-[10px]" style={{ color: T.ink3 }}>{leg.durationText}</div>
                        </div>
                        <div className="w-14">
                          <div className="text-[11px] tabular-nums" style={{ color: T.ink2 }}>{leg.distanceText ?? ""}</div>
                          <div className="text-[10px] tabular-nums" style={{ color: T.ink3 }}>{leg.fareText ?? "—"}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </ConciergeCard>

        {/* ROUTE MAP */}
        <ConciergeCard className="p-3">
          <SectionLabel en="Route Map" ja="ルートマップ" className="mb-2" />
          <RouteMapPreview stops={day.routeStops} height={150} showTransportIcons onOpen={() => onOpenMap()} />
        </ConciergeCard>

        {/* 移動サマリー */}
        <ConciergeCard className="p-4">
          <SectionLabel en="Move Summary" ja="移動サマリー" className="mb-3" />
          <div className="flex items-stretch gap-3">
            <div className="grid flex-1 grid-cols-3 gap-2">
              {summary.perMode.map((m) => (
                <div key={m.mode} className="text-center">
                  <span className="inline-flex" style={{ color: T.goldDeep }}><TransportIcon mode={m.mode} size={20} /></span>
                  <div className="mt-1 text-[10px]" style={{ color: T.ink3 }}>{m.label}</div>
                  <div className="font-serif text-[14px]" style={{ color: T.ink, fontWeight: 600 }}>{m.durationText}</div>
                  <div className="text-[9px] tabular-nums" style={{ color: T.ink3 }}>{m.distanceText}</div>
                </div>
              ))}
            </div>
            <div className="flex w-24 shrink-0 flex-col items-center justify-center rounded-xl px-2 py-2 text-center" style={{ background: T.goldBg }}>
              <div className="text-[9px]" style={{ color: T.ink3 }}>合計</div>
              <div className="font-serif text-[20px] leading-none" style={{ color: T.goldDeep, fontWeight: 700 }}>{summary.totalDurationText}</div>
              <div className="mt-1 text-[10px] tabular-nums" style={{ color: T.ink2 }}>{summary.totalDistanceText}</div>
              <div className="text-[10px] tabular-nums" style={{ color: T.ink2 }}>{summary.totalFareText}</div>
            </div>
          </div>
        </ConciergeCard>

        <p className="text-center text-[10px]" style={{ color: T.ink3 }}>※交通状況により前後する場合がございます。</p>
      </div>
    </div>
  );
}
