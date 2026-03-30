// app/stargazer/_components/Stage1Flow.tsx
// Stage 1: Surface Observation フロー管理
// 心理的設計: 呼吸トランジション + 鏡の瞬間 + 雰囲気レイヤー + ためらい検出
// 原則: ユーザーを内省的な状態に導き、表面的回答を超えた深層の反応を引き出す
"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MultipleChoiceCard from "./MultipleChoiceCard";
import BreathingTransition from "./BreathingTransition";
import MirrorMomentCard from "./MirrorMomentCard";
import {
  STAGE1_QUESTIONS,
  STAGE1_CATEGORIES,
} from "@/lib/stargazer/stage1Questions";
import {
  resolveStage1,
  calculateStage1AxisScores,
  type Stage1Answer,
} from "@/lib/stargazer/stage1Resolver";
import type { ResolvedResult } from "@/lib/stargazer/typeResolver";
import type { HesitationSignal } from "@/lib/stargazer/atmosphereConfig";
import {
  STAGE1_ATMOSPHERE,
  getAdaptiveBreathingMs,
  isSignificantHesitation,
} from "@/lib/stargazer/atmosphereConfig";
import { generateMirrorInsight } from "@/lib/stargazer/mirrorInsights";
import type { Stage1Category } from "@/lib/stargazer/stage1Questions";

interface Props {
  onComplete: (result: ResolvedResult, answers: Stage1Answer[]) => void;
  lightMode?: boolean;
}

type FlowPhase =
  | "category_intro"
  | "questioning"
  | "breathing"
  | "hesitation_ack"
  | "mirror_moment";

