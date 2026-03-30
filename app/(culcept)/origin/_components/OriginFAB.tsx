"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Action {
  id: string;
  emoji: string;
  label: string;
  onClick: () => void;
}

interface Props {
  onNewMemory: () => void;
  onDailyQuestion: () => void;
  onProfileAdd: () => void;
}

/**
 * モバイル用FAB（Floating Action Button）
 * 3アクション: 新しい記憶 / 今日の質問 / プロフィール追加
 */
export default function OriginFAB({
  onNewMemory,
  onDailyQuestion,
  onProfileAdd,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => setExpanded((p) => !p), []);

  const actions: Action[] = [
    { id: "memory", emoji: "✨", label: "新しい記憶", onClick: onNewMemory },
    { id: "daily", emoji: "💬", label: "今日の質問", onClick: onDailyQuestion },
    { id: "profile", emoji: "📋", label: "プロフィール", onClick: onProfileAdd },
  ];

  const handleAction = useCallback(
    (action: Action) => {
      setExpanded(false);
      // 少し遅延させてアニメーション完了を待つ
      setTimeout(() => action.onClick(), 150);
    },
    [],
  );

  return (
    <div className="fixed bottom-24 right-4 z-30 lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {/* サブアクション */}
      <AnimatePresence>
        {expanded && (
          <>
            {/* バックドロップ */}
            <motion.div
              className="fixed inset-0 z-[-1]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setExpanded(false)}
            />

            {/* アクションボタン群 */}
            <div className="mb-3 flex flex-col-reverse gap-2">
              {actions.map((action, i) => (
                <motion.button
                  key={action.id}
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.8 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => handleAction(action)}
                  className="flex items-center gap-2 self-end rounded-2xl border border-amber-200/50 bg-white/90 px-4 py-2.5 shadow-lg backdrop-blur-lg"
                >
                  <span className="text-sm">{action.emoji}</span>
                  <span className="text-xs font-semibold" style={{ color: "#3a2a1a" }}>
                    {action.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </>
        )}
      </AnimatePresence>

      {/* メインFABボタン */}
      <motion.button
        onClick={toggle}
        animate={{ rotate: expanded ? 45 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-400 text-xl text-white shadow-lg shadow-amber-500/30"
        whileTap={{ scale: 0.92 }}
      >
        ＋
      </motion.button>
    </div>
  );
}
