"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { generateOnboardingInsight } from "@/lib/rendezvous/onboardingOrchestrator";
import type { MatchingVector } from "@/lib/rendezvous/types";

// =============================================================================
// ZeroMatchWarmth - 候補0件時の温かみ体験
// 不安を生むのではなく、自己省察を促す
// =============================================================================

type ZeroMatchWarmthProps = {
  matchingVector?: MatchingVector;
  avatarName?: string;
  onStartDailyTopic?: () => void;
  onStartSelfDiscovery?: () => void;
};

export function ZeroMatchWarmth({
  matchingVector,
  avatarName = "あなたの分身",
  onStartDailyTopic,
  onStartSelfDiscovery,
}: ZeroMatchWarmthProps) {
  const [showInsight, setShowInsight] = useState(false);
  const insight = matchingVector ? generateOnboardingInsight(matchingVector) : null;

  useEffect(() => {
    const timer = setTimeout(() => setShowInsight(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative min-h-[60vh] flex flex-col items-center justify-center px-6 py-12">
      {/* 星空背景 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 30 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-white/60"
            style={{
              left: `${(i * 37 + 13) % 100}%`,
              top: `${(i * 53 + 7) % 100}%`,
            }}
            animate={{
              opacity: [0.2, 0.8, 0.2],
              scale: [0.8, 1.2, 0.8],
            }}
            transition={{
              duration: 3 + (i % 3),
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* 分身アバターアニメーション */}
      <motion.div
        className="relative z-10 mb-8"
        animate={{
          y: [0, -10, 0],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-400/30 to-indigo-500/30 backdrop-blur-sm border border-white/20 flex items-center justify-center">
          <motion.div
            className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-300/50 to-indigo-400/50"
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.6, 0.9, 0.6],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </div>
        {/* 探索中の光の軌跡 */}
        <motion.div
          className="absolute -right-2 top-1/2 w-16 h-0.5 bg-gradient-to-r from-violet-400/40 to-transparent"
          animate={{
            opacity: [0, 0.6, 0],
            width: [0, 64, 0],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            delay: 1,
          }}
        />
      </motion.div>

      {/* メインメッセージ */}
      <motion.div
        className="relative z-10 text-center max-w-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      >
        <h2 className="text-lg font-medium text-slate-700 mb-2">
          {avatarName}を送り出しました
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          まだ宇宙はひっそりとしています。
          <br />
          でも、分身は静かに探索を続けています。
        </p>
      </motion.div>

      {/* 自己理解インサイト */}
      <AnimatePresence>
        {showInsight && insight && (
          <motion.div
            className="relative z-10 mt-8 max-w-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.6 }}
          >
            <div className="rounded-2xl bg-white/60 backdrop-blur-md border border-white/30 p-5 shadow-sm">
              <p className="text-xs text-violet-500 font-medium mb-2">
                今日の観測
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">
                {insight}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* アクションボタン */}
      <motion.div
        className="relative z-10 mt-8 flex flex-col gap-3 w-full max-w-xs"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        {onStartDailyTopic && (
          <button
            onClick={onStartDailyTopic}
            className="w-full py-3 px-4 rounded-xl bg-white/60 backdrop-blur-sm border border-white/30 text-sm text-slate-600 hover:bg-white/80 transition-colors"
          >
            今日のトピックに参加する
          </button>
        )}
        {onStartSelfDiscovery && (
          <button
            onClick={onStartSelfDiscovery}
            className="w-full py-3 px-4 rounded-xl bg-violet-50/60 backdrop-blur-sm border border-violet-200/30 text-sm text-violet-600 hover:bg-violet-50/80 transition-colors"
          >
            自分を知るカードを引く
          </button>
        )}
      </motion.div>
    </div>
  );
}
