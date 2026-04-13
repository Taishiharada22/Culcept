"use client";

/**
 * MorningInsightChip — プロアクティブ・インサイト表示（Phase 4）
 *
 * Alterの「観測レイヤー」として、蓄積したパターンから
 * 生成されたインサイトを控えめに表示する。
 *
 * - FollowUpChip / JournalPromptChip と同じデザイン言語
 * - 自動的に消えるタイプ（×ボタンで閉じる or 5秒後にフェード）
 * - 1日1回、押し付けない観察
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ProactiveInsight } from "@/lib/alter-morning/types";

interface MorningInsightChipProps {
  insight: ProactiveInsight;
  onDismiss: () => void;
}

/** インサイトタイプ別のアクセントカラー */
const TYPE_STYLES: Record<ProactiveInsight["type"], { bg: string; text: string; icon: string }> = {
  weekday_strength: { bg: "bg-emerald-50/70", text: "text-emerald-600", icon: "🌿" },
  weekday_caution:  { bg: "bg-amber-50/70",   text: "text-amber-600",   icon: "🍂" },
  streak:           { bg: "bg-purple-50/70",   text: "text-purple-600",  icon: "🔥" },
  gentle_suggestion:{ bg: "bg-sky-50/70",      text: "text-sky-600",     icon: "💭" },
};

export default function MorningInsightChip({
  insight,
  onDismiss,
}: MorningInsightChipProps) {
  const [visible, setVisible] = useState(true);
  const dismissed = useRef(false);
  const style = TYPE_STYLES[insight.type];

  const dismiss = useCallback(() => {
    if (dismissed.current) return; // 二重発火防止
    dismissed.current = true;
    setVisible(false);
    setTimeout(onDismiss, 300);
  }, [onDismiss]);

  // 8秒後に自動フェード
  useEffect(() => {
    const timer = setTimeout(dismiss, 8000);
    return () => clearTimeout(timer);
  }, [dismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.97 }}
          transition={{ duration: 0.25 }}
          className={`relative mx-0 mt-2 mb-1 rounded-xl ${style.bg} backdrop-blur-md border border-white/50 shadow-sm px-3 py-2.5`}
        >
          <p className={`text-[13px] ${style.text} pr-5`}>
            <span className="mr-1">{style.icon}</span>
            {insight.message}
          </p>

          <button
            onClick={dismiss}
            className="absolute top-2 right-2.5 text-[11px] text-gray-300 hover:text-gray-500 transition-colors"
            aria-label="閉じる"
          >
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
