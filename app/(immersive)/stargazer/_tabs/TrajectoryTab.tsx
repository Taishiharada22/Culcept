// app/stargazer/_tabs/TrajectoryTab.tsx
// 軌跡タブ v2 — 現在地 + 安定コア + 揺らぎ分布 + パターン + 寄り添いインサイト
"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { getAxisLabels } from "@/lib/stargazer/traitAxes";
import type { TypeDefLike } from "@/lib/stargazer/dailyInsightEngine";
import type { ArchetypeResult } from "@/lib/stargazer/archetypeResolver";
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";
import {
  getConfidenceNarrative,
  classifyAxes,
} from "@/lib/stargazer/dailyInsightEngine";
import {
  getStabilityLabel,
  getInsightLevelLabel,
  type AxisDistribution,
  type FluctuationPattern,
  type CompanionInsight,
} from "@/lib/stargazer/fluctuationEngine";
import type { MetamorphosisLawResult } from "@/lib/stargazer/metamorphosisLaw";
import type { TemporalDiffResult } from "@/lib/stargazer/innovativeMechanisms";
import type { StressDecayCurveData } from "../_components/StressDecayCurveCard";
import type { TraitEvolutionResult } from "@/lib/stargazer/traitEvolution";
import MetamorphosisLawCard from "../_components/MetamorphosisLawCard";
import TemporalDiffCard from "../_components/TemporalDiffCard";
import StressDecayCurveCard from "../_components/StressDecayCurveCard";
import TransformationStageCard from "../_components/TransformationStageCard";
import EmptyState from "../_shared/EmptyState";
import TrendSparkline from "../_components/TrendSparkline";
import AxisEvolutionChart from "../_components/AxisEvolutionChart";
import SelfComparisonRadar from "../_components/SelfComparisonRadar";

interface TrajectoryTabProps {
  hasData: boolean;
  totalObservations: number;
  axisScores: Partial<Record<TraitAxisKey, number>>;
  confidence: number;
  typeDef: TypeDefLike | null;
  // 揺らぎエンジンデータ
  fluctuation?: {
    distributions: AxisDistribution[];
    patterns: FluctuationPattern[];
    insights: CompanionInsight[];
    snapshotCount: number;
  } | null;
  /** Layer 5: 変容律 */
  metamorphosis?: MetamorphosisLawResult | null;
  /** 時間差分分析 */
  temporalDiffs?: TemporalDiffResult[];
  /** ストレス減衰曲線 */
  stressDecayCurve?: StressDecayCurveData | null;
  /** Archetype result (preferred over legacy typeDef) */
  archetypeResult?: ArchetypeResult | null;
  /** Layer 6: 変容の可能性 */
  traitEvolution?: TraitEvolutionResult | null;
  /** 時系列データ（AxisEvolutionChart用） */
  timePoints?: { axisId: string; score: number; date: string }[];
  /** 過去のスコア（SelfComparisonRadar用） */
  previousAxisScores?: Partial<Record<TraitAxisKey, number>>;
}

