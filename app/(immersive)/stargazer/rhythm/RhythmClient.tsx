// app/stargazer/rhythm/RhythmClient.tsx
// サーカディアンリズム分析クライアント
"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  GlassCard,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import {
  analyzeCircadian,
  TIME_LABELS,
  type CircadianResult,
  type CircadianPattern,
  type TimeSlot,
} from "@/lib/stargazer/circadianAnalysis";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Design Tokens — time-of-day colors
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TIME_COLORS: Record<TimeSlot, {
  bg: string;
  bar: string;
  glow: string;
  text: string;
  icon: string;
}> = {
  morning: {
    bg: "rgba(251,191,36,0.15)",
    bar: "rgba(251,191,36,0.75)",
    glow: "rgba(251,191,36,0.40)",
    text: "rgba(253,224,71,0.92)",
    icon: "朝",
  },
  afternoon: {
    bg: "rgba(249,115,22,0.12)",
    bar: "rgba(249,115,22,0.72)",
    glow: "rgba(249,115,22,0.35)",
    text: "rgba(253,186,116,0.90)",
    icon: "昼",
  },
  evening: {
    bg: "rgba(99,102,241,0.15)",
    bar: "rgba(99,102,241,0.72)",
    glow: "rgba(99,102,241,0.38)",
    text: "rgba(165,180,252,0.92)",
    icon: "夕",
  },
  night: {
    bg: "rgba(30,27,75,0.35)",
    bar: "rgba(79,70,229,0.65)",
    glow: "rgba(67,56,202,0.38)",
    text: "rgba(139,92,246,0.92)",
    icon: "夜",
  },
};

const SLOTS: TimeSlot[] = ["morning", "afternoon", "evening", "night"];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub-components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TimeCard({
  slot,
  label,
  variant,
  delay,
}: {
  slot: TimeSlot;
  label: string;
  variant: "peak" | "vulnerable";
  delay: number;
}) {
  const colors = TIME_COLORS[slot];
  const isPeak = variant === "peak";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.22 }}
      className="flex-1"
    >
      <GlassCard
        className="p-4 text-center"
        style={{
          background: colors.bg,
          borderColor: colors.glow.replace("0.40", "0.22").replace("0.35", "0.18").replace("0.38", "0.20"),
        }}
      >
        {/* Label */}
        <p
          className="text-xs mb-2"
          style={{ color: "rgba(180,175,155,0.65)", fontFamily: "var(--font-mono)" }}
        >
          {label}
        </p>

        {/* Time glow orb */}
        <div
          className="w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center text-lg font-display font-semibold"
          style={{
            background: `radial-gradient(circle, ${colors.glow} 0%, transparent 70%)`,
            border: `1px solid ${colors.glow.replace("0.40", "0.35")}`,
            color: colors.text,
            fontFamily: "var(--font-display)",
            boxShadow: `0 0 20px ${colors.glow.replace("0.40", "0.25")}`,
          }}
        >
          {colors.icon}
        </div>

        <p
          className="text-base font-semibold"
          style={{ color: colors.text, fontFamily: "var(--font-display)" }}
        >
          {TIME_LABELS[slot]}
        </p>

        <p
          className="text-xs mt-1"
          style={{ color: "rgba(180,175,155,0.60)" }}
        >
          {isPeak ? "活性が最高" : "最も穏やか/脆弱"}
        </p>
      </GlassCard>
    </motion.div>
  );
}

