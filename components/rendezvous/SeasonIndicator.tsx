"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { SeasonProfile, Season, SeasonPhase } from "@/lib/rendezvous/relationshipSeasons";

// =============================================================================
// Season Visual Config
// =============================================================================

type SeasonVisual = {
  gradient: string;
  glowColor: string;
  particleColor: string;
  progressBarColor: string;
  bgAccent: string;
};

const SEASON_VISUALS: Record<Season, SeasonVisual> = {
  spring: {
    gradient: "from-emerald-100 via-green-50 to-pink-50",
    glowColor: "rgba(16, 185, 129, 0.2)",
    particleColor: "#10b981",
    progressBarColor: "bg-gradient-to-r from-emerald-400 to-pink-300",
    bgAccent: "bg-emerald-50/50",
  },
  summer: {
    gradient: "from-amber-100 via-yellow-50 to-orange-50",
    glowColor: "rgba(245, 158, 11, 0.2)",
    particleColor: "#f59e0b",
    progressBarColor: "bg-gradient-to-r from-amber-400 to-orange-300",
    bgAccent: "bg-amber-50/50",
  },
  autumn: {
    gradient: "from-orange-100 via-amber-50 to-red-50",
    glowColor: "rgba(234, 88, 12, 0.2)",
    particleColor: "#ea580c",
    progressBarColor: "bg-gradient-to-r from-orange-400 to-red-300",
    bgAccent: "bg-orange-50/50",
  },
  winter: {
    gradient: "from-blue-100 via-slate-50 to-indigo-50",
    glowColor: "rgba(99, 102, 241, 0.2)",
    particleColor: "#6366f1",
    progressBarColor: "bg-gradient-to-r from-blue-400 to-indigo-300",
    bgAccent: "bg-blue-50/50",
  },
};

// =============================================================================
// Props
// =============================================================================

type SeasonIndicatorProps = {
  profile: SeasonProfile;
  compact?: boolean;
};

// =============================================================================
// Component
// =============================================================================

export default function SeasonIndicator({
  profile,
  compact = false,
}: SeasonIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const visual = SEASON_VISUALS[profile.currentSeason];

  if (compact) {
    return (
      <CompactSeason
        profile={profile}
        visual={visual}
        onTap={() => setExpanded(true)}
      />
    );
  }

  return (
    <FullSeason
      profile={profile}
      visual={visual}
      expanded={expanded}
      onToggleExpand={() => setExpanded((p) => !p)}
    />
  );
}

// =============================================================================
// Compact Mode (card embed)
// =============================================================================

