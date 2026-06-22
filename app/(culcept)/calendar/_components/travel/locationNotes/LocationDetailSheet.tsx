// app/(culcept)/calendar/_components/travel/locationNotes/LocationDetailSheet.tsx
// カードタップで開く詳細ボトムシート（旅行/スポット共通）。
// 写真・バッジ・タイトル・エリア・評価・著者・説明・なぜ特別/知られていない・タグ・CTA。
// CTA は親（LocationNotesScreen）の保存/旅程に追加を共有。
"use client";

import * as React from "react";
import type { LocationItem } from "../../../_lib/travel/types";
import { T, BottomSheet, GOLD_GRADIENT } from "../concierge/primitives";
import { PhotoSlot } from "../PhotoSlot";
import { MapPin, Plus, Heart, Check, Clock } from "../concierge/icons";
import { Rating, AuthorLine, SourceBadge, ClassChip, MetaChip } from "./cards";
// ★評価OS: post-visit 答え合わせ（Stage 0-B）+ Fit-Arc readout（Stage 1-B）。いずれも flag OFF で null＝DOM 不変・local shadow only。
import { PostVisitCheckCard } from "@/app/(culcept)/plan/components/PostVisitCheckCard";
import { PlaceFitArcReadout } from "@/app/(culcept)/plan/components/PlaceFitArcReadout";

const CLASS_LABEL: Record<LocationItem["classification"], string> = { classic: "王道", hidden: "穴場", standard: "定番" };

export function LocationDetailSheet({
  item,
  onClose,
  saved,
  added,
  onToggleSave,
  onAddToItinerary,
}: {
  item: LocationItem | null;
  onClose: () => void;
  saved: boolean;
  added: boolean;
  onToggleSave: () => void;
  onAddToItinerary: () => void;
}) {
  // ★Stage 1-B: 答え合わせ保存 → FitArcReadout 再読込のための version（flag OFF では描画されず無影響）
  const [fitArcVersion, setFitArcVersion] = React.useState(0);
  return (
    <BottomSheet open={!!item} onClose={onClose}>
      {item && (
        <div className="pb-2">
          <div className="relative -mx-5 -mt-1">
            <PhotoSlot photo={item.photo} rounded="rounded-none" className="h-48 w-full" showLabel />
            <div className="absolute left-4 top-3 flex flex-wrap gap-1.5">
              <ClassChip label={item.kind === "trip" ? "旅行プラン" : "スポット"} tone="ink" />
              <ClassChip label={CLASS_LABEL[item.classification]} tone="gold" />
            </div>
          </div>

          <div className="pt-3.5">
            <h2 className="font-serif text-[20px] leading-snug" style={{ color: T.ink, fontWeight: 700 }}>{item.title}</h2>
            <div className="mt-1 flex items-center gap-1 text-[12px]" style={{ color: T.ink2 }}>
              <MapPin size={12} /> {item.areaLabel}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Rating rating={item.rating} count={item.ratingCount} />
              <span className="text-[11px]" style={{ color: T.ink3 }}>·</span>
              <AuthorLine item={item} />
              <SourceBadge source={item.source} />
            </div>

            {/* メタ（trip:期間/スポット数 spot:営業時間） */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.durationLabel && <MetaChip>{item.durationLabel}</MetaChip>}
              {item.spotCount ? <MetaChip>{item.spotCount}スポット</MetaChip> : null}
              {item.hours && (
                <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-[2px] text-[10px]" style={{ borderColor: T.border, background: T.cardAlt, color: T.ink2 }}>
                  <Clock size={10} /> {item.hours}
                </span>
              )}
              <MetaChip>{item.genre}</MetaChip>
            </div>

            <p className="mt-3 text-[13px] leading-relaxed" style={{ color: T.ink2 }}>{item.description}</p>

            {(item.whySpecial || item.whyHidden) && (
              <div className="mt-3 grid gap-2">
                {item.whySpecial && <WhyPanel title="なぜ特別なのか" body={item.whySpecial} />}
                {item.whyHidden && <WhyPanel title="なぜ知られていないのか" body={item.whyHidden} />}
              </div>
            )}

            {item.stops && item.stops.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: T.ink3 }}>立ち寄り先</div>
                <div className="flex flex-wrap gap-1.5">
                  {item.stops.map((s) => <MetaChip key={s}>{s}</MetaChip>)}
                </div>
              </div>
            )}

            {item.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {item.tags.map((t) => (
                  <span key={t} className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: T.cardAlt, color: T.ink2, border: `1px solid ${T.border}` }}>#{t}</span>
                ))}
              </div>
            )}

            {/* ★Fit-Arc readout（観測あり時のみ意味・不足なら empty/「まだ観測不足」。flag OFF で null＝DOM 不変） */}
            <div className="mt-4 flex justify-center">
              <PlaceFitArcReadout placeDescriptor={`${item.title} ${item.areaLabel}`} refreshSignal={fitArcVersion} />
            </div>

            {/* ★post-visit 答え合わせ（flag OFF では null＝既存挙動完全不変。place 記述子は内部で hash 化）。保存後に上の readout を再読込 */}
            <PostVisitCheckCard
              key={item.id}
              placeDescriptor={`${item.title} ${item.areaLabel}`}
              isDiscoveryDomain
              onRecorded={() => setFitArcVersion((v) => v + 1)}
              /* ★Stage 4-A: provenance のみ最小 snapshot（travel item は構造化文脈を持たないため他は null・honest） */
              contextSnapshot={{
                v: 1,
                sourceSurface: "location_detail",
                timeOfDay: null,
                dayType: null,
                gapBucket: null,
                weatherKind: null,
                fatigue: null,
                companion: null,
                mobilityLoad: null,
                locationCategory: null,
              }}
            />

            {/* sticky CTA */}
            <div className="sticky bottom-0 -mx-5 mt-5 flex gap-2 px-5 pb-1 pt-3" style={{ background: `linear-gradient(to top, ${T.bg} 75%, transparent)` }}>
              <button
                onClick={onAddToItinerary}
                disabled={added}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-semibold transition active:scale-[0.98]"
                style={added
                  ? { background: T.greenBg, color: T.green }
                  : { background: GOLD_GRADIENT, color: "#fdf8ee", boxShadow: "0 3px 12px rgba(138,112,56,0.25)" }}
              >
                {added ? <><Check size={15} /> 旅程に追加済み</> : <><Plus size={15} /> 旅程に追加</>}
              </button>
              <button
                onClick={onToggleSave}
                aria-pressed={saved}
                className="flex items-center justify-center gap-1.5 rounded-xl border px-5 py-3 text-[13px] font-medium transition active:scale-[0.98]"
                style={{ borderColor: T.border, background: saved ? T.goldBg : T.card, color: saved ? T.goldDeep : T.ink2 }}
              >
                <Heart size={15} filled={saved} /> {saved ? "保存済み" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function WhyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl p-2.5" style={{ background: T.cardSunk }}>
      <div className="text-[10px] font-semibold" style={{ color: T.goldDeep }}>{title}</div>
      <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: T.ink2 }}>{body}</p>
    </div>
  );
}
