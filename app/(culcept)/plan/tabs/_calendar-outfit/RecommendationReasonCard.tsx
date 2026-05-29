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
import { CAL_OUTFIT_PALETTE, STATUS_TONE_SOFT, STATUS_TONE_TEXT } from "./_palette";
import { SectionHeader } from "./SectionHeader";

export function RecommendationReasonCard({ reason }: { reason: CalendarOutfitReasonVM }) {
  const [open, setOpen] = useState(false);

  return (
    <section data-testid="plan-calendar-outfit-reason-section">
      <SectionHeader title="このコーデが似合う理由" />
      <div className={`${CAL_OUTFIT_PALETTE.card} p-3.5`}>
        <p className={`text-[14px] font-semibold leading-snug ${CAL_OUTFIT_PALETTE.heading}`}>
          {reason.headline}
        </p>

        {/* 主要 5 因子 */}
        {reason.factors.length > 0 && (
          <div className="mt-2.5 grid grid-cols-5 gap-2">
            {reason.factors.map((f) => {
              const tone = f.tone ?? "neutral";
              return (
                <div key={f.id} className="flex flex-col items-center gap-1.5 text-center">
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl ${STATUS_TONE_SOFT[tone]}`}
                    aria-hidden="true"
                  >
                    {f.icon}
                  </span>
                  <span className="text-[10px] leading-tight text-slate-400">{f.label}</span>
                  <span className={`text-xs font-semibold leading-tight ${STATUS_TONE_TEXT[tone]}`}>
                    {f.value}
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
