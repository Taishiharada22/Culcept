"use client";

/**
 * CompatibilityRadar
 * 4カテゴリ双方向相性スコア表示
 * "あなたから見た相性" と "相手から見た相性" を横並びバーで可視化
 */

import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import { RV_COLORS } from "@/components/ui/rendezvous-design";

// ---------- Types ----------

export interface CategoryScoresView {
  face: number;        // 0-100
  vibe: number;        // 0-100
  style: number;       // 0-100
  personality: number; // 0-100
  overall: number;     // 0-100
}

interface CompatibilityRadarProps {
  myView: CategoryScoresView;
  theirView: CategoryScoresView;
}

// ---------- Constants ----------

const CATEGORIES = [
  { key: "face" as const, label: "顔", color: "#8B5CF6" },         // violet
  { key: "vibe" as const, label: "雰囲気", color: "#F59E0B" },     // amber
  { key: "style" as const, label: "スタイル", color: "#10B981" },   // emerald
  { key: "personality" as const, label: "性格", color: "#3B82F6" }, // blue
] as const;

// ---------- Sub-components ----------

function ScoreBar({
  value,
  color,
  delay,
}: {
  value: number;
  color: string;
  delay: number;
}) {
  return (
    <div className="relative h-2 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.8, delay, ease: "easeOut" }}
      />
    </div>
  );
}

function OverallScore({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-white/50 shrink-0">{label}</span>
      <motion.span
        className="text-lg font-bold"
        style={{
          background: RV_COLORS.gradient,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        {value}%
      </motion.span>
    </div>
  );
}

function CategorySection({
  title,
  scores,
  baseDelay,
}: {
  title: string;
  scores: CategoryScoresView;
  baseDelay: number;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-white/70">{title}</span>
        <OverallScore value={scores.overall} label="総合" />
      </div>

      <div className="space-y-2">
        {CATEGORIES.map((cat, i) => (
          <div key={cat.key} className="flex items-center gap-2">
            <span
              className="text-[10px] w-12 shrink-0 text-right font-medium"
              style={{ color: cat.color }}
            >
              {cat.label}
            </span>
            <div className="flex-1 min-w-0">
              <ScoreBar
                value={scores[cat.key]}
                color={cat.color}
                delay={baseDelay + i * 0.1}
              />
            </div>
            <span className="text-[10px] w-7 text-right text-white/50 tabular-nums">
              {scores[cat.key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Main Component ----------

export default function CompatibilityRadar({ myView, theirView }: CompatibilityRadarProps) {
  return (
    <GlassCard className="p-3">
      <h3 className="text-xs font-bold text-white/80 mb-3 text-center tracking-wide">
        相性スコア
      </h3>

      <div className="flex gap-4">
        <CategorySection
          title="あなたから見た相性"
          scores={myView}
          baseDelay={0}
        />

        {/* Divider */}
        <div className="w-px shrink-0" style={{ background: "rgba(255,255,255,0.1)" }} />

        <CategorySection
          title="相手から見た相性"
          scores={theirView}
          baseDelay={0.4}
        />
      </div>
    </GlassCard>
  );
}
