/**
 * Slice 1 — section ④ おすすめコーデ (見出し + 3 枚 carousel)
 */

import type { CalendarOutfitProposalVM } from "./types";
import { SectionHeader } from "./SectionHeader";
import { OutfitCarousel } from "./OutfitCarousel";

export function RecommendedOutfitSection({
  proposals,
}: {
  proposals: ReadonlyArray<CalendarOutfitProposalVM>;
}) {
  return (
    <section data-testid="plan-calendar-outfit-recommended-section">
      <SectionHeader title="おすすめコーデ" hint="左右でめくる" />
      <OutfitCarousel proposals={proposals} />
    </section>
  );
}