/** Horizontal bar chart for 4 time slots */
function CircadianBarChart({ pattern }: { pattern: CircadianPattern }) {
  const maxAbs = Math.max(
    ...SLOTS.map((s) => Math.abs(pattern.byTimeSlot[s].avg))
  );
  const safeMax = maxAbs < 0.01 ? 1 : maxAbs;

  return (
    <div className="flex items-end gap-2 h-20">
      {SLOTS.map((slot) => {
        const entry = pattern.byTimeSlot[slot];
        const heightPct = entry.count > 0
          ? (Math.abs(entry.avg) / safeMax) * 100
          : 0;
        const colors = TIME_COLORS[slot];

        return (
          <div key={slot} className="flex-1 flex flex-col items-center gap-1">
            {/* Bar */}
            <div className="w-full flex items-end justify-center" style={{ height: 60 }}>
              <motion.div
                className="w-full rounded-t-md"
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(heightPct, entry.count > 0 ? 4 : 0)}%` }}
                transition={{ duration: 0.25, delay: 0.1, ease: "easeOut" }}
                style={{
                  background: colors.bar,
                  boxShadow: entry.count > 0 ? `0 0 8px ${colors.glow}` : "none",
                  minHeight: entry.count > 0 ? 4 : 0,
                  maxHeight: "100%",
                }}
              />
            </div>

            {/* Slot label */}
            <span
              className="text-xs"
              style={{
                color: colors.text,
                fontFamily: "var(--font-mono)",
                fontSize: "0.65rem",
              }}
            >
              {colors.icon}
            </span>

            {/* Count */}
            {entry.count > 0 && (
              <span
                className="text-xs"
                style={{ color: "rgba(140,135,115,0.50)", fontSize: "0.60rem" }}
              >
                {entry.count}件
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PatternCard({ pattern, index }: { pattern: CircadianPattern; index: number }) {
  const textPrimary = "rgba(240,235,220,0.90)";
  const textSecondary = "rgba(180,175,155,0.70)";
  const panelBg = "rgba(12,15,32,0.75)";

  const shiftColors = pattern.peakShift
    ? {
        from: TIME_COLORS[pattern.peakShift.from],
        to: TIME_COLORS[pattern.peakShift.to],
      }
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + index * 0.1, duration: 0.22 }}
    >
      <GlassCard className="p-5" style={{ background: panelBg }}>
        {/* Axis label */}
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <p
              className="text-xs mb-0.5"
              style={{ color: textSecondary, fontFamily: "var(--font-mono)" }}
            >
              軸
            </p>
            <p
              className="text-sm font-semibold"
              style={{ color: textPrimary, fontFamily: "var(--font-display)" }}
            >
              {pattern.axisLabel}
            </p>
          </div>

          {/* Peak shift badge */}
          {pattern.peakShift && shiftColors && (
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs flex-shrink-0"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(120,110,170,0.20)",
              }}
            >
              <span style={{ color: shiftColors.from.text }}>
                {shiftColors.from.icon}
              </span>
              <span style={{ color: "rgba(160,155,135,0.60)" }}>→</span>
              <span style={{ color: shiftColors.to.text }}>
                {shiftColors.to.icon}
              </span>
              <span
                style={{
                  color:
                    (pattern.peakShift?.delta ?? 0) > 0
                      ? "rgba(99,209,150,0.85)"
                      : "rgba(239,68,68,0.80)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {pattern.peakShift
                  ? `${pattern.peakShift.delta > 0 ? "+" : ""}${(
                      pattern.peakShift.delta * 100
                    ).toFixed(0)}%`
                  : ""}
              </span>
            </div>
          )}
        </div>

        {/* Bar chart */}
        <CircadianBarChart pattern={pattern} />

        {/* Axis endpoints */}
        <div className="flex justify-between mt-1 mb-4">
          <span className="text-xs" style={{ color: "rgba(140,135,115,0.50)", fontSize: "0.65rem" }}>
            {pattern.axisLabel.split(" ↔ ")[0]}
          </span>
          <span className="text-xs" style={{ color: "rgba(140,135,115,0.50)", fontSize: "0.65rem" }}>
            {pattern.axisLabel.split(" ↔ ")[1]}
          </span>
        </div>

        {/* Interpretation */}
        <div
          className="p-3 rounded-xl"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(120,110,170,0.12)" }}
        >
          <p className="text-sm leading-relaxed" style={{ color: textSecondary }}>
            {pattern.interpretation}
          </p>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function RhythmClient() {
  const [result, setResult] = useState<CircadianResult | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time hydration from localStorage
    setResult(analyzeCircadian());
  }, []);

  const textPrimary = "rgba(240,235,220,0.92)";
  const textSecondary = "rgba(180,175,155,0.72)";
  const panelBg = "rgba(12,15,32,0.75)";

  // Loading state (undefined = not yet computed)
  if (result === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{ color: textSecondary }}
          className="text-sm"
        >
          分析中...
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative"
      style={{
        background:
          "radial-gradient(ellipse 120% 55% at 50% 0%, rgba(30,20,80,0.40) 0%, transparent 60%), " +
          "linear-gradient(180deg, #080b18 0%, #0c1028 40%, #080b18 100%)",
      }}
    >
      {/* Ambient orbs — time-of-day themed */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Morning: warm amber top-right */}
        <motion.div
          className="absolute rounded-full"
          style={{
            top: "-5%",
            right: "-10%",
            width: "40vw",
            height: "35vh",
            background:
              "radial-gradient(circle, rgba(251,191,36,0.09) 0%, transparent 70%)",
            filter: "blur(55px)",
          }}
          animate={{ x: [0, 15, 0], y: [0, 10, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Night: deep indigo bottom-left */}
        <motion.div
          className="absolute rounded-full"
          style={{
            bottom: "0%",
            left: "-10%",
            width: "45vw",
            height: "40vh",
            background:
              "radial-gradient(circle, rgba(67,56,202,0.12) 0%, transparent 70%)",
            filter: "blur(55px)",
          }}
          animate={{ x: [0, -12, 0], y: [0, -15, 0] }}
          transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Evening: cool blue mid-left */}
        <motion.div
          className="absolute rounded-full"
          style={{
            top: "40%",
            left: "-5%",
            width: "35vw",
            height: "30vh",
            background:
              "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)",
            filter: "blur(50px)",
          }}
          animate={{ x: [0, 10, 0], y: [0, 20, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-12">
        {/* ── Header ── */}
        <FadeInView>
          <div className="mb-10 text-center">
            <Link
              href="/stargazer"
              className="inline-flex items-center gap-1.5 text-xs mb-6"
              style={{ color: textSecondary, fontFamily: "var(--font-mono)" }}
            >
              ← 深層観測
            </Link>
            <h1
              className="text-4xl mb-2 font-display"
              style={{ color: textPrimary, fontFamily: "var(--font-display)" }}
            >
              サーカディアンリズム
            </h1>
            <p className="text-sm" style={{ color: textSecondary }}>
              時間帯別パターン分析
            </p>
            <p
              className="text-xs mt-2 max-w-sm mx-auto leading-relaxed"
              style={{ color: "rgba(160,155,135,0.65)" }}
            >
              日々の記録から、あなたの心理状態が時間帯によってどう変化するかを分析します。
            </p>
          </div>
        </FadeInView>

        {/* ── No data state ── */}
        {result === null ? (
          <FadeInView>
            <GlassCard className="p-8 text-center" style={{ background: panelBg }}>
              <div
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{
                  background:
                    "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)",
                  border: "1px solid rgba(99,102,241,0.22)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.5rem",
                    color: "rgba(165,180,252,0.80)",
                  }}
                >
                  ◎
                </span>
              </div>
              <p
                className="text-sm mb-2"
                style={{ color: textPrimary }}
              >
                データが不足しています
              </p>
              <p
                className="text-xs leading-relaxed max-w-xs mx-auto"
                style={{ color: textSecondary }}
              >
                Micro-EMAデータが10件以上蓄積されると、あなたの時間帯別パターンが浮かび上がります。
              </p>
              <div className="mt-6">
                <Link href="/stargazer">
                  <span
                    className="inline-flex px-4 py-2 rounded-xl text-xs"
                    style={{
                      background: "rgba(99,102,241,0.18)",
                      border: "1px solid rgba(99,102,241,0.32)",
                      color: "rgba(165,180,252,0.90)",
                    }}
                  >
                    観測を始める
                  </span>
                </Link>
              </div>
            </GlassCard>
          </FadeInView>
        ) : (
          <>
            {/* ── Profile Summary ── */}
            <FadeInView>
              <GlassCard
                className="p-5 mb-6"
                style={{
                  background: panelBg,
                  borderColor: "rgba(99,102,241,0.22)",
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{
                      background:
                        "radial-gradient(circle, rgba(99,102,241,0.28) 0%, transparent 70%)",
                      border: "1px solid rgba(99,102,241,0.30)",
                    }}
                  >
                    <span
                      style={{
                        color: "rgba(165,180,252,0.90)",
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      ◎
                    </span>
                  </div>
                  <div className="flex-1">
                    <p
                      className="text-xs mb-1"
                      style={{ color: textSecondary, fontFamily: "var(--font-mono)" }}
                    >
                      サーカディアンプロファイル
                    </p>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: textPrimary }}
                    >
                      {result.profile}
                    </p>
                    <p
                      className="text-xs mt-2"
                      style={{ color: "rgba(140,135,115,0.55)", fontFamily: "var(--font-mono)" }}
                    >
                      観測データ: {result.totalEntries}件
                    </p>
                  </div>
                </div>
              </GlassCard>
            </FadeInView>

            {/* ── Peak / Vulnerable time cards ── */}
            <FadeInView>
              <div className="flex gap-3 mb-8">
                <TimeCard slot={result.peakTime} label="ピーク時間帯" variant="peak" delay={0.1} />
                <TimeCard slot={result.vulnerableTime} label="脆弱/穏やか時間帯" variant="vulnerable" delay={0.2} />
              </div>
            </FadeInView>

            {/* ── Circadian legend ── */}
            <FadeInView>
              <div className="flex gap-2 mb-6 flex-wrap">
                {SLOTS.map((slot) => (
                  <div
                    key={slot}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                    style={{
                      background: TIME_COLORS[slot].bg,
                      border: `1px solid ${TIME_COLORS[slot].glow.replace("0.40", "0.20").replace("0.35", "0.18").replace("0.38", "0.19")}`,
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: TIME_COLORS[slot].bar }}
                    />
                    <span
                      className="text-xs"
                      style={{ color: TIME_COLORS[slot].text, fontFamily: "var(--font-mono)" }}
                    >
                      {TIME_LABELS[slot]}
                    </span>
                  </div>
                ))}
              </div>
            </FadeInView>

            {/* ── Pattern cards ── */}
            <div className="space-y-4">
              <FadeInView>
                <h2
                  className="text-sm mb-4 px-1"
                  style={{
                    color: textSecondary,
                    fontFamily: "var(--font-display)",
                    letterSpacing: "0.08em",
                  }}
                >
                  変動パターン（{result.patterns.length}軸）
                </h2>
              </FadeInView>

              {result.patterns.map((pattern, i) => (
                <PatternCard key={pattern.axis} pattern={pattern} index={i} />
              ))}
            </div>

            {/* ── Footer note ── */}
            <FadeInView>
              <div className="mt-12 pb-8 text-center">
                <p
                  className="text-xs leading-relaxed max-w-xs mx-auto"
                  style={{ color: "rgba(140,135,115,0.50)" }}
                >
                  Golder & Macy (2011) の概日リズム×感情変動研究に基づく分析。医療的診断ではありません。
                </p>
              </div>
            </FadeInView>
          </>
        )}
      </div>
    </div>
  );
}
