"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
} from "framer-motion";
import type { StargazerQuestion } from "@/types/stargazer";

interface Props {
  question: StargazerQuestion;
  onAnswer: (
    questionId: string,
    answer: "A" | "B",
    shownAt: string,
    answeredAt: string,
    responseTimeMs: number,
    confidenceSelfReport: number,
    skipped: boolean
  ) => void;
  isSubmitting: boolean;
}

export default function ObservationCard({
  question,
  onAnswer,
  isSubmitting,
}: Props) {
  const [confidence, setConfidence] = useState(70);
  const [answered, setAnswered] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<"A" | "B" | null>(null);
  const shownAtRef = useRef<string>(new Date().toISOString());
  const prevQuestionRef = useRef<string>("");

  // 質問が変わったらリセット
  if (question.id !== prevQuestionRef.current) {
    prevQuestionRef.current = question.id;
    shownAtRef.current = new Date().toISOString();
    if (answered) setAnswered(false);
    if (selectedChoice) setSelectedChoice(null);
  }

  const x = useMotionValue(0);
  const rotateZ = useTransform(x, [-200, 0, 200], [-6, 0, 6]);
  const labelOpacityA = useTransform(x, [-200, -50, 0], [1, 0.5, 0]);
  const labelOpacityB = useTransform(x, [0, 50, 200], [0, 0.5, 1]);

  // 背景グロー
  const bgLeftGlow = useTransform(
    x,
    [-200, 0],
    ["rgba(99,102,241,0.12)", "rgba(99,102,241,0)"]
  );
  const bgRightGlow = useTransform(
    x,
    [0, 200],
    ["rgba(251,191,36,0)", "rgba(251,191,36,0.12)"]
  );

  // パーティクル用の決定論的位置（SSR/CSR一致）
  const particles = useMemo(() => {
    // seeded random でSSR/CSR一致を保証
    let seed = 77;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    return Array.from({ length: 12 }, (_, i) => ({
      angle: (i / 12) * Math.PI * 2,
      dist: 20 + rng() * 40,
      size: rng() * 3 + 1,
      delay: rng() * 0.3,
    }));
  }, []);

  const handleChoice = useCallback(
    (choice: "A" | "B") => {
      if (isSubmitting || answered) return;
      setAnswered(true);
      setSelectedChoice(choice);

      const now = new Date().toISOString();
      const responseTimeMs =
        Date.now() - new Date(shownAtRef.current).getTime();

      // 短い遅延で選択エフェクトを見せてから送信
      setTimeout(() => {
        onAnswer(
          question.id,
          choice,
          shownAtRef.current,
          now,
          responseTimeMs,
          confidence,
          false
        );

        setTimeout(() => {
          setAnswered(false);
          setSelectedChoice(null);
          setConfidence(70);
          x.set(0);
        }, 200);
      }, 400);
    },
    [question.id, confidence, isSubmitting, answered, onAnswer, x]
  );

  const handleSkip = useCallback(() => {
    if (isSubmitting || answered) return;
    setAnswered(true);

    const now = new Date().toISOString();
    onAnswer(question.id, "A", shownAtRef.current, now, 0, 0, true);

    setTimeout(() => {
      setAnswered(false);
      setSelectedChoice(null);
      setConfidence(70);
      x.set(0);
    }, 300);
  }, [question.id, isSubmitting, answered, onAnswer, x]);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
      const threshold = 80;
      if (info.offset.x < -threshold || info.velocity.x < -400) {
        handleChoice("A");
      } else if (info.offset.x > threshold || info.velocity.x > 400) {
        handleChoice("B");
      }
    },
    [handleChoice]
  );

  return (
    <div className="relative">
      {/* ドラッグ中の左右ラベル */}
      <div className="relative h-[360px] flex items-center justify-center">
        {/* 左ラベル (A) */}
        <motion.div
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 max-w-[110px]"
          style={{ opacity: labelOpacityA }}
        >
          <div
            className="rounded-xl px-3 py-3 text-center backdrop-blur-md"
            style={{
              background:
                "linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.05) 100%)",
              border: "1px solid rgba(99,102,241,0.2)",
            }}
          >
            <span className="text-xl block mb-1">
              {question.optionA.emoji}
            </span>
            <span className="text-[10px] text-indigo-200/80 leading-tight block">
              {question.optionA.label}
            </span>
          </div>
        </motion.div>

        {/* 右ラベル (B) */}
        <motion.div
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 max-w-[110px]"
          style={{ opacity: labelOpacityB }}
        >
          <div
            className="rounded-xl px-3 py-3 text-center backdrop-blur-md"
            style={{
              background:
                "linear-gradient(135deg, rgba(251,191,36,0.15) 0%, rgba(251,191,36,0.05) 100%)",
              border: "1px solid rgba(251,191,36,0.2)",
            }}
          >
            <span className="text-xl block mb-1">
              {question.optionB.emoji}
            </span>
            <span className="text-[10px] text-amber-200/80 leading-tight block">
              {question.optionB.label}
            </span>
          </div>
        </motion.div>

        {/* メインカード */}
        <AnimatePresence mode="wait">
          <motion.div
            key={question.id}
            className="w-[290px] cursor-grab active:cursor-grabbing"
            style={{ x, rotateZ }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragEnd={handleDragEnd}
            initial={{ opacity: 0, scale: 0.9, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -15 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <motion.div
              className="relative rounded-3xl overflow-hidden"
              style={{
                background:
                  "linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.015) 100%)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(24px)",
                boxShadow:
                  "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
            >
              {/* 左グロー */}
              <motion.div
                className="absolute inset-0 rounded-3xl pointer-events-none"
                style={{ background: bgLeftGlow }}
              />
              {/* 右グロー */}
              <motion.div
                className="absolute inset-0 rounded-3xl pointer-events-none"
                style={{ background: bgRightGlow }}
              />

              {/* 選択時のパーティクルバースト */}
              <AnimatePresence>
                {selectedChoice && (
                  <>
                    {particles.map((p, i) => (
                      <motion.div
                        key={i}
                        className="absolute rounded-full pointer-events-none"
                        style={{
                          width: p.size,
                          height: p.size,
                          left: "50%",
                          top: "50%",
                          background:
                            selectedChoice === "A"
                              ? "rgba(129,140,248,0.8)"
                              : "rgba(251,191,36,0.8)",
                        }}
                        initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                        animate={{
                          x: Math.cos(p.angle) * p.dist,
                          y: Math.sin(p.angle) * p.dist,
                          opacity: 0,
                          scale: 0,
                        }}
                        exit={{ opacity: 0 }}
                        transition={{
                          duration: 0.6,
                          delay: p.delay,
                          ease: "easeOut",
                        }}
                      />
                    ))}
                  </>
                )}
              </AnimatePresence>

              <div className="relative z-10 p-7">
                {/* カテゴリーバッジ */}
                <div className="flex justify-center mb-5">
                  <span
                    className="text-[9px] px-3 py-1 rounded-full tracking-[0.15em] uppercase"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.3)",
                    }}
                  >
                    {question.category}
                  </span>
                </div>

                {/* 質問テキスト */}
                <p className="text-white/90 text-[15px] font-medium mb-8 leading-relaxed text-center">
                  {question.text}
                </p>

                {/* 選択肢ボタン */}
                <div className="space-y-3">
                  <motion.button
                    onClick={() => handleChoice("A")}
                    disabled={isSubmitting || answered}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full py-3.5 px-4 rounded-xl text-sm transition-all flex items-center gap-3 disabled:opacity-40"
                    style={{
                      background:
                        selectedChoice === "A"
                          ? "rgba(99,102,241,0.2)"
                          : "rgba(99,102,241,0.06)",
                      border:
                        selectedChoice === "A"
                          ? "1px solid rgba(99,102,241,0.4)"
                          : "1px solid rgba(99,102,241,0.12)",
                      color: "rgba(199,210,254,0.9)",
                    }}
                  >
                    <span className="text-lg shrink-0">
                      {question.optionA.emoji}
                    </span>
                    <span className="text-left text-[13px] flex-1">
                      {question.optionA.label}
                    </span>
                    {selectedChoice === "A" && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-indigo-300/80 text-xs"
                      >
                        ✓
                      </motion.span>
                    )}
                  </motion.button>

                  <motion.button
                    onClick={() => handleChoice("B")}
                    disabled={isSubmitting || answered}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full py-3.5 px-4 rounded-xl text-sm transition-all flex items-center gap-3 disabled:opacity-40"
                    style={{
                      background:
                        selectedChoice === "B"
                          ? "rgba(251,191,36,0.2)"
                          : "rgba(251,191,36,0.06)",
                      border:
                        selectedChoice === "B"
                          ? "1px solid rgba(251,191,36,0.4)"
                          : "1px solid rgba(251,191,36,0.12)",
                      color: "rgba(253,230,138,0.9)",
                    }}
                  >
                    <span className="text-lg shrink-0">
                      {question.optionB.emoji}
                    </span>
                    <span className="text-left text-[13px] flex-1">
                      {question.optionB.label}
                    </span>
                    {selectedChoice === "B" && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-amber-300/80 text-xs"
                      >
                        ✓
                      </motion.span>
                    )}
                  </motion.button>
                </div>
              </div>

              {/* 送信中インジケータ */}
              {isSubmitting && (
                <motion.div
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center gap-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <motion.div
                    className="w-3 h-3 rounded-full bg-amber-400"
                    animate={{
                      scale: [1, 1.5, 1],
                      opacity: [0.5, 1, 0.5],
                      boxShadow: [
                        "0 0 8px rgba(251,191,36,0.3)",
                        "0 0 20px rgba(251,191,36,0.5)",
                        "0 0 8px rgba(251,191,36,0.3)",
                      ],
                    }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  />
                  <span className="text-[10px] text-amber-200/40 tracking-[0.2em]">
                    RECORDING
                  </span>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 確信度スライダー */}
      <div className="mt-3 px-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-white/20 tracking-wider">
            確信度
          </span>
          <span className="text-[10px] text-amber-300/35 font-mono">
            {confidence}%
          </span>
        </div>
        <div className="relative">
          <input
            type="range"
            min={0}
            max={100}
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            className="w-full h-[3px] bg-white/[0.04] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400/70 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(251,191,36,0.3)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-amber-300/30"
          />
          <div className="flex justify-between mt-1.5">
            <span className="text-[9px] text-white/12">わからない</span>
            <span className="text-[9px] text-white/12">確信</span>
          </div>
        </div>
      </div>

      {/* スキップ */}
      <div className="text-center mt-4">
        <button
          onClick={handleSkip}
          disabled={isSubmitting}
          className="text-[10px] text-white/12 hover:text-white/25 transition-colors disabled:opacity-30 py-2 px-4"
        >
          この質問をスキップ
        </button>
      </div>
    </div>
  );
}
