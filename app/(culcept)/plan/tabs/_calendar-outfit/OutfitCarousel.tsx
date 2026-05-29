"use client";

/**
 * Slice 1 — section ④ おすすめコーデの centered-peek carousel
 *
 * 振る舞い:
 *   - 中央のカードを主役にし、左右の隣カードを ~10% 見切れ表示 (peek)。
 *   - 中央カードのみ active (紫枠 + CTA)。 左右ボタン + 下部ドットで遷移。
 *   - 初期表示は中央 index (主役のコーデ)。 CTA で選択状態を保持する。
 *   - state は activeIndex / selectedId のみ。 I/O / network なし。
 *
 * peek レイアウト:
 *   - 各スライド幅 = 80%。 track offset = 10% - activeIndex*80% で中央寄せ。
 *   - 外側 overflow-hidden により左右に約 10% ずつ隣カードが覗く。
 */

import { useEffect, useState } from "react";

import type { CalendarOutfitProposalSource, CalendarOutfitProposalVM } from "./types";
import { getSelectionForDate, saveSelection, toSelectionRecord } from "./outfitSelectionStore";
import { OutfitCard } from "./OutfitCard";
import { CarouselDots } from "./CarouselDots";

export function OutfitCarousel({
  proposals,
  dayIso,
  source,
}: {
  proposals: ReadonlyArray<CalendarOutfitProposalVM>;
  /** 選択保存・復元の対象日 (YYYY-MM-DD) */
  dayIso: string;
  /** 提案の出所 (保存 source 用) */
  source: CalendarOutfitProposalSource;
}) {
  const count = proposals.length;
  const initialIndex = count > 0 ? Math.floor((count - 1) / 2) : 0;
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  // 初期は未選択。 中央カードの CTA を誘いの「このコーデにする」(主役) として見せ、
  // 「選択中」は user が選んだ後の状態にする。
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // B-5D: 同日の保存済み選択を復元（現在の proposals に同 id がある時だけ。 無ければ force しない）。
  // proposals / 日付が変わるたびに再評価し、 activeIndex も範囲内に収める。
  useEffect(() => {
    const saved = getSelectionForDate(dayIso);
    const matchIdx = saved ? proposals.findIndex((p) => p.id === saved.proposalId) : -1;
    if (saved && matchIdx >= 0) {
      setSelectedId(saved.proposalId);
      setActiveIndex(matchIdx);
    } else {
      setSelectedId(null);
      setActiveIndex((prev) => Math.min(prev, Math.max(0, proposals.length - 1)));
    }
  }, [dayIso, proposals]);

  if (count === 0) return null;

  const clamp = (i: number) => Math.min(Math.max(0, i), count - 1);
  const go = (i: number) => setActiveIndex(clamp(i));

  // B-5D: 「このコーデにする」→ 選択を独立 localStorage に保存（学習系・着用記録には書かない）。
  const handleSelect = (proposal: CalendarOutfitProposalVM) => {
    setSelectedId(proposal.id);
    saveSelection(toSelectionRecord(proposal, dayIso, source, new Date().toISOString()));
  };

  const trackTransform = `translateX(calc(10% - ${activeIndex * 80}%))`;

  return (
    <div data-testid="plan-calendar-outfit-carousel">
      <div className="relative">
        {/* スライドトラック (centered-peek) */}
        <div className="overflow-hidden">
          <div
            className="flex transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ transform: trackTransform }}
          >
            {proposals.map((proposal, i) => (
              <div key={proposal.id} className="w-[80%] shrink-0 px-1.5">
                <OutfitCard
                  proposal={proposal}
                  active={i === activeIndex}
                  selected={proposal.id === selectedId}
                  onSelect={() => handleSelect(proposal)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 左右ボタン */}
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(activeIndex - 1)}
              disabled={activeIndex === 0}
              aria-label="前のコーデ"
              data-testid="plan-calendar-outfit-carousel-prev"
              className="absolute left-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-500 shadow-md transition hover:text-violet-600 disabled:opacity-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => go(activeIndex + 1)}
              disabled={activeIndex === count - 1}
              aria-label="次のコーデ"
              data-testid="plan-calendar-outfit-carousel-next"
              className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-500 shadow-md transition hover:text-violet-600 disabled:opacity-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
      </div>

      {count > 1 && <CarouselDots count={count} activeIndex={activeIndex} onSelect={go} />}
    </div>
  );
}
