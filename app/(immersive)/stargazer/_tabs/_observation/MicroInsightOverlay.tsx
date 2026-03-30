// MicroInsightOverlay — 回答間の即時インサイト表示
// 1.5秒間表示後に自動消去、タップでスキップ可能
"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import type { MicroInsight, MicroInsightType } from "@/lib/architecture/edgeMicroInsights";

const TYPE_ICONS: Record<MicroInsightType, string> = {
  flip_detection: "⟲",
  contradiction_hint: "⊘",
  rare_answer: "✦",
  speed_signal: "⚡",
  trend_change: "↗",
  stability_note: "●",
  context_shift: "◈",
  pattern_confirmation: "≡",
};

interface MicroInsightOverlayProps {
  insight: MicroInsight;
  onDone: () => void;
  /** 自動消去までの時間（ms） */
  durationMs?: number;
}

export default function MicroInsightOverlay({
  insight,
  onDone,
  durationMs = 1500,
}: MicroInsightOverlayProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, durationMs);
    return () => clearTimeout(timer);
  }, [onDone, durationMs]);

  const icon = TYPE_ICONS[insight.type] ?? "✦";

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center px-8"
      style={{ background: "rgba(16,20,36,0.04)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onDone}
    >
      <motion.div
        className="max-w-sm w-full text-center py-5 px-6 rounded-2xl"
        style={{
          background: "rgba(255,255,255,0.85)",
          border: "1px solid rgba(190,170,110,0.18)",
          boxShadow: "0 8px 40px rgba(24,32,64,0.10)",
          backdropFilter: "blur(20px)",
        }}
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="text-xl block mb-2">{icon}</span>
        <p
          className="text-sm font-medium leading-relaxed"
          style={{ color: "rgba(24,30,48,0.88)" }}
        >
          {insight.text}
        </p>
      </motion.div>
    </motion.div>
  );
}
