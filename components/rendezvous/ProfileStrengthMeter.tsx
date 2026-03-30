"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ProfileStrengthResult } from "@/lib/rendezvous/profileStrength";

// =============================================================================
// ProfileStrengthMeter - Bumble式プロフィール完成度メーター
// RendezvousHomeの上部に配置、改善提案付き
// =============================================================================

type ProfileStrengthMeterProps = {
  className?: string;
};

const LEVEL_COLORS = {
  beginner: { ring: "#EF4444", bg: "from-red-400/20 to-orange-300/10" },
  growing: { ring: "#F59E0B", bg: "from-amber-400/20 to-yellow-300/10" },
  strong: { ring: "#22C55E", bg: "from-emerald-400/20 to-green-300/10" },
  excellent: { ring: "#8B5CF6", bg: "from-violet-400/20 to-indigo-300/10" },
};

const LEVEL_LABELS = {
  beginner: "はじまり",
  growing: "成長中",
  strong: "充実",
  excellent: "完成",
};

export function ProfileStrengthMeter({ className }: ProfileStrengthMeterProps) {
  const [data, setData] = useState<ProfileStrengthResult | null>(null);

  useEffect(() => {
    fetch("/api/rendezvous/profile-strength")
      .then((res) => res.json())
      .then((result) => {
        if (result.score !== undefined) setData(result);
      })
      .catch(() => {});
  }, []);

  if (!data || data.score >= 100) return null; // 完成済みなら非表示

  const { ring, bg } = LEVEL_COLORS[data.level];
  const circumference = 2 * Math.PI * 28;
  const dashOffset = circumference * (1 - data.score / 100);

  return (
    <motion.div
      className={cn(
        "rounded-2xl bg-white/60 backdrop-blur-md border border-white/30 shadow-sm overflow-hidden",
        className,
      )}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className={cn("px-4 py-4 bg-gradient-to-r", bg)}>
        <div className="flex items-center gap-4">
          {/* 円形プログレス */}
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="rgba(0,0,0,0.06)"
                strokeWidth="4"
              />
              <motion.circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke={ring}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: dashOffset }}
                transition={{ duration: 1.2, ease: "easeOut" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-semibold text-slate-700">{data.score}</span>
            </div>
          </div>

          {/* テキスト */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                プロフィール強度
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: `${ring}20`, color: ring }}
              >
                {LEVEL_LABELS[data.level]}
              </span>
            </div>
            {data.nextAction && (
              <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                {data.nextAction}
              </p>
            )}
          </div>
        </div>

        {/* 項目バー */}
        <div className="mt-3 flex gap-0.5">
          {data.items.map((item) => (
            <div
              key={item.key}
              className="flex-1 h-1.5 rounded-full"
              style={{
                backgroundColor: item.completed ? ring : "rgba(0,0,0,0.06)",
              }}
              title={item.label}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
