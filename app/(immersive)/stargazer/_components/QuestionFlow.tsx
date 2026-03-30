// app/stargazer/_components/QuestionFlow.tsx
// 観測フロー管理 — 質問 + エンゲージメントイベントのオーケストレーション
// 即時送信、戻るボタン、マイクロ・リヴィール、鏡の問い、ビジュアル・チョイス、
// 深呼吸の間、速答フラッシュ、深度メーター、観測タグ、アーキタイプほのめかし
"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SemanticDifferentialCard from "./SemanticDifferentialCard";
import { QUESTIONS, CHAPTERS, type ChapterKey } from "@/lib/stargazer/questions";
import { resolveType, type QuestionAnswer, type ResolvedResult } from "@/lib/stargazer/typeResolver";
import { useSignalCollector } from "@/hooks/useSignalCollector";

// Engagement components
import MicroRevealCard from "./engagement/MicroRevealCard";
import MirrorQuestionCard, { type MirrorResult } from "./engagement/MirrorQuestionCard";
import VisualChoiceCard, { type VisualChoicePair, type VisualChoiceResult } from "./engagement/VisualChoiceCard";
import DeepBreathTransition from "./engagement/DeepBreathTransition";
import DepthMeter, { calculateDepth } from "./engagement/DepthMeter";
import {
  generateReveal,
  generateMirrorProfile,
  getObservationTag,
  type ObservationTag,
} from "./engagement/revealGenerator";
import CognitiveQuestionCard from "./engagement/CognitiveQuestionCard";
import {
  getCfQuestionsByPhase,
  CF_CORE_INSERTION_POINTS,
  type CfAnswer,
} from "@/lib/stargazer/cognitiveFitQuestions";

// ── Event schedule config ──
// 質問数に応じてイベントの発火タイミングを決定
const REVEAL_INTERVAL = 5; // 5問ごとにマイクロ・リヴィール
const MIRROR_INTERVAL = 15; // 15問ごとに鏡の問い
const FLASH_INTERVAL = 5; // 5問ごとに速答フラッシュ（各セットの3問目）
const FLASH_OFFSET = 2; // セット内の3番目 (0-indexed)

// ビジュアル・チョイスの挿入タイミング（問番号）
function getVisualChoiceIndex(totalQ: number): number[] {
  // 全体の約55%地点に1つ挿入（35問なら約Q19付近）
  // 100問なら Q20, Q40, Q60, Q80, Q95 あたり
  if (totalQ <= 40) return [Math.floor(totalQ * 0.55)];
  const step = Math.floor(totalQ / 5);
  return [step, step * 2, step * 3, step * 4, Math.floor(totalQ * 0.95)].slice(0, 5);
}

// ビジュアル・チョイスペアの定義（coreフェーズはvc_01のみ。vc_02〜05はrendezvousフェーズで使用）
const VISUAL_CHOICE_PAIRS: VisualChoicePair[] = [
  {
    id: "vc_01",
    axes: ["cautious_vs_bold", "stress_isolation_vs_social"],
    imageA: "/stargazer/visual-choice/vc_01_a.webp",
    imageB: "/stargazer/visual-choice/vc_01_b.webp",
    axisWeightA: -0.5,
    axisWeightB: 0.5,
  },
];

// ── Flow phases ──
type FlowPhase =
  | "chapter_intro"
  | "deep_breath"
  | "questioning"
  | "micro_reveal"
  | "mirror_question"
  | "visual_choice"
  | "cognitive_fit"
  | "milestone"; // legacy compat

interface Props {
  onComplete: (result: ResolvedResult, answers: QuestionAnswer[], cfAnswers?: CfAnswer[]) => void;
  onQuestionAnswered?: (answeredCount: number, answers: QuestionAnswer[]) => void;
  lightMode?: boolean;
}

