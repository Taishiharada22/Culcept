// app/stargazer/_components/DailyInsightCard.tsx
// 今日のインサイト — Oura Ring 級のストーリーテリング
"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  GlassCard,
  FadeInView,
} from "@/components/ui/glassmorphism-design";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface DailyInsightData {
  text: string;
  category: "discovery" | "warning" | "affirmation" | "contradiction";
  surpriseScore: number; // 0..1
  relatedFeature?: string; // route path
}

export interface DailyInsightCardProps {
  insight: DailyInsightData;
  streak: number;
  todayPattern?: string;
}

// ---------------------------------------------------------------------------
// Category config
// ---------------------------------------------------------------------------
const CATEGORY_CONFIG: Record<
  DailyInsightData["category"],
  { label: string; color: string; bgTint: string; icon: React.ReactNode }
> = {
  discovery: {
    label: "発見",
    color: "#8B5CF6",
    bgTint: "rgba(139,92,246,0.06)",
    icon: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={12} cy={12} r={10} />
        <line x1={12} y1={8} x2={12} y2={12} />
        <line x1={12} y1={16} x2={12.01} y2={16} />
      </svg>
    ),
  },
  warning: {
    label: "注意信号",
    color: "#F59E0B",
    bgTint: "rgba(245,158,11,0.06)",
    icon: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1={12} y1={9} x2={12} y2={13} />
        <line x1={12} y1={17} x2={12.01} y2={17} />
      </svg>
    ),
  },
  affirmation: {
    label: "確認",
    color: "#10B981",
    bgTint: "rgba(16,185,129,0.06)",
    icon: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
  contradiction: {
    label: "矛盾",
    color: "#EF4444",
    bgTint: "rgba(239,68,68,0.06)",
    icon: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={12} cy={12} r={10} />
        <line x1={4.93} y1={4.93} x2={19.07} y2={19.07} />
      </svg>
    ),
  },
};

// ---------------------------------------------------------------------------
// Animated typing text
// ---------------------------------------------------------------------------
function TypingText({ text, delay = 0, speed = 30 }: { text: string; delay?: number; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [started, text, speed]);

  return (
    <span>
      {displayed}
      {started && displayed.length < text.length && (
        <motion.span
          className="inline-block w-[2px] h-[1em] bg-current ml-0.5 align-middle"
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        />
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Surprise meter
// ---------------------------------------------------------------------------
function SurpriseMeter({ score, color }: { score: number; color: string }) {
  const segments = 5;
  const filled = Math.round(score * segments);

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-slate-400 mr-0.5">驚き度</span>
      <div className="flex gap-0.5">
        {Array.from({ length: segments }, (_, i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: i < filled ? color : "rgba(200,200,210,0.25)",
            }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.8 + i * 0.08, type: "spring", stiffness: 400 }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function DailyInsightCard({
  insight,
  streak,
  todayPattern,
}: DailyInsightCardProps) {
  const config = CATEGORY_CONFIG[insight.category];

  return (
    <FadeInView>
      <GlassCard className="relative overflow-hidden">
        {/* Subtle category tint background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: config.bgTint }}
        />

        <div className="relative p-4 space-y-3">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${config.color}15`, color: config.color }}
              >
                {config.icon}
              </div>
              <div>
                <span
                  className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border"
                  style={{ borderColor: `${config.color}30`, color: config.color, backgroundColor: `${config.color}08` }}
                >
                  {config.label}
                </span>
              </div>
            </div>
            {streak > 0 && (
              <motion.div
                className="flex items-center gap-1 text-[11px] text-slate-400"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                <span>{streak}日連続</span>
              </motion.div>
            )}
          </div>

          {/* Today's pattern */}
          {todayPattern && (
            <motion.p
              className="text-xs text-slate-400 italic"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {todayPattern}
            </motion.p>
          )}

          {/* Insight text with typing animation */}
          <div className="text-sm text-slate-700 leading-relaxed min-h-[3em]">
            <TypingText text={insight.text} delay={400} speed={35} />
          </div>

          {/* Bottom row: surprise meter + link */}
          <div className="flex items-center justify-between pt-1">
            <SurpriseMeter score={insight.surpriseScore} color={config.color} />

            {insight.relatedFeature && (
              <Link href={insight.relatedFeature}>
                <motion.span
                  className="text-xs font-medium flex items-center gap-1"
                  style={{ color: config.color }}
                  whileHover={{ x: 3 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  もっと詳しく
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </motion.span>
              </Link>
            )}
          </div>
        </div>
      </GlassCard>
    </FadeInView>
  );
}
