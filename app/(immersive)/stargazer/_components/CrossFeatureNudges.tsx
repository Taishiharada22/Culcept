// app/stargazer/_components/CrossFeatureNudges.tsx
// クロスフィーチャーナッジ — 観測後に関連機能を文脈的に提案する
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  getNudgesForTrigger,
  markNudgeShown,
  type NudgeData,
} from "@/lib/stargazer/retentionHooks";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Props
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CrossFeatureNudgesProps {
  trigger: NudgeData["trigger"];
  /** 表示するナッジの最大数 */
  maxCount?: number;
  /** 表示/非表示アニメーションの遅延 (ms) */
  delayMs?: number;
  /** 自動で非表示にするまでの時間 (ms, 0 = 自動非表示なし) */
  autoHideMs?: number;
  className?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function CrossFeatureNudges({
  trigger,
  maxCount = 2,
  delayMs = 800,
  autoHideMs = 0,
  className,
}: CrossFeatureNudgesProps) {
  const [nudges, setNudges] = useState<NudgeData[]>([]);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => {
      const available = getNudgesForTrigger(trigger, maxCount);
      setNudges(available);
      if (available.length > 0) {
        setVisible(true);
        // 表示したナッジを記録
        for (const n of available) {
          markNudgeShown(n.id);
        }
      }
    }, delayMs);

    return () => clearTimeout(timer);
  }, [trigger, maxCount, delayMs]);

  // 自動非表示
  useEffect(() => {
    if (autoHideMs > 0 && visible) {
      const timer = setTimeout(() => setVisible(false), autoHideMs);
      return () => clearTimeout(timer);
    }
  }, [autoHideMs, visible]);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  const activeNudges = nudges.filter((n) => !dismissed.has(n.id));

  if (!visible || activeNudges.length === 0) return null;

  return (
    <div className={className}>
      <AnimatePresence mode="popLayout">
        {activeNudges.map((nudge, i) => (
          <motion.div
            key={nudge.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ delay: i * 0.12, type: "spring", stiffness: 250, damping: 22 }}
            className="mb-2"
          >
            <Link href={nudge.href} className="block">
              <div
                className="rounded-xl px-4 py-3 flex items-center gap-3 transition-all hover:shadow-md"
                style={{
                  background: "linear-gradient(135deg, rgba(168,85,247,0.05), rgba(139,92,246,0.03))",
                  border: "1px solid rgba(168,85,247,0.1)",
                  backdropFilter: "blur(8px)",
                }}
              >
                {/* Glow dot */}
                <motion.div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: "rgba(168,85,247,0.6)" }}
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />

                <p
                  className="flex-1 text-sm leading-relaxed"
                  style={{ color: "rgba(24,30,50,0.85)" }}
                >
                  {nudge.message}
                </p>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className="text-xs"
                    style={{ color: "rgba(168,85,247,0.6)" }}
                  >
                    {"\u2192"}
                  </span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dismiss(nudge.id);
                    }}
                    className="w-5 h-5 rounded-full flex items-center justify-center transition-colors hover:bg-slate-100"
                    style={{ color: "rgba(160,170,200,0.5)" }}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