function QuestionFlow({ onComplete, onQuestionAnswered, lightMode = false }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<QuestionAnswer[]>([]);
  const [flowPhase, setFlowPhase] = useState<FlowPhase>("chapter_intro");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Engagement state
  const [currentObsTag, setCurrentObsTag] = useState<ObservationTag | null>(null);
  const [visualChoiceIdx, setVisualChoiceIdx] = useState(0); // which VC pair to show next
  const [mirrorResults, setMirrorResults] = useState<MirrorResult[]>([]);
  const [vcResults, setVcResults] = useState<VisualChoiceResult[]>([]);

  // Cognitive Fit state
  const [cfAnswers, setCfAnswers] = useState<CfAnswer[]>([]);
  const [cfPhaseQueue, setCfPhaseQueue] = useState<ReturnType<typeof getCfQuestionsByPhase>>([]);
  const [cfQueueIdx, setCfQueueIdx] = useState(0);
  const cfTriggeredPhases = useRef<Set<string>>(new Set());

  // Signal collection
  const responseTimes = useRef<number[]>([]);
  const {
    startQuestion,
    onOptionHover,
    onOptionHoverEnd,
    recordAnswer,
    saveSession,
  } = useSignalCollector();

  const totalQuestions = QUESTIONS.length;
  const currentQuestion = QUESTIONS[currentIndex];
  const currentChapter = currentQuestion?.chapter;
  const chapterInfo = CHAPTERS.find((c) => c.key === currentChapter);
  const chapterLabel = chapterInfo?.label ?? "";

  const isFirstInChapter =
    currentIndex === 0 ||
    QUESTIONS[currentIndex - 1]?.chapter !== currentChapter;

  // VC insertion points (memoized)
  const vcInsertionPoints = useMemo(
    () => getVisualChoiceIndex(totalQuestions),
    [totalQuestions]
  );

  // Start signal tracking
  useEffect(() => {
    if (currentQuestion && flowPhase === "questioning") {
      startQuestion(currentQuestion.id);
    }
  }, [currentIndex, flowPhase, currentQuestion, startQuestion]);

  // ── Flash mode判定: 5問ごとのセットの3番目(0-indexed: 2) ──
  const isFlashQuestion = useMemo(() => {
    const posInSet = currentIndex % FLASH_INTERVAL;
    return posInSet === FLASH_OFFSET;
  }, [currentIndex]);

  // ── Depth calculation ──
  const depth = useMemo(
    () => calculateDepth(currentIndex, totalQuestions),
    [currentIndex, totalQuestions]
  );

  // ── 回答ハンドラ ──
  const handleAnswer = useCallback(
    (questionId: string, value: number, responseTimeMs: number) => {
      setIsSubmitting(true);
      recordAnswer(questionId, String(value));
      responseTimes.current.push(responseTimeMs);

      const newAnswer: QuestionAnswer = { questionId, value, responseTimeMs };
      const newAnswers = [...answers, newAnswer];
      setAnswers(newAnswers);

      // Notify parent of answered count
      onQuestionAnswered?.(newAnswers.length, newAnswers);

      // 観測タグの判定
      const tag = getObservationTag(newAnswer, newAnswers);
      if (tag) {
        setCurrentObsTag(tag);
        setTimeout(() => setCurrentObsTag(null), 1500);
      }

      setTimeout(() => {
        const nextIdx = currentIndex + 1;
        decideNextPhase(nextIdx, newAnswers);
        setIsSubmitting(false);
      }, 250);
    },
    [answers, currentIndex] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── 次のフェーズを決定 ──
  const decideNextPhase = useCallback(
    (nextIdx: number, currentAnswers: QuestionAnswer[]) => {
      const answeredCount = currentAnswers.length;

      // 全問完了チェック
      if (nextIdx >= totalQuestions) {
        saveSession();
        const result = resolveType(currentAnswers);
        onComplete(result, currentAnswers, cfAnswers);
        return;
      }

      // Cognitive Fit 質問の挿入チェック（10問目・20問目・35問目・45問目の後）
      const cfCheckPoints: { count: number; phase: string }[] = [
        { count: CF_CORE_INSERTION_POINTS.early, phase: "core_early" },
        { count: CF_CORE_INSERTION_POINTS.mid, phase: "core_mid" },
        { count: CF_CORE_INSERTION_POINTS.phase1_mid, phase: "phase1_mid" },
        { count: CF_CORE_INSERTION_POINTS.phase1_late, phase: "phase1_late" },
      ];
      for (const cp of cfCheckPoints) {
        if (
          answeredCount === cp.count &&
          !cfTriggeredPhases.current.has(cp.phase)
        ) {
          cfTriggeredPhases.current.add(cp.phase);
          const cfQuestions = getCfQuestionsByPhase(cp.phase as Parameters<typeof getCfQuestionsByPhase>[0]);
          if (cfQuestions.length > 0) {
            setCfPhaseQueue(cfQuestions);
            setCfQueueIdx(0);
            setCurrentIndex(nextIdx);
            setFlowPhase("cognitive_fit");
            return;
          }
        }
      }

      // ビジュアル・チョイスの挿入チェック
      if (vcInsertionPoints.includes(answeredCount) && visualChoiceIdx < VISUAL_CHOICE_PAIRS.length) {
        setCurrentIndex(nextIdx);
        setFlowPhase("visual_choice");
        return;
      }

      // 鏡の問い（15問ごと）
      if (answeredCount > 0 && answeredCount % MIRROR_INTERVAL === 0) {
        setCurrentIndex(nextIdx);
        setFlowPhase("mirror_question");
        return;
      }

      // マイクロ・リヴィール（5問ごと、鏡の問いと被らない場合）
      if (answeredCount > 0 && answeredCount % REVEAL_INTERVAL === 0) {
        setCurrentIndex(nextIdx);
        setFlowPhase("micro_reveal");
        return;
      }

      // チャプター変更チェック → 深呼吸の間
      const nextChapter = QUESTIONS[nextIdx]?.chapter;
      if (nextChapter !== currentChapter) {
        setCurrentIndex(nextIdx);
        setFlowPhase("deep_breath");
        return;
      }

      // 通常の次の質問
      setCurrentIndex(nextIdx);
      setFlowPhase("questioning");
    },
    [
      totalQuestions,
      currentChapter,
      vcInsertionPoints,
      visualChoiceIdx,
      saveSession,
      onComplete,
    ]
  );

  // ── 戻るボタン ──
  const handleGoBack = useCallback(() => {
    if (currentIndex <= 0 || isSubmitting) return;
    // 最後の回答を削除
    setAnswers((prev) => prev.slice(0, -1));
    setCurrentIndex(currentIndex - 1);
    setFlowPhase("questioning");
  }, [currentIndex, isSubmitting]);

  // ── フェーズ遷移ハンドラ ──
  const handleChapterIntroClose = useCallback(() => {
    setFlowPhase("questioning");
  }, []);

  const handleDeepBreathComplete = useCallback(() => {
    setFlowPhase("chapter_intro");
  }, []);

  const handleRevealContinue = useCallback(() => {
    setFlowPhase("questioning");
  }, []);

  const handleMirrorAnswer = useCallback(
    (result: MirrorResult) => {
      setMirrorResults((prev) => [...prev, result]);
      setFlowPhase("questioning");
    },
    []
  );

  const handleVisualChoiceAnswer = useCallback(
    (result: VisualChoiceResult) => {
      setVcResults((prev) => [...prev, result]);
      setVisualChoiceIdx((prev) => prev + 1);
      // VC後はリヴィールを挟む
      setFlowPhase("micro_reveal");
    },
    []
  );

  // ── Cognitive Fit 回答ハンドラ ──
  const handleCfAnswer = useCallback(
    (answer: CfAnswer) => {
      setCfAnswers((prev) => [...prev, answer]);
      const nextCfIdx = cfQueueIdx + 1;
      if (nextCfIdx < cfPhaseQueue.length) {
        // まだこのフェーズにCF問題が残っている
        setCfQueueIdx(nextCfIdx);
      } else {
        // CFフェーズ完了 → リヴィールを挟んでからcore質問に戻る
        setFlowPhase("micro_reveal");
      }
    },
    [cfQueueIdx, cfPhaseQueue.length]
  );

  // ── テーマカラー ──
  const textPrimary = "rgba(20,25,45,0.92)";
  const textSecondary = "rgba(55,60,80,0.7)";
  const textTertiary = "rgba(80,85,105,0.55)";
  const accent = "rgba(140,120,60,0.85)";

  // ── 深呼吸の間 ──
  if (flowPhase === "deep_breath") {
    return (
      <AnimatePresence mode="wait">
        <DeepBreathTransition
          key={`breath_${currentIndex}`}
          message="少し、息を吸って。"
          durationMs={5000}
          onComplete={handleDeepBreathComplete}
        />
      </AnimatePresence>
    );
  }

  // ── マイクロ・リヴィール ──
  if (flowPhase === "micro_reveal") {
    const reveal = generateReveal(answers, totalQuestions);

    return (
      <AnimatePresence mode="wait">
        <MicroRevealCard
          key={`reveal_${answers.length}`}
          message={reveal.message}
          phase={reveal.phase}
          archetypeHint={reveal.archetypeHint}
          onContinue={handleRevealContinue}
        />
      </AnimatePresence>
    );
  }

  // ── 鏡の問い ──
  if (flowPhase === "mirror_question") {
    const profileText = generateMirrorProfile(answers);

    return (
      <AnimatePresence mode="wait">
        <MirrorQuestionCard
          key={`mirror_${answers.length}`}
          profileText={profileText}
          onAnswer={handleMirrorAnswer}
        />
      </AnimatePresence>
    );
  }

  // ── Cognitive Fit 質問 ──
  if (flowPhase === "cognitive_fit") {
    const cfQuestion = cfPhaseQueue[cfQueueIdx];
    if (!cfQuestion) {
      setFlowPhase("questioning");
      return null;
    }

    return (
      <div className="py-8 px-4">
        <div className="mb-6">
          <DepthMeter currentDepth={depth.level} layerProgress={depth.layerProgress} />
        </div>
        <AnimatePresence mode="wait">
          <CognitiveQuestionCard
            key={cfQuestion.id}
            question={cfQuestion}
            onAnswer={handleCfAnswer}
            onGoBack={cfQueueIdx > 0 ? () => {
              setCfAnswers((prev) => prev.slice(0, -1));
              setCfQueueIdx(cfQueueIdx - 1);
            } : undefined}
            canGoBack={cfQueueIdx > 0}
          />
        </AnimatePresence>
      </div>
    );
  }

  // ── ビジュアル・チョイス ──
  if (flowPhase === "visual_choice") {
    const pair = VISUAL_CHOICE_PAIRS[visualChoiceIdx];
    if (!pair) {
      // ペアがない場合はスキップ
      setFlowPhase("questioning");
      return null;
    }

    return (
      <AnimatePresence mode="wait">
        <VisualChoiceCard
          key={`vc_${pair.id}`}
          pair={pair}
          onAnswer={handleVisualChoiceAnswer}
        />
      </AnimatePresence>
    );
  }

  // ── チャプター導入画面 ──
  if (flowPhase === "chapter_intro" && isFirstInChapter && chapterInfo) {
    const chapterIndex = CHAPTERS.findIndex((c) => c.key === currentChapter);

    // Bridge insight from previous chapter answers
    let bridgeInsight: string | null = null;
    if (answers.length > 0) {
      const prevAnswers = answers.slice(-7);
      const avgVal = prevAnswers.reduce((sum, a) => sum + a.value, 0) / prevAnswers.length;
      const bridgeMessages: Record<number, { left: string; right: string }> = {
        1: {
          left: "自分の内側に向かうエネルギーが強いようです",
          right: "周囲との繋がりからエネルギーを得る傾向があります",
        },
        2: {
          left: "親しい関係をじっくり深めるタイプのようです",
          right: "多様な人間関係を築くことに開かれています",
        },
        3: {
          left: "一貫した自分を保とうとする傾向があります",
          right: "場面に応じて柔軟に顔を変えられるようです",
        },
        4: {
          left: "慎重に進むことを好む傾向が見えます",
          right: "スピードと行動力を重視する傾向があります",
        },
      };
      const msg = bridgeMessages[chapterIndex];
      if (msg) {
        bridgeInsight = avgVal < 2.8 ? msg.left : avgVal > 3.2 ? msg.right : null;
      }
    }

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex flex-col items-center justify-center py-16 text-center px-6"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
        >
          {/* Bridge insight */}
          {bridgeInsight && (
            <motion.div
              className="mb-6 p-3 rounded-xl max-w-xs mx-auto"
              style={{
                background: "rgba(190,170,110,0.06)",
                border: "1px solid rgba(190,170,110,0.12)",
              }}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <p
                className="font-display text-xs leading-relaxed"
                style={{ color: "rgba(170,150,90,0.65)" }}
              >
                ✦ {bridgeInsight}
              </p>
            </motion.div>
          )}

          <p
            className="font-mono-sg text-xs tracking-[0.3em] uppercase mb-3"
            style={{ color: textTertiary }}
          >
            Chapter {chapterIndex + 1} of {CHAPTERS.length}
          </p>
          <h2
            className="font-display text-2xl font-semibold mb-3"
            style={{ color: textPrimary }}
          >
            {chapterInfo.label}
          </h2>
          <p
            className="font-body text-sm leading-relaxed mb-8 max-w-sm"
            style={{ color: textSecondary }}
          >
            {chapterInfo.description}
          </p>

          <motion.button
            onClick={handleChapterIntroClose}
            className="px-6 py-3 rounded-xl font-body text-sm font-semibold"
            style={{
              background: "rgba(140,120,60,0.12)",
              border: "1px solid rgba(160,140,70,0.3)",
              color: "rgba(100,85,30,0.9)",
              boxShadow: "0 2px 8px rgba(140,120,60,0.06)",
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

  if (!currentQuestion) return null;

  // ── 質問フロー（メイン） ──
  return (
    <div className="py-8 px-4">
      {/* 深度メーター（進捗バーの代わり） */}
      <div className="mb-6">
        <DepthMeter
          currentDepth={depth.level}
          layerProgress={depth.layerProgress}
        />
      </div>

      <AnimatePresence mode="wait">
        <SemanticDifferentialCard
          key={currentQuestion.id}
          question={currentQuestion}
          questionIndex={currentIndex}
          totalQuestions={totalQuestions}
          chapterLabel={chapterLabel}
          onAnswer={handleAnswer}
          onGoBack={handleGoBack}
          canGoBack={currentIndex > 0}
          isSubmitting={isSubmitting}
          lightMode={lightMode}
          flashMode={isFlashQuestion}
          observationTag={currentObsTag}
          displayQuestionText={currentQuestion.questionText}
          onScaleHover={(v) => onOptionHover(String(v))}
          onScaleHoverEnd={(v) => onOptionHoverEnd(String(v))}
        />
      </AnimatePresence>
    </div>
  );
}

export default React.memo(QuestionFlow);
