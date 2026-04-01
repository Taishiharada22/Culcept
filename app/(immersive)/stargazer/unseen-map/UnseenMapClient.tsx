"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { trackFeatureView, trackInteraction } from "@/lib/stargazer/trackClient";
import {
  GlassCard,
  GlassButton,
  GlassBadge,
  FadeInView,
  ProgressRing,
  Skeleton,
} from "@/components/ui/glassmorphism-design";
import {
  buildUnseenMap,
  type UnseenMap,
  type MapTile,
  type TileState,
  type UnseenMapInput,
} from "@/lib/stargazer/unseenMap";
import type { AxisCategory } from "@/lib/stargazer/traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CATEGORY_LABELS: Record<AxisCategory, string> = {
  core: "判断の核",
  relational: "関係性",
  motion: "行動原理",
  aesthetic: "美的感覚",
  emotional: "感情の流れ",
  safety: "安全性",
  relational_deep: "深層関係性",
  depth: "深層心理",
  cognitive: "認知スタイル",
  expansion: "拡張観測",
};

const CATEGORY_COLORS: Record<AxisCategory, string> = {
  core: "from-amber-400 to-orange-500",
  relational: "from-pink-400 to-rose-500",
  motion: "from-blue-400 to-indigo-500",
  aesthetic: "from-purple-400 to-violet-500",
  emotional: "from-cyan-400 to-teal-500",
  safety: "from-emerald-400 to-green-500",
  relational_deep: "from-fuchsia-400 to-pink-500",
  depth: "from-slate-400 to-zinc-500",
  cognitive: "from-sky-400 to-blue-500",
  expansion: "from-gray-400 to-neutral-500",
};

const CATEGORY_GLOW: Record<AxisCategory, string> = {
  core: "rgba(251,146,60,0.3)",
  relational: "rgba(244,114,182,0.3)",
  motion: "rgba(99,102,241,0.3)",
  aesthetic: "rgba(168,85,247,0.3)",
  emotional: "rgba(6,182,212,0.3)",
  safety: "rgba(52,211,153,0.3)",
  relational_deep: "rgba(232,121,249,0.3)",
  depth: "rgba(148,163,184,0.3)",
  cognitive: "rgba(56,189,248,0.3)",
  expansion: "rgba(120,120,120,0.3)",
};

const TILE_STATES: TileState[] = ["fog", "outline", "partial", "clear", "deep", "mastered"];

const DEPTH_LABELS: Record<TileState, string> = {
  fog: "未探索",
  outline: "輪郭",
  partial: "部分的",
  clear: "明瞭",
  deep: "深層",
  mastered: "極",
};

