"use client";

// ============================================================
// EngagementDashboard — エンゲージメント状態の表示
// ストリーク、デイリーミステリー、タイムゲート
// ============================================================

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassBadge } from "@/components/ui/glassmorphism-design";
import type { EngagementLoop, TimeGate, StreakTier } from "@/lib/rendezvous/addictionArchitecture";

type Props = {
  loop: EngagementLoop;
  timeGates: TimeGate[];
  onRevealMystery: () => void;
  compact?: boolean;
};

// ---------- Tier Colors ----------

const TIER_CONFIG: Record<StreakTier, { color: string; bg: string; emoji: string }> = {
  none: { color: "#9CA3AF", bg: "rgba(156,163,175,0.1)", emoji: "" },
  bronze: { color: "#CD7F32", bg: "rgba(205,127,50,0.1)", emoji: "" },
  silver: { color: "#94A3B8", bg: "rgba(148,163,184,0.15)", emoji: "" },
  gold: { color: "#EAB308", bg: "rgba(234,179,8,0.12)", emoji: "" },
  platinum: { color: "#A78BFA", bg: "rgba(167,139,250,0.12)", emoji: "" },
};

// ---------- Helpers ----------

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "NOW";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatTimeGateCountdown(opensAt: string): string {
  const diff = Math.max(0, Math.floor((new Date(opensAt).getTime() - Date.now()) / 1000));
  if (diff <= 0) return "NOW";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h > 24) return `${Math.ceil(h / 24)}日`;
  if (h > 0) return `${h}時間${m > 0 ? `${m}分` : ""}`;
  return `${m}分`;
}

// ---------- Sub-Components ----------

function StreakCounter({ days, tier }: { days: number; tier: StreakTier }) {
  const config = TIER_CONFIG[tier];

  return (
    <div className="flex items-center gap-2">
      {/* Flame icon */}
      <motion.div
        className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
        style={{ background: config.bg }}
        animate={
          days > 0
            ? { scale: [1, 1.1, 1] }
            : undefined
        }
        transition={
          days > 0
            ? { duration: 2, repeat: Infinity, ease: "easeInOut" }
            : undefined
        }
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill={days > 0 ? config.color : "#D1D5DB"}
          stroke="none"
        >
          <path d="M12 2C10.5 5.5 7 8 7 12c0 2.76 2.24 5 5 5s5-2.24 5-5c0-4-3.5-6.5-5-10zm0 13c-1.1 0-2-.9-2-2 0-1.5 1.2-2.5 2-3.5.8 1 2 2 2 3.5 0 1.1-.9 2-2 2z" />
        </svg>
      </motion.div>

      <div className="flex flex-col">
        <span className="text-sm font-bold" style={{ color: config.color }}>
          {days}日連続
        </span>
        {tier !== "none" && (
          <GlassBadge
            variant="default"
            size="sm"
            className="mt-0.5 text-[10px]"
          >
            <span style={{ color: config.color }}>{TIER_CONFIG[tier].emoji}</span>
          </GlassBadge>
        )}
      </div>
    </div>
  );
}

