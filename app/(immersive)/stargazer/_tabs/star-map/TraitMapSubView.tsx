// app/stargazer/_tabs/star-map/TraitMapSubView.tsx
// アーキタイプタブ「特性マップ」サブビュー — 特性マップ + レーダー + 軸詳細 + 深層分析
"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import InteractiveConstellationMap from "../../_components/InteractiveConstellationMap";
import ArchetypeLayerChart from "../../_components/ArchetypeLayerChart";
import ContradictionMapCard from "../../_components/ContradictionMapCard";
import GenerativeCoreCard from "../../_components/GenerativeCoreCard";
import PredictiveCloneCard from "../../_components/PredictiveCloneCard";
import EmptyState from "../../_shared/EmptyState";
// TypeIdentityCard, CoreStarDisplay, SecondaryTypesDisplay removed (old type system removed)
import {
  CollapsibleSection,
  OverviewSection,
  CoreAxesSection,
} from "./shared";
import { useArchetypeTheme } from "../../_components/ArchetypeThemeProvider";
import { hexToRgba } from "../../_utils/color";
import { aggregateRadarDimensions as aggregateRadarDimensionsFn } from "@/lib/stargazer/radarAggregation";
import type { aggregateRadarDimensions } from "@/lib/stargazer/radarAggregation";
import { TRAIT_AXES, type TraitAxisKey } from "@/lib/stargazer/traitAxes";
// getTypeByCode removed (old type system removed)
import type { ArchetypeResult } from "@/lib/stargazer/archetypeResolver";
import type { ContradictionMap as ContradictionMapType } from "@/lib/stargazer/contradictionMap";
import type { GenerativeCoreResult } from "@/lib/stargazer/generativeCore";
import type { PredictiveCloneResult } from "@/lib/stargazer/predictiveClone";
import type { ProfileContent } from "@/lib/stargazer/profileContentGenerator";

interface TraitMapSubViewProps {
  axisScores: Partial<Record<TraitAxisKey, number>>;
  previousAxisScores?: Partial<Record<TraitAxisKey, number>>;
  contradictionMap?: ContradictionMapType;
  archetypeResult?: ArchetypeResult | null;
  understandingLevel?: number;
  radarDimensions: ReturnType<typeof aggregateRadarDimensions>;
  ghostRadarDimensions?: ReturnType<typeof aggregateRadarDimensions>;
  summaryAxes?: ProfileContent["summaryAxes"];
  generativeCoreResult?: GenerativeCoreResult;
  predictiveCloneResult?: PredictiveCloneResult;
  totalObservations: number;
  typeDef?: { code: string; label: string; traits?: Partial<Record<string, number>> } | null;
}

