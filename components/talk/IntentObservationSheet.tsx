"use client";

/**
 * Intent ミニ観測ボトムシート
 *
 * トーク画面で intent 機能（🔮送信前チェック / 💭バブルヒント）を使おうとした際、
 * 自分の対話スタイル観測が不足していると表示される。
 * 30問（約2分）に答えるだけで intent 用の11軸スコアが生成され、機能が有効になる。
 *
 * 学術基盤: ECR-S / ROCI-II / ERQ / Self-Monitoring Scale / BFI-2-XS
 * 各軸2-3専用問 + クロスローディング5問 = 計30問
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QUESTIONS } from "@/lib/talk/quickObserveQuestions";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 定数・型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const C = {
  coalter: "#6366F1",
  neural: "#8B5CF6",
  t1: "#1a1a2e",
  t2: "#4a4a68",
  t3: "#8888a0",
  s1: "#ffffff",
  s2: "#f5f6fa",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Props
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type SheetReason = "self_incomplete" | "counterpart_incomplete";

interface Props {
  open: boolean;
  reason: SheetReason;
  onClose: () => void;
  /** 観測完了後のコールバック（intent 機能を再試行するため） */
  onComplete: () => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function IntentObservationSheet({ open, reason, onClose, onComplete }: Props) {
  const [step, setStep] = useState<"intro" | "questions" | "saving" | "done">("intro");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const handleStartObservation = useCallback(() => {
    setStep("questions");
    setQuestionIndex(0);
    setAnswers({});
  }, []);

  const handleSelectOption = useCallback(async (optionId: string) => {
    const currentQ = QUESTIONS[questionIndex];
    const newAnswers = { ...answers, [currentQ.id]: optionId };
    setAnswers(newAnswers);

    if (questionIndex < QUESTIONS.length - 1) {
      // 次の質問へ
      setQuestionIndex(prev => prev + 1);
    } else {
      // 全問回答完了 → 保存
      setStep("saving");
      try {
        const res = await fetch("/api/talk/quick-observe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: Object.entries(newAnswers).map(([questionId, oId]) => ({
              questionId,
              optionId: oId,
            })),
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setStep("done");
          // 少し見せてから閉じる
          setTimeout(() => {
            onComplete();
          }, 1500);
        } else {
          console.warn("[quick-observe] save failed:", data);
          setStep("done");
          setTimeout(() => onClose(), 1500);
        }
      } catch (e) {
        console.warn("[quick-observe] error:", e);
        setStep("done");
        setTimeout(() => onClose(), 1500);
      }
    }
  }, [questionIndex, answers, onComplete, onClose]);

  const handleClose = useCallback(() => {
    setStep("intro");
    setQuestionIndex(0);
    setAnswers({});
    onClose();
  }, [onClose]);

  const currentQuestion = QUESTIONS[questionIndex];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="intent-obs-backdrop"
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={step === "questions" ? undefined : handleClose}
          />

          {/* Sheet */}
          <motion.div
            key="intent-obs-sheet"
            className="fixed bottom-0 left-0 right-0 z-50"
            style={{
              background: "rgba(255,255,255,0.97)",
              backdropFilter: "blur(20px)",
              borderTop: "1px solid rgba(255,255,255,0.8)",
              borderRadius: "24px 24px 0 0",
              boxShadow: "0 -8px 40px rgba(30,30,60,0.12)",
              maxHeight: "85vh",
              overflow: "hidden",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div style={{ padding: "8px 20px 32px", maxWidth: 420, margin: "0 auto" }}>
              <AnimatePresence mode="wait">
                {/* ── Intro ── */}
                {step === "intro" && reason === "self_incomplete" && (
                  <motion.div
                    key="intro-self"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div style={{ textAlign: "center", marginBottom: 20 }}>
                      <div style={{
                        fontSize: 28,
                        marginBottom: 12,
                        filter: "drop-shadow(0 2px 8px rgba(99,102,241,0.3))",
                      }}>
                        ✦
                      </div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: C.t1, marginBottom: 8 }}>
                        対話スタイルの観測
                      </h3>
                      <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.7 }}>
                        30の質問に答えるだけで、<br />
                        やり取りの補助精度が上がります。
                      </p>
                    </div>

                    <div style={{
                      background: C.s2,
                      borderRadius: 16,
                      padding: "14px 16px",
                      marginBottom: 20,
                    }}>
                      <p style={{ fontSize: 12, color: C.t3, lineHeight: 1.7 }}>
                        あなたの伝え方の傾向を把握することで、
                        相手にどう伝わるかを Alter が予測できるようになります。
                        一度答えれば、すべてのトークで有効です。
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        onClick={handleClose}
                        style={{
                          flex: 1,
                          padding: "12px 0",
                          borderRadius: 14,
                          border: `1px solid ${C.s2}`,
                          background: "transparent",
                          color: C.t3,
                          fontSize: 14,
                          fontWeight: 500,
                          cursor: "pointer",
                        }}
                      >
                        あとで
                      </button>
                      <button
                        onClick={handleStartObservation}
                        style={{
                          flex: 2,
                          padding: "12px 0",
                          borderRadius: 14,
                          border: "none",
                          background: `linear-gradient(135deg, ${C.coalter}, ${C.neural})`,
                          color: "#fff",
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: "pointer",
                          boxShadow: `0 4px 16px ${C.coalter}40`,
                        }}
                      >
                        観測を始める（約2分）
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── Counterpart incomplete ── */}
                {step === "intro" && reason === "counterpart_incomplete" && (
                  <motion.div
                    key="intro-counterpart"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div style={{ textAlign: "center", marginBottom: 20 }}>
                      <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.5 }}>✦</div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: C.t1, marginBottom: 8 }}>
                        相手の観測データがまだありません
                      </h3>
                      <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.7 }}>
                        この機能は、お互いの対話スタイルが<br />
                        わかっているときに使えます。<br />
                        相手が観測を進めると、自動的に有効になります。
                      </p>
                    </div>

                    <button
                      onClick={handleClose}
                      style={{
                        width: "100%",
                        padding: "12px 0",
                        borderRadius: 14,
                        border: `1px solid ${C.s2}`,
                        background: "transparent",
                        color: C.t2,
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      閉じる
                    </button>
                  </motion.div>
                )}

                {/* ── Questions ── */}
                {step === "questions" && currentQuestion && (
                  <motion.div
                    key={`q-${currentQuestion.id}`}
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  >
                    {/* Progress bar */}
                    <div style={{
                      height: 3,
                      borderRadius: 2,
                      background: C.s2,
                      marginBottom: 16,
                      overflow: "hidden",
                    }}>
                      <motion.div
                        style={{
                          height: "100%",
                          borderRadius: 2,
                          background: `linear-gradient(90deg, ${C.coalter}, ${C.neural})`,
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${((questionIndex + 1) / QUESTIONS.length) * 100}%` }}
                        transition={{ type: "spring", damping: 20, stiffness: 200 }}
                      />
                    </div>

                    {/* Question number */}
                    <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>
                      {questionIndex + 1} / {QUESTIONS.length}
                    </div>

                    {/* Question text */}
                    <h3 style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: C.t1,
                      marginBottom: 16,
                      lineHeight: 1.5,
                    }}>
                      {currentQuestion.text}
                    </h3>

                    {/* Options */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {currentQuestion.options.map((opt) => (
                        <motion.button
                          key={opt.id}
                          onClick={() => handleSelectOption(opt.id)}
                          whileTap={{ scale: 0.97 }}
                          style={{
                            padding: "14px 16px",
                            borderRadius: 14,
                            border: `1px solid rgba(99,102,241,0.15)`,
                            background: "rgba(99,102,241,0.04)",
                            color: C.t1,
                            fontSize: 14,
                            fontWeight: 500,
                            textAlign: "left",
                            cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                        >
                          {opt.label}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* ── Saving ── */}
                {step === "saving" && (
                  <motion.div
                    key="saving"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{ textAlign: "center", padding: "32px 0" }}
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                      style={{ fontSize: 24, marginBottom: 12 }}
                    >
                      ✦
                    </motion.div>
                    <p style={{ fontSize: 14, color: C.t2 }}>保存中...</p>
                  </motion.div>
                )}

                {/* ── Done ── */}
                {step === "done" && (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    style={{ textAlign: "center", padding: "32px 0" }}
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.3, 1] }}
                      transition={{ duration: 0.5 }}
                      style={{ fontSize: 32, marginBottom: 12 }}
                    >
                      ✓
                    </motion.div>
                    <p style={{ fontSize: 15, fontWeight: 600, color: C.t1, marginBottom: 4 }}>
                      観測完了
                    </p>
                    <p style={{ fontSize: 13, color: C.t3 }}>
                      やり取りの補助が有効になりました
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Safe area bottom */}
            <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
