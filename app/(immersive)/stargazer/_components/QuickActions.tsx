// app/stargazer/_components/QuickActions.tsx
// クイックアクション — 共鳴設定・共鳴通知・深掘り対話
"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const ACTIONS = [
  {
    emoji: "🔗",
    label: "共鳴設定",
    description: "他のユーザーとの比較",
    comingSoon: true,
  },
  {
    emoji: "✨",
    label: "共鳴通知",
    description: "変化があった時の通知",
    comingSoon: true,
  },
  {
    emoji: "↗",
    label: "深掘り対話",
    description: "AIとの対話で深掘り",
    comingSoon: true,
  },
] as const;

interface Props {
  lightMode?: boolean;
}

export default function QuickActions({ lightMode = true }: Props) {
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const handleClick = useCallback((action: typeof ACTIONS[number]) => {
    if (action.comingSoon) {
      setToastMsg(`「${action.label}」は近日公開予定です`);
      setTimeout(() => setToastMsg(null), 2500);
    }
  }, []);

  const cardBg = lightMode
    ? "rgba(255,255,255,0.6)"
    : "rgba(255,255,255,0.6)";
  const cardBorder = lightMode
    ? "rgba(160,170,200,0.12)"
    : "rgba(160,170,200,0.12)";
  const textPrimary = lightMode
    ? "rgba(30,40,60,0.8)"
    : "rgba(30,40,60,0.8)";
  const textSecondary = lightMode
    ? "rgba(60,70,90,0.5)"
    : "rgba(100,105,130,0.5)";

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {ACTIONS.map((action, i) => (
          <motion.button
            key={action.label}
            onClick={() => handleClick(action)}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06 }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="rounded-xl p-4 text-center transition-all cursor-pointer"
            style={{
              background: cardBg,
              border: `1px solid ${cardBorder}`,
            }}
          >
            <span className="text-xl inline-block mb-2">{action.emoji}</span>
            <p
              className="font-body text-xs font-semibold mb-0.5"
              style={{ color: textPrimary }}
            >
              {action.label}
            </p>
            <p
              className="font-body text-xs"
              style={{ color: textSecondary }}
            >
              {action.description}
            </p>
            {action.comingSoon && (
              <p
                className="font-body text-[9px] mt-1 tracking-wider uppercase"
                style={{ color: lightMode ? "rgba(120,80,230,0.45)" : "rgba(251,191,36,0.5)" }}
              >
                coming soon
              </p>
            )}
          </motion.button>
        ))}
      </div>

      {/* Coming Soon Toast */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl font-body text-sm shadow-lg"
            style={{
              background: lightMode ? "rgba(30,30,50,0.88)" : "rgba(30,30,50,0.85)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.9)",
            }}
          >
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
