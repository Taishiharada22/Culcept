// app/stargazer/_components/TodaySummaryCard.tsx
// Today's Summary Card — Apple Health式の優先度ベース統合サマリー
// 最大3つの優先事項を1カードに凝縮表示する
"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import {
  getTodayPriorities,
  type TodayPriority,
  type TodayPrioritizerInput,
} from "@/lib/stargazer/todayPrioritizer";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Props
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TodaySummaryCardProps {
  input: TodayPrioritizerInput;
  /** Callback to switch tab within the same page (avoids router.push on same page) */
  onNavigateTab?: (tabKey: string) => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Indicator colors
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const INDICATOR_COLORS: Record<string, string> = {
  green: "rgba(16,185,129,0.9)",
  red: "rgba(239,68,68,0.9)",
  gold: "rgba(201,169,110,0.9)",
  blue: "rgba(99,102,241,0.8)",
  slate: "rgba(148,163,184,0.6)",
};

const INDICATOR_BG: Record<string, string> = {
  green: "rgba(16,185,129,0.08)",
  red: "rgba(239,68,68,0.08)",
  gold: "rgba(201,169,110,0.08)",
  blue: "rgba(99,102,241,0.06)",
  slate: "rgba(148,163,184,0.06)",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function TodaySummaryCard({ input, onNavigateTab }: TodaySummaryCardProps) {
  const router = useRouter();
  const priorities = useMemo(() => getTodayPriorities(input), [input]);

  const handleAction = (route: string) => {
    // Extract tab param for same-page navigation
    const url = new URL(route, "http://x");
    const tab = url.searchParams.get("tab");
    if (tab && onNavigateTab) {
      onNavigateTab(tab);
      // If navigating to current tab (observe), scroll to top to trigger observation
      if (tab === "observe") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } else {
      router.push(route);
    }
  };

  if (priorities.length === 0) return null;

  const hasTimeSensitive = priorities.some((p) => p.timeSensitive);
  const first = priorities[0];
  const rest = priorities.slice(1);
  const isSingle = priorities.length === 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <GlassCard
        variant="gradient"
        padding="none"
        hoverEffect={false}
        className="relative overflow-hidden"
      >
        {/* Subtle pulse overlay for time-sensitive items */}
        {hasTimeSensitive && (
          <motion.div
            className="absolute inset-0 rounded-3xl pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at 50% 0%, rgba(201,169,110,0.06) 0%, transparent 70%)",
            }}
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        <div className="relative z-10 p-5">
          {/* Header with priority dots */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <motion.div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "rgba(190,170,110,0.7)" }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 3, repeat: Infinity }}
              />
              <span
                className="text-xs font-medium tracking-wider uppercase"
                style={{ color: "rgba(100,116,139,0.55)" }}
              >
                今日の重要事項
              </span>
            </div>

            {/* Priority indicator dots */}
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((idx) => {
                const item = priorities[idx];
                return (
                  <div
                    key={idx}
                    className="w-2 h-2 rounded-full transition-all duration-300"
                    style={{
                      background: item
                        ? INDICATOR_COLORS[item.indicator]
                        : "rgba(148,163,184,0.2)",
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Primary priority — large display */}
          <PrimaryPriorityItem
            item={first}
            hasExtraRoom={isSingle}
            onAction={() => {
              if (first.action) handleAction(first.action.route);
            }}
          />

          {/* Secondary priorities — compact */}
          {rest.length > 0 && (
            <div
              className="mt-4 pt-3 space-y-2"
              style={{
                borderTop: "1px solid rgba(148,163,184,0.1)",
              }}
            >
              {rest.map((item, idx) => (
                <SecondaryPriorityItem
                  key={`${item.type}-${idx}`}
                  item={item}
                  onAction={() => {
                    if (item.action) handleAction(item.action.route);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub-components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PrimaryPriorityItem({
  item,
  hasExtraRoom,
  onAction,
}: {
  item: TodayPriority;
  hasExtraRoom: boolean;
  onAction: () => void;
}) {
  const [tapped, setTapped] = useState(false);

  const handleTap = () => {
    setTapped(true);
    setTimeout(() => setTapped(false), 400);
    if (item.action) onAction();
  };

  return (
    <motion.div
      className="cursor-pointer relative overflow-hidden rounded-xl"
      onClick={handleTap}
      whileTap={{
        scale: 0.97,
        transition: { duration: 0.08 },
      }}
    >
      {/* Haptic-like glow flash on tap */}
      <AnimatePresence>
        {tapped && (
          <motion.div
            className="absolute inset-0 rounded-xl pointer-events-none z-10"
            style={{
              background: `radial-gradient(circle at 50% 50%, ${INDICATOR_COLORS[item.indicator] ?? "rgba(168,85,247,0.3)"}20 0%, transparent 70%)`,
              boxShadow: `inset 0 0 20px ${INDICATOR_COLORS[item.indicator] ?? "rgba(168,85,247,0.15)"}15`,
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.18 }}
          />
        )}
      </AnimatePresence>

      <div className={`flex items-start gap-3 ${hasExtraRoom ? "py-2" : ""}`}>
        {/* Icon with indicator background */}
        <div
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: INDICATOR_BG[item.indicator] }}
        >
          <span className="text-xl leading-none">{item.icon}</span>
        </div>

        <div className="flex-1 min-w-0">
          <h3
            className={`font-bold leading-tight ${hasExtraRoom ? "text-base" : "text-sm"}`}
            style={{ color: "rgba(22,28,48,0.9)" }}
          >
            {item.headline}
          </h3>
          <p
            className={`mt-1 leading-relaxed ${hasExtraRoom ? "text-sm" : "text-xs"}`}
            style={{ color: "rgba(100,116,139,0.7)" }}
          >
            {item.body}
          </p>

          {/* Action button */}
          {item.action && (
            <motion.span
              className="inline-flex items-center gap-1 mt-2 text-xs font-medium"
              style={{ color: INDICATOR_COLORS[item.indicator] }}
              whileHover={{ x: 2 }}
            >
              {item.action.label}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </motion.span>
          )}
        </div>

        {/* Time-sensitive indicator */}
        {item.timeSensitive && (
          <motion.div
            className="shrink-0 w-2 h-2 rounded-full mt-1.5"
            style={{ background: INDICATOR_COLORS[item.indicator] }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </div>
    </motion.div>
  );
}

function SecondaryPriorityItem({
  item,
  onAction,
}: {
  item: TodayPriority;
  onAction: () => void;
}) {
  return (
    <motion.button
      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl transition-colors text-left"
      style={{ background: "rgba(0,0,0,0.01)" }}
      onClick={item.action ? onAction : undefined}
      whileHover={{ background: "rgba(0,0,0,0.03)" }}
      whileTap={{ scale: 0.99 }}
    >
      {/* Compact indicator dot + icon */}
      <div className="relative shrink-0">
        <span className="text-base leading-none">{item.icon}</span>
        <div
          className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
          style={{ background: INDICATOR_COLORS[item.indicator] }}
        />
      </div>

      {/* Single-line text */}
      <span
        className="flex-1 text-xs font-medium truncate"
        style={{ color: "rgba(22,28,48,0.75)" }}
      >
        {item.headline}
      </span>

      {/* Arrow */}
      {item.action && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(148,163,184,0.4)"
          strokeWidth={2}
          className="shrink-0"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5l7 7-7 7"
          />
        </svg>
      )}

      {/* Pulsing dot for time-sensitive */}
      {item.timeSensitive && (
        <motion.div
          className="shrink-0 w-1.5 h-1.5 rounded-full"
          style={{ background: INDICATOR_COLORS[item.indicator] }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </motion.button>
  );
}
