"use client";

import { motion } from "framer-motion";
import type { ExplorationStage } from "@/lib/origin/v7/retention";

interface Props {
  stage: ExplorationStage;
  chapterCount: number;
}

/**
 * 探索段階バッジ — ユーザーの進行度をゲーミフィケーション的に表示
 */
export default function ExplorationStageBadge({ stage, chapterCount }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl border border-amber-200/40 bg-gradient-to-r from-amber-50/40 to-white/60 px-4 py-3 backdrop-blur-sm"
    >
      <div className="flex items-center gap-3">
        {/* レベルアイコン */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100/60 text-lg">
          {stage.emoji}
        </div>

        <div className="flex-1 min-w-0">
          {/* 段階名 + レベル */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: "#3a2a1a" }}>
              Lv.{stage.level} {stage.name}
            </span>
            <span className="text-[10px] text-gray-400">
              {chapterCount}章
            </span>
          </div>

          {/* プログレスバー */}
          {stage.nextThreshold && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-amber-100/50">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${stage.progress * 100}%` }}
                  transition={{ type: "spring", stiffness: 200, damping: 25 }}
                />
              </div>
              <span className="text-[10px] text-amber-600/60 shrink-0">
                {chapterCount}/{stage.nextThreshold}
              </span>
            </div>
          )}

          {/* 最高段階 */}
          {!stage.nextThreshold && (
            <p className="mt-0.5 text-[10px] text-amber-600/60">
              最高段階に到達 ✨
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
