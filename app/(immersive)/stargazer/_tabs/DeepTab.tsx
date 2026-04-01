// app/stargazer/_tabs/DeepTab.tsx
// 深層タブ v6 — 世界最高水準の自己解読エンジン
// 4層深度レイヤー構造 (表層 → パターン → 構造 → 深淵)
// Apple Intelligence × Spotify Wrapped × Calm 級のビジュアル体験
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { localizeText } from "@/lib/stargazer/textLocalizer";
import { motion, AnimatePresence } from "framer-motion";
import { inferShadowProfile, type ShadowProfile } from "@/lib/stargazer/shadowInference";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { TRAIT_AXES } from "@/lib/stargazer/traitAxes";
import type { ContextDifference } from "@/lib/stargazer/traitCards";
import type {
  ContextNarrative,
  ContradictionInsight,
} from "@/lib/stargazer/dailyInsightEngine";
import type { SelfGapResult } from "@/lib/relational/types";
import type { AttractionProfile } from "@/lib/orbiter/types";
import type {
  EntropySignature,
  ResonancePrediction,
  PhantomChoiceResult,
  MetaObservationInsight,
} from "@/lib/stargazer/innovativeMechanisms";
import type { JudgmentArchaeologyResult } from "@/lib/stargazer/judgmentArchaeology";
import type { WhyInsight } from "@/lib/stargazer/explanationEngine";
import type { ArchetypeResult, DualArchetypeResult } from "@/lib/stargazer/archetypeResolver";
import type { ArchetypeCode } from "@/lib/stargazer/archetypeTypes";
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";
import type { BehavioralInsight } from "@/lib/stargazer/behavioralInsightEngine";
import type { DataQualityScore } from "@/lib/stargazer/validation/dataQuality";
import type { TraitEvolutionSummary } from "../_components/GrowthStageCard";

// Components
import SelfGapPanel from "../_components/SelfGapPanel";
import AttractionDiscoverySection from "../_components/AttractionDiscoverySection";
import EntropySignatureCard from "../_components/EntropySignatureCard";
import PhantomChoiceCard from "../_components/PhantomChoiceCard";
import MetaObservationCard from "../_components/MetaObservationCard";
import JudgmentArchaeologyCard from "../_components/JudgmentArchaeologyCard";
import WhyInsightSection from "../_components/WhyInsightSection";
import ArchetypeIdentityCard from "../_components/ArchetypeIdentityCard";
import BehavioralInsightSection from "../_components/BehavioralInsightSection";
import DataQualityBadge from "../_components/DataQualityBadge";
import GrowthStageCard from "../_components/GrowthStageCard";
import DepthLayerAccordion from "../_components/DepthLayerAccordion";
import CoreWoundCard from "../_components/CoreWoundCard";
import EmptyState from "../_shared/EmptyState";
import { NoContradictionsYet, NoInsightsYet } from "../_components/EmptyStates";
import ExpansionAxesSection, { type ExpansionAxisData } from "../_components/ExpansionAxesSection";
import UnobservedSection from "../_components/UnobservedSection";
import LiveSkyPanel from "../_components/LiveSkyPanel";
import AxisOverviewPanel from "../_components/AxisOverviewPanel";
import ObservationConsole from "../_components/ObservationConsole";
import SimulationCards from "../_components/SimulationCards";
import V4EngineHub from "../_components/V4EngineHub";
import InsightCardDisplay from "../_components/InsightCardDisplay";
import CognitiveFitDisplay from "../_components/CognitiveFitDisplay";
import type { InsightCardCollection } from "@/types/stargazer";
import { generateCrossAxisInsights, type CrossAxisInsight } from "@/lib/stargazer/crossAxisPatterns";
import {
  AxisRadarEvolution,
  ContradictionWeb,
  GrowthTimeline,
  type GrowthMilestone,
} from "../_components/PatternVisualization";

interface DeepTabProps {
  hasData: boolean;
  contextNarratives: ContextNarrative[];
  contextDiffs: ContextDifference[];
  contradictions: ContradictionInsight[];
  unobservedAreas: {
    axis: TraitAxisKey;
    label: string;
    category: string;
    suggestion: string;
  }[];
  axisScores: Partial<Record<TraitAxisKey, number>>;
  totalObservations: number;
  entropySignature?: EntropySignature | null;
  resonancePredictions?: ResonancePrediction[];
  phantomChoices?: PhantomChoiceResult[];
  metaInsights?: MetaObservationInsight[];
  judgmentArchaeology?: JudgmentArchaeologyResult | null;
  whyInsights?: WhyInsight[];
  archetypeResult?: ArchetypeResult | null;
  dualArchetypeResult?: DualArchetypeResult | null;
  previousAxisScores?: Partial<Record<TraitAxisKey, number>>;
  growthMilestones?: GrowthMilestone[];
  behavioralInsights?: BehavioralInsight[];
  dataQuality?: DataQualityScore;
  traitEvolution?: TraitEvolutionSummary | null;
  isBetaTester?: boolean;
  /** P4: 拡張軸データ（profile API から） */
  expansionAxes?: ExpansionAxisData[];
}

// ═══════════════════════════════════════════════════════════════
// Depth Ambient Background
// ═══════════════════════════════════════════════════════════════

