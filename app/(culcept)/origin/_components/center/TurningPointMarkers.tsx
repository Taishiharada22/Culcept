"use client";

import { motion } from "framer-motion";
import type { TurningPoint } from "@/lib/origin/v7/workspaceTypes";
import { getTurningPointCategoryLabel } from "@/lib/origin/v7/turningPointData";
import { getPeriodLabel } from "@/lib/origin/v7/periods";

type Props = {
  turningPoints: TurningPoint[];
  onSelectTurningPoint: (tp: TurningPoint) => void;
};

const IMPACT_STYLE: Record<string, { border: string; bg: string; glow: string }> = {
  transformative: {
    border: "border-amber-400/60",
    bg: "bg-amber-50/80",
    glow: "shadow-amber-200/30 shadow-sm",
  },
  significant: {
    border: "border-amber-300/50",
    bg: "bg-amber-50/50",
    glow: "",
  },
  subtle: {
    border: "border-gray-200/50",
    bg: "bg-white/50",
    glow: "",
  },
};

export default function TurningPointMarkers({
  turningPoints,
  onSelectTurningPoint,
}: Props) {
  if (turningPoints.length === 0) return null;

  return (
    <section className="px-3 pb-3">
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <span className="text-sm">⚡</span>
        <h4 className="text-xs font-semibold text-gray-600">転機</h4>
        <span className="ml-auto text-[10px] text-gray-400">
          {turningPoints.length}件
        </span>
      </div>
      <div className="space-y-1.5">
        {turningPoints.map((tp, i) => {
          const style = IMPACT_STYLE[tp.impact] ?? IMPACT_STYLE.subtle;
          return (
            <motion.button
              key={tp.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectTurningPoint(tp)}
              className={`
                flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all
                hover:bg-white/70
                ${style.border} ${style.bg} ${style.glow}
              `}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/80 text-sm">
                {getCategoryIcon(tp.category)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-gray-700">
                  {tp.title}
                </p>
                <p className="text-[10px] text-gray-400">
                  {getPeriodLabel(tp.period)}
                  {" · "}
                  {getTurningPointCategoryLabel(tp.category)}
                </p>
              </div>
              <ImpactIndicator impact={tp.impact} />
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    beginning: "🌅",
    ending: "🌆",
    meeting: "🤝",
    separation: "👋",
    win: "🏆",
    loss: "🕊️",
    defeat: "💔",
    move: "🚃",
    decision: "⚡",
  };
  return icons[category] ?? "⚡";
}

function ImpactIndicator({
  impact,
}: {
  impact: "transformative" | "significant" | "subtle";
}) {
  const config: Record<string, { bars: number; color: string }> = {
    transformative: { bars: 3, color: "bg-amber-400" },
    significant: { bars: 2, color: "bg-amber-300" },
    subtle: { bars: 1, color: "bg-gray-300" },
  };
  const c = config[impact] ?? config.subtle;
  return (
    <div className="flex items-end gap-0.5">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className={`w-[3px] rounded-full ${
            n <= c.bars ? c.color : "bg-gray-200/50"
          }`}
          style={{ height: 4 + n * 3 }}
        />
      ))}
    </div>
  );
}
