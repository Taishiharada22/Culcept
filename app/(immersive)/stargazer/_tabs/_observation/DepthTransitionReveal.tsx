"use client";

// DepthTransitionReveal — フェーズ遷移時のフルスクリーン演出
// 自己決定理論: 「深い質問を獲得した」有能感
// surface → awakening, awakening → maturity, maturity → deep

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PhaseTransition } from "@/lib/stargazer/depthPhaseController";
import { DEPTH_PHASE_COLORS } from "@/lib/stargazer/depthPhaseController";

interface DepthTransitionRevealProps {
  transition: PhaseTransition;
  onDone: () => void;
}

// タイピングリビール
function TypingText({ text, onComplete }: { text: string; onComplete: () => void }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setTimeout(() => setDone(true), 1200);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [text]);

  useEffect(() => {
    if (done) onComplete();
  }, [done, onComplete]);

  return (
    <span>
      {displayed}
      {!done && displayed.length < text.length && (
        <motion.span
          className="inline-block w-[2px] h-[0.85em] bg-current ml-0.5 align-middle"
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        />
      )}
    </span>
  );
}

export default function DepthTransitionReveal({
  transition,
  onDone,
}: DepthTransitionRevealProps) {
  const [showMessage, setShowMessage] = useState(false);
  const [messageDone, setMessageDone] = useState(false);
  const toColor = DEPTH_PHASE_COLORS[transition.to];

  // Phase 1: icon (0-1.5s), Phase 2: message typing (1.5s+), Phase 3: tap to dismiss
  useEffect(() => {
    const t = setTimeout(() => setShowMessage(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const handleTap = useCallback(() => {
    if (messageDone) onDone();
  }, [messageDone, onDone]);

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    const t = setTimeout(onDone, 8000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-8 cursor-pointer"
      style={{
        background: "linear-gradient(180deg, rgba(10,12,24,0.96) 0%, rgba(16,20,36,0.94) 100%)",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      onClick={handleTap}
    >
      {/* 背景のグローリング */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 300,
          height: 300,
          background: `radial-gradient(circle, ${toColor.replace(/[\d.]+\)$/, "0.12)")}, transparent 70%)`,
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.5, 1.2], opacity: [0, 0.8, 0.4] }}
        transition={{ duration: 2.5, ease: "easeOut" }}
      />

      {/* Phase label */}
      <motion.span
        className="font-mono-sg text-[0.6rem] tracking-[0.3em] mb-4"
        style={{ color: toColor }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        DEPTH SHIFT
      </motion.span>

      {/* アイコン */}
      <motion.span
        className="text-5xl block mb-6"
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", delay: 0.5, stiffness: 150, damping: 12 }}
      >
        {transition.icon}
      </motion.span>

      {/* メッセージ（タイピングリビール） */}
      <AnimatePresence>
        {showMessage && (
          <motion.p
            className="font-display text-xl leading-[1.5] text-center max-w-sm"
            style={{ color: "rgba(255,255,255,0.9)" }}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <TypingText
              text={transition.message}
              onComplete={() => setMessageDone(true)}
            />
          </motion.p>
        )}
      </AnimatePresence>

      {/* タップ案内 */}
      <AnimatePresence>
        {messageDone && (
          <motion.p
            className="mt-10 text-xs tracking-[0.2em]"
            style={{ color: "rgba(255,255,255,0.15)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            タップして観測を始める
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