function TierBadge({ tier, label }: { tier: StreakTier; label: string }) {
  if (tier === "none") return null;
  const config = TIER_CONFIG[tier];

  return (
    <motion.div
      className="rounded-full px-3 py-1 text-xs font-medium"
      style={{
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.color}30`,
      }}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", bounce: 0.5 }}
    >
      {label}
    </motion.div>
  );
}

function MysteryCard({
  mystery,
  nextRevealIn,
  onReveal,
}: {
  mystery: EngagementLoop["dailyMystery"];
  nextRevealIn: number | null;
  onReveal: () => void;
}) {
  const isAvailable = nextRevealIn === null;
  const [countdown, setCountdown] = useState(nextRevealIn ?? 0);

  useEffect(() => {
    if (nextRevealIn === null || nextRevealIn <= 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with prop
    setCountdown(nextRevealIn);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [nextRevealIn]);

  return (
    <GlassCard className="relative overflow-hidden p-4">
      {/* Blur overlay when not available */}
      {!isAvailable && !mystery.revealed && (
        <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <p className="text-xs text-gray-500">開封まで</p>
            <p className="text-lg font-bold text-indigo-600">
              {formatCountdown(countdown)}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400">
            今日のミステリー
          </p>
          <p className="mt-1 text-sm leading-relaxed text-gray-700">
            {mystery.revealed ? mystery.hint : "..."}
          </p>
        </div>

        {isAvailable && !mystery.revealed && (
          <motion.button
            onClick={onReveal}
            className="shrink-0 rounded-full bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            開封する
          </motion.button>
        )}
      </div>

      {mystery.revealed && (
        <motion.div
          className="mt-2 rounded-lg bg-indigo-50 px-3 py-2"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
        >
          <p className="text-xs text-indigo-600">
            {mysteryTypeLabel(mystery.type)}
          </p>
        </motion.div>
      )}
    </GlassCard>
  );
}

function mysteryTypeLabel(type: EngagementLoop["dailyMystery"]["type"]): string {
  const labels: Record<typeof type, string> = {
    new_encounter: "新しい出会い",
    insight_unlock: "インサイト解放",
    sync_invitation: "シンク招待",
    phantom_boost: "ファントムブースト",
    mirror_update: "ミラーアップデート",
    catalyst_reveal: "カタリストリビール",
  };
  return labels[type];
}

function TimeGateIndicator({ gate }: { gate: TimeGate }) {
  const [remaining, setRemaining] = useState(formatTimeGateCountdown(gate.opensAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(formatTimeGateCountdown(gate.opensAt));
    }, 60_000);
    return () => clearInterval(interval);
  }, [gate.opensAt]);

  const isOpen = new Date(gate.opensAt).getTime() <= Date.now();

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/60 px-3 py-2 backdrop-blur-sm">
      {/* Status dot */}
      <div
        className="h-2 w-2 shrink-0 rounded-full"
        style={{
          background: isOpen ? "#10B981" : "#F59E0B",
          boxShadow: isOpen ? "0 0 6px #10B98180" : "0 0 6px #F59E0B80",
        }}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-gray-700">
          {gate.label}
        </p>
        <p className="text-[10px] text-gray-400">{gate.description}</p>
      </div>

      <span
        className="shrink-0 text-xs font-bold"
        style={{ color: isOpen ? "#10B981" : "#F59E0B" }}
      >
        {isOpen ? "OPEN" : remaining}
      </span>
    </div>
  );
}

// ---------- Main Component ----------

export default function EngagementDashboard({
  loop,
  timeGates,
  onRevealMystery,
  compact = false,
}: Props) {
  const { streakDays, streakBonus, dailyMystery, nextRevealIn, engagementScore } = loop;

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <StreakCounter days={streakDays} tier={streakBonus.tier} />
        <TierBadge tier={streakBonus.tier} label={streakBonus.label} />
        {nextRevealIn !== null && (
          <span className="text-xs text-gray-400">
            {formatCountdown(nextRevealIn)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: Streak + Score */}
      <div className="flex items-center justify-between">
        <StreakCounter days={streakDays} tier={streakBonus.tier} />
        <div className="flex items-center gap-2">
          <TierBadge tier={streakBonus.tier} label={streakBonus.label} />
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-gray-400">
              エンゲージメント
            </span>
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-purple-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${engagementScore}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </div>
              <span className="text-[10px] font-medium text-indigo-600">
                {engagementScore}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Perks (if any) */}
      <AnimatePresence>
        {streakBonus.perks.length > 0 && (
          <motion.div
            className="flex flex-wrap gap-1.5"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            {streakBonus.perks.map((perk) => (
              <GlassBadge key={perk} variant="default" size="sm">
                <span className="text-[10px]">{perk}</span>
              </GlassBadge>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Daily Mystery */}
      <MysteryCard
        mystery={dailyMystery}
        nextRevealIn={nextRevealIn}
        onReveal={onRevealMystery}
      />

      {/* Time Gates */}
      {timeGates.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400">
            タイムゲート
          </p>
          {timeGates.map((gate) => (
            <TimeGateIndicator key={gate.type} gate={gate} />
          ))}
        </div>
      )}

      {/* Pullback message */}
      <AnimatePresence>
        {loop.pullbackMessage && (
          <motion.div
            className="rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <p className="text-xs leading-relaxed text-indigo-700">
              {loop.pullbackMessage}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
