"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// =============================================================================
// FirstConnectionCeremony - 初めての候補到着セレモニー
// 「宇宙の片隅で、二つの分身が出会いました」
// =============================================================================

type FirstConnectionCeremonyProps = {
  /** マッチ理由テキスト（2-3個） */
  reasons: string[];
  /** 候補カテゴリ */
  category: string;
  /** セレモニー完了コールバック */
  onComplete: () => void;
  /** 相手の表示名 */
  counterpartName?: string;
};

export function FirstConnectionCeremony({
  reasons,
  category,
  onComplete,
  counterpartName,
}: FirstConnectionCeremonyProps) {
  const [phase, setPhase] = useState<"approach" | "meet" | "reveal" | "done">("approach");

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase("meet"), 3000),
      setTimeout(() => setPhase("reveal"), 5500),
      setTimeout(() => setPhase("done"), 10000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const categoryLabel = CATEGORY_LABELS[category] ?? "接続";

  return (
    <AnimatePresence>
      {phase !== "done" && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          {/* 星のパーティクル */}
          <div className="absolute inset-0 overflow-hidden">
            {Array.from({ length: 50 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-0.5 h-0.5 rounded-full bg-white"
                style={{
                  left: `${(i * 31 + 17) % 100}%`,
                  top: `${(i * 47 + 11) % 100}%`,
                }}
                animate={{
                  opacity: [0.1, 0.6, 0.1],
                }}
                transition={{
                  duration: 2 + (i % 4),
                  repeat: Infinity,
                  delay: i * 0.1,
                }}
              />
            ))}
          </div>

          {/* 二つの分身 */}
          <div className="relative w-full max-w-md mx-auto px-8">
            {/* 左の分身（自分） */}
            <motion.div
              className="absolute left-8 top-1/2 -translate-y-1/2"
              initial={{ x: -100, opacity: 0 }}
              animate={{
                x: phase === "approach" ? -40 : phase === "meet" ? 20 : 40,
                opacity: 1,
              }}
              transition={{ duration: 2, ease: "easeOut" }}
            >
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-400/60 to-indigo-500/60 backdrop-blur-sm border border-violet-300/30 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-violet-300/50" />
              </div>
            </motion.div>

            {/* 右の分身（相手） */}
            <motion.div
              className="absolute right-8 top-1/2 -translate-y-1/2"
              initial={{ x: 100, opacity: 0 }}
              animate={{
                x: phase === "approach" ? 40 : phase === "meet" ? -20 : -40,
                opacity: 1,
              }}
              transition={{ duration: 2, ease: "easeOut" }}
            >
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-rose-400/60 to-pink-500/60 backdrop-blur-sm border border-rose-300/30 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-rose-300/50" />
              </div>
            </motion.div>

            {/* 共鳴ライン（meet以降） */}
            <AnimatePresence>
              {(phase === "meet" || phase === "reveal") && (
                <motion.div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 1, delay: 0.5 }}
                >
                  <div className="w-24 h-0.5 bg-gradient-to-r from-violet-400/60 via-white/40 to-rose-400/60" />
                  {/* パルス効果 */}
                  <motion.div
                    className="absolute inset-0 w-24 h-0.5 bg-gradient-to-r from-violet-400/30 via-white/20 to-rose-400/30"
                    animate={{ scaleX: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* テキスト */}
            <div className="text-center pt-32">
              <AnimatePresence mode="wait">
                {phase === "approach" && (
                  <motion.p
                    key="approach"
                    className="text-white/70 text-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    宇宙の片隅で...
                  </motion.p>
                )}
                {phase === "meet" && (
                  <motion.div
                    key="meet"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <p className="text-white text-base font-medium mb-2">
                      二つの分身が出会いました
                    </p>
                    <p className="text-white/50 text-xs">
                      {categoryLabel}の可能性
                    </p>
                  </motion.div>
                )}
                {phase === "reveal" && (
                  <motion.div
                    key="reveal"
                    className="space-y-4"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                  >
                    <p className="text-white/60 text-xs mb-3">
                      この出会いの理由
                    </p>
                    {reasons.slice(0, 3).map((reason, i) => (
                      <motion.div
                        key={i}
                        className="inline-block mx-1 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/10"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.3 }}
                      >
                        <span className="text-white/80 text-xs">{reason}</span>
                      </motion.div>
                    ))}
                    <motion.button
                      className="mt-6 block mx-auto px-6 py-2.5 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 text-white/90 text-sm hover:bg-white/25 transition-colors"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1.2 }}
                      onClick={onComplete}
                    >
                      出会いを見る
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  romantic: "恋愛",
  friendship: "友人",
  cocreation: "共創",
  community: "コミュニティ",
  partner: "パートナー",
};
