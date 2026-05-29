/**
 * Slice 1 — section ④ おすすめコーデ card 1 枚 (presentational pure)
 *
 * 構成: タイトル + 用途バッジ + flat-lay (SVG シルエット群) + SYNC スコア + CTA。
 *   - active (carousel 中央) のみ 紫枠 + CTA を表示。 非 active は dim。
 *   - CTA「このコーデにする」は選択状態を切替える (selected で「選択中」へ)。
 *   - SYNC band 色 / badge 色は palette に閉じる (CalendarTab.tsx の色禁止と整合)。
 */

import type { CalendarOutfitProposalVM } from "./types";
import { BADGE_TONE, CAL_OUTFIT_PALETTE, SYNC_BAND_VM } from "./_palette";
import { OutfitItemSilhouette } from "./OutfitItemSilhouette";

export function OutfitCard({
  proposal,
  active = true,
  selected = false,
  onSelect,
}: {
  proposal: CalendarOutfitProposalVM;
  active?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const band = SYNC_BAND_VM[proposal.syncBandKey];

  return (
    <div
      data-testid={`plan-calendar-outfit-card-${proposal.id}`}
      aria-current={active ? "true" : undefined}
      className={
        "rounded-3xl border bg-white/90 backdrop-blur-sm transition-all duration-300 " +
        (active
          ? "border-violet-300 p-5 shadow-md ring-2 ring-violet-400/80"
          : "border-violet-100/60 p-4 opacity-60 shadow-sm")
      }
    >
      {/* ヘッダ: タイトル + バッジ + ムード */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className={`text-sm font-semibold ${CAL_OUTFIT_PALETTE.heading}`}>
            {proposal.title}
          </h4>
          {proposal.badge && (
            <span
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${BADGE_TONE[proposal.badge.tone]}`}
            >
              {proposal.badge.label}
            </span>
          )}
        </div>
        {proposal.moodTag && (
          <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-500">
            {proposal.moodTag}
          </span>
        )}
      </div>

      {/* flat-lay: SVG シルエット群 (実画像は使わない、 服そのものを主役に) */}
      <div className="mt-3 rounded-2xl bg-gradient-to-br from-violet-50/80 via-white to-white p-4">
        <div className="flex min-h-[120px] flex-wrap items-end justify-center gap-x-3 gap-y-3">
          {proposal.items.map((item) => (
            <div key={item.id} className="flex items-end justify-center">
              <OutfitItemSilhouette
                shape={item.shape}
                color={item.color}
                size={active ? 72 : 48}
              />
              <span className="sr-only">{item.category}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SYNC スコア + CTA */}
      <div className="mt-4 flex items-center justify-between">
        <span className="inline-flex items-baseline gap-1.5">
          <span className="text-[11px] tracking-wide text-violet-500">SYNC スコア</span>
          <span className="text-2xl font-bold leading-none text-violet-700">{proposal.syncScore}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${band.pill}`}>
            {band.label}
          </span>
        </span>
        {active && (
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            data-testid={`plan-calendar-outfit-cta-${proposal.id}`}
            className={
              "inline-flex items-center gap-1 rounded-full px-4 py-2 text-[13px] font-semibold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 " +
              (selected
                ? "bg-violet-100 text-violet-700"
                : "bg-gradient-to-r from-violet-500 to-purple-500 text-white hover:from-violet-600 hover:to-purple-600")
            }
          >
            {selected ? "選択中" : "このコーデにする"}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 12l5 5L20 7"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
