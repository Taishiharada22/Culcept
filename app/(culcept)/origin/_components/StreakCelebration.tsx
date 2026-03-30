"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getStreakMessage } from "@/lib/origin/v7/retention";

interface Props {
  milestone: number;
  onDismiss: () => void;
}

/**
 * ストリークマイルストーン祝福オーバーレイ
 * 紙吹雪 + メッセージ（3秒後自動消去）
 */
export default function StreakCelebration({ milestone, onDismiss }: Props) {
  const { emoji, title, body } = getStreakMessage(milestone);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 500);
    }, 3500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  // 紙吹雪パーティクル
  const confettiColors = ["#f59e0b", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899"];
  const particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 1.5 + Math.random() * 1,
    color: confettiColors[i % confettiColors.length],
    rotation: Math.random() * 720,
    size: 4 + Math.random() * 6,
  }));

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          onClick={() => {
            setVisible(false);
            setTimeout(onDismiss, 300);
          }}
        >
          {/* 半透明バックドロップ */}
          <div className="absolute inset-0 bg-black/10" />

          {/* 紙吹雪 */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {particles.map((p) => (
              <motion.div
                key={p.id}
                className="absolute rounded-sm"
                style={{
                  left: `${p.x}%`,
                  top: "-10px",
                  width: p.size,
                  height: p.size,
                  backgroundColor: p.color,
                }}
                initial={{ y: -20, rotate: 0, opacity: 1 }}
                animate={{
                  y: typeof window !== "undefined" ? window.innerHeight + 20 : 800,
                  rotate: p.rotation,
                  opacity: [1, 1, 0],
                }}
                transition={{
                  duration: p.duration,
                  delay: p.delay,
                  ease: "easeIn",
                }}
              />
            ))}
          </div>

          {/* メッセージカード */}
          <motion.div
            className="relative z-10 flex flex-col items-center gap-3 rounded-3xl border border-amber-200/60 bg-white/90 px-8 py-6 shadow-xl backdrop-blur-lg"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <span className="text-4xl">{emoji}</span>
            <h3 className="text-lg font-bold" style={{ color: "#3a2a1a" }}>
              {title}
            </h3>
            <p className="max-w-xs text-center text-sm leading-relaxed text-gray-600">
              {body}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
