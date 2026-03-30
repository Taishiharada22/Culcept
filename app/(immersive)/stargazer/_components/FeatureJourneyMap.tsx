// app/stargazer/_components/FeatureJourneyMap.tsx
// 機能ジャーニーマップ — 特性マップのように8機能の関係性と進捗を表示
"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  GlassCard,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import {
  buildJourneyMap,
  getNextRecommendedFeature,
  getStreakData,
  getNextMilestone,
  markFeatureExplored,
  type JourneyNode,
} from "@/lib/stargazer/retentionHooks";
import type { V4Feature } from "@/lib/stargazer/depthPhaseController";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constellation Node Positions (relative %, like a star map)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NODE_POSITIONS: Record<V4Feature, { x: number; y: number }> = {
  inner_weather:    { x: 50, y: 8 },
  blind_spot:       { x: 22, y: 30 },
  prophecy:         { x: 78, y: 30 },
  unseen_map:       { x: 10, y: 55 },
  alter:            { x: 38, y: 55 },
  decision_oracle:  { x: 85, y: 55 },
  ghost_resonance:  { x: 28, y: 78 },
  psyche_signature: { x: 62, y: 85 },
  // Phase 6 additions
  values_discovery:     { x: 55, y: 35 },
  core_wound:           { x: 65, y: 55 },
  transformation:       { x: 50, y: 65 },
  life_events:          { x: 15, y: 40 },
  act_hexaflex:         { x: 75, y: 40 },
  transform_simulation: { x: 42, y: 78 },
  dream_journal:        { x: 72, y: 78 },
  circadian_rhythm:     { x: 90, y: 35 },
  micro_ema:            { x: 50, y: 48 },
  parts_dialogue:       { x: 20, y: 65 },
};

const PHASE_COLORS: Record<JourneyNode["phaseInLoop"], string> = {
  observe: "rgba(56,189,248,0.9)",
  detect: "rgba(168,85,247,0.9)",
  verify: "rgba(251,191,36,0.9)",
  discover: "rgba(52,211,153,0.9)",
  dialogue: "rgba(244,114,182,0.9)",
  synthesize: "rgba(255,255,255,0.95)",
};

