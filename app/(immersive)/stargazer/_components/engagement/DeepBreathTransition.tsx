// DeepBreathTransition.tsx
// 🌊 深呼吸の間 — カテゴリ境界で5秒間の静寂
// 星座が静かに脈動する画面 + メッセージ
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface Props {
  message?: string;
  durationMs?: number;
  onComplete: () => void;
}

export default function DeepBreathTransition({
  message = "少し、息を吸って。",
  durationMs = 5000,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<"breathing" | "fading">("breathing");

  useEffect(() => {
    const breathTimer = setTimeout(() => {
      setPhase("fading");
    }, durationMs - 800);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, durationMs);

    return () => {
      clearTimeout(breathTimer);
      clearTimeout(completeTimer);
    };
  }, [durationMs, onComplete]);

  return (
    <motion.div
      className="flex flex-col items-center justify-center py-20 px-6 text-center relative min-h-[300px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* 脈動するグロウ */}
      <motion.div
        className="absolute w-32 h-32 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(140,120,60,0.12), transparent 70%)",
        }}
        animate={{
          scale: [1, 1.4, 1],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* 小さな星のパーティクル */}
      {Array.from({ length: 6 }, (_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full"
          style={{
            background: "rgba(190,170,110,0.4)",
            left: `${30 + Math.cos((i / 6) * Math.PI * 2) * 25}%`,
            top: `${40 + Math.sin((i / 6) * Math.PI * 2) * 20}%`,
          }}
          animate={{
            opacity: [0.2, 0.6, 0.2],
            scale: [0.8, 1.2, 0.8],
          }}
          transition={{
            duration: 3,
            delay: i * 0.4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* メッセージ */}
      <motion.p
        className="font-display text-base relative z-10"
        style={{ color: "rgba(100,90,50,0.6)" }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: phase === "fading" ? 0 : 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.25 }}
      >
        {message}
      </motion.p>
    </motion.div>
  );
}
