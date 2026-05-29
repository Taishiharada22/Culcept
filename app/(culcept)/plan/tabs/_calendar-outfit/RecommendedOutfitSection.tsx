/**
 * Slice 1 — section ④ おすすめコーデ (見出し + 3 枚 carousel)
 */

import type { CalendarOutfitProposalSource, CalendarOutfitProposalVM } from "./types";
import { SectionHeader } from "./SectionHeader";
import { OutfitCarousel } from "./OutfitCarousel";

export function RecommendedOutfitSection({
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
  return (
    <section data-testid="plan-calendar-outfit-recommended-section">
      <SectionHeader title="おすすめコーデ" hint="左右でめくる" />
      <OutfitCarousel proposals={proposals} dayIso={dayIso} source={source} />
    </section>
  );
}
