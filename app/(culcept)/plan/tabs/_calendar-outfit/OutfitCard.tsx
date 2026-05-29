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
import { OutfitItemView, toOutfitItemAsset } from "./OutfitItemView";

export function OutfitCard({
  proposal,
  active = true,
  selected = false,
  onSelect,
  worn = false,
  onMarkWorn,
  satisfaction,
  onRate,
}: {
  proposal: CalendarOutfitProposalVM;
  active?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** この日に「実際に着た」記録があるか (B-5E) */
  worn?: boolean;
  /** 「今日これを着た」確認 (選択済みカードにのみ表示) */
  onMarkWorn?: () => void;
  /** 着用後の軽い評価 (1-5。 未評価は undefined) — B-5E-C-A */
  satisfaction?: number;
  /** 「よかった / 微妙」評価 (着用済みカードにのみ表示)。 学習には流さない (隔離 store のみ) */
  onRate?: (value: "good" | "bad") => void;
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

      {/* flat-lay: アイテム表示器 (OutfitItemView が 画像 / シルエット / 欠損 を吸収)。
          現行 mock は画像なし → 全て placeholder (= 既存 SVG シルエット) に落ちるため見た目は不変。 */}
      <div className="mt-3 rounded-2xl bg-gradient-to-br from-violet-50/80 via-white to-white p-4">
        <div className="flex min-h-[120px] flex-wrap items-end justify-center gap-x-3 gap-y-3">
          {proposal.items.map((item) => (
            <div key={item.id} className="flex items-end justify-center">
              <OutfitItemView asset={toOutfitItemAsset(item)} size={active ? 72 : 48} />
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

      {/* B-5E: 選択済みカードに diary 状態（着用→感触）を 1 行に控えめにまとめる。
          薄い区切り線で SYNC/CTA と分け、 着用→評価の流れを自然に見せる（隔離 store のみ・学習なし）。 */}
      {active && selected && (
        <div className="mt-2.5 flex items-center justify-end gap-1.5 border-t border-violet-100/60 pt-2 text-[11px]">
          {!worn ? (
            <button
              type="button"
              onClick={onMarkWorn}
              data-testid={`plan-calendar-outfit-worn-${proposal.id}`}
              className="rounded font-medium text-slate-500 transition hover:text-violet-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              今日これを着た
            </button>
          ) : (
            <>
              <span className="inline-flex items-center gap-0.5 font-medium text-violet-600">
                着用済み
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              {satisfaction != null ? (
                <span className={satisfaction >= 4 ? "font-medium text-violet-600" : "text-slate-500"}>
                  感触: {satisfaction >= 4 ? "よかった" : "微妙"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onRate?.("good")}
                    data-testid={`plan-calendar-outfit-rate-good-${proposal.id}`}
                    className="rounded-full border border-violet-200 px-2 py-0.5 font-medium text-violet-600 transition hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                  >
                    よかった
                  </button>
                  <button
                    type="button"
                    onClick={() => onRate?.("bad")}
                    data-testid={`plan-calendar-outfit-rate-bad-${proposal.id}`}
                    className="rounded-full border border-slate-200 px-2 py-0.5 font-medium text-slate-500 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                  >
                    微妙
                  </button>
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