export default function Stage1Flow({ onComplete, lightMode = false }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Stage1Answer[]>([]);
  const [flowPhase, setFlowPhase] = useState<FlowPhase>("category_intro");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResponseTimeMs, setLastResponseTimeMs] = useState(3000);
  const [lastHesitation, setLastHesitation] = useState<HesitationSignal | null>(
    null
  );
  const [completedCategory, setCompletedCategory] =
    useState<Stage1Category | null>(null);

  const currentQuestion = STAGE1_QUESTIONS[currentIndex];
  const currentCategory = currentQuestion?.category;

  const categoryInfo = STAGE1_CATEGORIES.find(
    (c) => c.key === currentCategory
  );
  const categoryIndex = STAGE1_CATEGORIES.findIndex(
    (c) => c.key === currentCategory
  );

  // 現在のカテゴリの雰囲気設定
  const atmosphere = currentCategory
    ? STAGE1_ATMOSPHERE[currentCategory]
    : null;

  // 現在のカテゴリの最初の質問かどうか
  const isFirstInCategory =
    currentIndex === 0 ||
    STAGE1_QUESTIONS[currentIndex - 1]?.category !== currentCategory;

  // 次の質問が新しいカテゴリかどうか
  const nextQuestion = STAGE1_QUESTIONS[currentIndex + 1];
  const isLastInCategory =
    !nextQuestion || nextQuestion.category !== currentCategory;

  // 部分的な軸スコア（鏡の瞬間用）
  const partialScores = useMemo(
    () => (answers.length > 0 ? calculateStage1AxisScores(answers) : {}),
    [answers]
  );

  // 回答ハンドラ — ためらい情報を含む
  const handleAnswer = useCallback(
    (
      questionId: string,
      selectedOptionId: string,
      responseTimeMs: number,
      hesitation: HesitationSignal
    ) => {
      setIsSubmitting(true);
      setLastResponseTimeMs(responseTimeMs);
      setLastHesitation(hesitation);

      const newAnswer: Stage1Answer = {
        questionId,
        selectedOptionId,
        responseTimeMs,
      };

      const newAnswers = [...answers, newAnswer];
      setAnswers(newAnswers);

      setTimeout(() => {
        const nextIdx = currentIndex + 1;

        if (nextIdx >= STAGE1_QUESTIONS.length) {
          // 全問完了 → タイプ解決
          const result = resolveStage1(newAnswers);
          onComplete(result, newAnswers);
          return;
        }

        const nextCat = STAGE1_QUESTIONS[nextIdx].category;
        const categoryChanged = nextCat !== currentCategory;

        if (categoryChanged) {
          // カテゴリ完了 → 鏡の瞬間を表示
          setCompletedCategory(currentCategory!);
          setCurrentIndex(nextIdx);
          setFlowPhase("mirror_moment");
        } else if (isSignificantHesitation(hesitation)) {
          // ためらいを検出 → 短い呼吸 + 承認メッセージ
          setCurrentIndex(nextIdx);
          setFlowPhase("hesitation_ack");
        } else {
          // 通常の呼吸トランジション
          setCurrentIndex(nextIdx);
          setFlowPhase("breathing");
        }

        setIsSubmitting(false);
      }, 300);
    },
    [answers, currentIndex, currentCategory, onComplete]
  );

  // カテゴリ導入を閉じる
  const handleCategoryIntroClose = useCallback(() => {
    setFlowPhase("questioning");
  }, []);

  // 呼吸トランジション完了
  const handleBreathingComplete = useCallback(() => {
    setFlowPhase("questioning");
  }, []);

  // ためらい承認完了
  const handleHesitationAckComplete = useCallback(() => {
    setFlowPhase("questioning");
  }, []);

  // 鏡の瞬間 → 次のカテゴリ導入へ
  const handleMirrorContinue = useCallback(() => {
    setCompletedCategory(null);
    setFlowPhase("category_intro");
  }, []);

  const textPrimary = "rgba(30,40,60,0.85)";
  const textSecondary = "rgba(100,105,130,0.6)";
  const textTertiary = "rgba(120,125,140,0.4)";

  // ── 鏡の瞬間 ──
  if (flowPhase === "mirror_moment" && completedCategory) {
    const completedAtmo = STAGE1_ATMOSPHERE[completedCategory];
    const completedCatInfo = STAGE1_CATEGORIES.find(
      (c) => c.key === completedCategory
    );
    const insight = generateMirrorInsight(completedCategory, partialScores);

    return (
      <AnimatePresence mode="wait">
        <MirrorMomentCard
          key={`mirror_${completedCategory}`}
          observation={insight.observation}
          categoryEmoji={completedCatInfo?.emoji ?? "🔮"}
          accentColor={completedAtmo.primaryColor}
          onContinue={handleMirrorContinue}
          lightMode={lightMode}
        />
      </AnimatePresence>
    );
  }

  // ── ためらい承認パーズ ──
  if (flowPhase === "hesitation_ack") {
    return (
      <AnimatePresence mode="wait">
        <BreathingTransition
          key={`hesitation_${currentIndex}`}
          durationMs={2800}
          accentColor={atmosphere?.primaryColor}
          onComplete={handleHesitationAckComplete}
          message="迷いがあったようですね — それ自体が大切な観測データです"
          lightMode={lightMode}
        />
      </AnimatePresence>
    );
  }

  // ── 呼吸トランジション ──
  if (flowPhase === "breathing") {
    const breathingMs = getAdaptiveBreathingMs(lastResponseTimeMs);

    return (
      <AnimatePresence mode="wait">
        <BreathingTransition
          key={`breathing_${currentIndex}`}
          durationMs={breathingMs}
          accentColor={atmosphere?.primaryColor}
          onComplete={handleBreathingComplete}
          lightMode={lightMode}
        />
      </AnimatePresence>
    );
  }

  // ── カテゴリ導入画面 ──
  if (flowPhase === "category_intro" && isFirstInCategory && categoryInfo) {
    return (
      <motion.div
        key={`intro_${currentCategory}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex flex-col items-center justify-center py-16 text-center px-6 relative"
      >
        {/* 雰囲気グラデーション背景 */}
        {atmosphere && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ background: atmosphere.backgroundGradient }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
          />
        )}

        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="relative z-10"
        >
          {/* カテゴリ絵文字 — 呼吸するグロウ付き */}
          <motion.div className="relative mb-5">
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background: atmosphere?.primaryColor ?? "rgba(251,191,36,0.5)",
                filter: "blur(20px)",
              }}
              animate={{
                scale: [0.8, 1.2, 0.8],
                opacity: [0.1, 0.25, 0.1],
              }}
              transition={{
                duration: (atmosphere?.breathingCycleMs ?? 5000) / 1000,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <motion.div
              className="text-4xl relative z-10"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                delay: 0.3,
                type: "spring",
                stiffness: 300,
              }}
            >
              {categoryInfo.emoji}
            </motion.div>
          </motion.div>

          <p
            className="font-mono-sg text-xs tracking-[0.3em] uppercase mb-3"
            style={{
              color: atmosphere?.primaryColor ?? textTertiary,
            }}
          >
            Category {categoryIndex + 1} of {STAGE1_CATEGORIES.length}
          </p>
          <h2
            className="font-display text-2xl font-semibold mb-3"
            style={{ color: textPrimary }}
          >
            {categoryInfo.label}
          </h2>
          <p
            className="font-body text-sm leading-relaxed mb-3 max-w-sm"
            style={{ color: textSecondary }}
          >
            {categoryInfo.description}
          </p>

          {/* 心理的安全プライム — カテゴリ固有の安心メッセージ */}
          {atmosphere && (
            <motion.p
              className="font-body text-xs leading-relaxed mb-8 max-w-xs"
              style={{
                color: atmosphere.primaryColor.replace(/[\d.]+\)$/, "0.4)"),
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              {atmosphere.safetyPrime}
            </motion.p>
          )}

          <motion.button
            onClick={handleCategoryIntroClose}
            className="px-6 py-3 rounded-xl font-body text-sm font-semibold"
            style={{
              background: (
                atmosphere?.primaryColor ?? "rgba(251,191,36,0.8)"
              ).replace(/[\d.]+\)$/, "0.08)"),
              border: `1px solid ${(
                atmosphere?.primaryColor ?? "rgba(251,191,36,0.8)"
              ).replace(/[\d.]+\)$/, "0.15)")}`,
              color:
                atmosphere?.primaryColor ?? "rgba(251,191,36,0.8)",
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            観測を始める
          </motion.button>
        </motion.div>
      </motion.div>
    );
  }

  if (!currentQuestion || !categoryInfo) return null;

  // ── 質問フロー ──
  return (
    <div className="py-8 px-4 relative">
      {/* カテゴリ雰囲気背景 */}
      {atmosphere && (
        <motion.div
          className="absolute inset-0 pointer-events-none -z-10"
          style={{ background: atmosphere.backgroundGradient }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        />
      )}

      <AnimatePresence mode="wait">
        <MultipleChoiceCard
          key={currentQuestion.id}
          question={currentQuestion}
          questionIndex={currentIndex}
          totalQuestions={STAGE1_QUESTIONS.length}
          categoryLabel={categoryInfo.label}
          categoryEmoji={categoryInfo.emoji}
          onAnswer={handleAnswer}
          isSubmitting={isSubmitting}
          lightMode={lightMode}
          atmosphereColor={atmosphere?.primaryColor}
        />
      </AnimatePresence>
    </div>
  );
}
