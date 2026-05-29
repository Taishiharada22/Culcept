/**
 * Slice 1 — section ⑥ ワードローブ分析 (5 枚の stat card grid)
 */

import type { CalendarOutfitStatVM } from "./types";
import { SectionHeader } from "./SectionHeader";
import { WardrobeStatCard } from "./WardrobeStatCard";

export function WardrobeAnalysisSection({
  stats,
}: {
  stats: ReadonlyArray<CalendarOutfitStatVM>;
}) {
  return (
    <section data-testid="plan-calendar-outfit-wardrobe-section">
      <SectionHeader title="ワードローブ分析" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {stats.map((stat) => (
          <WardrobeStatCard key={stat.id} stat={stat} />
        ))}
      </div>
    </section>
  );
}
