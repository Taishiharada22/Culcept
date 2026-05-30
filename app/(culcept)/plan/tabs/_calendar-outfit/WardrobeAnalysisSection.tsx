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
      {/* 理想画像準拠: 5 項目を「それぞれ独立した小カード」として横並び（1 つの大枠に入れない）。 */}
      <div className="grid grid-cols-5 gap-2">
        {stats.map((stat) => (
          <WardrobeStatCard key={stat.id} stat={stat} />
        ))}
      </div>
    </section>
  );
}