const DEPTH_DESCRIPTIONS: Record<TileState, string> = {
  fog: "まだ見えない。ここに何が隠れているのか......",
  outline: "輪郭が見え始めた。少しずつ姿を現している。",
  partial: "部分的に見えている。もう少しで全体像が掴める。",
  clear: "はっきりと見えている。あなたの一部として認識された。",
  deep: "深い理解に達した。この軸のパターンが読み取れる。",
  mastered: "極みに達した。この領域を完全に掌握している。",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fog particles SVG for uncharted tiles
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function FogParticles({ intensity }: { intensity: "heavy" | "light" }) {
  const count = intensity === "heavy" ? 4 : 2;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 60 60">
      {Array.from({ length: count }).map((_, i) => (
        <motion.circle
          key={i}
          cx={15 + i * 12}
          cy={25 + (i % 2) * 10}
          r={4 + i % 3}
          fill={`rgba(148,163,184,${intensity === "heavy" ? 0.15 : 0.08})`}
          animate={{
            cx: [15 + i * 12, 20 + i * 10, 15 + i * 12],
            cy: [25 + (i % 2) * 10, 30 + (i % 2) * 8, 25 + (i % 2) * 10],
            opacity: [0.1, 0.25, 0.1],
          }}
          transition={{
            duration: 4 + i * 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </svg>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tile Component (enhanced)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function MapTileCard({
  tile,
  onTap,
  index,
}: {
  tile: MapTile;
  onTap: (tile: MapTile) => void;
  index: number;
}) {
  const catGlow = CATEGORY_GLOW[tile.category];
  const catColor = CATEGORY_COLORS[tile.category];
  const stateIdx = TILE_STATES.indexOf(tile.state);
  const isRevealed = stateIdx >= 2; // partial or above
  const isRecent = tile.lastObservedAt &&
    (Date.now() - new Date(tile.lastObservedAt).getTime()) < 3 * 24 * 60 * 60 * 1000;

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.025, duration: 0.2, type: "spring", stiffness: 200 }}
      onClick={() => onTap(tile)}
      className={`
        relative w-full aspect-square rounded-2xl border backdrop-blur-lg
        transition-all duration-300 overflow-hidden
        hover:scale-[1.06] active:scale-[0.97]
        ${tile.state === "fog"
          ? "bg-slate-200/30 border-slate-300/15"
          : tile.state === "outline"
            ? "bg-slate-100/40 border-slate-300/30"
            : tile.state === "partial"
              ? "bg-white/45 border-slate-300/50"
              : tile.state === "clear"
                ? "bg-white/60 border-indigo-200/50"
                : tile.state === "deep"
                  ? "bg-white/70 border-indigo-300/60"
                  : "bg-gradient-to-br from-amber-50/90 to-white/90 border-amber-300/50"
        }
      `}
      style={{
        boxShadow: tile.state === "mastered"
          ? `0 0 16px rgba(251,191,36,0.2), 0 4px 12px rgba(0,0,0,0.04)`
          : tile.state === "deep"
            ? `0 0 12px ${catGlow}, 0 4px 8px rgba(0,0,0,0.03)`
            : tile.state === "clear"
              ? `0 2px 8px rgba(0,0,0,0.04)`
              : "none",
      }}
    >
      {/* Fog overlay for unexplored */}
      {tile.state === "fog" && (
        <>
          <FogParticles intensity="heavy" />
          <motion.div
            className="absolute inset-0 rounded-2xl"
            style={{
              background: "radial-gradient(circle at center, rgba(148,163,184,0.05), rgba(148,163,184,0.15))",
            }}
            animate={{ opacity: [0.6, 0.9, 0.6] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Mystery icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.span
              className="text-lg"
              style={{ color: "rgba(148,163,184,0.3)" }}
              animate={{ opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              ?
            </motion.span>
          </div>
        </>
      )}

      {/* Outline: partial fog */}
      {tile.state === "outline" && (
        <FogParticles intensity="light" />
      )}

      {/* Recent observation glow */}
      {isRecent && isRevealed && (
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, ${catGlow}, transparent 70%)`,
          }}
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Mastered aurora */}
      {tile.state === "mastered" && (
        <motion.div
          className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${catColor} opacity-10`}
          animate={{ opacity: [0.06, 0.15, 0.06] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Deep glow ring */}
      {tile.state === "deep" && (
        <motion.div
          className="absolute inset-0 rounded-2xl border-2 border-indigo-400/20"
          animate={{ opacity: [0.2, 0.6, 0.2] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Content */}
      <div className={`relative z-10 flex flex-col items-center justify-center h-full p-1.5 ${
        tile.state === "fog" ? "opacity-0" : tile.state === "outline" ? "opacity-40" : ""
      }`}>
        {tile.state !== "fog" && (
          <>
            <span className={`text-[10px] sm:text-xs font-medium text-center leading-tight line-clamp-2 px-0.5 ${
              isRevealed ? "text-slate-700" : "text-slate-400"
            }`}>
              {tile.axisLabel}
            </span>
            {isRevealed && tile.evidenceCount > 0 && (
              <span className="mt-0.5 text-[9px] text-slate-400 font-mono-sg">
                {tile.evidenceCount} 件
              </span>
            )}
          </>
        )}
      </div>

      {/* Depth indicator -- gradient ring */}
      <div className="absolute top-1 right-1">
        <div
          className={`w-2 h-2 rounded-full transition-all duration-500 ${
            tile.state === "mastered"
              ? "bg-amber-400 shadow-sm shadow-amber-400/50"
              : tile.state === "deep"
                ? "bg-indigo-400 shadow-sm shadow-indigo-400/40"
                : tile.state === "clear"
                  ? "bg-blue-300"
                  : tile.state === "partial"
                    ? "bg-slate-400"
                    : "bg-slate-300/30"
          }`}
        />
      </div>

      {/* Mastered sparkle particles */}
      {tile.state === "mastered" && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-amber-300"
              style={{
                top: `${20 + i * 25}%`,
                left: `${15 + i * 30}%`,
              }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0.5, 1.2, 0.5],
              }}
              transition={{
                duration: 2,
                delay: i * 0.6,
                repeat: Infinity,
              }}
            />
          ))}
        </>
      )}

      {/* Adjacent territory hint for fog tiles */}
      {tile.state === "fog" && tile.adjacentRevealed && (
        <motion.div
          className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full bg-amber-400/40"
          animate={{ opacity: [0.2, 0.6, 0.2] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
    </motion.button>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Detail Panel (enhanced)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TileDetailPanel({
  tile,
  onClose,
}: {
  tile: MapTile;
  onClose: () => void;
}) {
  const catColor = CATEGORY_COLORS[tile.category];
  const stateIdx = TILE_STATES.indexOf(tile.state);
  const catGlow = CATEGORY_GLOW[tile.category];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 40, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="fixed inset-x-4 bottom-24 z-50 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[420px]"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <GlassCard
        variant="elevated"
        padding="lg"
        className="relative z-50 overflow-hidden"
      >
        {/* Background glow for revealed tiles */}
        {stateIdx >= 3 && (
          <div
            className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${catGlow}, transparent 70%)`,
              filter: "blur(20px)",
              opacity: 0.4,
            }}
          />
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors z-10"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="relative z-10 flex items-start gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${catColor} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
            {DEPTH_LABELS[tile.state].charAt(0)}
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 font-display">
              {tile.state === "fog" ? "??????" : tile.axisLabel}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <GlassBadge size="sm" variant="info">
                {CATEGORY_LABELS[tile.category]}
              </GlassBadge>
              <GlassBadge
                size="sm"
                variant={
                  tile.state === "mastered"
                    ? "warning"
                    : tile.state === "deep" || tile.state === "clear"
                      ? "success"
                      : "default"
                }
              >
                {DEPTH_LABELS[tile.state]}
              </GlassBadge>
            </div>
          </div>
        </div>

        {/* State description */}
        <p className="text-sm text-slate-500 mb-4 italic leading-relaxed relative z-10">
          {DEPTH_DESCRIPTIONS[tile.state]}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4 relative z-10">
          <div className="text-center p-2 rounded-xl bg-slate-50/80">
            <p className="text-xs text-slate-500">深度</p>
            <p className="text-lg font-bold text-slate-800">{tile.depthLevel}/5</p>
          </div>
          <div className="text-center p-2 rounded-xl bg-slate-50/80">
            <p className="text-xs text-slate-500">観測数</p>
            <p className="text-lg font-bold text-slate-800">{tile.evidenceCount}</p>
          </div>
          <div className="text-center p-2 rounded-xl bg-slate-50/80">
            <p className="text-xs text-slate-500">最終観測</p>
            <p className="text-sm font-semibold text-slate-800">
              {tile.lastObservedAt
                ? new Date(tile.lastObservedAt).toLocaleDateString("ja-JP", {
                    month: "short",
                    day: "numeric",
                  })
                : "--"}
            </p>
          </div>
        </div>

        {/* Depth progress bar */}
        <div className="mb-4 relative z-10">
          <div className="flex items-center gap-1">
            {TILE_STATES.map((state, i) => {
              const isActive = i <= stateIdx;
              return (
                <motion.div
                  key={state}
                  className="h-2 flex-1 rounded-full overflow-hidden"
                  style={{ background: "rgba(148,163,184,0.12)" }}
                >
                  <motion.div
                    className={`h-full rounded-full ${isActive ? `bg-gradient-to-r ${catColor}` : ""}`}
                    initial={{ width: "0%" }}
                    animate={{ width: isActive ? "100%" : "0%" }}
                    transition={{ delay: 0.1 + i * 0.08, duration: 0.22, ease: "easeOut" }}
                  />
                </motion.div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-slate-400">未探索</span>
            <span className="text-[9px] text-slate-400">極</span>
          </div>
        </div>

        {/* Discovery teaser */}
        {tile.discoveryTeaser && (
          <motion.div
            className="p-3 rounded-xl relative z-10 overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.06), rgba(168,85,247,0.06))",
              border: "1px solid rgba(99,102,241,0.1)",
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <p className="text-xs font-semibold text-indigo-600 mb-1">
              次の発見
            </p>
            <p className="text-sm text-indigo-900 font-body leading-relaxed">
              {tile.discoveryTeaser}
            </p>
          </motion.div>
        )}

        {/* Adjacent hint for fog */}
        {tile.state === "fog" && tile.adjacentRevealed && (
          <motion.div
            className="mt-3 p-3 rounded-xl relative z-10"
            style={{
              background: "rgba(251,191,36,0.06)",
              border: "1px solid rgba(251,191,36,0.12)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <p className="text-sm text-amber-800">
              隣接する領域が明らかになっている。この霧の向こうに何かがある...
            </p>
            <p className="text-xs text-amber-600/60 mt-1 italic">
              観測を続けることで、少しずつ見えてくる。
            </p>
          </motion.div>
        )}
      </GlassCard>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Exploration Hero
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ExplorationHero({ map }: { map: UnseenMap }) {
  const pct = map.explorationPercentage;
  const message = pct < 10
    ? "探索の旅が始まったばかり。未知の領域が広がっている。"
    : pct < 30
      ? "少しずつ霧が晴れてきた。まだ多くの領域が眠っている。"
      : pct < 60
        ? "地図の輪郭が見え始めた。あなた自身の姿が浮かび上がっている。"
        : pct < 80
          ? "大部分が明らかになった。でも最も深い領域はまだ先にある。"
          : "ほぼ全ての領域を探索した。あなたは自分自身の熟練した観測者だ。";

  return (
    <FadeInView delay={0.1}>
      <div className="flex flex-col items-center mb-6">
        <div className="relative">
          <ProgressRing progress={pct} size={140} strokeWidth={10}>
            <div className="flex flex-col items-center">
              <motion.span
                className="text-3xl font-bold text-slate-900 font-display"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3, type: "spring" }}
              >
                {pct}%
              </motion.span>
              <span className="text-xs text-slate-500 font-body">
                探索率
              </span>
            </div>
          </ProgressRing>

          {/* Decorative orbital dots */}
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-indigo-400/40"
              style={{
                top: "50%",
                left: "50%",
              }}
              animate={{
                x: [
                  Math.cos((i * 2.1) + 0) * 80 - 3,
                  Math.cos((i * 2.1) + Math.PI) * 80 - 3,
                  Math.cos((i * 2.1) + Math.PI * 2) * 80 - 3,
                ],
                y: [
                  Math.sin((i * 2.1) + 0) * 80 - 3,
                  Math.sin((i * 2.1) + Math.PI) * 80 - 3,
                  Math.sin((i * 2.1) + Math.PI * 2) * 80 - 3,
                ],
                opacity: [0.2, 0.6, 0.2],
              }}
              transition={{ duration: 8 + i * 2, repeat: Infinity, ease: "linear" }}
            />
          ))}
        </div>

        <motion.p
          className="mt-4 text-sm text-slate-500 text-center max-w-xs leading-relaxed italic"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {message}
        </motion.p>

        <div className="mt-3 flex items-center gap-4 text-sm text-slate-600">
          <span>
            <span className="font-semibold text-slate-800">{map.totalRevealed}</span> 発見済
          </span>
          <span className="w-px h-4 bg-slate-300" />
          <span>
            <span className="font-semibold text-slate-800">{map.unchartedTerritories.length}</span> 未踏
          </span>
        </div>
      </div>
    </FadeInView>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Loading Skeleton
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LoadingSkeleton() {
  return (
    <div className="min-h-screen px-4 pt-20 pb-32 max-w-lg mx-auto">
      <div className="flex flex-col items-center mb-8">
        <Skeleton variant="circular" width={120} height={120} />
        <Skeleton className="mt-4 w-32 h-4" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 16 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" className="aspect-square w-full" />
        ))}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function UnseenMapClient() {
  useEffect(() => { trackFeatureView("unseen_map"); }, []);

  const [map, setMap] = useState<UnseenMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTile, setSelectedTile] = useState<MapTile | null>(null);
  const [filterCategory, setFilterCategory] = useState<AxisCategory | "all">("all");

  const fetchMap = useCallback(async () => {
    try {
      const res = await fetch("/api/stargazer/unseen-map");
      if (!res.ok) throw new Error("Failed to fetch unseen map");

      const data = await res.json();

      // API returns pre-built map or input data
      if (data.map) {
        setMap(data.map);
      } else {
        const input: UnseenMapInput = {
          axisScores: data.axisScores ?? {},
          observationQualities: data.observationQualities ?? {},
          observationCounts: data.observationCounts ?? {},
          mirrorCoverage: data.mirrorCoverage ?? {},
          lastObservationDates: data.lastObservationDates ?? {},
          recentDiscoveries: data.recentDiscoveries ?? [],
        };
        setMap(buildUnseenMap(input));
      }
    } catch {
      const input: UnseenMapInput = {
        axisScores: {},
        observationQualities: {},
        observationCounts: {},
        mirrorCoverage: {},
        lastObservationDates: {},
      };
      setMap(buildUnseenMap(input));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMap();
  }, [fetchMap]);

  if (loading) return <LoadingSkeleton />;
  if (!map) return null;

  const filteredTiles =
    filterCategory === "all"
      ? map.tiles
      : map.tiles.filter((t) => t.category === filterCategory);

  const suggestedTile = map.tiles.find(
    (t) => t.axisKey === map.nextSuggestedExploration
  );

  const categories = Array.from(new Set(map.tiles.map((t) => t.category)));

  return (
    <div className="min-h-screen pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 backdrop-blur-xl bg-white/10 border-b border-white/10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/stargazer"
            className="w-9 h-9 rounded-xl bg-white/60 backdrop-blur-lg border border-slate-200/50 flex items-center justify-center text-slate-600 hover:bg-white/80 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-slate-900 font-display">
              未知の地図
            </h1>
            <p className="text-xs text-slate-500 font-body">
              {map.totalRevealed}/{map.totalTiles} 領域が明らかに
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6">
        {/* Exploration Hero */}
        <ExplorationHero map={map} />

        {/* Category Filter */}
        <FadeInView delay={0.2}>
          <div className="mb-6 overflow-x-auto scrollbar-hide -mx-4 px-4">
            <div className="flex gap-2 min-w-max">
              <button
                onClick={() => setFilterCategory("all")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  filterCategory === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-white/60 text-slate-600 hover:bg-white/80"
                }`}
              >
                すべて
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                    filterCategory === cat
                      ? "bg-slate-900 text-white"
                      : "bg-white/60 text-slate-600 hover:bg-white/80"
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>
        </FadeInView>

        {/* Tile Grid */}
        <FadeInView delay={0.3}>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-8">
            {filteredTiles.map((tile, i) => (
              <MapTileCard
                key={tile.axisKey}
                tile={tile}
                onTap={setSelectedTile}
                index={i}
              />
            ))}
          </div>
        </FadeInView>

        {/* Legend */}
        <FadeInView delay={0.4}>
          <GlassCard padding="sm" className="mb-6">
            <p className="text-xs font-semibold text-slate-700 mb-2">深度レベル</p>
            <div className="flex flex-wrap gap-3">
              {([
                { state: "fog" as const, label: "未探索", color: "bg-slate-300/40" },
                { state: "outline" as const, label: "輪郭", color: "bg-slate-400/60" },
                { state: "partial" as const, label: "部分的", color: "bg-slate-500" },
                { state: "clear" as const, label: "明瞭", color: "bg-blue-400" },
                { state: "deep" as const, label: "深層", color: "bg-indigo-500" },
                { state: "mastered" as const, label: "極", color: "bg-amber-400" },
              ]).map(({ state, label, color }) => (
                <div key={state} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                  <span className="text-[10px] text-slate-600">{label}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </FadeInView>

        {/* Next Exploration Suggestion */}
        {suggestedTile && (
          <FadeInView delay={0.5}>
            <GlassCard variant="gradient" padding="md" className="mb-6 relative overflow-hidden">
              {/* Background decorative element */}
              <motion.div
                className="absolute -top-8 -right-8 w-24 h-24 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(99,102,241,0.1), transparent 70%)",
                  filter: "blur(10px)",
                }}
                animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 5, repeat: Infinity }}
              />

              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">次の探索候補</h3>
                </div>

                <p className="text-base font-semibold text-slate-800 mb-1">
                  {suggestedTile.axisLabel}
                </p>
                <GlassBadge size="sm" variant="info" className="mb-2">
                  {CATEGORY_LABELS[suggestedTile.category]}
                </GlassBadge>
                {suggestedTile.discoveryTeaser && (
                  <p className="text-sm text-slate-600 leading-relaxed mt-2 font-body italic">
                    {suggestedTile.discoveryTeaser}
                  </p>
                )}

                <div className="mt-3">
                  <GlassButton variant="primary" size="sm" href="/stargazer">
                    観測を開始する
                  </GlassButton>
                </div>
              </div>
            </GlassCard>
          </FadeInView>
        )}
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedTile && (
          <TileDetailPanel
            tile={selectedTile}
            onClose={() => setSelectedTile(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