function CompactSeason({
  profile,
  visual,
  onTap,
}: {
  profile: SeasonProfile;
  visual: SeasonVisual;
  onTap: () => void;
}) {
  return (
    <motion.button
      onClick={onTap}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
        ${visual.bgAccent} border border-white/60
        backdrop-blur-sm text-sm font-medium
        transition-colors hover:bg-white/40
      `}
      whileTap={{ scale: 0.95 }}
    >
      <span className="text-base">{profile.seasonEmoji}</span>
      <span className="text-slate-700">{profile.seasonLabel}</span>
    </motion.button>
  );
}

// =============================================================================
// Full Mode (detail page)
// =============================================================================

function FullSeason({
  profile,
  visual,
  expanded,
  onToggleExpand,
}: {
  profile: SeasonProfile;
  visual: SeasonVisual;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  return (
    <GlassCard variant="gradient" padding="none" hoverEffect={false}>
      <div className="relative overflow-hidden">
        {/* Background gradient + glow */}
        <div
          className={`absolute inset-0 bg-gradient-to-br ${visual.gradient} opacity-60`}
        />
        <div
          className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl"
          style={{ background: visual.glowColor }}
        />

        {/* Season particles */}
        <SeasonParticles season={profile.currentSeason} visual={visual} />

        {/* Content */}
        <div className="relative z-10 p-6">
          {/* Header */}
          <motion.button
            onClick={onToggleExpand}
            className="w-full text-left"
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <motion.span
                className="text-3xl"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                {profile.seasonEmoji}
              </motion.span>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-800">
                  {profile.seasonLabel}
                </h3>
                {profile.cycleCount > 1 && (
                  <span className="text-xs text-slate-500">
                    {profile.cycleCount}回目のサイクル
                  </span>
                )}
              </div>
              <motion.span
                className="text-slate-400 text-sm"
                animate={{ rotate: expanded ? 180 : 0 }}
              >
                {"\u25BC"}
              </motion.span>
            </div>

            {/* Description */}
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              {profile.seasonDescription}
            </p>

            {/* Progress bar */}
            <SeasonProgressBar
              progress={profile.progress}
              visual={visual}
              nextSeason={profile.nextSeason}
              estimatedDays={profile.estimatedDaysToNext}
            />
          </motion.button>

          {/* Guidance */}
          <motion.div
            className="mt-4 p-3 rounded-2xl bg-white/50 backdrop-blur-sm border border-white/60"
            initial={false}
          >
            <p className="text-sm text-slate-700 leading-relaxed">
              <span className="font-semibold text-slate-800">
                {"\u{1F4AC}"} アドバイス:{" "}
              </span>
              {profile.guidance}
            </p>
          </motion.div>

          {/* Expanded: history timeline */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-white/40">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">
                    {"\u{1F4C5}"} 季節の履歴
                  </h4>
                  <SeasonTimeline history={profile.seasonHistory} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </GlassCard>
  );
}

// =============================================================================
// Season Progress Bar
// =============================================================================

function SeasonProgressBar({
  progress,
  visual,
  nextSeason,
  estimatedDays,
}: {
  progress: number;
  visual: SeasonVisual;
  nextSeason: Season;
  estimatedDays: number | null;
}) {
  const nextMeta = SEASON_META_MINI[nextSeason];

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
        <span>季節の進行</span>
        {estimatedDays !== null && estimatedDays > 0 && (
          <span>
            {nextMeta.emoji} {nextMeta.label}まで約{estimatedDays}日
          </span>
        )}
      </div>
      <div className="h-2 rounded-full bg-white/50 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${visual.progressBarColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.round(progress * 100)}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

const SEASON_META_MINI: Record<Season, { label: string; emoji: string }> = {
  spring: { label: "春", emoji: "\u{1F331}" },
  summer: { label: "夏", emoji: "\u{1F33B}" },
  autumn: { label: "秋", emoji: "\u{1F342}" },
  winter: { label: "冬", emoji: "\u{2744}\u{FE0F}" },
};

// =============================================================================
// Season Timeline
// =============================================================================

function SeasonTimeline({ history }: { history: SeasonPhase[] }) {
  if (history.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic">
        まだ季節の履歴がありません
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {history
        .slice()
        .reverse()
        .map((phase, i) => {
          const mini = SEASON_META_MINI[phase.season];
          const visual = SEASON_VISUALS[phase.season];
          const isCurrent = i === 0 && phase.endedAt === null;

          return (
            <motion.div
              key={`${phase.season}-${phase.startedAt}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`
                flex items-start gap-3 p-2.5 rounded-xl
                ${isCurrent ? visual.bgAccent + " border border-white/60" : ""}
              `}
            >
              {/* Timeline dot */}
              <div className="flex flex-col items-center pt-0.5">
                <div
                  className={`
                    w-3 h-3 rounded-full
                    ${isCurrent ? "ring-2 ring-offset-1" : ""}
                  `}
                  style={{
                    backgroundColor: visual.particleColor,
                    // @ts-expect-error -- CSS custom property for ring color
                    "--tw-ring-color": visual.particleColor,
                  }}
                />
                {i < history.length - 1 && (
                  <div className="w-px h-6 bg-slate-200 mt-1" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{mini.emoji}</span>
                  <span className="text-sm font-medium text-slate-700">
                    {mini.label}
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/60 text-slate-500 font-medium">
                      現在
                    </span>
                  )}
                  <span className="text-xs text-slate-400 ml-auto">
                    {phase.durationDays}日間
                  </span>
                </div>
                {phase.highlights.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {phase.highlights.map((h, hi) => (
                      <span
                        key={hi}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/50 text-slate-500"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
    </div>
  );
}

// =============================================================================
// Season Particles (nature-inspired ambient animation)
// =============================================================================

function SeasonParticles({
  season,
  visual,
}: {
  season: Season;
  visual: SeasonVisual;
}) {
  const particleCount = 6;
  const particles = Array.from({ length: particleCount }, (_, i) => i);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((i) => (
        <SeasonParticle key={i} index={i} season={season} visual={visual} />
      ))}
    </div>
  );
}

function SeasonParticle({
  index,
  season,
  visual,
}: {
  index: number;
  season: Season;
  visual: SeasonVisual;
}) {
  // Deterministic starting positions spread across the card
  const startX = 15 + ((index * 37 + 11) % 70);
  const startY = -10;
  const size = season === "winter" ? 4 + (index % 3) : 6 + (index % 4);
  const duration = 6 + (index % 5) * 2;
  const delay = index * 0.8;

  const particleContent = getParticleContent(season, index);

  // Different motion paths per season
  const motionVariants = getSeasonMotion(season, index);

  return (
    <motion.div
      className="absolute"
      style={{
        left: `${startX}%`,
        top: `${startY}%`,
        fontSize: `${size}px`,
        opacity: 0.4 + (index % 3) * 0.1,
      }}
      animate={motionVariants}
      transition={{
        duration,
        repeat: Infinity,
        delay,
        ease: "linear",
      }}
    >
      {particleContent}
    </motion.div>
  );
}

function getParticleContent(season: Season, index: number): string {
  switch (season) {
    case "spring": {
      const items = ["\u{1F33F}", "\u{1F331}", "\u{1F338}", "\u{2728}", "\u{1F33C}", "\u{1F343}"];
      return items[index % items.length];
    }
    case "summer": {
      const items = ["\u{2728}", "\u{1F31F}", "\u{2600}\u{FE0F}", "\u{1F33B}", "\u{1F31E}", "\u{1F4AB}"];
      return items[index % items.length];
    }
    case "autumn": {
      const items = ["\u{1F342}", "\u{1F341}", "\u{1F343}", "\u{1F33E}", "\u{1F344}", "\u{1F3B5}"];
      return items[index % items.length];
    }
    case "winter": {
      const items = ["\u{2744}\u{FE0F}", "\u{2B50}", "\u{1FA90}", "\u{2728}", "\u{1F311}", "\u{1F30C}"];
      return items[index % items.length];
    }
  }
}

function getSeasonMotion(
  season: Season,
  index: number,
): Record<string, number[]> {
  const baseY = [0, 120];
  const swayAmount = 20 + (index % 3) * 15;

  switch (season) {
    case "spring":
      // Gentle upward drift (sprouting)
      return {
        y: [120, 0],
        x: [-swayAmount / 2, swayAmount / 2],
        opacity: [0, 0.6, 0.4, 0],
        scale: [0.5, 1, 1.1, 0.8],
      };
    case "summer":
      // Warm floating glow
      return {
        y: [60, -20, 60],
        x: [-swayAmount, swayAmount, -swayAmount],
        opacity: [0.3, 0.7, 0.3],
        scale: [0.8, 1.2, 0.8],
      };
    case "autumn":
      // Falling leaves
      return {
        y: baseY,
        x: [-swayAmount, swayAmount, -swayAmount / 2, swayAmount / 2],
        rotate: [0, 180, 360],
        opacity: [0, 0.6, 0.3, 0],
      };
    case "winter":
      // Gentle snowfall
      return {
        y: baseY,
        x: [-swayAmount / 3, swayAmount / 3, -swayAmount / 3],
        opacity: [0, 0.5, 0.3, 0],
      };
  }
}
