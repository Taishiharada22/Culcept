"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  RvCard,
  RvGlowCard,
  RvButton,
  RV_COLORS,
} from "@/components/ui/rendezvous-design";

// =============================================================================
// GameClient — ライブ心理ゲーム実行画面
// =============================================================================

type GameQuestion = {
  prompt: string;
  options?: string[];
  freeText?: boolean;
};

// デモデータ（実際はAPI取得）
const DEMO_QUESTIONS: GameQuestion[] = [
  {
    prompt: "親友が不正をしているのを知った。報告する？黙っている？",
    options: ["報告する", "黙っている", "まず親友に直接話す", "状況による"],
  },
  {
    prompt: "100万円もらえるが、今後一生SNSを使えなくなる。受け取る？",
    options: ["受け取る", "受け取らない"],
  },
  {
    prompt: "一生一つの感情しか感じられないとしたら、どれを選ぶ？",
    options: ["喜び", "安心", "好奇心", "愛"],
  },
];

export default function GameClient({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [freeInput, setFreeInput] = useState("");
  const [phase, setPhase] = useState<"playing" | "results">("playing");
  const [submitting, setSubmitting] = useState(false);

  const questions = DEMO_QUESTIONS;
  const question = questions[currentQ];
  const isLast = currentQ >= questions.length - 1;

  const submitAnswer = async () => {
    const answer = question?.freeText ? freeInput.trim() : selectedOption;
    if (!answer || submitting) return;
    setSubmitting(true);

    try {
      await fetch(`/api/rendezvous/game/${gameId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIndex: currentQ, answer }),
      });
    } catch {
      // ignore
    }

    setAnswers((prev) => [...prev, answer]);

    if (isLast) {
      setPhase("results");
    } else {
      setCurrentQ((q) => q + 1);
      setSelectedOption(null);
      setFreeInput("");
    }
    setSubmitting(false);
  };

  // ─── 結果画面 ───
  if (phase === "results") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200 }}
          className="text-5xl mb-4"
        >
          🎉
        </motion.div>
        <p className="text-lg font-bold mb-2" style={{ color: RV_COLORS.text }}>
          ゲーム完了！
        </p>
        <p className="text-xs mb-6 text-center" style={{ color: RV_COLORS.textSub }}>
          あなたの回答が他の参加者と比較されます。
          似た回答をした人との接続が開かれるかもしれません。
        </p>

        {/* 自分の回答振り返り */}
        <RvCard className="w-full max-w-sm mb-6">
          <p className="text-xs font-bold mb-3" style={{ color: RV_COLORS.textMuted }}>
            あなたの回答
          </p>
          {answers.map((a, i) => (
            <div key={i} className="flex items-start gap-2 mb-2">
              <span className="text-[10px] font-bold mt-0.5" style={{ color: RV_COLORS.accent }}>
                Q{i + 1}
              </span>
              <p className="text-xs" style={{ color: RV_COLORS.text }}>{a}</p>
            </div>
          ))}
        </RvCard>

        <RvButton variant="primary" onClick={() => router.push("/rendezvous/live")}>
          ライブに戻る
        </RvButton>
      </div>
    );
  }

  // ─── ゲーム進行 ───
  return (
    <div className="flex flex-col min-h-[70vh] px-4 py-6">
      {/* プログレス */}
      <div className="flex items-center gap-2 mb-6">
        <div
          className="flex-1 h-1.5 rounded-full overflow-hidden"
          style={{ backgroundColor: RV_COLORS.surfaceMuted }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: RV_COLORS.gradient }}
            animate={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
          />
        </div>
        <span className="text-[10px] font-bold" style={{ color: RV_COLORS.textMuted }}>
          {currentQ + 1}/{questions.length}
        </span>
      </div>

      {/* 質問 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3 }}
        >
          <p
            className="text-base font-bold leading-relaxed mb-6"
            style={{ color: RV_COLORS.text }}
          >
            {question?.prompt}
          </p>

          {/* 選択肢 or 自由記述 */}
          {question?.options ? (
            <div className="flex flex-col gap-2">
              {question.options.map((opt) => (
                <motion.button
                  key={opt}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSelectedOption(opt)}
                  className="w-full text-left rounded-xl px-4 py-3 text-sm transition-all"
                  style={{
                    backgroundColor:
                      selectedOption === opt
                        ? `${RV_COLORS.primary}12`
                        : RV_COLORS.surface,
                    border: `1.5px solid ${
                      selectedOption === opt
                        ? `${RV_COLORS.primary}60`
                        : RV_COLORS.border
                    }`,
                    color:
                      selectedOption === opt
                        ? RV_COLORS.primary
                        : RV_COLORS.text,
                    fontWeight: selectedOption === opt ? 700 : 400,
                  }}
                >
                  {opt}
                </motion.button>
              ))}
            </div>
          ) : (
            <textarea
              value={freeInput}
              onChange={(e) => setFreeInput(e.target.value)}
              placeholder="あなたの答えを..."
              className="w-full rounded-xl px-4 py-3 text-sm min-h-[100px] resize-none focus:outline-none"
              style={{
                backgroundColor: RV_COLORS.surface,
                border: `1.5px solid ${RV_COLORS.border}`,
                color: RV_COLORS.text,
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* 送信 */}
      <div className="mt-auto pt-6">
        <RvButton
          variant="glow"
          disabled={
            submitting ||
            (question?.freeText ? !freeInput.trim() : !selectedOption)
          }
          onClick={submitAnswer}
          className="w-full"
        >
          {isLast ? "結果を見る" : "次の質問へ"}
        </RvButton>
      </div>
    </div>
  );
}
