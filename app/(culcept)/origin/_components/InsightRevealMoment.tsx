"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import BreathingTransition from "@/app/stargazer/_components/BreathingTransition";
import type { DetectedInsight } from "@/lib/origin/v7/insightDetection";

interface Props {
  insight: DetectedInsight;
  onDismiss: () => void;
}

/**
 * インサイト発見のドラマティック演出
 * 背景暗転 → BreathingTransition → グロウカード → 自動消去
 */
export default function InsightRevealMoment({ insight, onDismiss }: Props) {
  const [phase, setPhase] = useState<"breathing" | "reveal" | "settling">("breathing");

  const handleBreathingComplete = useCallback(() => {
    setPhase("reveal");
  }, []);

  // 自動消去（reveal後5秒）
  useEffect(() => {
    if (phase !== "reveal") return;
    const timer = setTimeout(() => {
      setPhase("settling");
      setTimeout(onDismiss, 600);
    }, 5000);
    return () => clearTimeout(timer);
  }, [phase, onDismiss]);

  // グロウパーティクル
  const particles = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    angle: (i / 8) * Math.PI * 2,
    delay: i * 0.1,
  }));

  return (
    <motion.div
      className="fixed inset-0 z-[55] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => {
        setPhase("settling");
        setTimeout(onDismiss, 300);
      }}
    >
      {/* 暗転バックドロップ */}
      <motion.div
        className="absolute inset-0"
        initial={{ backgroundColor: "rgba(0,0,0,0)" }}
        animate={{ backgroundColor: "rgba(0,0,0,0.15)" }}
        transition={{ duration: 0.8 }}
      />

      <AnimatePresence mode="wait">
        {/* ブリージング・ビルドアップ */}
        {phase === "breathing" && (
          <motion.div
            key="breathing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <BreathingTransition
              durationMs={2200}
              accentColor="rgba(99,102,241,0.5)"
              onComplete={handleBreathingComplete}
              message="何かが見えてきました..."
              lightMode
            />
          </motion.div>
        )}

        {/* インサイトカード */}
        {(phase === "reveal" || phase === "settling") && (
          <motion.div
            key="card"
            className="relative z-10 max-w-sm"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{
              scale: phase === "settling" ? 0.95 : 1,
              opacity: phase === "settling" ? 0 : 1,
            }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            {/* グロウエフェクト */}
            <div className="absolute -inset-4 rounded-3xl opacity-60" style={{
              background: "radial-gradient(ellipse at center, rgba(99,102,241,0.3), transparent 70%)",
              animation: "sg-glow-pulse 2s ease-in-out infinite",
            }} />

            {/* パーティクル */}
            <div className="pointer-events-none absolute -inset-8">
              {particles.map((p) => (
                <motion.div
                  key={p.id}
                  className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-indigo-300/60"
                  initial={{ x: 0, y: 0, opacity: 0 }}
                  animate={{
                    x: Math.cos(p.angle) * 60,
                    y: Math.sin(p.angle) * 60,
                    opacity: [0, 0.8, 0],
                  }}
                  transition={{
                    duration: 2,
                    delay: p.delay + 0.3,
                    repeat: Infinity,
                    repeatDelay: 1,
                  }}
                />
              ))}
            </div>

            {/* カード本体 */}
            <div className="relative rounded-3xl border border-indigo-200/50 bg-gradient-to-br from-indigo-50/90 via-white/90 to-purple-50/90 px-6 py-6 shadow-xl backdrop-blur-lg">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🔮</span>
                <div className="flex-1">
                  <h3
                    className="text-base font-bold"
                    style={{ color: "#2d1f5e" }}
                  >
                    {insight.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    {insight.body}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-center text-[10px] text-gray-400">
                タップで閉じる
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