function DepthAmbience() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px]"
        style={{
          background: "radial-gradient(ellipse at center, rgba(139,92,246,0.03) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px]"
        style={{
          background: "radial-gradient(ellipse at center, rgba(170,150,90,0.02) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Depth Navigation
// ═══════════════════════════════════════════════════════════════

function DepthNavigator({ activeDepth, onJump }: { activeDepth: number; onJump: (level: number) => void }) {
  const depths = [
    { level: 1, label: "表層", color: "#6B9FD4" },
    { level: 2, label: "パターン", color: "#9F7AEA" },
    { level: 3, label: "構造", color: "#D4956B" },
    { level: 4, label: "深淵", color: "#CD6B6B" },
  ];
  return (
    <div className="flex items-center gap-1 mb-6">
      {depths.map((d, i) => (
        <button
          key={d.level}
          onClick={() => onJump(d.level)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-300"
          style={{
            background: activeDepth === d.level ? `linear-gradient(135deg, ${d.color}15, ${d.color}08)` : "transparent",
            border: `1px solid ${activeDepth === d.level ? d.color + "25" : "transparent"}`,
          }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full transition-all duration-300"
            style={{
              background: d.color,
              opacity: activeDepth === d.level ? 1 : 0.25,
              boxShadow: activeDepth === d.level ? `0 0 6px ${d.color}60` : "none",
            }}
          />
          <span
            className="text-[11px] font-medium transition-all duration-300"
            style={{ color: d.color, opacity: activeDepth === d.level ? 0.9 : 0.35 }}
          >
            {d.label}
          </span>
          {i < depths.length - 1 && (
            <div className="w-4 h-px ml-1" style={{ background: `linear-gradient(90deg, ${d.color}20, ${depths[i + 1].color}20)` }} />
          )}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Cinematic Section Header
// ═══════════════════════════════════════════════════════════════

function CinematicHeader({ label, sublabel, accentColor }: { label: string; sublabel: string; accentColor?: string }) {
  const color = accentColor || "rgba(146,118,56,0.84)";
  return (
    <motion.div
      className="mb-4"
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.22 }}
    >
      <div className="flex items-center gap-3 mb-1.5">
        <div className="h-px flex-1 max-w-[40px]" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
        <span className="text-[10px] font-mono-sg tracking-[0.3em] uppercase" style={{ color, opacity: 0.8 }}>{sublabel}</span>
      </div>
      <h3 className="font-display text-[1.2rem] font-semibold leading-tight" style={{ color: "rgba(24,30,50,0.96)" }}>{label}</h3>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Premium Narrative Text
// ═══════════════════════════════════════════════════════════════

function NarrativeText({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.p
      className="text-[1.02rem] leading-[1.9] mb-5"
      style={{ color: "rgba(56,62,84,0.92)" }}
      initial={{ opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.22, delay }}
    >
      {children}
    </motion.p>
  );
}

// ═══════════════════════════════════════════════════════════════
// Premium Stat Pill
// ═══════════════════════════════════════════════════════════════

function StatPill({ value, label, color, delay = 0 }: { value: number | string; label: string; color: string; delay?: number }) {
  return (
    <motion.div
      className="flex flex-col items-center px-4 py-3 rounded-xl"
      style={{ background: `linear-gradient(135deg, ${color}08, ${color}03)`, border: `1px solid ${color}12` }}
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.22, delay }}
    >
      <span className="font-mono-sg text-xl font-semibold" style={{ color: `${color}dd` }}>{value}</span>
      <span className="text-[11px] mt-0.5" style={{ color: "rgba(72,78,100,0.7)" }}>{label}</span>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Premium Contradiction Card
// ═══════════════════════════════════════════════════════════════

function ContradictionCard({ contradiction, index }: { contradiction: ContradictionInsight; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <motion.div
      className="rounded-2xl overflow-hidden cursor-pointer"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.75) 0%, rgba(251,248,242,0.65) 100%)",
        border: "1px solid rgba(170,150,90,0.1)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.03)",
      }}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: index * 0.06 }}
      onClick={() => setIsExpanded(!isExpanded)}
      layout
    >
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] font-medium px-2.5 py-1 rounded-lg" style={{ background: "linear-gradient(135deg, rgba(170,150,90,0.12), rgba(170,150,90,0.05))", color: "rgba(146,118,56,0.9)", border: "1px solid rgba(170,150,90,0.08)" }}>
            {contradiction.cardA.label}
          </span>
          <svg width="16" height="8" viewBox="0 0 16 8" fill="none">
            <path d="M1 4H15M15 4L12 1M15 4L12 7" stroke="rgba(139,92,246,0.3)" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M15 4H1M1 4L4 1M1 4L4 7" stroke="rgba(170,150,90,0.3)" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="text-[11px] font-medium px-2.5 py-1 rounded-lg" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(139,92,246,0.05))", color: "rgba(116,84,198,0.9)", border: "1px solid rgba(139,92,246,0.08)" }}>
            {contradiction.cardB.label}
          </span>
        </div>
        <p className="text-[0.98rem] leading-[1.85]" style={{ color: "rgba(42,48,70,0.94)" }}>{localizeText(contradiction.narrative)}</p>
        <AnimatePresence>
          {isExpanded && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
              <div className="mt-3 px-4 py-3 rounded-xl" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.04), rgba(170,150,90,0.03))", borderLeft: "2px solid rgba(139,92,246,0.15)" }}>
                <p className="text-[0.88rem] leading-[1.75]" style={{ color: "rgba(100,86,160,0.85)" }}>
                  この矛盾は、場面によって異なる「あなたの使い分け」を示しています。{contradiction.cardA.label}的な面と{contradiction.cardB.label}的な面の両方を持つことは、状況への柔軟な適応力の表れです。
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex justify-end mt-2">
          <span className="text-[10px]" style={{ color: "rgba(120,126,150,0.5)" }}>{isExpanded ? "閉じる" : "タップして詳細"}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Premium Context Narrative Card
// ═══════════════════════════════════════════════════════════════

const CONTEXT_CONFIG: Record<string, { color: string; icon: string }> = {
  friends: { color: "rgba(74,222,128,0.85)", icon: "友" },
  romance: { color: "rgba(244,114,182,0.85)", icon: "恋" },
  work: { color: "rgba(96,165,250,0.85)", icon: "仕" },
  family: { color: "rgba(251,191,36,0.85)", icon: "家" },
  one_on_one: { color: "rgba(168,85,247,0.85)", icon: "対" },
  online: { color: "rgba(245,158,11,0.85)", icon: "網" },
};

function ContextNarrativeCard({ narrative, diff, index }: { narrative: ContextNarrative; diff?: ContextDifference; index: number }) {
  const framingConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
    protective: { label: "自分を守るための変化", color: "rgba(210,92,152,0.84)", bg: "rgba(244,114,182,0.06)", border: "rgba(244,114,182,0.12)" },
    authentic: { label: "素の自分が出ている", color: "rgba(146,118,56,0.84)", bg: "rgba(170,150,90,0.06)", border: "rgba(170,150,90,0.12)" },
    adaptive: { label: "場面に合わせた変化", color: "rgba(74,132,214,0.84)", bg: "rgba(96,165,250,0.06)", border: "rgba(96,165,250,0.12)" },
  };
  const framing = framingConfig[narrative.framing] || framingConfig.adaptive;
  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.7) 0%, rgba(248,246,240,0.6) 100%)", border: "1px solid rgba(200,190,170,0.1)", backdropFilter: "blur(12px)", boxShadow: "0 2px 12px rgba(0,0,0,0.02)" }}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: index * 0.06 }}
    >
      <div className="p-4">
        <p className="text-[0.98rem] leading-[1.85] mb-3" style={{ color: "rgba(42,48,70,0.94)" }}>{localizeText(narrative.narrative)}</p>
        {diff && (
          <div className="space-y-2 mb-3">
            {diff.contexts.map((ctx) => {
              const config = CONTEXT_CONFIG[ctx.context];
              return (
                <div key={ctx.context} className="flex items-center gap-2">
                  <span className="text-[11px] w-8 text-center font-medium rounded" style={{ color: config?.color || "rgba(88,94,116,0.82)", background: config ? `${config.color.replace("0.85", "0.08")}` : "rgba(88,94,116,0.05)", padding: "1px 4px" }}>
                    {config?.icon || ctx.context.slice(0, 2)}
                  </span>
                  <span className="text-[11px] w-12 text-right" style={{ color: config?.color || "rgba(88,94,116,0.7)" }}>{localizeText(ctx.contextLabel)}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden relative" style={{ background: "rgba(160,170,200,0.06)" }}>
                    <motion.div
                      className="absolute top-0 h-full rounded-full"
                      style={{ left: ctx.score >= 0 ? "50%" : `${50 + ctx.score * 50}%`, background: config?.color || "rgba(120,125,140,0.4)" }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${Math.abs(ctx.score) * 50}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.25, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    />
                    <div className="absolute top-0 left-1/2 w-px h-full" style={{ background: "rgba(160,170,200,0.12)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <span className="inline-block text-[11px] font-medium px-2.5 py-1 rounded-lg" style={{ background: framing.bg, color: framing.color, border: `1px solid ${framing.border}` }}>
          {framing.label}
        </span>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Premium Shadow Profile Section
// ═══════════════════════════════════════════════════════════════

function ShadowProfileSection({ shadowProfile }: { shadowProfile: ShadowProfile }) {
  return (
    <motion.section initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.25 }} aria-label="もうひとりのアーキタイプ">
      <CinematicHeader label="もうひとりのアーキタイプ" sublabel="SHADOW" accentColor="rgba(139,92,246,0.7)" />
      <NarrativeText>三面鏡の乖離パターンから、あなたの無意識に潜む「影」が浮かび上がりました。</NarrativeText>
      <motion.div className="rounded-2xl overflow-hidden mb-4" style={{ background: "linear-gradient(145deg, rgba(139,92,246,0.04) 0%, rgba(168,85,247,0.02) 50%, rgba(255,255,255,0.6) 100%)", border: "1px solid rgba(139,92,246,0.12)", backdropFilter: "blur(16px)" }}>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-lg font-display font-semibold" style={{ color: "rgba(24,30,50,0.96)" }}>{shadowProfile.shadowName}</span>
            <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-mono-sg font-medium" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(139,92,246,0.06))", color: "rgba(116,84,198,0.9)", border: "1px solid rgba(139,92,246,0.12)" }}>{shadowProfile.shadowCode}</span>
            <span className="px-2 py-0.5 rounded-lg text-[11px]" style={{ background: "rgba(100,100,120,0.05)", color: "rgba(80,86,108,0.7)" }}>確信度 {Math.round(shadowProfile.confidence * 100)}%</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="px-4 py-3.5 rounded-xl" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.05), rgba(139,92,246,0.02))", borderLeft: "2px solid rgba(139,92,246,0.2)" }}>
              <span className="text-[10px] font-mono-sg tracking-[0.2em] uppercase block mb-2" style={{ color: "rgba(116,84,198,0.65)" }}>DESIRE</span>
              <p className="text-[0.95rem] leading-[1.8]" style={{ color: "rgba(42,48,70,0.92)" }}>{shadowProfile.shadowDesires}</p>
            </div>
            <div className="px-4 py-3.5 rounded-xl" style={{ background: "linear-gradient(135deg, rgba(214,96,156,0.05), rgba(214,96,156,0.02))", borderLeft: "2px solid rgba(214,96,156,0.2)" }}>
              <span className="text-[10px] font-mono-sg tracking-[0.2em] uppercase block mb-2" style={{ color: "rgba(180,72,128,0.65)" }}>FEAR</span>
              <p className="text-[0.95rem] leading-[1.8]" style={{ color: "rgba(42,48,70,0.92)" }}>{shadowProfile.shadowFears}</p>
            </div>
          </div>
          <p className="text-[0.98rem] leading-[1.85] mb-4" style={{ color: "rgba(56,62,84,0.92)" }}>{shadowProfile.manifestation}</p>
          {shadowProfile.topDivergences.length > 0 && (
            <div className="mb-4">
              <span className="text-[10px] font-mono-sg tracking-[0.2em] uppercase block mb-2" style={{ color: "rgba(146,118,56,0.6)" }}>DIVERGENCE</span>
              <div className="space-y-2">
                {shadowProfile.topDivergences.map((div) => (
                  <div key={div.axis} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(160,170,200,0.04)", border: "1px solid rgba(160,170,200,0.06)" }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[0.88rem]" style={{ color: "rgba(56,62,84,0.88)" }}>{div.axisLabel}</span>
                        <span className="text-[11px] font-mono-sg font-medium" style={{ color: div.gap > 0 ? "rgba(139,92,246,0.8)" : "rgba(96,165,250,0.8)" }}>{div.gap > 0 ? "+" : ""}{div.gap.toFixed(2)}</span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden mb-1.5" style={{ background: "rgba(160,170,200,0.06)" }}>
                        <motion.div className="h-full rounded-full" style={{ background: div.gap > 0 ? "rgba(139,92,246,0.4)" : "rgba(96,165,250,0.4)" }} initial={{ width: 0 }} whileInView={{ width: `${Math.min(Math.abs(div.gap) * 100, 100)}%` }} viewport={{ once: true }} transition={{ duration: 0.25 }} />
                      </div>
                      <p className="text-[0.82rem] leading-[1.65]" style={{ color: "rgba(80,86,108,0.7)" }}>{div.interpretation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="px-4 py-4 rounded-xl" style={{ background: "linear-gradient(135deg, rgba(170,150,90,0.06), rgba(170,150,90,0.02))", borderLeft: "2px solid rgba(170,150,90,0.2)" }}>
            <span className="text-[10px] font-mono-sg tracking-[0.2em] uppercase block mb-2" style={{ color: "rgba(146,118,56,0.6)" }}>INTEGRATION</span>
            <p className="text-[0.98rem] leading-[1.85]" style={{ color: "rgba(42,48,70,0.92)" }}>{shadowProfile.integrationHint}</p>
          </div>
        </div>
      </motion.div>
    </motion.section>
  );
}

// ═══════════════════════════════════════════════════════════════
// Unobserved Territory Card
// ═══════════════════════════════════════════════════════════════

function UnobservedTerritoryCard({ category, categoryLabel, items }: { category: string; categoryLabel: string; items: { axis: TraitAxisKey; label: string; suggestion: string }[] }) {
  return (
    <motion.div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.5) 0%, rgba(240,238,230,0.4) 100%)", border: "1px dashed rgba(160,150,130,0.15)", backdropFilter: "blur(8px)" }} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
      <div className="p-4">
        <span className="text-[10px] font-mono-sg tracking-[0.2em] uppercase block mb-3" style={{ color: "rgba(134,110,56,0.65)" }}>{categoryLabel}</span>
        <div className="space-y-2">
          {items.slice(0, 3).map((item) => (
            <p key={item.axis} className="text-[0.95rem] leading-[1.8]" style={{ color: "rgba(62,68,88,0.85)" }}>
              あなたは「{item.label.split(" ↔ ")[0]}」と「{item.label.split(" ↔ ")[1]}」のあいだで、どこに立つのだろう？
            </p>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Deep Feature Index — quick-access grid for deep features
// ═══════════════════════════════════════════════════════════════

const DEEP_FEATURES = [
  { icon: "◎", name: "Alter", href: "/stargazer/alter", description: "もうひとりの自分" },
  { icon: "🌤", name: "心の天気", href: "/stargazer/weather", description: "感情のコンディション" },
  { icon: "🔮", name: "予言", href: "/stargazer/prophecy", description: "行動予測" },
  { icon: "🗺", name: "未知の地図", href: "/stargazer/unseen-map", description: "未発見の自分" },
  { icon: "👁", name: "盲点", href: "/stargazer/blind-spot", description: "見えない傾向" },
  { icon: "👻", name: "ゴースト", href: "/stargazer/ghost", description: "無意識の残像" },
  { icon: "✦", name: "署名", href: "/stargazer/signature", description: "あなたの心理署名" },
  { icon: "💎", name: "価値観", href: "/stargazer/values", description: "大切にしていること" },
  { icon: "🔄", name: "変容", href: "/stargazer/transform", description: "変化のプロセス" },
  { icon: "🩹", name: "核傷", href: "/stargazer/wound", description: "心の深い傷" },
  { icon: "🎯", name: "シミュレーション", href: "/stargazer/simulation", description: "仮想シナリオ" },
  { icon: "🌙", name: "夢日記", href: "/stargazer/dreams", description: "無意識の記録" },
  { icon: "🎵", name: "リズム", href: "/stargazer/rhythm", description: "行動のリズム" },
  { icon: "📅", name: "ライフイベント", href: "/stargazer/events", description: "人生の出来事" },
  { icon: "🧘", name: "柔軟性", href: "/stargazer/flexibility", description: "心理的柔軟性" },
  { icon: "📊", name: "ミニ観測", href: "/stargazer/micro-ema", description: "日中のミニチェック" },
  { icon: "☀️", name: "オラクル", href: "/stargazer/oracle", description: "今日の問い" },
] as const;

function DeepFeatureIndex() {
  return (
    <motion.div
      className="mb-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="h-px flex-1 max-w-[32px]" style={{ background: "linear-gradient(90deg, rgba(139,92,246,0.4), transparent)" }} />
        <span className="text-[10px] font-mono tracking-[0.2em] uppercase" style={{ color: "rgba(139,92,246,0.6)" }}>FEATURES</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {DEEP_FEATURES.map((f) => (
          <a
            key={f.href}
            href={f.href}
            className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl transition-all active:scale-95"
            style={{
              background: "linear-gradient(145deg, rgba(255,255,255,0.6), rgba(248,246,240,0.4))",
              border: "1px solid rgba(160,150,130,0.08)",
              backdropFilter: "blur(8px)",
            }}
          >
            <span className="text-lg leading-none">{f.icon}</span>
            <span className="text-[11px] font-semibold text-center leading-tight" style={{ color: "rgba(24,30,50,0.85)" }}>
              {f.name}
            </span>
          </a>
        ))}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main DeepTab Component
// ═══════════════════════════════════════════════════════════════

export default function DeepTab({
  hasData, contextNarratives, contextDiffs, contradictions, unobservedAreas, axisScores,
  totalObservations, entropySignature, resonancePredictions, phantomChoices, metaInsights,
  judgmentArchaeology, whyInsights, archetypeResult, dualArchetypeResult, previousAxisScores,
  growthMilestones, behavioralInsights, dataQuality, traitEvolution, isBetaTester,
  expansionAxes,
}: DeepTabProps) {
  const [showAllAxes, setShowAllAxes] = useState(false);
  const [selfGap, setSelfGap] = useState<SelfGapResult | null>(null);
  const [attractionProfile, setAttractionProfile] = useState<AttractionProfile | null>(null);
  const [shadowProfile, setShadowProfile] = useState<ShadowProfile | null>(null);
  const [insightCards, setInsightCards] = useState<InsightCardCollection | null>(null);
  const [activeDepth, setActiveDepth] = useState(1);
  const layerRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const crossAxisInsights = useMemo(
    () => hasData ? generateCrossAxisInsights(axisScores as Record<string, number>, 3) : [],
    [hasData, axisScores]
  );

  useEffect(() => {
    if (archetypeResult?.code && typeof window !== "undefined") {
      try {
        const selfRaw = localStorage.getItem("stargazer_mirror_self_v1");
        const fpRaw = localStorage.getItem("stargazer_mirror_footprint_v1");
        const spRaw = localStorage.getItem("stargazer_mirror_shadow_v1");
        if (selfRaw && (fpRaw || spRaw)) {
          const selfScores = JSON.parse(selfRaw) as Partial<Record<TraitAxisKey, number>>;
          const fpScores = fpRaw ? (JSON.parse(fpRaw) as Partial<Record<TraitAxisKey, number>>) : {};
          const spScores = spRaw ? (JSON.parse(spRaw) as Partial<Record<TraitAxisKey, number>>) : {};
          setShadowProfile(inferShadowProfile(selfScores, fpScores, spScores, archetypeResult.code));
        }
      } catch { /* silent */ }
    }
    fetch("/api/stargazer/self-gap").then(r => r.json()).then(d => { if (d.ok && d.selfGap) setSelfGap(d.selfGap); }).catch(() => {});
    fetch("/api/orbiter/attraction", { credentials: "include" }).then(r => r.json()).then(d => { if (d.ok && d.attractionProfile) setAttractionProfile(d.attractionProfile); }).catch(() => {});
    fetch("/api/stargazer/insights", { credentials: "include" }).then(r => r.json()).then(d => { if (d.ok && d.cards?.length > 0) setInsightCards({ cards: d.cards, totalInsights: d.totalInsights, topDimensions: d.topDimensions }); }).catch(() => {});
  }, []);

  const handleDepthJump = useCallback((level: number) => {
    setActiveDepth(level);
    layerRefs.current[level]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (!hasData) {
    return <div style={{ color: "rgba(56,62,84,0.94)", fontSize: "1.04rem" }}><EmptyState message="観測を重ねると、あなたの深層がここに浮かび上がります。" /></div>;
  }

  const CATEGORY_LABELS: Record<string, string> = { core: "判断・思考", relational: "人との関わり方", emotional: "感情の動き", motion: "行動のクセ", aesthetic: "美意識・好み", safety: "安心の保ち方", relational_deep: "深い人間関係" };
  const groupedUnobserved: Record<string, typeof unobservedAreas> = {};
  for (const item of unobservedAreas) { if (!groupedUnobserved[item.category]) groupedUnobserved[item.category] = []; groupedUnobserved[item.category].push(item); }

  const AXIS_CATEGORY_LABELS: Record<string, string> = { core: "判断・思考のパターン", relational: "人との関わり方", emotional: "感情の動き・回復力", motion: "行動のクセ", aesthetic: "美意識・表現の好み", safety: "安心の保ち方", relational_deep: "深い人間関係" };
  const groupedAxes: Record<string, typeof TRAIT_AXES> = {};
  for (const axis of TRAIT_AXES) { if (!groupedAxes[axis.category]) groupedAxes[axis.category] = []; groupedAxes[axis.category].push(axis); }

  function getAxisReading(score: number, labelLeft: string, labelRight: string): string {
    const abs = Math.abs(score);
    if (abs < 0.1) return "まだデータが少ないため、もう少し観測が必要です";
    const side = score < 0 ? labelLeft : labelRight;
    if (abs > 0.6) return `「${side}」寄りの傾向がはっきり出ています`;
    if (abs > 0.3) return `やや「${side}」寄り。状況によって変わることもあります`;
    return `「${labelLeft}」と「${labelRight}」の中間。場面によって揺れ動きます`;
  }

  const milestones: GrowthMilestone[] = growthMilestones && growthMilestones.length > 0 ? growthMilestones : [
    ...(totalObservations >= 1 ? [{ date: "初回", title: "観測を開始", description: "深層観測で最初の自己観測を行いました。", type: "milestone" as const, significance: 0.8 }] : []),
    ...(totalObservations >= 5 ? [{ date: `${totalObservations}回目`, title: "性格の輪郭が見え始める", description: "複数回の観測で、あなたの傾向の一部が安定してきました。", type: "observation" as const, significance: 0.6 }] : []),
    ...(contradictions.length > 0 ? [{ date: "検出", title: `${contradictions.length}件の矛盾を発見`, description: "あなたの中に共存する矛盾が浮かび上がりました。これは自然なことです。", type: "contradiction" as const, significance: 0.7 }] : []),
    ...(totalObservations >= 10 ? [{ date: `${totalObservations}回`, title: "深層パターンの検出", description: "十分な観測により、あなたの行動パターンが見えてきました。", type: "insight" as const, significance: 0.9 }] : []),
  ];

  return (
    <div className="relative">
      <DepthAmbience />
      <DepthNavigator activeDepth={activeDepth} onJump={handleDepthJump} />

      {/* ═══ Deep機能インデックス ═══ */}
      <DeepFeatureIndex />

      <div className="space-y-5 relative z-10">

        {/* ═══ Layer 1: 表層 (Surface) ═══ */}
        <div ref={(el) => { layerRefs.current[1] = el; }}>
          <DepthLayerAccordion layerId="depth-surface" label="表層" sublabel="あなたの全体像" description="アーキタイプ・データ品質・変化レーダー" depthLevel={1} defaultOpen={true}>
            {archetypeResult && getArchetypeByCode(archetypeResult.code) && (
              <div id="sg-section-archetype-identity">
                <ArchetypeIdentityCard archetypeCode={archetypeResult.code} confidence={archetypeResult.confidence} topMatches={archetypeResult.topMatches} shadowCode={getArchetypeByCode(archetypeResult.code)!.shadowCode as ArchetypeCode} dualResult={dualArchetypeResult} />
              </div>
            )}
            {archetypeResult?.code && totalObservations >= 20 && <CoreWoundCard archetypeCode={archetypeResult.code} />}
            {shadowProfile && <ShadowProfileSection shadowProfile={shadowProfile} />}
            {dataQuality && <DataQualityBadge quality={dataQuality} />}
            <CognitiveFitDisplay />
            <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <CinematicHeader label="あなたの深層" sublabel="OVERVIEW" />
              <NarrativeText>アーキタイプタブでは「あなたがどんな人か」を描きました。ここでは「なぜそうなのか」を探ります。矛盾や揺れがあるのは自然なことです。</NarrativeText>
              <div className="grid grid-cols-3 gap-3">
                <StatPill value={totalObservations} label="総観測数" color="#AA966A" delay={0} />
                <StatPill value={TRAIT_AXES.length} label="分析項目" color="#7A58D2" delay={0.08} />
                <StatPill value={unobservedAreas.length} label="未発見" color="#D6609C" delay={0.16} />
              </div>
            </motion.div>
            {(() => {
              const radarCurrent = TRAIT_AXES.slice(0, 8).map(a => ({ key: a.id, label: a.labelLeft.slice(0, 4), score: Math.round(((axisScores[a.id] ?? 0) + 1) * 50) }));
              const radarPast = previousAxisScores ? TRAIT_AXES.slice(0, 8).map(a => ({ key: a.id, label: a.labelLeft.slice(0, 4), score: Math.round(((previousAxisScores[a.id] ?? 0) + 1) * 50) })) : undefined;
              return (
                <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                  <CinematicHeader label="あなたの変化レーダー" sublabel="EVOLUTION" accentColor="rgba(107,159,212,0.7)" />
                  <NarrativeText>{previousAxisScores ? "以前の自分と今の自分を重ねて見ています。破線が過去、実線が現在です。" : "あなたの深層の傾向をレーダーで俯瞰します。観測を続けると過去との比較ができるようになります。"}</NarrativeText>
                  <AxisRadarEvolution current={radarCurrent} past={radarPast} />
                </motion.div>
              );
            })()}
            {totalObservations >= 3 && (
              <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} aria-label="性格軸マップ">
                <CinematicHeader label="性格軸マップ" sublabel="AXIS MAP" accentColor="rgba(170,150,90,0.7)" />
                <NarrativeText>あなたの傾向を軸ごとに俯瞰します。中央が中間、左右に振れるほど傾向が強い軸です。</NarrativeText>
                <AxisOverviewPanel axisScores={axisScores as Record<string, number>} lightMode />
              </motion.section>
            )}
            {/* P4: 拡張軸セクション — visible / displayTier を唯一の判定源とする */}
            {expansionAxes && expansionAxes.length > 0 && (
              <ExpansionAxesSection axes={expansionAxes} />
            )}
            {totalObservations >= 5 && (
              <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} aria-label="リアルタイム軸ゲージ">
                <CinematicHeader label="LIVE SKY" sublabel="REAL-TIME" accentColor="rgba(74,222,128,0.7)" />
                <NarrativeText>各軸のスコアをリアルタイムで可視化しています。ダイヤモンドマーカーが現在位置です。</NarrativeText>
                <LiveSkyPanel
                  dimensions={TRAIT_AXES.map(a => ({
                    id: a.id,
                    score: (axisScores[a.id] ?? 0) as number,
                    confidence: Math.min(1, Math.abs(axisScores[a.id] ?? 0) * 2),
                    evidenceCount: Math.abs(axisScores[a.id] ?? 0) > 0.05 ? Math.max(1, Math.round(totalObservations * 0.3)) : 0,
                    category: a.category,
                    labelLeft: a.labelLeft,
                    labelRight: a.labelRight,
                  }))}
                />
              </motion.section>
            )}
            {totalObservations >= 5 && (
              <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} aria-label="観測コンソール">
                <CinematicHeader label="観測コンソール" sublabel="OBSERVATION STATS" accentColor="rgba(96,165,250,0.7)" />
                <NarrativeText>あなたの観測パターン — 反応速度や迷い度が、認知スタイルのヒントになります。</NarrativeText>
                <ObservationConsole stats={{ totalAnswered: totalObservations, avgResponseTimeMs: 0, fastAnswerCount: 0, slowAnswerCount: 0, avgHesitation: 0 }} totalQuestions={TRAIT_AXES.length * 3} />
              </motion.section>
            )}
          </DepthLayerAccordion>
        </div>

        {/* ═══ Layer 2: パターン (Pattern) ═══ */}
        <div ref={(el) => { layerRefs.current[2] = el; }}>
          <DepthLayerAccordion layerId="depth-pattern" label="パターン" sublabel="繰り返しの法則" description="矛盾・文脈変化・自己ギャップの分析" depthLevel={2} defaultOpen={totalObservations >= 5}>
            {contradictions.length === 0 && totalObservations >= 3 && (
              <NoContradictionsYet />
            )}
            {contradictions.length > 0 && (
              <section aria-label="矛盾分析">
                <CinematicHeader label="あなたの中の矛盾" sublabel="CONTRADICTION" accentColor="rgba(159,122,234,0.7)" />
                <NarrativeText>矛盾があるのは自然なこと。人は場面や状態によって違う面を持っています。</NarrativeText>
                <div className="space-y-3">{contradictions.map((c, i) => <ContradictionCard key={i} contradiction={c} index={i} />)}</div>
              </section>
            )}
            {contradictions.length > 0 && (
              <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} aria-label="矛盾ネットワーク">
                <CinematicHeader label="矛盾マップ" sublabel="NETWORK" accentColor="rgba(159,122,234,0.6)" />
                <NarrativeText>あなたの中にある矛盾をネットワーク図で可視化しています。ノードをタップすると関連する矛盾だけを表示します。</NarrativeText>
                <ContradictionWeb
                  nodes={contradictions.flatMap(c => [{ key: c.cardA.label, label: c.cardA.label, score: 50 }, { key: c.cardB.label, label: c.cardB.label, score: 50 }]).filter((n, i, arr) => arr.findIndex(x => x.key === n.key) === i)}
                  edges={contradictions.map(c => { const nodes = contradictions.flatMap(cc => [cc.cardA.label, cc.cardB.label]).filter((n, i, arr) => arr.indexOf(n) === i); return { from: nodes.indexOf(c.cardA.label), to: nodes.indexOf(c.cardB.label), severity: 0.3 + Math.random() * 0.5, description: c.narrative }; })}
                />
              </motion.section>
            )}
            <section aria-label="文脈別の変化">
              <CinematicHeader label="場面で変わるあなた" sublabel="CONTEXT" accentColor="rgba(170,150,90,0.7)" />
              {contextNarratives.length === 0 ? <NarrativeText>観測が重なると、ここに場面ごとの表情が現れます</NarrativeText> : (
                <>
                  <NarrativeText>同じ人でも、場面によって違う面が現れます。それは自然な適応力です。</NarrativeText>
                  <div className="space-y-3">{contextNarratives.map((cn, i) => <ContextNarrativeCard key={i} narrative={cn} diff={contextDiffs.find(d => d.axis === cn.axisId)} index={i} />)}</div>
                </>
              )}
            </section>
            {selfGap && (
              <motion.section initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} aria-label="自己ギャップ分析">
                <CinematicHeader label="今の自分と本来の自分" sublabel="SELF-GAP" accentColor="rgba(214,96,156,0.7)" />
                <NarrativeText>状態が変わったとき、あなたの中でどこが変化するか。ズレがあるのは、環境に適応している証拠です。</NarrativeText>
                <SelfGapPanel selfGap={selfGap} />
              </motion.section>
            )}
            {crossAxisInsights.length > 0 && (
              <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} aria-label="軸間パターン">
                <CinematicHeader label="軸の交差点" sublabel="CROSS-AXIS" accentColor="rgba(170,150,90,0.7)" />
                <NarrativeText>2つの軸が交わるところに、単独では見えない「あなたらしさ」が現れます。</NarrativeText>
                <div className="space-y-3">
                  {crossAxisInsights.map(ci => (
                    <motion.div key={ci.id} className="rounded-2xl p-4" style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.75) 0%, rgba(251,246,237,0.65) 100%)", border: "1px solid rgba(201,169,110,0.1)", backdropFilter: "blur(12px)", boxShadow: "0 2px 12px rgba(0,0,0,0.02)" }} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                      <p className="text-[0.95rem] leading-[1.85] mb-3" style={{ color: "rgba(30,40,60,0.88)" }}>{ci.insight}</p>
                      <p className="text-[0.85rem] leading-[1.7] mb-3" style={{ color: "rgba(56,62,84,0.55)" }}>{ci.manifestation}</p>
                      <div className="flex gap-2 flex-wrap">
                        <span className="text-[10px] font-medium px-2.5 py-1 rounded-lg" style={{ background: "rgba(34,197,94,0.06)", color: "rgba(34,197,94,0.8)", border: "1px solid rgba(34,197,94,0.08)" }}>{ci.asStrength.length > 30 ? ci.asStrength.slice(0, 30) + "…" : ci.asStrength}</span>
                        <span className="text-[10px] font-medium px-2.5 py-1 rounded-lg" style={{ background: "rgba(244,114,182,0.06)", color: "rgba(244,114,182,0.8)", border: "1px solid rgba(244,114,182,0.08)" }}>{ci.asCaution.length > 30 ? ci.asCaution.slice(0, 30) + "…" : ci.asCaution}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            )}
            {insightCards && insightCards.cards.length > 0 && (
              <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} aria-label="パーソナリティ・インサイト">
                <CinematicHeader label="蓄積されたインサイト" sublabel="INSIGHTS" accentColor="rgba(159,122,234,0.7)" />
                <NarrativeText>観測を通じて発見された、あなたのパターン・矛盾・成長の記録です。</NarrativeText>
                <InsightCardDisplay collection={insightCards} lightMode />
              </motion.section>
            )}
          </DepthLayerAccordion>
        </div>

        {/* ═══ Layer 3: 構造 (Structure) ═══ */}
        <div ref={(el) => { layerRefs.current[3] = el; }}>
          <DepthLayerAccordion layerId="depth-structure" label="構造" sublabel="なぜそうなのか" description="なぜそうなのか・革新的メカニズム分析" depthLevel={3} defaultOpen={totalObservations >= 10}>
            <V4EngineHub totalObservations={totalObservations} isBetaTester={isBetaTester} />
            {whyInsights && whyInsights.length > 0 && <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}><WhyInsightSection insights={whyInsights} /></motion.div>}
            {entropySignature && <motion.section initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}><EntropySignatureCard entropySignature={entropySignature} resonancePredictions={resonancePredictions} /></motion.section>}
            {phantomChoices && phantomChoices.length > 0 && <motion.section initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}><PhantomChoiceCard phantomChoices={phantomChoices} /></motion.section>}
            {metaInsights && metaInsights.length > 0 && <motion.section initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}><MetaObservationCard metaInsights={metaInsights} /></motion.section>}
            {judgmentArchaeology && judgmentArchaeology.layers.length > 0 && <motion.section initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}><JudgmentArchaeologyCard archaeology={judgmentArchaeology} /></motion.section>}
            {attractionProfile && (
              <motion.section initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} aria-label="惹かれるパターン">
                <CinematicHeader label="あなたが惹かれるパターン" sublabel="ATTRACTION" accentColor="rgba(244,114,182,0.7)" />
                <NarrativeText>「惹かれる人」と「うまくいく人」は違うことがあります。まずあなたが自然に惹かれるパターンを見てみましょう。</NarrativeText>
                <AttractionDiscoverySection attractionProfile={attractionProfile} />
              </motion.section>
            )}
            {totalObservations >= 10 && (
              <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} aria-label="シミュレーション">
                <CinematicHeader label="シミュレーション" sublabel="WHAT IF" accentColor="rgba(244,114,182,0.6)" />
                <NarrativeText>あなたの観測データを使って、いろんな場面であなたがどう動くかをシミュレーション。</NarrativeText>
                <SimulationCards />
              </motion.section>
            )}
          </DepthLayerAccordion>
        </div>

        {/* ═══ Layer 4: 深淵 (Abyss) ═══ */}
        <div ref={(el) => { layerRefs.current[4] = el; }}>
          <DepthLayerAccordion layerId="depth-abyss" label="深淵" sublabel="まだ見ぬ自分" description="行動データ・成長追跡・全軸詳細" depthLevel={4} defaultOpen={false}>
            {behavioralInsights && behavioralInsights.length > 0 && <BehavioralInsightSection insights={behavioralInsights} />}
            {traitEvolution && <GrowthStageCard evolution={traitEvolution} />}
            {milestones.length > 0 && (
              <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} aria-label="成長タイムライン">
                <CinematicHeader label="あなたの成長の軌跡" sublabel="GROWTH TIMELINE" accentColor="rgba(205,107,107,0.7)" />
                <NarrativeText>観測の中で見えてきた、あなたの成長と発見の記録です。</NarrativeText>
                <GrowthTimeline milestones={milestones} />
              </motion.section>
            )}
            {unobservedAreas.length > 0 && (
              <section aria-label="未観測領域">
                <CinematicHeader label="まだ見えていない部分" sublabel="UNCHARTED" accentColor="rgba(160,150,130,0.7)" />
                <NarrativeText>まだ十分なデータがない部分です。観測を続けると見えてきます。</NarrativeText>
                <UnobservedSection
                  dimensions={TRAIT_AXES.map(a => ({
                    id: a.id,
                    score: (axisScores[a.id] ?? 0) as number,
                    confidence: Math.min(1, Math.abs(axisScores[a.id] ?? 0) * 2),
                    evidenceCount: Math.abs(axisScores[a.id] ?? 0) > 0.05 ? Math.max(1, Math.round(totalObservations * 0.3)) : 0,
                    category: a.category,
                    labelLeft: a.labelLeft,
                    labelRight: a.labelRight,
                  }))}
                  totalQuestions={totalObservations}
                  lightMode
                />
              </section>
            )}
            <section aria-label="全軸詳細">
              <button onClick={() => setShowAllAxes(!showAllAxes)} className="flex items-center gap-2 w-full text-left group" aria-expanded={showAllAxes} aria-controls="all-axes-detail">
                <CinematicHeader label={`全${TRAIT_AXES.length}項目の詳細`} sublabel="ALL AXES" accentColor="rgba(120,126,150,0.6)" />
                <motion.div className="flex-shrink-0 flex items-center justify-center ml-auto" style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(120,126,150,0.06)", border: "1px solid rgba(120,126,150,0.1)" }}>
                  <motion.svg width={10} height={10} viewBox="0 0 10 10" animate={{ rotate: showAllAxes ? 180 : 0 }} transition={{ duration: 0.18 }}>
                    <path d="M2 3.5L5 7.5L8 3.5" stroke="rgba(120,126,150,0.5)" strokeWidth={1.2} strokeLinecap="round" fill="none" />
                  </motion.svg>
                </motion.div>
              </button>
              <AnimatePresence>
                {showAllAxes && (
                  <motion.div id="all-axes-detail" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ height: { duration: 0.22, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.18, delay: 0.1 } }} className="overflow-hidden">
                    <div className="mt-3 space-y-6">
                      {Object.entries(groupedAxes).map(([cat, axes]) => (
                        <div key={cat}>
                          <span className="text-[10px] font-mono-sg tracking-[0.2em] uppercase block mb-3" style={{ color: "rgba(146,118,56,0.6)" }}>{AXIS_CATEGORY_LABELS[cat] || cat}</span>
                          <div className="space-y-2">
                            {axes.map(axis => {
                              const score = axisScores[axis.id] ?? 0;
                              const reading = getAxisReading(score, axis.labelLeft, axis.labelRight);
                              return (
                                <motion.div key={axis.id} className="rounded-xl py-3 px-4" style={{ background: "rgba(255,255,255,0.4)", border: "1px solid rgba(200,200,210,0.08)", backdropFilter: "blur(8px)" }} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
                                  <div className="flex justify-between text-[0.85rem] mb-1.5">
                                    <span style={{ color: score < -0.15 ? "rgba(30,35,55,0.92)" : "rgba(86,92,116,0.7)", fontWeight: score < -0.15 ? 600 : 400 }}>{axis.labelLeft}</span>
                                    <span style={{ color: score > 0.15 ? "rgba(30,35,55,0.92)" : "rgba(86,92,116,0.7)", fontWeight: score > 0.15 ? 600 : 400 }}>{axis.labelRight}</span>
                                  </div>
                                  <div className="h-1.5 rounded-full relative overflow-hidden" style={{ background: "rgba(160,170,200,0.06)" }}>
                                    <motion.div className="absolute top-0 h-full rounded-full" style={{ left: score >= 0 ? "50%" : `${50 + score * 50}%`, background: Math.abs(score) > 0.3 ? "rgba(170,150,90,0.5)" : Math.abs(score) > 0.1 ? "rgba(139,92,246,0.3)" : "rgba(120,125,140,0.15)" }} initial={{ width: 0 }} whileInView={{ width: `${Math.abs(score) * 50}%` }} viewport={{ once: true }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} />
                                    <div className="absolute top-0 left-1/2 w-px h-full" style={{ background: "rgba(160,170,200,0.1)" }} />
                                  </div>
                                  <p className="text-[0.88rem] mt-1.5 leading-[1.7]" style={{ color: "rgba(58,64,86,0.85)" }}>{reading}</p>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </DepthLayerAccordion>
        </div>

        {/* Footer */}
        <motion.p className="text-center text-[0.82rem] py-6" style={{ color: "rgba(78,84,108,0.6)" }} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
          観測を重ねるほど、より正確な分析ができるようになります
        </motion.p>
      </div>
    </div>
  );
}
