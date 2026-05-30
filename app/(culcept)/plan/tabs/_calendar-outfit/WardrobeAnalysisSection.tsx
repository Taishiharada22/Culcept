/**
 * Slice 1 — section ⑥ ワードローブ分析 (5 枚の stat card grid)
 */

import type { CalendarOutfitStatVM } from "./types";
import { CAL_OUTFIT_PALETTE } from "./_palette";
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
      {/* 理想画像準拠: 1 枚の白カード内に 5 項目を横並び（各項目はアイコン左 + 2 段縦積み）。 */}
      <div className={`${CAL_OUTFIT_PALETTE.card} grid grid-cols-5 gap-x-2 gap-y-2 p-3.5`}>
        {stats.map((stat) => (
          <WardrobeStatCard key={stat.id} stat={stat} />
        ))}
      </div>
    </section>
  );
}
