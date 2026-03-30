// app/stargazer/_components/ShareableInsightCard.tsx
// SNS 共有用のスクリーンショット映えするインサイトカード
// 星座パターン背景 + 大きなインサイトテキスト + ブランドウォーターマーク
"use client";

import { motion } from "framer-motion";

// ── Props ──

interface Props {
  insight: string;
  category: string;
  archetypeName?: string;
  archetypeEmoji?: string;
  stat?: { label: string; value: string };
  gradient?: string;
  aspectRatio?: "story" | "square";
}

// ── Constellation pattern (SVG dots) ──

function ConstellationPattern() {
  // Deterministic star positions for consistent rendering
  const stars = [
    { x: 15, y: 12 }, { x: 42, y: 8 }, { x: 78, y: 18 },
    { x: 25, y: 35 }, { x: 55, y: 28 }, { x: 88, y: 32 },
    { x: 10, y: 55 }, { x: 38, y: 52 }, { x: 65, y: 48 },
    { x: 92, y: 58 }, { x: 20, y: 75 }, { x: 50, y: 72 },
    { x: 75, y: 68 }, { x: 35, y: 88 }, { x: 60, y: 85 },
    { x: 85, y: 82 }, { x: 8, y: 92 }, { x: 48, y: 95 },
  ];

  // Connect some stars with lines
  const lines: [number, number][] = [
    [0, 1], [1, 4], [4, 2], [3, 4], [4, 5],
    [6, 7], [7, 8], [8, 9], [10, 11], [11, 12],
    [13, 14], [14, 15],
  ];

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ opacity: 0.08 }}
    >
      {lines.map(([a, b], i) => (
        <line
          key={`line-${i}`}
          x1={stars[a].x}
          y1={stars[a].y}
          x2={stars[b].x}
          y2={stars[b].y}
          stroke="white"
          strokeWidth="0.15"
        />
      ))}
      {stars.map((s, i) => (
        <circle
          key={`star-${i}`}
          cx={s.x}
          cy={s.y}
          r={i % 3 === 0 ? 0.5 : 0.3}
          fill="white"
        />
      ))}
    </svg>
  );
}

// ── Stat Ring ──

function StatRing({ label, value }: { label: string; value: string }) {
  // Parse numeric value for ring (try to extract number)
  const numericMatch = value.match(/(\d+)/);
  const percent = numericMatch ? Math.min(Number(numericMatch[1]), 100) : 50;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg width="96" height="96" className="-rotate-90">
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="4"
          />
          <motion.circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke="url(#shareRingGrad)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
          />
          <defs>
            <linearGradient id="shareRingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#06B6D4" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-white">{value}</span>
        </div>
      </div>
      <span className="text-xs text-white/50">{label}</span>
    </div>
  );
}

// ── Main Component ──

export default function ShareableInsightCard({
  insight,
  category,
  archetypeName,
  archetypeEmoji,
  stat,
  gradient,
  aspectRatio = "story",
}: Props) {
  const defaultGradient =
    "linear-gradient(160deg, #0F0B1E 0%, #1A1040 30%, #1E1B4B 60%, #0F172A 100%)";
  const bg = gradient || defaultGradient;

  const aspectClass =
    aspectRatio === "story" ? "aspect-[9/16]" : "aspect-square";

  return (
    <div
      className={`relative w-full max-w-sm mx-auto ${aspectClass} rounded-3xl overflow-hidden`}
      style={{ background: bg }}
    >
      {/* Constellation background */}
      <ConstellationPattern />

      {/* Subtle vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col justify-between p-8">
        {/* Top: Category + Archetype */}
        <div className="space-y-3">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.22 }}
          >
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-medium"
              style={{
                background: "rgba(139,92,246,0.2)",
                color: "rgba(167,139,250,0.9)",
                border: "1px solid rgba(139,92,246,0.15)",
              }}
            >
              {category}
            </span>
          </motion.div>

          {archetypeName && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              transition={{ delay: 0.2, duration: 0.22 }}
              className="flex items-center gap-2 text-sm text-white/60"
            >
              {archetypeEmoji && <span className="text-lg">{archetypeEmoji}</span>}
              <span>{archetypeName}</span>
            </motion.div>
          )}
        </div>

        {/* Center: Insight */}
        <div className="flex-1 flex flex-col items-center justify-center py-8">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.25 }}
            className="text-xl sm:text-2xl font-bold text-white leading-relaxed text-center"
            style={{ textShadow: "0 2px 20px rgba(0,0,0,0.3)" }}
          >
            {insight}
          </motion.p>

          {/* Stat ring */}
          {stat && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6, duration: 0.22 }}
              className="mt-8"
            >
              <StatRing label={stat.label} value={stat.value} />
            </motion.div>
          )}
        </div>

        {/* Bottom: Watermark */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.22 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]"
              style={{
                background: "linear-gradient(135deg, #8B5CF6, #06B6D4)",
              }}
            >
              S
            </div>
            <div className="text-[11px] text-white/30">
              深層観測 by Aneurasync
            </div>
          </div>
          <div className="text-[10px] text-white/20 font-mono">
            aneurasync.com
          </div>
        </motion.div>
      </div>
    </div>
  );
}
