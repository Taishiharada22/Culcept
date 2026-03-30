"use client";

import dynamic from "next/dynamic";
import type { GenomeVisualizationData } from "@/lib/aneurasync/personaGenome";
import { useGenomeExpression } from "../hooks/useGenomeExpression";
import { useDarkGenes } from "../hooks/useDarkGenes";
import ExpressionToggle from "./ExpressionToggle";
import DarkGenePanel from "./DarkGenePanel";

// Lazy-load the 3D canvas to avoid loading Three.js until this tab is active
const GenomeCanvas = dynamic(
  () => import("../_3d/GenomeCanvas"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center rounded-[32px] border border-white/85 bg-white/76 backdrop-blur-xl">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          <span className="text-sm text-slate-400">3D DNA を読み込み中...</span>
        </div>
      </div>
    ),
  },
);

interface Dna3dTabProps {
  visualization: GenomeVisualizationData;
  completeness: number;
}

/**
 * Dna3dTab — Container for the 3D DNA helix visualization.
 * Includes gene expression toggle and strand detail cards.
 */
export default function Dna3dTab({
  visualization,
  completeness,
}: Dna3dTabProps) {
  const expression = useGenomeExpression(visualization.strands);
  const darkGenes = useDarkGenes(visualization.strands);

  return (
    <div className="space-y-5">
      {/* Expression toggle */}
      <div role="status" className="flex items-center justify-between rounded-[20px] bg-white/50 px-5 py-3 backdrop-blur-sm">
        <div className="text-sm font-semibold text-slate-700">遺伝子発現</div>
        <ExpressionToggle
          mode={expression.mode}
          onToggle={expression.toggleMode}
          expressedCount={expression.expressedCount}
          dormantCount={expression.dormantCount}
        />
      </div>

      {/* Context indicator */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: expression.context.season === "spring" ? "春" : expression.context.season === "summer" ? "夏" : expression.context.season === "autumn" ? "秋" : "冬", icon: expression.context.season === "spring" ? "🌸" : expression.context.season === "summer" ? "☀️" : expression.context.season === "autumn" ? "🍂" : "❄️", ariaPrefix: "現在の季節" },
          { label: expression.context.timeOfDay === "morning" ? "朝" : expression.context.timeOfDay === "afternoon" ? "午後" : expression.context.timeOfDay === "evening" ? "夕方" : "夜", icon: expression.context.timeOfDay === "morning" ? "🌅" : expression.context.timeOfDay === "afternoon" ? "☀️" : expression.context.timeOfDay === "evening" ? "🌇" : "🌙", ariaPrefix: "現在の時間帯" },
          { label: `気分 ${expression.context.mood}/5`, icon: expression.context.mood >= 4 ? "😊" : expression.context.mood >= 3 ? "😐" : "😔", ariaPrefix: "現在の気分" },
        ].map((tag) => (
          <span
            key={tag.label}
            className="rounded-full bg-white/60 px-2.5 py-1 text-[10px] text-slate-500 backdrop-blur-sm"
            aria-label={`${tag.ariaPrefix}: ${tag.label}`}
          >
            {tag.icon} {tag.label}
          </span>
        ))}
      </div>

      {/* 3D Canvas */}
      <GenomeCanvas
        strands={visualization.strands}
        overallLabel={visualization.overallLabel}
        overallDescription={visualization.overallDescription}
        completeness={completeness}
        activationMap={expression.activationMap}
        expressionMode={expression.mode}
      />

      {/* Strand detail cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visualization.strands.map((strand) => {
          // Count expressed vs dormant for this strand
          const strandActivations = strand.basePairs.map((bp) => ({
            ...bp,
            activation: expression.activationMap.get(bp.id) ?? 1,
          }));
          const expressed = strandActivations.filter((a) => a.activation > 0.4).length;

          return (
            <div
              key={strand.id}
              className="rounded-[24px] border border-white/85 bg-white/76 px-6 py-5 shadow-[0_12px_32px_rgba(148,163,184,0.1)] backdrop-blur-xl"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-8 w-2 rounded-full"
                    style={{ backgroundColor: strand.color }}
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      {strand.label}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {strand.basePairs.length} 塩基対
                    </div>
                  </div>
                </div>
                <span className="text-[10px] text-slate-400">
                  {expressed}/{strand.basePairs.length} 発現中
                </span>
              </div>

              {/* Top base pairs */}
              <div className="mt-3 flex flex-wrap gap-2">
                {strandActivations
                  .sort((a, b) => b.activation - a.activation)
                  .slice(0, 4)
                  .map((bp) => (
                    <div
                      key={bp.id}
                      className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                      style={{
                        backgroundColor: bp.activation > 0.4
                          ? `${strand.color}15`
                          : "rgba(148,163,184,0.08)",
                        color: bp.activation > 0.4
                          ? strand.color
                          : "#94a3b8",
                      }}
                    >
                      {bp.label.length > 12
                        ? bp.label.slice(0, 12) + "…"
                        : bp.label}
                      <span className="ml-1 opacity-60">
                        {Math.round(bp.activation * 100)}%
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dark Gene Discovery */}
      <DarkGenePanel
        darkCount={darkGenes.darkCount}
        discoveredCount={darkGenes.discoveredCount}
        discoveries={darkGenes.discoveries}
        recentDiscoveryIds={darkGenes.recentDiscoveryIds}
      />
    </div>
  );
}
