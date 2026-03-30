// TodaySummaryMini — ヘッダー右上用のコンパクト重要事項カード
// priority[0] の icon + headline のみ表示、タップでナビゲート
"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  getTodayPriorities,
  type TodayPrioritizerInput,
} from "@/lib/stargazer/todayPrioritizer";

const INDICATOR_COLORS: Record<string, string> = {
  green: "rgba(16,185,129,0.9)",
  red: "rgba(239,68,68,0.9)",
  gold: "rgba(201,169,110,0.9)",
  blue: "rgba(99,102,241,0.8)",
  slate: "rgba(148,163,184,0.6)",
};

const INDICATOR_BG: Record<string, string> = {
  green: "rgba(16,185,129,0.06)",
  red: "rgba(239,68,68,0.06)",
  gold: "rgba(201,169,110,0.06)",
  blue: "rgba(99,102,241,0.05)",
  slate: "rgba(148,163,184,0.04)",
};

interface TodaySummaryMiniProps {
  input: TodayPrioritizerInput;
  onNavigateTab?: (tabKey: string) => void;
}

export default function TodaySummaryMini({ input, onNavigateTab }: TodaySummaryMiniProps) {
  const router = useRouter();
  const priorities = useMemo(() => getTodayPriorities(input), [input]);

  if (priorities.length === 0) return null;

  const first = priorities[0];
  const count = priorities.length;

  const handleTap = () => {
    if (!first.action) return;
    const url = new URL(first.action.route, "http://x");
    const tab = url.searchParams.get("tab");
    if (tab && onNavigateTab) {
      onNavigateTab(tab);
    } else {
      router.push(first.action.route);
    }
  };

  return (
    <motion.button
      onClick={handleTap}
      className="text-left rounded-xl px-3 py-2.5 transition-all active:scale-[0.97] max-w-[200px]"
      style={{
        background: INDICATOR_BG[first.indicator],
        border: `1px solid ${INDICATOR_COLORS[first.indicator]}20`,
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.2, duration: 0.18 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
    >
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5 shrink-0">{first.icon}</span>
        <div className="min-w-0">
          <p
            className="text-[11px] font-semibold leading-tight line-clamp-2"
            style={{ color: "rgba(22,28,48,0.85)" }}
          >
            {first.headline}
          </p>
          {count > 1 && (
            <p
              className="text-[9px] mt-1"
              style={{ color: "rgba(100,116,139,0.5)" }}
            >
              他{count - 1}件
            </p>
          )}
        </div>

        {/* Priority dot */}
        {first.timeSensitive && (
          <motion.div
            className="shrink-0 w-1.5 h-1.5 rounded-full mt-1"
            style={{ background: INDICATOR_COLORS[first.indicator] }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </div>
    </motion.button>
  );
}
