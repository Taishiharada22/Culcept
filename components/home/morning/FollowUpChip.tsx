"use client";

/**
 * FollowUpChip — 日中フォローUI
 *
 * Alter会話エリアの下に表示される小さなチップ。
 * ユーザーがタスクの進捗を3択で回答する。
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PlanItem } from "@/lib/alter-morning/types";
import {
  recordFollowUpResponse,
  recordFollowUpSkip,
} from "@/lib/alter-morning/followUpTracker";

interface FollowUpChipProps {
  targetItem: PlanItem;
  message: string;
  onRespond: (itemId: string, status: "done" | "partial" | "skipped") => void;
  onDismiss: () => void;
}

export default function FollowUpChip({
  targetItem,
  message,
  onRespond,
  onDismiss,
}: FollowUpChipProps) {
  const [dismissed, setDismissed] = useState(false);

  const handleResponse = (status: "done" | "partial" | "skipped") => {
    recordFollowUpResponse();
    onRespond(targetItem.id, status);
    setDismissed(true);
  };

  const handleDismiss = () => {
    recordFollowUpSkip();
    onDismiss();
    setDismissed(true);
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

          {/* 3択ボタン */}
          <div className="flex gap-2">
            <button
              onClick={() => handleResponse("done")}
              className="flex-1 py-1.5 rounded-lg bg-emerald-50/80 text-emerald-600 text-[12px] font-medium border border-emerald-200/50 active:scale-95 transition-transform"
            >
              終わった
            </button>
            <button
              onClick={() => handleResponse("partial")}
              className="flex-1 py-1.5 rounded-lg bg-amber-50/80 text-amber-600 text-[12px] font-medium border border-amber-200/50 active:scale-95 transition-transform"
            >
              まだ途中
            </button>
            <button
              onClick={() => handleResponse("skipped")}
              className="flex-1 py-1.5 rounded-lg bg-gray-50/80 text-gray-500 text-[12px] font-medium border border-gray-200/50 active:scale-95 transition-transform"
            >
              やめた
            </button>
          </div>

          {/* 閉じるボタン */}
          <button
            onClick={handleDismiss}
            className="absolute top-1.5 right-2 text-[10px] text-gray-300 hover:text-gray-500"
            aria-label="閉じる"
          >
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
