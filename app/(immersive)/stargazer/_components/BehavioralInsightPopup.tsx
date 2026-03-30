"use client";

// BehavioralInsightPopup.tsx
// 回答直後に表示される行動インサイトポップアップ
//
// 「この質問に4.2秒かかりました。平均は1.8秒」
// 「『選択肢名』にも惹かれていた」
// 自分の迷いを数値で見せられる、ゾクッとする体験。

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { QuestionInsight } from "@/lib/stargazer/behavioralSignalCollector";

interface Props {
  insight: QuestionInsight | null;
  visible: boolean;
}

const AUTO_DISMISS_MS = 3500;

export default function BehavioralInsightPopup({ insight, visible }: Props) {
  const shouldShow = visible && insight && hasContent(insight);
  const [autoDismissed, setAutoDismissed] = useState(false);
  const prevShouldShowRef = useRef(shouldShow);

  // Reset auto-dismiss when inputs change
  if (prevShouldShowRef.current !== shouldShow) {
    prevShouldShowRef.current = shouldShow;
    if (shouldShow && autoDismissed) setAutoDismissed(false);
  }

  useEffect(() => {
    if (!shouldShow) return;
    const timer = setTimeout(() => setAutoDismissed(true), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [shouldShow]);

  const show = shouldShow && !autoDismissed;

  return (
    <AnimatePresence>
      {show && insight && hasContent(insight) && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="pointer-events-none fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2"
        >
          <div
            className="relative overflow-hidden rounded-2xl p-4"
            style={{
              background: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(139,92,246,0.2)",
              boxShadow: "0 8px 32px rgba(90,70,160,0.12), 0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            {/* 左端のアクセントバー */}
            <div
              className="absolute left-0 top-0 h-full w-1 rounded-l-2xl"
              style={{
                background: "linear-gradient(to bottom, rgba(139,92,246,0.7), rgba(190,170,110,0.6))",
              }}
            />

            <div className="space-y-1.5 pl-3">
              {/* 迷いメッセージ */}
              {insight.hesitationMessage && (
                <p
                  className="text-sm font-medium"
                  style={{ color: "rgba(24,30,48,0.9)" }}
                >
                  {insight.hesitationMessage}
                </p>
              )}

              {/* 平均との比較 */}
              {insight.comparisonToAverage && (
                <p
                  className="text-xs"
                  style={{ color: "rgba(80,85,105,0.7)" }}
                >
                  {insight.comparisonToAverage}
                </p>
              )}

              {/* ホバーインサイト */}
              {insight.hoverInsight && (
                <p
                  className="text-xs"
                  style={{ color: "rgba(139,92,246,0.85)" }}
                >
                  {insight.hoverInsight}
                </p>
              )}

              {/* フォーカス離脱インサイト */}
              {insight.focusLostInsight && (
                <p
                  className="text-xs"
                  style={{ color: "rgba(190,170,110,0.85)" }}
                >
                  {insight.focusLostInsight}
                </p>
              )}
            </div>

            {/* 消失プログレスバー */}
            <motion.div
              className="absolute bottom-0 left-0 h-0.5"
              style={{
                background: "linear-gradient(90deg, rgba(139,92,246,0.5), rgba(190,170,110,0.4))",
              }}
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: AUTO_DISMISS_MS / 1000, ease: "linear" }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** インサイトに表示すべき内容があるか */
function hasContent(insight: QuestionInsight): boolean {
  return !!(
    insight.hesitationMessage ||
    insight.comparisonToAverage ||
    insight.hoverInsight ||
    insight.focusLostInsight
  );
}
