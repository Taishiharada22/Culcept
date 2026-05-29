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
import { OutfitCollage } from "./OutfitCollage";

export function OutfitCard({
  proposal,
  active = true,
  selected = false,
  onSelect,
  worn = false,
  onMarkWorn,
  satisfaction,
  onRate,
  onUndoWorn,
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
  /** 「着用済み」の取り消し (worn + rating をまとめて解除) — Undo Polish */
  onUndoWorn?: () => void;
}) {
  const band = SYNC_BAND_VM[proposal.syncBandKey];

  return (
    <div
      data-testid={`plan-calendar-outfit-card-${proposal.id}`}
      aria-current={active ? "true" : undefined}
      className={
        "relative rounded-3xl border bg-white/90 backdrop-blur-sm transition-all duration-300 " +
        (active
          ? "border-violet-300 p-5 shadow-md ring-2 ring-violet-400/80"
          : "scale-[0.97] border-violet-100/60 p-4 opacity-60 shadow-sm")
      }
    >
      {/* 非 active でも「選択中」が分かる極小マーカー（active は CTA で表示するため出さない） */}
      {selected && !active && (
        <>
          <span
            className="absolute right-2.5 top-2.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-100 text-violet-600 ring-1 ring-violet-200"
            aria-hidden="true"
            data-testid={`plan-calendar-outfit-selected-mark-${proposal.id}`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="sr-only">選択中</span>
        </>
      )}

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

      {/* styling board: アイテムを少し重ねて 1 枚のコーデとして見せる（OutfitCollage）。
          外枠は縦長（mx-auto + maxWidth で portrait に寄せる）。 実画像 / SVG / 欠損も同じ board 上。 */}
      <div
        className="mt-3 mx-auto overflow-visible rounded-2xl bg-gradient-to-br from-violet-50/80 via-white to-white p-2.5"
        style={{ maxWidth: active ? 320 : 208 }}
      >
        <OutfitCollage items={proposal.items} active={active} />
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
          着用→評価の流れを自然に見せ、 誤操作は「取り消す」で戻せる（隔離 store のみ・学習なし）。
          感触は 2 ボタンのトグルで、 選択中を塗りで示す＝表示と再評価を兼ねる。 */}
      {active && selected && (
        <div className="mt-2.5 flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1 border-t border-violet-100/60 pt-2 text-[11px]">
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
              {/* 感触トグル（選択中は塗り。 もう一方を押せば再評価＝rating 修正） */}
              <button
                type="button"
                onClick={() => onRate?.("good")}
                aria-pressed={satisfaction != null && satisfaction >= 4}
                data-testid={`plan-calendar-outfit-rate-good-${proposal.id}`}
                className={
                  "rounded-full border px-2 py-0.5 font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 " +
                  (satisfaction != null && satisfaction >= 4
                    ? "border-violet-300 bg-violet-100 text-violet-700"
                    : "border-violet-200 text-violet-600 hover:bg-violet-50")
                }
              >
                よかった
              </button>
              <button
                type="button"
                onClick={() => onRate?.("bad")}
                aria-pressed={satisfaction != null && satisfaction <= 2}
                data-testid={`plan-calendar-outfit-rate-bad-${proposal.id}`}
                className={
                  "rounded-full border px-2 py-0.5 font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 " +
                  (satisfaction != null && satisfaction <= 2
                    ? "border-slate-300 bg-slate-100 text-slate-600"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50")
                }
              >
                微妙
              </button>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onUndoWorn}
                data-testid={`plan-calendar-outfit-worn-undo-${proposal.id}`}
                className="rounded text-slate-400 transition hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              >
                取り消す
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
