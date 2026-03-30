"use client";

// MirrorMomentOverlay — 矛盾検出時のフルスクリーン演出
// 「自分って、そういう人間だったのか」の最大トリガー
// 認知的不協和: 自分の中の相反する2つの答えを視覚的に対比させる
//
// 5段階演出:
// 1. 暗転 + 「矛盾を検出した」(0-2s)
// 2. 2つの回答カードが左右からスライドイン (2-5s)
// 3. フラクチャーライン SVGアニメ (5-6s)
// 4. 矛盾ナラティブのタイピングリビール (6-9s)
// 5. タップして続ける (9s+)

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ContradictionData {
  /** 軸名 (日本語) */
  axisLabel: string;
  /** 片方の回答/傾向 */
  sideA: string;
  /** もう片方の回答/傾向 */
  sideB: string;
  /** 矛盾の解釈ナラティブ */
  narrative: string;
  /** 矛盾のタイプ */
  type?: "temporal" | "cross_axis" | "self_vs_behavior" | "stated_vs_chosen";
}

interface MirrorMomentOverlayProps {
  contradiction: ContradictionData;
  onDone: () => void;
}

function TypingReveal({ text, onComplete, speed = 45 }: { text: string; onComplete: () => void; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setTimeout(() => setDone(true), 1000);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

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

// SVGフラクチャーライン
function FractureLine() {
  return (
    <svg
      width="3"
      height="120"
      viewBox="0 0 3 120"
      className="mx-auto"
      style={{ overflow: "visible" }}
    >
      <motion.path
        d="M1.5 0 L2 20 L0.5 35 L2.5 55 L1 70 L2 90 L1.5 120"
        stroke="rgba(239,68,68,0.6)"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
      {/* グロー */}
      <motion.path
        d="M1.5 0 L2 20 L0.5 35 L2.5 55 L1 70 L2 90 L1.5 120"
        stroke="rgba(239,68,68,0.2)"
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
      />
    </svg>
  );
}

export default function MirrorMomentOverlay({
  contradiction,
  onDone,
}: MirrorMomentOverlayProps) {
  const [phase, setPhase] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Phase progression
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(2), 2000),   // cards slide in
      setTimeout(() => setPhase(3), 4500),    // fracture line
      setTimeout(() => setPhase(4), 5500),    // narrative typing
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const handleNarrativeDone = useCallback(() => {
    setPhase(5);
  }, []);

  // Auto-dismiss after 15s
  useEffect(() => {
    const t = setTimeout(onDone, 15000);
    return () => clearTimeout(t);
  }, [onDone]);

  const typeLabel = {
    temporal: "時間的矛盾",
    cross_axis: "軸間矛盾",
    self_vs_behavior: "自己認識 vs 行動",
    stated_vs_chosen: "表明 vs 選択",
  }[contradiction.type ?? "cross_axis"];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6"
      style={{
        background: "linear-gradient(180deg, rgba(8,8,16,0.97) 0%, rgba(16,12,24,0.95) 100%)",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      onClick={phase >= 5 ? onDone : undefined}
    >
      {/* Phase 1: 検出アナウンス */}
      <AnimatePresence>
        {phase === 1 && (
          <motion.div
            className="text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.3 }}
          >
            <motion.span
              className="font-mono-sg text-[0.6rem] tracking-[0.3em] block mb-3"
              style={{ color: "rgba(239,68,68,0.5)" }}
            >
              CONTRADICTION DETECTED
            </motion.span>
            <motion.span
              className="text-4xl block"
              animate={{ rotate: [0, -5, 5, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            >
              🪞
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase 2+: 二つの回答カード + フラクチャー */}
      <AnimatePresence>
        {phase >= 2 && (
          <motion.div
            className="flex items-stretch gap-3 max-w-sm w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {/* Side A */}
            <motion.div
              className="flex-1 rounded-xl p-4"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              initial={{ x: -80, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <span
                className="font-mono-sg text-[9px] tracking-wider block mb-2"
                style={{ color: "rgba(74,222,128,0.6)" }}
              >
                A
              </span>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "rgba(255,255,255,0.85)" }}
              >
                {contradiction.sideA}
              </p>
            </motion.div>

            {/* フラクチャーライン (Phase 3+) */}
            <div className="flex items-center">
              {phase >= 3 ? (
                <FractureLine />
              ) : (
                <div style={{ width: 3 }} />
              )}
            </div>

            {/* Side B */}
            <motion.div
              className="flex-1 rounded-xl p-4"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              initial={{ x: 80, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 }}
            >
              <span
                className="font-mono-sg text-[9px] tracking-wider block mb-2"
                style={{ color: "rgba(244,114,182,0.6)" }}
              >
                B
              </span>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "rgba(255,255,255,0.85)" }}
              >
                {contradiction.sideB}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 軸ラベル + 矛盾タイプ */}
      <AnimatePresence>
        {phase >= 2 && (
          <motion.div
            className="mt-4 flex items-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <span
              className="text-[10px] px-2 py-1 rounded-full"
              style={{
                background: "rgba(239,68,68,0.1)",
                color: "rgba(239,68,68,0.6)",
                border: "1px solid rgba(239,68,68,0.15)",
              }}
            >
              {contradiction.axisLabel}
            </span>
            <span
              className="text-[10px]"
              style={{ color: "rgba(255,255,255,0.25)" }}
            >
              {typeLabel}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase 4: ナラティブタイピングリビール */}
      <AnimatePresence>
        {phase >= 4 && (
          <motion.p
            className="mt-8 text-base leading-relaxed text-center max-w-sm"
            style={{ color: "rgba(255,255,255,0.75)" }}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <TypingReveal
              text={contradiction.narrative}
              onComplete={handleNarrativeDone}
              speed={40}
            />
          </motion.p>
        )}
      </AnimatePresence>

      {/* Phase 5: タップ案内 */}
      <AnimatePresence>
        {phase >= 5 && (
          <motion.p
            className="mt-10 text-xs tracking-[0.2em]"
            style={{ color: "rgba(255,255,255,0.12)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            タップして続ける
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
