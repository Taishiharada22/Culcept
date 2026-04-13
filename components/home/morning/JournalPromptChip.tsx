"use client";

/**
 * JournalPromptChip — 夜ジャーナル誘導UI
 *
 * 夜にAlterエリアに表示される誘導チップ。
 * 「書く」→ Origin ジャーナルページへ遷移
 * 「今日はいい」→ 辞退記録
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  recordJournalWritten,
  recordJournalDeclined,
} from "@/lib/alter-morning/journalPrompt";

interface JournalPromptChipProps {
  message: string;
  onDismiss: () => void;
}

export default function JournalPromptChip({
  message,
  onDismiss,
}: JournalPromptChipProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  const handleWrite = () => {
    recordJournalWritten();
    setDismissed(true);
    router.push("/origin?from=alter&intent=journal");
  };

  const handleDecline = () => {
    recordJournalDeclined();
    setDismissed(true);
    onDismiss();
  };

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -5, scale: 0.95 }}
          transition={{ duration: 0.25 }}
          className="mx-0 mt-2 mb-1 rounded-xl bg-white/60 backdrop-blur-md border border-white/50 shadow-sm px-3 py-2.5"
        >
          {/* メッセージ */}
          <p className="text-[13px] text-gray-700 mb-2">{message}</p>

          {/* 2択ボタン */}
          <div className="flex gap-2">
            <button
              onClick={handleWrite}
              className="flex-1 py-1.5 rounded-lg bg-purple-50/80 text-purple-600 text-[12px] font-medium border border-purple-200/50 active:scale-95 transition-transform"
            >
              書く
            </button>
            <button
              onClick={handleDecline}
              className="flex-1 py-1.5 rounded-lg bg-gray-50/80 text-gray-500 text-[12px] font-medium border border-gray-200/50 active:scale-95 transition-transform"
            >
              今日はいい
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