const PHASE_LABELS: Record<JourneyNode["phaseInLoop"], string> = {
  observe: "観測",
  detect: "検出",
  verify: "検証",
  discover: "発見",
  dialogue: "対話",
  synthesize: "統合",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Props
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface FeatureJourneyMapProps {
  availableFeatures: Set<V4Feature>;
  totalObservations: number;
  className?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function FeatureJourneyMap({
  availableFeatures,
  totalObservations,
  className,
}: FeatureJourneyMapProps) {
  const [selectedNode, setSelectedNode] = useState<V4Feature | null>(null);
  const [justUnlocked, setJustUnlocked] = useState<V4Feature | null>(null);

  const journeyNodes = useMemo(() => buildJourneyMap(availableFeatures), [availableFeatures]);
  const nextRecommended = useMemo(() => getNextRecommendedFeature(availableFeatures), [availableFeatures]);
  const streak = useMemo(() => getStreakData(), []);
  const milestone = useMemo(() => getNextMilestone(), []);

  // アンロックアニメーション検出
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prevKey = "culcept_sg_prev_available_features_v1";
    const prevStr = localStorage.getItem(prevKey);
    const prev: V4Feature[] = prevStr ? JSON.parse(prevStr) : [];
    const prevSet = new Set(prev);

    const newlyAvailable = Array.from(availableFeatures).filter((f) => !prevSet.has(f));
    if (newlyAvailable.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time hydration from localStorage
      setJustUnlocked(newlyAvailable[0]);
      setTimeout(() => setJustUnlocked(null), 3000);
    }

    try {
      localStorage.setItem(prevKey, JSON.stringify(Array.from(availableFeatures)));
    } catch {
      // Quota exceeded — non-critical, silently ignore
    }
  }, [availableFeatures]);

  const exploredCount = journeyNodes.filter((n) => n.explored).length;
  const exploredPct = Math.round((exploredCount / journeyNodes.length) * 100);

  return (
    <FadeInView delay={0.05} className={className}>
      <GlassCard variant="elevated" className="relative overflow-hidden" padding="none">
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between mb-1">
            <h3
              className="font-display text-base font-medium"
              style={{ color: "rgba(24,30,50,0.95)" }}
            >
              パターンジャーニー
            </h3>
            <div className="flex items-center gap-2">
              <GlassBadge size="sm" variant="info">
                {exploredCount}/{journeyNodes.length} 探索済
              </GlassBadge>
              {streak.currentStreak >= 3 && (
                <GlassBadge size="sm" variant="warning">
                  {streak.currentStreak}日連続
                </GlassBadge>
              )}
            </div>
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "rgba(72,78,100,0.7)" }}
          >
            観測を重ねるほど、パターンの全容が見えてくる
          </p>
        </div>

        {/* Constellation Map */}
        <div className="relative" style={{ height: 340, overflow: "hidden" }}>
          {/* Background glow */}
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse at 50% 40%, rgba(139,92,246,0.06) 0%, transparent 70%)",
            }}
          />

          {/* Connection Lines (SVG) */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ pointerEvents: "none" }}
          >
            {journeyNodes.flatMap((node) =>
              node.leadsTo.map((targetFeature) => {
                const from = NODE_POSITIONS[node.feature];
                const to = NODE_POSITIONS[targetFeature];
                if (!from || !to) return null;

                const targetNode = journeyNodes.find((n) => n.feature === targetFeature);
                const bothExplored = node.explored && targetNode?.explored;
                const eitherAvailable = node.available || (targetNode?.available ?? false);

                return (
                  <motion.line
                    key={`${node.feature}-${targetFeature}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={
                      bothExplored
                        ? "rgba(168,85,247,0.35)"
                        : eitherAvailable
                          ? "rgba(168,85,247,0.12)"
                          : "rgba(160,170,200,0.08)"
                    }
                    strokeWidth={bothExplored ? 0.4 : 0.2}
                    strokeDasharray={bothExplored ? "none" : "1 1"}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1, delay: 0.3 }}
                  />
                );
              }),
            )}
          </svg>

          {/* Nodes */}
          {journeyNodes.map((node, i) => {
            const pos = NODE_POSITIONS[node.feature];
            const isRecommended = nextRecommended?.feature === node.feature;
            const isUnlocking = justUnlocked === node.feature;
            const isSelected = selectedNode === node.feature;
            const phaseColor = PHASE_COLORS[node.phaseInLoop];

            return (
              <motion.div
                key={node.feature}
                className="absolute"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: "translate(-50%, -50%)",
                  zIndex: isSelected ? 20 : 10,
                }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 + i * 0.06, type: "spring", stiffness: 200 }}
              >
                <button
                  onClick={() => {
                    setSelectedNode(isSelected ? null : node.feature);
                    if (node.explored || node.available) {
                      markFeatureExplored(node.feature);
                    }
                  }}
                  className="relative flex flex-col items-center"
                  style={{ minWidth: 56 }}
                >
                  {/* Recommended pulse */}
                  {isRecommended && node.available && (
                    <motion.div
                      className="absolute rounded-full"
                      style={{
                        width: 52,
                        height: 52,
                        top: -6,
                        left: "50%",
                        marginLeft: -26,
                        background: "rgba(168,85,247,0.15)",
                      }}
                      animate={{
                        scale: [1, 1.4, 1],
                        opacity: [0.6, 0, 0.6],
                      }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    />
                  )}

                  {/* Unlock animation */}
                  <AnimatePresence>
                    {isUnlocking && (
                      <motion.div
                        className="absolute rounded-full"
                        style={{
                          width: 60,
                          height: 60,
                          top: -10,
                          left: "50%",
                          marginLeft: -30,
                          background: `radial-gradient(circle, ${phaseColor}, transparent)`,
                        }}
                        initial={{ scale: 0, opacity: 1 }}
                        animate={{ scale: 3, opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                      />
                    )}
                  </AnimatePresence>

                  {/* Star node */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-300"
                    style={{
                      background: node.explored
                        ? `radial-gradient(circle, ${phaseColor}22, ${phaseColor}08)`
                        : node.available
                          ? "rgba(255,255,255,0.8)"
                          : "rgba(200,200,210,0.2)",
                      border: node.explored
                        ? `2px solid ${phaseColor}44`
                        : node.available
                          ? "1.5px solid rgba(168,85,247,0.2)"
                          : "1px dashed rgba(160,170,200,0.2)",
                      boxShadow: node.explored
                        ? `0 0 12px ${phaseColor}22`
                        : isRecommended && node.available
                          ? "0 0 8px rgba(168,85,247,0.15)"
                          : "none",
                      opacity: node.available ? 1 : 0.4,
                      filter: node.available ? "none" : "grayscale(0.8)",
                    }}
                  >
                    <span style={{ fontSize: "1.1rem" }}>
                      {node.available ? node.icon : "\u{1F512}"}
                    </span>
                  </div>

                  {/* Label */}
                  <span
                    className="mt-1 text-[10px] font-medium leading-none whitespace-nowrap"
                    style={{
                      color: node.explored
                        ? "rgba(24,30,50,0.85)"
                        : node.available
                          ? "rgba(72,78,100,0.65)"
                          : "rgba(160,170,200,0.5)",
                    }}
                  >
                    {node.label}
                  </span>

                  {/* Explored dot */}
                  {node.explored && (
                    <div
                      className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                      style={{
                        background: phaseColor,
                        boxShadow: `0 0 6px ${phaseColor}`,
                      }}
                    />
                  )}
                </button>
              </motion.div>
            );
          })}

          {/* Selected node detail popup */}
          <AnimatePresence>
            {selectedNode && (() => {
              const node = journeyNodes.find((n) => n.feature === selectedNode);
              if (!node) return null;
              const pos = NODE_POSITIONS[selectedNode];
              const popupLeft = pos.x > 60 ? pos.x - 40 : pos.x < 40 ? pos.x : pos.x - 20;

              return (
                <motion.div
                  key="popup"
                  className="absolute z-30"
                  style={{
                    left: `${Math.max(5, Math.min(popupLeft, 60))}%`,
                    top: `${Math.min(pos.y + 8, 70)}%`,
                    width: "40%",
                    minWidth: 180,
                  }}
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  <div
                    className="rounded-xl p-3"
                    style={{
                      background: "rgba(255,255,255,0.95)",
                      backdropFilter: "blur(12px)",
                      border: "1px solid rgba(168,85,247,0.15)",
                      boxShadow: "0 8px 24px rgba(24,32,64,0.1)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">{node.icon}</span>
                      <span
                        className="font-display text-sm font-medium"
                        style={{ color: "rgba(24,30,50,0.9)" }}
                      >
                        {node.label}
                      </span>
                      <GlassBadge
                        size="sm"
                        variant={node.explored ? "success" : node.available ? "info" : "default"}
                      >
                        {node.explored ? "探索済" : node.available ? "利用可" : "未解放"}
                      </GlassBadge>
                    </div>
                    <p
                      className="text-xs leading-relaxed mb-2"
                      style={{ color: "rgba(72,78,100,0.7)" }}
                    >
                      {node.description}
                    </p>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{
                          background: `${PHASE_COLORS[node.phaseInLoop]}15`,
                          color: PHASE_COLORS[node.phaseInLoop],
                        }}
                      >
                        {PHASE_LABELS[node.phaseInLoop]}
                      </span>
                      {node.prerequisites.length > 0 && (
                        <span
                          className="text-[10px]"
                          style={{ color: "rgba(72,78,100,0.5)" }}
                        >
                          前提: {node.prerequisites.map((p) => {
                            const pNode = journeyNodes.find((n) => n.feature === p);
                            return pNode?.label;
                          }).join(", ")}
                        </span>
                      )}
                    </div>
                    {node.available && (
                      <Link
                        href={node.href}
                        className="block w-full text-center py-2 rounded-lg text-xs font-medium transition-all hover:opacity-90"
                        style={{
                          background: node.explored
                            ? "rgba(168,85,247,0.08)"
                            : "rgba(168,85,247,0.9)",
                          color: node.explored
                            ? "rgba(168,85,247,0.9)"
                            : "white",
                        }}
                        onClick={() => markFeatureExplored(node.feature)}
                      >
                        {node.explored ? "もう一度" : "探索する"}
                      </Link>
                    )}
                  </div>
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>

        {/* Next Recommended + Milestone Footer */}
        <div className="px-5 pb-5 space-y-3">
          {/* Next recommended feature */}
          {nextRecommended && nextRecommended.available && (
            <Link href={nextRecommended.href} className="block">
              <motion.div
                className="rounded-xl p-3 flex items-center gap-3 transition-all hover:shadow-md"
                style={{
                  background: "linear-gradient(135deg, rgba(168,85,247,0.06), rgba(236,72,153,0.04))",
                  border: "1px solid rgba(168,85,247,0.12)",
                }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "rgba(168,85,247,0.1)",
                  }}
                >
                  <span className="text-base">{nextRecommended.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-medium"
                    style={{ color: "rgba(168,85,247,0.8)" }}
                  >
                    次におすすめ
                  </p>
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "rgba(24,30,50,0.9)" }}
                  >
                    {nextRecommended.label} — {nextRecommended.description}
                  </p>
                </div>
                <span
                  className="text-sm flex-shrink-0"
                  style={{ color: "rgba(168,85,247,0.5)" }}
                >
                  {"\u2192"}
                </span>
              </motion.div>
            </Link>
          )}

          {/* Milestone progress */}
          {milestone && (
            <div className="rounded-xl p-3" style={{ background: "rgba(251,191,36,0.04)" }}>
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className="text-xs font-medium"
                  style={{ color: "rgba(180,140,40,0.8)" }}
                >
                  次のマイルストーン: {milestone.name}
                </span>
                <span
                  className="text-[10px] font-mono"
                  style={{ color: "rgba(180,140,40,0.6)" }}
                >
                  {milestone.current}/{milestone.target}
                </span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: "rgba(251,191,36,0.1)" }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, rgba(251,191,36,0.6), rgba(245,158,11,0.8))" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${milestone.progress * 100}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
              <p
                className="text-[10px] mt-1"
                style={{ color: "rgba(72,78,100,0.5)" }}
              >
                {milestone.description}
              </p>
            </div>
          )}

          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(160,170,200,0.1)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, rgba(168,85,247,0.4), rgba(236,72,153,0.4))" }}
                initial={{ width: 0 }}
                animate={{ width: `${exploredPct}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
            <span
              className="text-[10px] font-mono"
              style={{ color: "rgba(72,78,100,0.5)" }}
            >
              {exploredPct}%
            </span>
          </div>
        </div>
      </GlassCard>
    </FadeInView>
  );
}