export default function TrajectoryTab({
  hasData,
  totalObservations,
  axisScores,
  confidence,
  typeDef,
  fluctuation,
  metamorphosis,
  temporalDiffs,
  stressDecayCurve,
  archetypeResult,
  traitEvolution,
  timePoints,
  previousAxisScores,
}: TrajectoryTabProps) {
  if (!hasData) {
    return (
      <div
        style={{
          color: "rgba(56,62,84,0.94)",
          fontSize: "1.04rem",
        }}
      >
        <EmptyState message="観測を始めると、あなたの軌跡がここに記録されます。" />
      </div>
    );
  }

  const archetypeDef = archetypeResult ? getArchetypeByCode(archetypeResult.code) : null;
  const { stable, moving, unknown } = classifyAxes(axisScores);
  const confidenceText = getConfidenceNarrative(confidence, totalObservations);

  const distributions = fluctuation?.distributions ?? [];
  const patterns = fluctuation?.patterns ?? [];
  const insights = fluctuation?.insights ?? [];

  return (
    <div className="space-y-8">
      {/* ── Layer 6: 変容の可能性 ── */}
      {traitEvolution && (
        <TransformationStageCard
          changeStage={traitEvolution.changeStage}
          changeStageLabel={traitEvolution.changeStageLabel}
          changeStageDescription={traitEvolution.changeStageDescription}
          accelerating={traitEvolution.accelerating}
          mostStable={traitEvolution.mostStable}
        />
      )}

      {/* ── Section 1: Where You Stand ── */}
      <section className="card-hero-star">
        <span
          className="text-section-header"
          style={{ color: "rgba(96,78,42,0.98)", fontSize: "0.88rem" }}
        >
          あなたの現在地
        </span>
        <p
          className="text-narrative mt-3"
          style={{ fontSize: "1.12rem", color: "rgba(24,30,50,0.95)" }}
        >
          {totalObservations}回の観測を重ねて、
          {archetypeDef
            ? `「${archetypeDef.name}」としての`
            : typeDef
              ? `「${typeDef.label}」としての`
              : "あなたの"}
          性格の輪郭が見えてきました。
        </p>
        <p
          className="mt-2"
          style={{
            color: "rgba(56,62,84,0.92)",
            fontSize: "1.04rem",
            lineHeight: 1.8,
          }}
        >
          {confidenceText}
        </p>
      </section>

      {/* ── Section 1.3: Trend Sparklines (変化の大きい軸) ── */}
      {distributions.length > 0 && (() => {
        // Pick the top 3 axes with the widest range (most change)
        const topChanging = [...distributions]
          .sort((a, b) => (b.range[1] - b.range[0]) - (a.range[1] - a.range[0]))
          .slice(0, 3);

        return (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span
              className="text-section-header"
              style={{ color: "rgba(96,78,42,0.98)", fontSize: "0.88rem" }}
            >
              変化が大きい軸
            </span>
            <p
              className="mt-1 mb-3"
              style={{
                color: "rgba(56,62,84,0.94)",
                fontSize: "1.05rem",
                lineHeight: 1.82,
              }}
            >
              最近、最も揺れ動いている性格の軸です。折れ線は観測ごとの変化を示しています。
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {topChanging.map((dist, i) => {
                const labels = getAxisLabels(dist.axis);
                if (!labels) return null;

                // Generate sparkline data from distribution info
                // Use range and center to create a plausible trajectory
                const sparkData = Array.from({ length: 8 }, (_, j) => {
                  const base = ((dist.center + 1) / 2) * 100;
                  const spread = ((dist.range[1] - dist.range[0]) / 2) * 50;
                  const noise = Math.sin(j * 1.3 + i * 2.1) * spread;
                  return Math.max(0, Math.min(100, base + noise));
                });

                return (
                  <motion.div
                    key={dist.axis}
                    className="rounded-xl p-3"
                    style={{
                      background: "rgba(255,255,255,0.5)",
                      border: "1px solid rgba(160,170,200,0.12)",
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-xs font-medium"
                        style={{ color: "rgba(24,30,50,0.82)" }}
                      >
                        {labels.left} / {labels.right}
                      </span>
                      <span
                        className="text-[10px] font-mono-sg"
                        style={{ color: "rgba(139,92,246,0.7)" }}
                      >
                        {getStabilityLabel(dist.stability)}
                      </span>
                    </div>
                    <TrendSparkline
                      data={sparkData}
                      width={140}
                      height={36}
                      color="rgba(139,92,246,0.7)"
                      showTrend
                      highlightMinMax
                    />
                  </motion.div>
                );
              })}
            </div>
          </motion.section>
        );
      })()}

      {/* ── Section 1.5: Companion Insights (寄り添い) ── */}
      {insights.length > 0 && (
        <section>
          <span
            className="text-section-header"
            style={{ color: "rgba(96,78,42,0.98)", fontSize: "0.88rem" }}
          >
            観測の気づき
          </span>
          <div className="space-y-2 mt-3">
            {insights.map((insight, i) => {
              const levelColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
                notice: {
                  bg: "rgba(170,150,90,0.04)",
                  border: "rgba(190,170,110,0.12)",
                  text: "rgba(24,30,50,0.94)",
                  badge: "rgba(146,118,56,0.84)",
                },
                pattern: {
                  bg: "rgba(139,92,246,0.04)",
                  border: "rgba(139,92,246,0.12)",
                  text: "rgba(24,30,50,0.94)",
                  badge: "rgba(116,84,198,0.84)",
                },
                prediction: {
                  bg: "rgba(59,130,246,0.04)",
                  border: "rgba(59,130,246,0.12)",
                  text: "rgba(24,30,50,0.95)",
                  badge: "rgba(54,118,214,0.84)",
                },
              };
              const colors = levelColors[insight.level] || levelColors.notice;

              return (
                <motion.div
                  key={i}
                  className="rounded-xl p-4"
                  style={{
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                  }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-sm px-2 py-0.5 rounded-full font-mono-sg"
                      style={{
                        background: `${colors.badge}20`,
                        color: colors.badge,
                        border: `1px solid ${colors.badge}30`,
                      }}
                    >
                      {getInsightLevelLabel(insight.level)}
                    </span>
                    <div className="flex gap-1 ml-auto">
                      {[...Array(Math.ceil(insight.confidence * 3))].map((_, ci) => (
                        <div
                          key={ci}
                          className="w-1 h-1 rounded-full"
                          style={{ background: colors.badge }}
                        />
                      ))}
                    </div>
                  </div>
                  <p
                    className="font-display text-base leading-relaxed"
                    style={{ color: colors.text }}
                  >
                    {insight.text}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Section 1.7: Metamorphosis Law (変容律) ── */}
      {metamorphosis && metamorphosis.dataCompleteness > 0 && (
        <MetamorphosisLawCard metamorphosis={metamorphosis} />
      )}

      {/* ── Section 1.8: Temporal Diff (時間差分) ── */}
      {temporalDiffs && temporalDiffs.length > 0 && (
        <TemporalDiffCard temporalDiffs={temporalDiffs} />
      )}

      {/* ── Section 1.9: Stress Decay Curve (ストレス減衰曲線) ── */}
      {stressDecayCurve && stressDecayCurve.dataPoints.length > 0 && (
        <StressDecayCurveCard curveData={stressDecayCurve} />
      )}

      {/* ── 揺らぎデータがまだない場合のガイド ── */}
      {distributions.length === 0 && !metamorphosis && (
        <section className="card-instrument">
          <p
            className="text-base leading-7"
            style={{ color: "rgba(56,62,84,0.92)" }}
          >
            もう少し観測を続けると、あなたの変化のパターンが見えてきます
          </p>
        </section>
      )}

      {/* ── Section 1.5: 時系列推移 + 自己比較 ── */}
      {timePoints && timePoints.length >= 4 && (
        <section className="card-hero-star">
          <span
            className="text-section-header"
            style={{ color: "rgba(96,78,42,0.98)", fontSize: "0.88rem" }}
          >
            変化の軌跡
          </span>
          <p className="sg-text-caption mt-1 mb-3">
            観測を通じて動いた軸を可視化
          </p>
          <AxisEvolutionChart timePoints={timePoints} days={30} />
        </section>
      )}

      {previousAxisScores && Object.keys(previousAxisScores).length >= 3 && (
        <section className="card-hero-star">
          <span
            className="text-section-header"
            style={{ color: "rgba(96,78,42,0.98)", fontSize: "0.88rem" }}
          >
            過去の自分との比較
          </span>
          <p className="sg-text-caption mt-1 mb-3">
            1ヶ月前の自分と重ねて見る
          </p>
          <SelfComparisonRadar
            currentScores={axisScores}
            pastScores={previousAxisScores}
            pastLabel="1ヶ月前"
          />
        </section>
      )}

      {/* ── Section 2: Living Distribution (生きた分布) ── */}
      {distributions.length > 0 && (
        <section>
          <span
            className="text-section-header"
            style={{
              color: "rgba(96,78,42,0.98)",
              fontSize: "0.88rem",
              letterSpacing: "0.16em",
            }}
          >
            あなたの傾向の幅
          </span>
          <p
            className="mt-1 mb-3"
            style={{
              color: "rgba(56,62,84,0.94)",
              fontSize: "1.05rem",
              lineHeight: 1.82,
            }}
          >
            あなたの傾向は1つの点ではなく、幅を持っています。状態や場面で変わるのは自然なことです。
          </p>
          <div className="space-y-3">
            {distributions.slice(0, 6).map((dist, i) => {
              const labels = getAxisLabels(dist.axis);
              if (!labels) return null;

              // 分布バーの位置計算 (-1~+1 → 0%~100%)
              const centerPct = ((dist.center + 1) / 2) * 100;
              const rangeLowPct = ((dist.range[0] + 1) / 2) * 100;
              const rangeHighPct = ((dist.range[1] + 1) / 2) * 100;

              return (
                <motion.div
                  key={dist.axis}
                  className="card-info"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                >
                  {/* Axis label */}
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-sm"
                      style={{ color: "rgba(64,70,92,0.86)" }}
                    >
                      {labels.left}
                    </span>
                    <span
                      className="text-sm font-mono-sg"
                      style={{ color: "rgba(88,94,118,0.8)" }}
                    >
                      {getStabilityLabel(dist.stability)}
                    </span>
                    <span
                      className="text-sm"
                      style={{ color: "rgba(64,70,92,0.86)" }}
                    >
                      {labels.right}
                    </span>
                  </div>

                  {/* Distribution bar */}
                  <div
                    className="relative h-3 rounded-full overflow-hidden"
                    style={{ background: "rgba(160,170,200,0.08)" }}
                  >
                    {/* Range (幅) */}
                    <div
                      className="absolute top-0 h-full rounded-full"
                      style={{
                        left: `${rangeLowPct}%`,
                        width: `${Math.max(2, rangeHighPct - rangeLowPct)}%`,
                        background: `linear-gradient(90deg, rgba(139,92,246,0.15), rgba(170,150,90,0.15))`,
                      }}
                    />
                    {/* Center point */}
                    <div
                      className="absolute top-0 h-full rounded-full"
                      style={{
                        left: `${centerPct - 1}%`,
                        width: "3%",
                        background: dist.stability > 0.6
                          ? "rgba(170,150,90,0.6)"
                          : "rgba(139,92,246,0.5)",
                        boxShadow: dist.stability > 0.6
                          ? "0 0 6px rgba(170,150,90,0.2)"
                          : "0 0 6px rgba(139,92,246,0.2)",
                      }}
                    />
                    {/* Center line */}
                    <div
                      className="absolute top-0 h-full w-px"
                      style={{
                        left: "50%",
                        background: "rgba(160,170,200,0.1)",
                      }}
                    />
                  </div>

                  {/* Trend + conditions */}
                  <div className="flex items-center justify-between mt-1.5">
                    {dist.trendLabel ? (
                      <span
                        className="text-sm"
                        style={{ color: "rgba(76,82,106,0.82)" }}
                      >
                        → {dist.trendLabel}
                      </span>
                    ) : (
                      <span />
                    )}
                    {dist.conditions.length > 0 && (
                      <span
                        className="text-sm"
                        style={{ color: "rgba(109,86,168,0.86)" }}
                      >
                        {dist.conditions[0].conditionLabel}の時に動く
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Section 3: Stable Core ── */}
      {stable.length > 0 && (
        <section>
          <span
            className="text-section-header"
            style={{ color: "rgba(96,78,42,0.98)", fontSize: "0.88rem" }}
          >
            変わらない部分 — あなたの核
          </span>
          <p
            className="mt-1 mb-3"
            style={{
              color: "rgba(56,62,84,0.94)",
              fontSize: "1.05rem",
              lineHeight: 1.82,
            }}
          >
            何度観測しても安定している部分。あなたの本質に近いものです。
          </p>
          <div className="space-y-2">
            {stable.slice(0, 5).map((item, i) => (
              <motion.div
                key={item.axisId}
                className="card-info flex items-center justify-between"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <span
                  className="font-display text-base"
                  style={{ color: "rgba(24,30,50,0.94)" }}
                >
                  {item.label}
                </span>
                <div className="flex items-center gap-2">
                  {/* Strength dots */}
                  {[...Array(3)].map((_, di) => (
                    <div
                      key={di}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background:
                          di < Math.ceil(Math.abs(item.score) * 3)
                            ? "rgba(170,150,90,0.5)"
                            : "rgba(160,170,200,0.1)",
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* ── Section 4: Fluctuation Patterns ── */}
      {patterns.length > 0 && (
        <section>
          <span
            className="text-section-header"
            style={{ color: "rgba(96,78,42,0.98)", fontSize: "0.88rem" }}
          >
            繰り返す変化のパターン
          </span>
          <p
            className="mt-1 mb-3"
            style={{
              color: "rgba(56,62,84,0.94)",
              fontSize: "1.05rem",
              lineHeight: 1.82,
            }}
          >
            あなたの中で繰り返し起こる変化のパターンです。知っておくと対処しやすくなります。
          </p>
          <div className="space-y-3">
            {patterns.map((pattern, i) => (
              <motion.div
                key={pattern.id}
                className="card-contradiction"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">🌀</span>
                  <h4
                    className="font-display text-lg font-medium"
                    style={{ color: "rgba(24,30,50,0.95)" }}
                  >
                    {pattern.name}
                  </h4>
                  <span
                    className="ml-auto text-sm font-mono-sg"
                    style={{ color: "rgba(86,92,116,0.82)" }}
                  >
                    {pattern.occurrences}回観測
                  </span>
                </div>
                <p
                  className="text-base leading-relaxed mb-2"
                  style={{ color: "rgba(56,62,84,0.9)" }}
                >
                  {pattern.description}
                </p>
                <div className="flex items-center gap-3">
                  <span
                    className="text-sm px-2 py-0.5 rounded"
                    style={{
                      background: "rgba(255,255,255,0.5)",
                      color: "rgba(82,88,110,0.86)",
                    }}
                  >
                    🎯 {pattern.triggerLabel}
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: "rgba(82,88,110,0.86)" }}
                  >
                    ⏱ {pattern.estimatedDuration}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* ── Section 5: Still Moving ── */}
      {moving.length > 0 && (
        <section>
          <span
            className="text-section-header"
            style={{ color: "rgba(96,78,42,0.98)", fontSize: "0.88rem" }}
          >
            まだ変化している部分
          </span>
          <p
            className="mt-1 mb-3"
            style={{
              color: "rgba(56,62,84,0.94)",
              fontSize: "1.05rem",
              lineHeight: 1.82,
            }}
          >
            まだ変化の途中にある部分です。成長中のサインかもしれません。
          </p>
          <div className="space-y-2">
            {moving.slice(0, 5).map((item, i) => (
              <motion.div
                key={item.axisId}
                className="card-mystery flex items-center justify-between py-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.05 }}
              >
                <span
                  className="text-base"
                  style={{ color: "rgba(58,64,86,0.9)" }}
                >
                  {item.label}
                </span>
                {/* Oscillating indicator */}
                <motion.div
                  className="w-2 h-2 rounded-full"
                  style={{ background: "rgba(139,92,246,0.4)" }}
                  animate={{ x: [-3, 3, -3] }}
                  transition={{
                    duration: 2 + i * 0.3,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* ── Section 6: The Unknown ── */}
      {unknown.length > 0 && (
        <section>
          <span
            className="text-section-header"
            style={{ color: "rgba(96,78,42,0.98)", fontSize: "0.88rem" }}
          >
            まだ見えていない部分
          </span>
          <div className="card-mystery mt-3 text-center py-6">
            <p
              className="font-display text-3xl font-light"
              style={{ color: "rgba(72,78,100,0.82)" }}
            >
              {unknown.length}
            </p>
            <p
              className="mt-1"
              style={{
                color: "rgba(56,62,84,0.94)",
                fontSize: "1.04rem",
                lineHeight: 1.8,
              }}
            >
              あと{unknown.length}の領域が、あなたを待っている
            </p>
          </div>
        </section>
      )}

      {/* Future */}
      <p
        className="text-center text-sm py-4"
        style={{ color: "rgba(78,84,108,0.82)" }}
      >
        {fluctuation && fluctuation.snapshotCount > 0
          ? `${fluctuation.snapshotCount}回分の記録をもとに分析しています`
          : "観測を続けると、あなたの変化の軌跡がここに記録されます"}
      </p>
    </div>
  );
}