export default function TraitMapSubView({
  axisScores,
  previousAxisScores,
  contradictionMap,
  archetypeResult,
  understandingLevel,
  radarDimensions,
  ghostRadarDimensions,
  summaryAxes,
  generativeCoreResult,
  predictiveCloneResult,
  totalObservations,
  typeDef,
}: TraitMapSubViewProps) {
  const { theme } = useArchetypeTheme();
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    deep_analysis: false,
    axes_detail: true,
  });

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const axisCount = Object.keys(axisScores).length;

  // Build previous radar dimension scores for trend indicators
  const previousRadarScores = useMemo(() => {
    if (!previousAxisScores) return undefined;
    const prevDims = aggregateRadarDimensionsFn(previousAxisScores);
    const map: Record<string, number> = {};
    for (const d of prevDims) {
      map[d.key] = d.score;
    }
    return map;
  }, [previousAxisScores]);

  // ── 空状態: 軸が足りない ──
  if (axisCount < 3) {
    const requiredAxes = 3;
    return (
      <div className="space-y-6 pb-8">
        <EmptyState
          message="特性マップはもう少しで出現します"
          submessage={`あと${requiredAxes - axisCount}つの軸が観測されると、あなたの特性がパターンとして浮かび上がります`}
          variant="stars"
          compact
        />

        {/* ゴーストパターンプレビュー */}
        <motion.div
          className="relative rounded-2xl overflow-hidden p-4"
          style={{
            background: theme
              ? hexToRgba(theme.palette.primary, 0.03)
              : "rgba(176,144,80,0.03)",
            border: `1px dashed ${theme ? hexToRgba(theme.palette.primary, 0.15) : "rgba(176,144,80,0.15)"}`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ duration: 1 }}
        >
          <svg
            viewBox="0 0 320 320"
            className="w-full max-w-[280px] mx-auto"
            style={{ opacity: 0.15 }}
          >
            {/* Ghost grid rings */}
            {[0.25, 0.5, 0.75, 1].map((r) => (
              <circle
                key={r}
                cx="160"
                cy="160"
                r={115 * r}
                fill="none"
                stroke={
                  theme?.palette.textMuted ?? "rgba(100,105,130,0.3)"
                }
                strokeWidth="0.5"
                strokeDasharray="4 4"
              />
            ))}
            {/* Ghost label placeholder */}
            <text
              x="160"
              y="160"
              textAnchor="middle"
              dominantBaseline="middle"
              className="font-display"
              fontSize="14"
              fill={
                theme?.palette.textMuted ?? "rgba(100,105,130,0.4)"
              }
            >
              観測データを収集中...
            </text>
          </svg>
        </motion.div>
      </div>
    );
  }

  // Deep analysis item count
  const deepAnalysisCount = [
    contradictionMap && contradictionMap.entries.length > 0 ? 1 : 0,
    generativeCoreResult && generativeCoreResult.dataCompleteness >= 0.1
      ? 1
      : 0,
    predictiveCloneResult &&
    predictiveCloneResult.predictions.length > 0
      ? 1
      : 0,
  ].reduce((a, b) => a + b, 0);

  const axesCount = summaryAxes?.length ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 pb-6 sm:pb-8 lg:pb-12">
      {/* ═══ Desktop 2-column: Map + Radar | Mobile: stacked ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-6">
        {/* Left: Interactive Trait Map */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
        >
          <InteractiveConstellationMap
            axisScores={axisScores as Record<string, number>}
            previousScores={
              previousAxisScores as Record<string, number> | undefined
            }
            contradictions={contradictionMap?.entries.map((e, i, arr) => ({
              axisA: e.axisId,
              axisB: arr[(i + 1) % arr.length]?.axisId ?? e.axisId,
              severity: e.magnitude,
            }))}
            archetypeCode={archetypeResult?.code}
            understandingLevel={understandingLevel}
          />
        </motion.div>

        {/* Right: Radar + Layer Chart (stacked on mobile) */}
        <div className="space-y-4 sm:space-y-6 mt-4 sm:mt-6 lg:mt-0">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.1 }}
          >
            <OverviewSection
              dimensions={radarDimensions}
              ghostDimensions={ghostRadarDimensions}
              typeDef={typeDef}
              previousScores={previousRadarScores}
            />
          </motion.div>

      {/* ═══ Archetype Layer Chart ═══ */}
      {archetypeResult && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.15 }}
        >
          <ArchetypeLayerChart
            scores={{
              layer1: {
                ...archetypeResult.layer1.scores,
                winner: archetypeResult.layer1.code,
              },
              layer2: {
                ...archetypeResult.layer2.scores,
                winner: archetypeResult.layer2.code,
              },
              layer3: {
                ...archetypeResult.layer3.scores,
                winner: archetypeResult.layer3.code,
              },
              layer4: {
                ...archetypeResult.layer4.scores,
                winner: archetypeResult.layer4.code,
              },
            }}
          />
        </motion.div>
      )}
        </div>
      </div>

      {/* ═══ Axes Detail (expanded by default in this view) ═══ */}
      {summaryAxes && axesCount > 0 && (
        <CollapsibleSection
          id="axes_detail"
          title="軸の詳細"
          subtitle={`${axesCount}つの性格軸`}
          itemCount={axesCount}
          expanded={expandedSections.axes_detail ?? true}
          onToggle={() => toggleSection("axes_detail")}
        >
          <CoreAxesSection axes={summaryAxes} />
        </CollapsibleSection>
      )}

      {/* ═══ Deep Analysis (collapsed by default) ═══ */}
      {deepAnalysisCount > 0 && (
        <CollapsibleSection
          id="deep_analysis"
          title="深層分析"
          subtitle="矛盾・核心・予測クローン"
          itemCount={deepAnalysisCount}
          expanded={expandedSections.deep_analysis ?? false}
          onToggle={() => toggleSection("deep_analysis")}
        >
          <div className="space-y-8">
            {contradictionMap &&
              contradictionMap.entries.length > 0 && (
                <ContradictionMapCard
                  contradictionMap={contradictionMap}
                />
              )}

            {generativeCoreResult &&
              generativeCoreResult.dataCompleteness >= 0.1 && (
                <GenerativeCoreCard
                  generativeCore={generativeCoreResult}
                />
              )}

            {predictiveCloneResult &&
              predictiveCloneResult.predictions.length > 0 && (
                <PredictiveCloneCard
                  cloneResult={predictiveCloneResult}
                />
              )}
          </div>
        </CollapsibleSection>
      )}

      {/* Type Identity & Core Star — old type system removed */}
    </div>
  );
}
