"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, FadeInView } from "@/components/ui/glassmorphism-design";
import HumanMomentCard from "./HumanMomentCard";
import type { HumanMoment, HumanMomentRarity, SilenceProfile } from "@/lib/rendezvous/humanProof";

// =============================================================================
// Props
// =============================================================================

type HumanProofTimelineProps = {
  moments: HumanMoment[];
  silenceProfile: SilenceProfile;
  proofScore: number;
  narrative: string;
};

// =============================================================================
// Filter tabs
// =============================================================================

type FilterTab = "all" | "rare" | "legendary";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "\u3059\u3079\u3066" },
  { key: "rare", label: "\u30EC\u30A2" },
  { key: "legendary", label: "\u30EC\u30B8\u30A7\u30F3\u30C0\u30EA\u30FC" },
];

function filterMoments(moments: HumanMoment[], tab: FilterTab): HumanMoment[] {
  if (tab === "all") return moments;
  if (tab === "rare") return moments.filter((m) => m.rarity === "rare" || m.rarity === "legendary");
  return moments.filter((m) => m.rarity === "legendary");
}

// =============================================================================
// Breathing Score Circle
// =============================================================================

function BreathingScoreCircle({ score }: { score: number }) {
  // Organic, breathing circle -- not a mechanical ring
  const hue = score > 70 ? 160 : score > 40 ? 45 : 220; // green > amber > blue
  const mainColor = `hsl(${hue}, 70%, 55%)`;
  const glowColor = `hsla(${hue}, 70%, 55%, 0.3)`;

  return (
    <div className="flex flex-col items-center">
      <motion.div
        className="relative w-28 h-28 flex items-center justify-center"
        animate={{
          scale: [1, 1.04, 1],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        {/* Outer glow */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: glowColor }}
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.4, 0.7, 0.4],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Main circle */}
        <motion.div
          className="absolute inset-2 rounded-full backdrop-blur-sm border-2"
          style={{
            borderColor: mainColor,
            background: `radial-gradient(circle at 40% 35%, white, ${glowColor})`,
          }}
          animate={{
            boxShadow: [
              `0 0 20px 4px ${glowColor}`,
              `0 0 30px 8px ${glowColor}`,
              `0 0 20px 4px ${glowColor}`,
            ],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Score text */}
        <div className="relative z-10 text-center">
          <motion.span
            className="text-3xl font-bold"
            style={{ color: mainColor }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            {score}
          </motion.span>
        </div>
      </motion.div>

      <span className="mt-2 text-sm font-semibold text-slate-600">
        {"\u4EBA\u9593\u6027\u30B9\u30B3\u30A2"}
      </span>
    </div>
  );
}

// =============================================================================
// Silence Profile Bar
// =============================================================================

function SilenceProfileBar({ profile }: { profile: SilenceProfile }) {
  const meaningfulPercent = Math.round(profile.silenceScore * 100);
  const emptyPercent = 100 - meaningfulPercent;

  return (
    <FadeInView delay={0.2}>
      <GlassCard variant="elevated" padding="sm" hoverEffect={false}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">{"\u{1F311}"}</span>
          <h4 className="text-sm font-semibold text-slate-700">
            {"\u6C88\u9ED9\u306E\u610F\u5473"}
          </h4>
        </div>

        {/* Visual bar */}
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden flex">
          <motion.div
            className="h-full bg-gradient-to-r from-indigo-400 to-violet-400 rounded-l-full"
            initial={{ width: 0 }}
            animate={{ width: `${meaningfulPercent}%` }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
          />
          <div
            className="h-full bg-slate-200"
            style={{ width: `${emptyPercent}%` }}
          />
        </div>

        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-indigo-500 font-medium">
            {"\u610F\u5473\u306E\u3042\u308B\u6C88\u9ED9"} {meaningfulPercent}%
          </span>
          <span className="text-[10px] text-slate-400">
            {"\u5E73\u5747"}{profile.averageGapHours}{"\u6642\u9593"}
          </span>
        </div>

        {profile.gapsThatLedToDeeper > 0 && (
          <p className="text-xs text-slate-500 mt-2">
            {profile.gapsThatLedToDeeper}{"\u56DE\u306E\u6C88\u9ED9\u304C\u3001\u3088\u308A\u6DF1\u3044\u4F1A\u8A71\u306B\u3064\u306A\u304C\u3063\u305F"}
          </p>
        )}
      </GlassCard>
    </FadeInView>
  );
}

// =============================================================================
// Timeline connector
// =============================================================================

function TimelineDot({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex flex-col items-center">
      <motion.div
        className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-violet-400 to-indigo-400 border-2 border-white shadow-sm"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: index * 0.1, duration: 0.3 }}
      />
      {index < total - 1 && (
        <motion.div
          className="w-px bg-gradient-to-b from-violet-200 to-transparent"
          initial={{ height: 0 }}
          animate={{ height: 24 }}
          transition={{ delay: index * 0.1 + 0.1, duration: 0.3 }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export default function HumanProofTimeline({
  moments,
  silenceProfile,
  proofScore,
  narrative,
}: HumanProofTimelineProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const filtered = useMemo(
    () => filterMoments(moments, activeTab),
    [moments, activeTab],
  );

  const isEmpty = moments.length === 0;

  return (
    <div className="space-y-6">
      {/* Score circle */}
      <FadeInView>
        <div className="flex flex-col items-center py-4">
          <BreathingScoreCircle score={proofScore} />
        </div>
      </FadeInView>

      {/* Narrative */}
      <FadeInView delay={0.1}>
        <p className="text-center text-sm text-amber-700/80 italic leading-relaxed px-4">
          {narrative}
        </p>
      </FadeInView>

      {/* Silence profile */}
      {silenceProfile.averageGapHours > 0 && (
        <SilenceProfileBar profile={silenceProfile} />
      )}

      {/* Filter tabs */}
      {!isEmpty && (
        <FadeInView delay={0.2}>
          <div className="flex gap-2 px-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  px-3.5 py-1.5 rounded-full text-xs font-medium transition-all
                  ${
                    activeTab === tab.key
                      ? "bg-violet-100 text-violet-700 shadow-sm"
                      : "bg-white/50 text-slate-500 hover:bg-white/70"
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </FadeInView>
      )}

      {/* Timeline */}
      <AnimatePresence mode="wait">
        {isEmpty ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <GlassCard variant="elevated" padding="lg" hoverEffect={false}>
              <div className="text-center py-6">
                <span className="text-4xl mb-3 block">{"\u{1F30C}"}</span>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {"\u307E\u3060\u4EBA\u9593\u306E\u8A3C\u306F\u898B\u3064\u304B\u3063\u3066\u3044\u306A\u3044\u3002"}
                  <br />
                  {"\u3067\u3082\u3001\u4F1A\u8A71\u3092\u7D9A\u3051\u308C\u3070\u5FC5\u305A\u73FE\u308C\u308B\u3002"}
                </p>
              </div>
            </GlassCard>
          </motion.div>
        ) : filtered.length === 0 ? (
          <motion.div
            key="no-filter-results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-center py-8">
              <p className="text-sm text-slate-400">
                {"\u3053\u306E\u30D5\u30A3\u30EB\u30BF\u30FC\u306B\u8A72\u5F53\u3059\u308B\u77AC\u9593\u306F\u307E\u3060\u306A\u3044"}
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-0"
          >
            {filtered.map((moment, i) => (
              <div key={moment.id} className="flex gap-3">
                {/* Timeline connector */}
                <div className="flex-shrink-0 pt-6">
                  <TimelineDot index={i} total={filtered.length} />
                </div>

                {/* Card */}
                <div className="flex-1 pb-4">
                  <HumanMomentCard moment={moment} />
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
