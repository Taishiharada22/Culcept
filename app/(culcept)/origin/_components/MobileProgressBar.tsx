"use client";

import { motion } from "framer-motion";

interface Props {
  /** 0-1 の進捗率 */
  progress: number;
  /** ステップラベル（例: "3 / 7"） */
  label?: string;
}

/**
 * モバイル探索フロー時のスティッキー上部プログレスバー
 */
export default function MobileProgressBar({ progress, label }: Props) {
  return (
    <div className="sticky top-0 z-10 bg-[#f5f0e8]/90 px-4 pb-2 pt-3 backdrop-blur-sm lg:hidden">
      <div className="flex items-center gap-3">
        {/* プログレスバー */}
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-amber-100/60">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress * 100, 100)}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
          />
        </div>

        {/* ラベル */}
        {label && (
          <span className="shrink-0 text-[10px] font-medium text-amber-600/70">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
