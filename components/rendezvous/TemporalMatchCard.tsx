"use client";

/**
 * TemporalMatchCard
 * 時間的マッチング結果を表示するカード。
 * 「今のあなた」->「橋」->「未来のあなた」のタイムライン表現。
 */

import { motion } from "framer-motion";
import { GlassCard, GlassBadge } from "@/components/ui/glassmorphism-design";
import type { TemporalMatch, BridgeType } from "@/lib/rendezvous/temporalMatching";

type Props = {
  match: TemporalMatch;
  displayName: string;
  avatarUrl?: string | null;
  compact?: boolean;
};

const BRIDGE_ICONS: Record<BridgeType, string> = {
  already_there: "\u2728",
  walking_together: "\u{1F6B6}",
  pulling_forward: "\u{1F31F}",
  mirror_of_future: "\u{1FA9E}",
  catalyst_of_change: "\u26A1",
};

const BRIDGE_COLORS: Record<BridgeType, string> = {
  already_there: "from-amber-400/20 to-amber-600/10",
  walking_together: "from-blue-400/20 to-indigo-600/10",
  pulling_forward: "from-emerald-400/20 to-cyan-600/10",
  mirror_of_future: "from-violet-400/20 to-purple-600/10",
  catalyst_of_change: "from-rose-400/20 to-orange-600/10",
};

const BRIDGE_ACCENT: Record<BridgeType, string> = {
  already_there: "text-amber-500",
  walking_together: "text-blue-500",
  pulling_forward: "text-emerald-500",
  mirror_of_future: "text-violet-500",
  catalyst_of_change: "text-rose-500",
};

export default function TemporalMatchCard({
  match,
  displayName,
  avatarUrl,
  compact = false,
}: Props) {
  if (compact) {
    return <CompactView match={match} displayName={displayName} avatarUrl={avatarUrl} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <GlassCard className="relative overflow-hidden">
        {/* Gradient background based on bridge type */}
        <div
          className={`absolute inset-0 bg-gradient-to-br ${BRIDGE_COLORS[match.bridgeType]} pointer-events-none`}
        />

        <div className="relative z-10">
          {/* Header: Bridge type + score */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">{BRIDGE_ICONS[match.bridgeType]}</span>
              <GlassBadge variant="default" size="sm">
                {match.bridgeLabel}
              </GlassBadge>
            </div>
            <ScoreRing score={match.bridgeScore} bridgeType={match.bridgeType} />
          </div>

          {/* Timeline: 今のあなた -> 橋 -> 未来のあなた */}
          <div className="flex items-center gap-3 mb-4">
            {/* 今のあなた */}
            <div className="flex-shrink-0 text-center">
              <div className="w-10 h-10 rounded-full bg-slate-200/60 flex items-center justify-center text-sm">
                {"\u{1F464}"}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">今のあなた</p>
            </div>

            {/* Arrow */}
            <div className="flex-1 relative">
              <div className="h-px bg-gradient-to-r from-slate-300 via-slate-400 to-slate-300" />
              {/* Connecting arrows for each bridge axis */}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2">
                <svg width="8" height="8" viewBox="0 0 8 8" className="text-slate-400">
                  <path d="M0 4L4 0L8 4" fill="none" stroke="currentColor" strokeWidth="1" />
                </svg>
              </div>
            </div>

            {/* Bridge person */}
            <div className="flex-shrink-0 text-center">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-md"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-lg border-2 border-white shadow-md">
                  {displayName.charAt(0)}
                </div>
              )}
              <p className="text-xs font-medium text-slate-700 mt-1">{displayName}</p>
            </div>

            {/* Arrow */}
            <div className="flex-1 relative">
              <div className="h-px bg-gradient-to-r from-slate-300 via-slate-400 to-slate-300" />
              <div className="absolute -top-1 left-1/2 -translate-x-1/2">
                <svg width="8" height="8" viewBox="0 0 8 8" className="text-slate-400">
                  <path d="M0 4L4 0L8 4" fill="none" stroke="currentColor" strokeWidth="1" />
                </svg>
              </div>
            </div>

            {/* 未来のあなた */}
            <div className="flex-shrink-0 text-center">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center text-sm shadow-sm">
                {"\u2728"}
              </div>
              <p className="text-[10px] text-amber-600 mt-1">未来のあなた</p>
            </div>
          </div>

          {/* Bridge axes */}
          {match.bridgeAxes.length > 0 && (
            <div className="space-y-2 mb-4">
              {match.bridgeAxes.slice(0, 3).map((axis, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-24 flex-shrink-0 text-right">
                    {axis.label}
                  </span>
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full bg-gradient-to-r ${BRIDGE_COLORS[match.bridgeType].replace("/20", "/60").replace("/10", "/40")}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${axis.futureAlignment * 100}%` }}
                      transition={{ delay: 0.3 + i * 0.15, duration: 0.8 }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 w-10 text-right">
                    {Math.round(axis.futureAlignment * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Narrative */}
          <p className="text-sm text-slate-600 leading-relaxed">
            {match.bridgeNarrative}
          </p>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ============================================================
// Compact view for list display
// ============================================================

function CompactView({
  match,
  displayName,
  avatarUrl,
}: {
  match: TemporalMatch;
  displayName: string;
  avatarUrl?: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <GlassCard padding="sm" className="!py-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-sm flex-shrink-0">
              {displayName.charAt(0)}
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700 truncate">
                {displayName}
              </span>
              <span className="text-xs">{BRIDGE_ICONS[match.bridgeType]}</span>
            </div>
            <p className="text-xs text-slate-500 truncate">{match.bridgeLabel}</p>
          </div>

          {/* Score */}
          <div className="flex-shrink-0">
            <ScoreRing score={match.bridgeScore} bridgeType={match.bridgeType} size="sm" />
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ============================================================
// Score ring component
// ============================================================

function ScoreRing({
  score,
  bridgeType,
  size = "md",
}: {
  score: number;
  bridgeType: BridgeType;
  size?: "sm" | "md";
}) {
  const dimensions = size === "sm" ? 32 : 44;
  const strokeWidth = size === "sm" ? 2.5 : 3;
  const radius = (dimensions - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <div className="relative" style={{ width: dimensions, height: dimensions }}>
      <svg
        width={dimensions}
        height={dimensions}
        viewBox={`0 0 ${dimensions} ${dimensions}`}
        className="-rotate-90"
      >
        <circle
          cx={dimensions / 2}
          cy={dimensions / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-200"
        />
        <motion.circle
          cx={dimensions / 2}
          cy={dimensions / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          className={BRIDGE_ACCENT[bridgeType]}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-medium ${
          size === "sm" ? "text-[10px]" : "text-xs"
        } text-slate-700`}
      >
        {score}
      </span>
    </div>
  );
}
