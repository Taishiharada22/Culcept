"use client";

/**
 * Slice 1 — section ⑤ 提案理由 (presentational)
 *
 * 構成:
 *   - 見出し 1 文 + 主要 5 因子 (icon + label + value) を主役に。
 *   - 補足 body + 判断軸チップは「詳細を見る」開示の中へ (= 死んだ装飾ではなく機能する disclosure)。
 *   - 「最適化」 等の煽り語は使わない。 因子は観測の語彙 (気温 / 移動量 / 環境 / 予定 / 気分)。
 */

import { useState } from "react";

import type { CalendarOutfitReasonVM } from "./types";
import { CAL_OUTFIT_PALETTE, STATUS_TONE_TEXT } from "./_palette";
import { SectionHeader } from "./SectionHeader";
import { CalIcon, REASON_ICON } from "./icons";

export function RecommendationReasonCard({ reason }: { reason: CalendarOutfitReasonVM }) {
  const [open, setOpen] = useState(false);

  return (
    <section data-testid="plan-calendar-outfit-reason-section">
      <SectionHeader title="このコーデが似合う理由" />
      <div className={`${CAL_OUTFIT_PALETTE.card} p-3.5`}>
        <p className={`text-[14px] font-semibold leading-snug ${CAL_OUTFIT_PALETTE.heading}`}>
          {reason.headline}
        </p>

        {/* 理想画像準拠: 1 枚のカード内に 5 項目を横並び。 各項目は「アイコン左 + 右に ラベル/値 の 2 段縦積み」
            （アイコンの下に文字を置かない・個別の囲みチップにしない）。 */}
        {reason.factors.length > 0 && (
          <div className="mt-2.5 grid grid-cols-5 gap-x-2 gap-y-2">
            {reason.factors.map((f) => {
              const tone = f.tone ?? "neutral";
              const svgIcon = REASON_ICON[f.id];
              return (
                <div
                  key={f.id}
                  tabIndex={0}
                  className="group relative flex cursor-default items-center gap-1.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                >
                  <span className="shrink-0 transition-transform duration-150 group-hover:scale-110 group-focus-within:scale-110">
                    {svgIcon ? (
                      <CalIcon name={svgIcon} size={18} className={STATUS_TONE_TEXT[tone]} />
                    ) : (
                      <span className="text-base leading-none" aria-hidden="true">
                        {f.icon}
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-[10px] text-slate-400">{f.label}</p>
                    <p className={`truncate text-[11px] font-semibold ${STATUS_TONE_TEXT[tone]}`}>
                      {f.value}
                    </p>
                  </div>
                  <span className="pointer-events-none absolute -top-8 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-[10px] font-medium text-white shadow-md group-hover:block group-focus-within:block">
                    {f.label} {f.value}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* 詳細開示 (body + 判断軸チップ) */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="plan-calendar-outfit-reason-detail"
          className="mt-3 inline-flex items-center gap-0.5 rounded text-xs font-medium text-violet-600 transition hover:text-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        >
          {open ? "閉じる" : "詳細を見る"}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className={"transition-transform " + (open ? "rotate-90" : "")}
          >
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <div id="plan-calendar-outfit-reason-detail" className="mt-2">
            <p className={`text-xs leading-relaxed ${CAL_OUTFIT_PALETTE.subtle}`}>{reason.body}</p>
            {reason.axisChips.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {reason.axisChips.map((chip) => (
                  <span
                    key={chip.label}
                    className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-600"
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
