"use client";

import { GlassCard, GlassBadge } from "@/components/ui/glassmorphism-design";
import type { HistoryItem } from "@/lib/avatar-fitting/types";
import type { MatchBand } from "@/lib/matchScore/index";

type Props = {
  items: HistoryItem[];
};

const BAND_STYLE: Record<MatchBand, string> = {
  green: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  yellow: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  red: "bg-rose-500/20 text-rose-300 border-rose-500/30",
};

const BAND_TEXT: Record<MatchBand, string> = {
  green: "Good", yellow: "OK", red: "NG",
};

const CATEGORY_EMOJI: Record<string, string> = {
  tops: "👕", bottoms: "👖", outer: "🧥",
  shoes: "👟", accessories: "💍", unknown: "👗",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function FittingHistory({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <GlassCard>
      <h3 className="mb-3 text-sm font-medium text-white/60">過去の診断</h3>
      <div className="space-y-2">
        {items.slice(0, 10).map(item => (
          <div key={item.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
            <span className="text-lg">{CATEGORY_EMOJI[item.extractedCategory] ?? "👗"}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{item.overallMatch}</span>
                <GlassBadge className={`text-[10px] ${BAND_STYLE[item.band]}`}>
                  {BAND_TEXT[item.band]}
                </GlassBadge>
              </div>
              {item.avatarComment && (
                <p className="truncate text-xs text-white/40">{item.avatarComment}</p>
              )}
            </div>
            <span className="shrink-0 text-xs text-white/25">{formatDate(item.createdAt)}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
