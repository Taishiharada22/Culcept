// app/stargazer/_components/ResultsSequence.tsx
// Spotify Wrapped 風シーケンシャルリザルト表示
// タップで進む8枚のカード演出（45軸ベース結果表示）
"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CelebrationOverlay from "./CelebrationOverlay";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";
import { TRAIT_AXES } from "@/lib/stargazer/traitAxes";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { ResolvedResult, QuestionAnswer } from "@/lib/stargazer/typeResolver";
import { readMigratedKey } from "@/lib/storageMigration";
import {
  generateOverallSummary,
  deriveBehavioralTendencies,
  deriveCognitiveStyle,
  deriveDeepPsychology,
  deriveRelationalStyle,
  deriveReactionTypeDetail,
} from "@/lib/stargazer/axisResultSections";

interface MicroAnswer {
  value: string;
  insight: string;
}

interface Props {
  finalResult: ResolvedResult;
  microAnswers: MicroAnswer[];
  coreAnswers: QuestionAnswer[];
  rvAnswers: QuestionAnswer[];
  microAxes: Partial<Record<TraitAxisKey, number>>;
  playStarBorn: () => void;
  playInsightReveal: () => void;
  playStreakMilestone: () => void;
  haptics: { light: () => void; medium: () => void; heavy: () => void };
  onSave: () => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Reusable: Axis Bar Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AxisBar({
  leftLabel,
  rightLabel,
  score,
  isLowConfidence,
  delay = 0,
}: {
  leftLabel: string;
  rightLabel: string;
  score: number; // -1 to +1
  isLowConfidence?: boolean;
  delay?: number;
}) {
  // Map score from [-1, +1] to percentage position [0, 100]
  const position = ((score + 1) / 2) * 100;

  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isLowConfidence ? 0.45 : 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
    >
      <div className="flex items-center justify-between mb-0.5">
        <span
          className="text-[10px] font-medium truncate max-w-[40%]"
          style={{ color: score < -0.1 ? "rgba(139,92,246,0.8)" : "rgba(100,105,130,0.5)" }}
        >
          {leftLabel}
        </span>
        {isLowConfidence && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-full"
            style={{
              background: "rgba(120,100,160,0.08)",
              color: "rgba(120,100,160,0.6)",
            }}
          >
            観測中
          </span>
        )}
        <span
          className="text-[10px] font-medium truncate max-w-[40%] text-right"
          style={{ color: score > 0.1 ? "rgba(170,150,90,0.8)" : "rgba(100,105,130,0.5)" }}
        >
          {rightLabel}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(160,170,200,0.1)" }}>
        {/* Center line */}
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{ left: "50%", background: "rgba(100,105,130,0.2)" }}
        />
        {/* Score indicator bar */}
        <motion.div
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            background: score < 0
              ? "linear-gradient(90deg, rgba(139,92,246,0.5), rgba(139,92,246,0.2))"
              : "linear-gradient(90deg, rgba(170,150,90,0.2), rgba(170,150,90,0.5))",
            left: score < 0 ? `${position}%` : "50%",
            width: `${Math.abs(score) * 50}%`,
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: delay + 0.15, duration: 0.4, ease: "easeOut" }}
        />
        {/* Score marker dot */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2"
          style={{
            left: `${position}%`,
            transform: `translate(-50%, -50%)`,
            background: score < 0 ? "rgba(139,92,246,0.9)" : "rgba(170,150,90,0.9)",
            borderColor: "rgba(255,255,255,0.9)",
            boxShadow: "0 0 4px rgba(0,0,0,0.1)",
          }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: delay + 0.3, type: "spring", damping: 12 }}
        />
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cinematic particle backdrop
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CinematicParticlesLight({ count = 20 }: { count?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }, (_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${(i * 37 + 13) % 100}%`,
            top: `${(i * 53 + 7) % 100}%`,
            width: 1.5 + (i % 3),
            height: 1.5 + (i % 3),
            background: `rgba(190,170,110,${0.15 + (i % 4) * 0.08})`,
          }}
          animate={{
            y: [0, -30 - (i % 20), 0],
            opacity: [0.1, 0.5, 0.1],
          }}
          transition={{
            duration: 3 + (i % 3),
            delay: (i * 0.3) % 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fit feedback persistence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FIT_FEEDBACK_KEY = "culcept_sg_fit_feedback_v1";

function loadSavedFitScore(archetypeCode: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = readMigratedKey(FIT_FEEDBACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.archetypeCode === archetypeCode && typeof parsed?.fitScore === "number") {
      return parsed.fitScore;
    }
  } catch { /* ignore */ }
  return null;
}

function saveFitScoreLocal(archetypeCode: string, fitScore: number): void {
  try {
    localStorage.setItem("aneurasync_sg_fit_feedback_v1", JSON.stringify({
      archetypeCode: archetypeCode,
      fitScore,
      savedAt: new Date().toISOString(),
    }));
  } catch { /* ignore */ }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section card glass style
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GLASS_CARD_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.85)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  border: "1px solid rgba(140,150,180,0.12)",
  borderRadius: 16,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function ResultsSequence({
  finalResult,
  microAnswers,
  coreAnswers,
  rvAnswers,
  microAxes,
  playStarBorn,
  playInsightReveal,
  playStreakMilestone,
  haptics,
  onSave,
}: Props) {
  const [cardIndex, setCardIndex] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [revealReady, setRevealReady] = useState(false);
  const [showTypeDetail, setShowTypeDetail] = useState(false);
  const [activeCluster, setActiveCluster] = useState(0);

  const archResult = resolveArchetype(finalResult.axisScores);
  const archDef = getArchetypeByCode(archResult.code);
  const archetypeCode = archResult.code;

  const [savedFitScore, setSavedFitScore] = useState<number | null>(() =>
    loadSavedFitScore(archetypeCode)
  );

  const totalAnswers = coreAnswers.length + rvAnswers.length + 3;

  // Precompute all section data
  const overallSummary = useMemo(
    () => generateOverallSummary(finalResult.axisScores, finalResult.axisConfidences),
    [finalResult.axisScores, finalResult.axisConfidences],
  );
  const behavioralTendencies = useMemo(
    () => deriveBehavioralTendencies(finalResult.axisScores, finalResult.axisConfidences),
    [finalResult.axisScores, finalResult.axisConfidences],
  );
  const cognitiveStyle = useMemo(
    () => deriveCognitiveStyle(finalResult.axisScores),
    [finalResult.axisScores],
  );
  const deepPsychology = useMemo(
    () => deriveDeepPsychology(finalResult.axisScores, finalResult.axisConfidences),
    [finalResult.axisScores, finalResult.axisConfidences],
  );
  const relationalStyle = useMemo(
    () => deriveRelationalStyle(finalResult.axisScores, finalResult.axisConfidences),
    [finalResult.axisScores, finalResult.axisConfidences],
  );
  const reactionTypeDetail = useMemo(
    () => deriveReactionTypeDetail(finalResult.reactionType, finalResult.axisScores),
    [finalResult.reactionType, finalResult.axisScores],
  );

  const microInsights = microAnswers.map((a) => a.insight).filter(Boolean);

  const TOTAL_CARDS = 8;

  // Sound/haptic triggers per card
  useEffect(() => {
    if (cardIndex === 0) {
      const revealTimer = setTimeout(() => {
        setRevealReady(true);
        playStarBorn();
        haptics.heavy();
      }, 1200);
      const celebTimer = setTimeout(() => {
        setShowCelebration(true);
      }, 1600);
      return () => {
        clearTimeout(revealTimer);
        clearTimeout(celebTimer);
      };
    }
    if (cardIndex === 1) {
      const t = setTimeout(() => {
        playInsightReveal();
        haptics.medium();
      }, 600);
      return () => clearTimeout(t);
    }
    if (cardIndex === 2) {
      const t = setTimeout(() => {
        haptics.light();
      }, 400);
      return () => clearTimeout(t);
    }
    if (cardIndex === 3 || cardIndex === 4 || cardIndex === 5 || cardIndex === 6) {
      const t = setTimeout(() => haptics.light(), 300);
      return () => clearTimeout(t);
    }
    if (cardIndex === 7) {
      const t = setTimeout(() => playStreakMilestone(), 300);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardIndex]);

  const advance = useCallback(() => {
    if (cardIndex === 0 && !revealReady) return;
    if (cardIndex < TOTAL_CARDS - 1) {
      setCardIndex((i) => i + 1);
      haptics.light();
    }
  }, [cardIndex, revealReady, haptics]);

  // Progress dots
  const ProgressDots = () => (
    <div className="flex justify-center gap-1.5 mb-6">
      {Array.from({ length: TOTAL_CARDS }, (_, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === cardIndex ? 20 : 6,
            height: 6,
            background: i === cardIndex
              ? "rgba(170,150,90,0.7)"
              : i < cardIndex
                ? "rgba(170,150,90,0.3)"
                : "rgba(160,170,200,0.2)",
          }}
        />
      ))}
    </div>
  );

  // Tap hint
  const TapHint = () => (
    cardIndex < TOTAL_CARDS - 1 ? (
      <motion.p
        className="text-center text-xs mt-8 font-mono-sg"
        style={{ color: "rgba(120,125,140,0.35)" }}
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        タップして次へ
      </motion.p>
    ) : null
  );

  const cardVariants = {
    enter: { opacity: 0, y: 40 },
    center: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -30 },
  };

  return (
    <div
      className="relative min-h-[80vh] flex flex-col justify-center px-4 cursor-pointer"
      onClick={advance}
    >
      <CinematicParticlesLight count={cardIndex === 0 ? 35 : 15} />

      <CelebrationOverlay
        visible={showCelebration}
        title="観測完了"
        subtitle={`${totalAnswers}件の回答を記録しました`}
        theme="gold"
        duration={3000}
        onDismiss={() => setShowCelebration(false)}
        onSoundTrigger={() => {}}
      />

      <ProgressDots />

      <AnimatePresence mode="wait">

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* Card 0: Opening — アーキタイプリビール */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {cardIndex === 0 && (
          <motion.div
            key="card0"
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="text-center space-y-6 relative z-10"
          >
            {/* Simple archetype reveal animation */}
            <div className="relative w-40 h-40 mx-auto flex items-center justify-center">
              <AnimatePresence>
                {revealReady && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 1] }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <span className="font-display text-7xl block">
                      {archDef?.emoji ?? "✦"}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Subtle glow ring */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(190,170,110,0.08) 0%, transparent 70%)",
                }}
                animate={revealReady ? { scale: [1, 1.3, 1], opacity: [0.5, 0, 0] } : { opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: revealReady ? 1 : 2, repeat: revealReady ? 0 : Infinity }}
              />
            </div>

            {/* Pre-reveal text */}
            {!revealReady && (
              <motion.p
                className="font-display text-sm"
                style={{ color: "rgba(170,150,90,0.5)" }}
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                パターンを分析中...
              </motion.p>
            )}

            {/* Post-reveal text */}
            <motion.p
              className="font-mono-sg text-[10px] tracking-[0.3em] uppercase"
              style={{ color: "rgba(170,150,90,0.5)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: revealReady ? 1 : 0 }}
              transition={{ delay: revealReady ? 0.3 : 0, duration: 0.5 }}
            >
              観測完了
            </motion.p>

            <motion.h2
              className="font-display text-2xl"
              style={{ color: "rgba(30,35,55,0.9)" }}
              initial={{ opacity: 0, y: 20 }}
              animate={revealReady ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ delay: revealReady ? 0.5 : 0, duration: 0.6 }}
            >
              あなたの内面のパターンが浮かび上がりました
            </motion.h2>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: revealReady ? 1 : 0 }}
              transition={{ delay: revealReady ? 0.7 : 0, duration: 0.5 }}
              className="space-y-2"
            >
              <p className="font-display text-lg font-semibold" style={{ color: "rgba(30,35,55,0.85)" }}>
                {archDef?.name ?? archResult.code}
              </p>
              <span
                className="inline-block font-mono-sg text-xs tracking-[0.3em] px-3 py-1 rounded-lg"
                style={{
                  background: "rgba(170,150,90,0.06)",
                  border: "1px solid rgba(190,170,110,0.15)",
                  color: "rgba(170,150,90,0.75)",
                }}
              >
                {archResult.code}
              </span>
              <p className="font-mono-sg text-sm" style={{ color: "rgba(170,150,90,0.6)" }}>
                {totalAnswers}回の観測から導出
              </p>
            </motion.div>
          </motion.div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* Card 1: 全体像 (Overall Summary) */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {cardIndex === 1 && (
          <motion.div
            key="card1"
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6 relative z-10 max-w-md mx-auto w-full"
          >
            <div className="text-center space-y-2">
              <p
                className="font-mono-sg text-[10px] tracking-[0.3em] uppercase"
                style={{ color: "rgba(170,150,90,0.5)" }}
              >
                全体像
              </p>
              <h3
                className="font-display text-xl"
                style={{ color: "rgba(30,35,55,0.88)" }}
              >
                あなたの観測サマリ
              </h3>
            </div>

            <motion.div
              className="p-5 rounded-2xl"
              style={GLASS_CARD_STYLE}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <p
                className="font-display text-sm leading-relaxed"
                style={{ color: "rgba(30,35,55,0.8)" }}
              >
                {overallSummary.summaryText}
              </p>
            </motion.div>

            {/* Key traits as badges */}
            <motion.div
              className="flex flex-wrap justify-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              {overallSummary.keyTraits.map((trait, i) => (
                <motion.span
                  key={trait}
                  className="px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{
                    background: "rgba(170,150,90,0.08)",
                    border: "1px solid rgba(190,170,110,0.2)",
                    color: "rgba(130,115,60,0.85)",
                  }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.7 + i * 0.1, type: "spring", damping: 15 }}
                >
                  {trait}
                </motion.span>
              ))}
            </motion.div>

            <motion.p
              className="text-center text-xs"
              style={{ color: "rgba(100,105,130,0.4)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
            >
              支配カテゴリ: {overallSummary.dominantCategory}
            </motion.p>
          </motion.div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* Card 2: 傾向マップ (Behavioral Tendencies) */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {cardIndex === 2 && (
          <motion.div
            key="card2"
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-4 relative z-10 max-w-md mx-auto w-full"
          >
            <div className="text-center space-y-2">
              <p
                className="font-mono-sg text-[10px] tracking-[0.3em] uppercase"
                style={{ color: "rgba(170,150,90,0.5)" }}
              >
                傾向マップ
              </p>
              <h3
                className="font-display text-xl"
                style={{ color: "rgba(30,35,55,0.88)" }}
              >
                あなたの傾向マップ
              </h3>
            </div>

            {/* Cluster tabs */}
            <div className="flex gap-1 justify-center">
              {behavioralTendencies.map((cluster, i) => (
                <button
                  key={cluster.clusterKey}
                  onClick={(e) => { e.stopPropagation(); setActiveCluster(i); }}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={{
                    background: activeCluster === i ? "rgba(170,150,90,0.15)" : "rgba(0,0,0,0.03)",
                    border: `1px solid ${activeCluster === i ? "rgba(170,150,90,0.3)" : "rgba(0,0,0,0.06)"}`,
                    color: activeCluster === i ? "rgba(130,115,60,0.9)" : "rgba(100,105,130,0.6)",
                  }}
                >
                  {cluster.clusterName}
                </button>
              ))}
            </div>

            {/* Active cluster axes */}
            <motion.div
              key={`cluster-${activeCluster}`}
              className="p-4 rounded-2xl space-y-3"
              style={GLASS_CARD_STYLE}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {behavioralTendencies[activeCluster]?.axes.map((axis, i) => {
                const def = TRAIT_AXES.find((a) => a.id === axis.key);
                if (!def) return null;
                return (
                  <AxisBar
                    key={axis.key}
                    leftLabel={def.labelLeft}
                    rightLabel={def.labelRight}
                    score={axis.score}
                    isLowConfidence={axis.isLowConfidence}
                    delay={i * 0.06}
                  />
                );
              })}
            </motion.div>

            <motion.p
              className="text-center text-[10px]"
              style={{ color: "rgba(100,105,130,0.35)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              左右にスコアが振れるほど、傾向が明確です
            </motion.p>
          </motion.div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* Card 3: 思考の型 (Cognitive Style) */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {cardIndex === 3 && (
          <motion.div
            key="card3"
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5 relative z-10 max-w-md mx-auto w-full"
          >
            <div className="text-center space-y-2">
              <p
                className="font-mono-sg text-[10px] tracking-[0.3em] uppercase"
                style={{ color: "rgba(170,150,90,0.5)" }}
              >
                認知プロファイル
              </p>
              <h3
                className="font-display text-xl"
                style={{ color: "rgba(30,35,55,0.88)" }}
              >
                思考の型
              </h3>
            </div>

            <div className="p-4 rounded-2xl space-y-4" style={GLASS_CARD_STYLE}>
              {cognitiveStyle.axes.map((axis, i) => (
                <motion.div
                  key={axis.key}
                  className="space-y-1"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                >
                  <AxisBar
                    leftLabel={axis.leftLabel}
                    rightLabel={axis.rightLabel}
                    score={axis.score}
                    delay={0.2 + i * 0.1}
                  />
                  <p
                    className="text-[10px] leading-relaxed pl-1"
                    style={{ color: "rgba(80,85,105,0.55)" }}
                  >
                    {axis.interpretation}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* Profile summary */}
            <motion.div
              className="p-3 rounded-xl"
              style={{
                background: "rgba(170,150,90,0.04)",
                border: "1px solid rgba(190,170,110,0.12)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
            >
              <p
                className="text-xs leading-relaxed"
                style={{ color: "rgba(50,55,75,0.65)" }}
              >
                {cognitiveStyle.profileSummary}
              </p>
            </motion.div>
          </motion.div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* Card 4: 深層プロフィール (Deep Psychology) */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {cardIndex === 4 && (
          <motion.div
            key="card4"
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5 relative z-10 max-w-md mx-auto w-full"
          >
            <div className="text-center space-y-2">
              <p
                className="font-mono-sg text-[10px] tracking-[0.3em] uppercase"
                style={{ color: "rgba(120,100,160,0.5)" }}
              >
                深層心理
              </p>
              <h3
                className="font-display text-xl"
                style={{ color: "rgba(30,35,55,0.88)" }}
              >
                深層プロフィール
              </h3>
              <p className="text-xs" style={{ color: "rgba(60,65,85,0.5)" }}>
                あなたの無意識のパターンと傾向
              </p>
            </div>

            <div className="space-y-3">
              {deepPsychology.dimensions.map((dim, i) => (
                <motion.div
                  key={dim.key}
                  className="p-4 rounded-2xl"
                  style={{
                    ...GLASS_CARD_STYLE,
                    opacity: dim.isLowConfidence ? 0.55 : 1,
                  }}
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: dim.isLowConfidence ? 0.55 : 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.12 }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="font-display text-xs font-semibold"
                      style={{ color: "rgba(120,100,160,0.8)" }}
                    >
                      {dim.displayName}
                    </span>
                    {dim.isLowConfidence && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full"
                        style={{
                          background: "rgba(120,100,160,0.08)",
                          color: "rgba(120,100,160,0.6)",
                        }}
                      >
                        観測中
                      </span>
                    )}
                  </div>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "rgba(40,45,65,0.7)" }}
                  >
                    {dim.interpretation}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* Card 5: 関係性スタイル (Relational Style) */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {cardIndex === 5 && (
          <motion.div
            key="card5"
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5 relative z-10 max-w-md mx-auto w-full"
          >
            <div className="text-center space-y-2">
              <p
                className="font-mono-sg text-[10px] tracking-[0.3em] uppercase"
                style={{ color: "rgba(170,150,90,0.5)" }}
              >
                対人パターン
              </p>
              <h3
                className="font-display text-xl"
                style={{ color: "rgba(30,35,55,0.88)" }}
              >
                関係性スタイル
              </h3>
            </div>

            <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1" onClick={(e) => e.stopPropagation()}>
              {relationalStyle.dimensions.map((dim, i) => (
                <motion.div
                  key={dim.key}
                  className="p-3.5 rounded-2xl"
                  style={{
                    ...GLASS_CARD_STYLE,
                    opacity: dim.isLowConfidence ? 0.5 : 1,
                  }}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: dim.isLowConfidence ? 0.5 : 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.08 }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="font-display text-xs font-semibold"
                      style={{ color: "rgba(30,35,55,0.75)" }}
                    >
                      {dim.displayName}
                    </span>
                    {dim.isLowConfidence && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full"
                        style={{
                          background: "rgba(120,100,160,0.08)",
                          color: "rgba(120,100,160,0.6)",
                        }}
                      >
                        観測中
                      </span>
                    )}
                  </div>
                  <p
                    className="text-[11px] leading-relaxed"
                    style={{ color: "rgba(40,45,65,0.65)" }}
                  >
                    {dim.interpretation}
                  </p>
                </motion.div>
              ))}
            </div>

            <motion.p
              className="text-center text-[10px]"
              style={{ color: "rgba(100,105,130,0.35)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
            >
              Rendezvous での対話を通じて、さらに深まります
            </motion.p>
          </motion.div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* Card 6: 反応タイプ (Reaction Type) */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {cardIndex === 6 && (
          <motion.div
            key="card6"
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5 relative z-10 max-w-md mx-auto w-full"
          >
            <div className="text-center space-y-2">
              <p
                className="font-mono-sg text-[10px] tracking-[0.3em] uppercase"
                style={{ color: "rgba(170,150,90,0.5)" }}
              >
                反応パターン
              </p>
              <h3
                className="font-display text-xl"
                style={{ color: "rgba(30,35,55,0.88)" }}
              >
                反応タイプ
              </h3>
            </div>

            {/* Type hero */}
            <motion.div
              className="text-center space-y-3 p-5 rounded-2xl"
              style={GLASS_CARD_STYLE}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, type: "spring", damping: 20 }}
            >
              <motion.span
                className="text-4xl block"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4, type: "spring", damping: 10 }}
              >
                {reactionTypeDetail.emoji}
              </motion.span>
              <p className="font-display text-lg font-semibold" style={{ color: "rgba(30,35,55,0.9)" }}>
                {reactionTypeDetail.name}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(50,55,75,0.65)" }}>
                {reactionTypeDetail.description}
              </p>
            </motion.div>

            {/* Indicator axes — why this type */}
            <motion.div
              className="space-y-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <p className="text-[10px] font-mono-sg tracking-wider uppercase text-center" style={{ color: "rgba(100,105,130,0.45)" }}>
                このタイプの根拠
              </p>
              {reactionTypeDetail.indicatorAxes.slice(0, 5).map((indicator, i) => (
                <motion.div
                  key={indicator.key}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{
                    background: "rgba(255,255,255,0.6)",
                    border: "1px solid rgba(140,150,180,0.08)",
                  }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + i * 0.08 }}
                >
                  <span className="text-[10px] flex-1 truncate" style={{ color: "rgba(50,55,75,0.7)" }}>
                    {indicator.label}
                  </span>
                  <div
                    className="w-16 h-1 rounded-full overflow-hidden flex-shrink-0"
                    style={{ background: "rgba(160,170,200,0.1)" }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: "linear-gradient(90deg, rgba(170,150,90,0.4), rgba(139,92,246,0.4))",
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${indicator.contribution * 100}%` }}
                      transition={{ delay: 0.8 + i * 0.1, duration: 0.4 }}
                    />
                  </div>
                  <span className="text-[9px] w-8 text-right font-mono-sg" style={{ color: "rgba(100,105,130,0.5)" }}>
                    {Math.round(indicator.contribution * 100)}%
                  </span>
                </motion.div>
              ))}
            </motion.div>

            {/* Confidence note */}
            <motion.p
              className="text-[10px] text-center leading-relaxed px-4"
              style={{ color: "rgba(100,105,130,0.4)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
            >
              {reactionTypeDetail.confidenceNote}
            </motion.p>
          </motion.div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* Card 7: Save & Share (CTA) */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {cardIndex === 7 && (
          <motion.div
            key="card7"
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="text-center space-y-8 relative z-10 max-w-md mx-auto w-full"
          >
            <div className="space-y-3">
              <motion.div
                className="text-4xl"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 10 }}
              >
                {archDef?.emoji ?? "✦"}
              </motion.div>
              <h3
                className="font-display text-xl"
                style={{ color: "rgba(30,35,55,0.88)" }}
              >
                {archDef?.name ?? archResult.code}
              </h3>
            </div>

            {/* Confidence ring */}
            <motion.div
              className="flex flex-col items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <div className="relative w-20 h-20">
                <svg viewBox="0 0 80 80" className="w-full h-full">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(160,170,200,0.1)" strokeWidth="3" />
                  <motion.circle
                    cx="40" cy="40" r="34"
                    fill="none"
                    stroke="rgba(170,150,90,0.5)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    initial={{ strokeDashoffset: 2 * Math.PI * 34 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 34 * (1 - archResult.confidence) }}
                    transition={{ delay: 0.6, duration: 1.5, ease: "easeOut" }}
                    transform="rotate(-90 40 40)"
                  />
                </svg>
                <span
                  className="absolute inset-0 flex items-center justify-center font-display text-lg"
                  style={{ color: "rgba(170,150,90,0.7)" }}
                >
                  {Math.round(archResult.confidence * 100)}%
                </span>
              </div>
              <p className="text-xs" style={{ color: "rgba(100,105,130,0.45)" }}>
                初期の観測精度 -- 日々の観測で深まります
              </p>
            </motion.div>

            {archDef?.quote && (
              <motion.div
                className="py-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                <p
                  className="font-display text-sm italic leading-relaxed"
                  style={{ color: "rgba(60,65,85,0.35)" }}
                >
                  &ldquo;{archDef.quote.text}&rdquo;
                </p>
                <p
                  className="font-mono-sg text-[10px] mt-1"
                  style={{ color: "rgba(100,105,130,0.3)" }}
                >
                  -- {archDef.quote.author}
                </p>
              </motion.div>
            )}

            {/* Save CTA */}
            <motion.button
              onClick={(e) => {
                e.stopPropagation();
                onSave();
              }}
              className="w-full py-4 rounded-xl font-display text-base tracking-wide font-semibold transition-all"
              style={{
                background: "linear-gradient(135deg, rgba(170,150,90,0.2), rgba(160,150,200,0.12))",
                border: "1px solid rgba(190,170,110,0.3)",
                color: "rgba(70,60,30,0.9)",
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              保存して日常観測を始める
            </motion.button>

            {/* Share & Detail buttons */}
            {archDef && (
              <motion.div
                className="flex gap-2 w-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4 }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); setShowTypeDetail(true); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium transition-all active:scale-95"
                  style={{
                    color: "rgba(190,170,110,0.9)",
                    background: "rgba(190,170,110,0.06)",
                    border: "1px solid rgba(190,170,110,0.15)",
                  }}
                >
                  タイプ詳細を見る
                </button>
                <button
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium transition-all active:scale-95"
                  style={{
                    color: "rgba(139,92,246,0.9)",
                    background: "rgba(139,92,246,0.06)",
                    border: "1px solid rgba(139,92,246,0.15)",
                  }}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const url = `${window.location.origin}/type/${archDef.code}`;
                    const text = `${archDef.emoji} ${archDef.name}（${archDef.code}）\n「${archDef.motto ?? archDef.tagline}」\n\n初期観測で見えた、私のアーキタイプ。\n${url}`;
                    if (navigator.share) {
                      try { await navigator.share({ title: `${archDef.name} | Aneurasync`, text, url }); } catch {}
                    } else {
                      await navigator.clipboard.writeText(text);
                      alert("コピーしました");
                    }
                  }}
                >
                  シェアする
                </button>
              </motion.div>
            )}

            {/* Type Fit Feedback */}
            <motion.div
              className="w-full mt-4 p-4 rounded-xl text-center"
              style={{
                background: "rgba(255,255,255,0.4)",
                border: "1px solid rgba(0,0,0,0.05)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.8 }}
            >
              <p className="text-xs mb-2" style={{ color: "rgba(70,75,100,0.6)" }}>
                {savedFitScore ? "回答済み - ありがとうございます" : "この結果、しっくりきますか？"}
              </p>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((score) => {
                  const isSelected = savedFitScore === score;
                  return (
                    <motion.button
                      key={score}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSavedFitScore(score);
                        saveFitScoreLocal(archetypeCode, score);
                        fetch("/api/stargazer/type-feedback", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({
                            archetypeCode: archetypeCode,
                            fitScore: score,
                          }),
                        }).catch(() => {});
                      }}
                      animate={isSelected ? { scale: 1.2 } : { scale: 1 }}
                      whileTap={{ scale: 0.9 }}
                      className="w-8 h-8 rounded-full text-xs font-bold transition-all"
                      style={{
                        background: isSelected
                          ? (score <= 2 ? "rgba(244,114,182,0.25)" : score >= 4 ? "rgba(34,197,94,0.25)" : "rgba(120,80,230,0.2)")
                          : (score <= 2 ? "rgba(244,114,182,0.08)" : score >= 4 ? "rgba(34,197,94,0.08)" : "rgba(0,0,0,0.04)"),
                        border: `${isSelected ? "2px" : "1px"} solid ${
                          isSelected
                            ? (score <= 2 ? "rgba(244,114,182,0.6)" : score >= 4 ? "rgba(34,197,94,0.6)" : "rgba(120,80,230,0.5)")
                            : (score <= 2 ? "rgba(244,114,182,0.2)" : score >= 4 ? "rgba(34,197,94,0.2)" : "rgba(0,0,0,0.08)")
                        }`,
                        color: isSelected
                          ? (score <= 2 ? "rgba(244,114,182,1)" : score >= 4 ? "rgba(34,197,94,1)" : "rgba(120,80,230,0.9)")
                          : (score <= 2 ? "rgba(244,114,182,0.8)" : score >= 4 ? "rgba(34,197,94,0.8)" : "rgba(70,75,100,0.5)"),
                        boxShadow: isSelected ? "0 0 8px rgba(120,80,230,0.15)" : "none",
                      }}
                    >
                      {score}
                    </motion.button>
                  );
                })}
              </div>
              <p className="text-[9px] mt-1.5" style={{ color: "rgba(70,75,100,0.35)" }}>
                1=全く違う 〜 5=まさに自分
              </p>
            </motion.div>

            <motion.p
              className="text-xs"
              style={{ color: "rgba(70,75,100,0.45)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.2 }}
            >
              これは観測の出発点です。日々の観測を重ねるほど、あなたの輪郭が鮮明になります。
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <TapHint />

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* Archetype Detail Modal */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <AnimatePresence>
        {showTypeDetail && archDef && (
          <motion.div
            key="type-detail-overlay"
            className="fixed inset-0 z-[100] flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setShowTypeDetail(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Sheet */}
            <motion.div
              className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl"
              style={{
                background: "linear-gradient(180deg, #0f1528 0%, #0a0f1e 100%)",
                border: "1px solid rgba(190,170,110,0.15)",
                borderBottom: "none",
              }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle */}
              <div className="sticky top-0 z-10 flex justify-center pt-3 pb-2" style={{ background: "inherit" }}>
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              <div className="px-6 pb-10 space-y-6">
                {/* Hero */}
                <div className="text-center space-y-3 pt-2">
                  <div className="text-6xl">{archDef.emoji}</div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">{archDef.englishName}</h2>
                  <div className="flex items-center justify-center gap-2">
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-mono border border-amber-400/30 bg-amber-500/10 text-amber-200">
                      {archDef.code}
                    </span>
                    <span className="text-white/60 text-sm">{archDef.name}</span>
                  </div>
                  <p className="text-white/70 text-sm leading-relaxed max-w-sm mx-auto italic">
                    {archDef.tagline}
                  </p>
                  {archDef.motto && (
                    <p className="text-white/40 text-xs tracking-wide">&mdash; {archDef.motto}</p>
                  )}
                </div>

                {/* Divider */}
                <div className="h-px mx-auto max-w-xs" style={{ background: "linear-gradient(90deg, transparent, rgba(190,170,110,0.4), transparent)" }} />

                {/* Strengths */}
                <div className="flex flex-wrap justify-center gap-2">
                  {archDef.strengths.map((s) => (
                    <span key={s} className="px-3 py-1 rounded-full text-xs border border-amber-400/20 bg-amber-500/10 text-amber-200/80">
                      {s}
                    </span>
                  ))}
                </div>

                {/* Dual View */}
                {archDef.dualView && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-white/40 tracking-widest uppercase text-center">三面鏡</h3>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5 space-y-1.5">
                        <p className="text-[10px] text-white/40 font-semibold">自画像</p>
                        <p className="text-white/85 text-sm leading-relaxed">{archDef.dualView.selfView}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5 space-y-1.5">
                        <p className="text-[10px] text-white/40 font-semibold">観測像</p>
                        <p className="text-white/85 text-sm leading-relaxed">{archDef.dualView.observedView}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Blind spots */}
                {archDef.blindSpots.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-white/40 tracking-widest uppercase text-center">盲点</h3>
                    <div className="flex flex-wrap justify-center gap-2">
                      {archDef.blindSpots.map((b) => (
                        <span key={b} className="px-3 py-1 rounded-full text-xs border border-white/10 bg-white/[0.04] text-white/60">
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* States */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-1">
                    <p className="text-[10px] text-emerald-400/60 font-semibold">安定時</p>
                    <p className="text-white/80 text-xs leading-relaxed">{archDef.safeState}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-1">
                    <p className="text-[10px] text-rose-400/60 font-semibold">負荷時</p>
                    <p className="text-white/80 text-xs leading-relaxed">{archDef.stressState}</p>
                  </div>
                </div>

                {/* Inner world */}
                {(archDef.innerContradiction || archDef.secretDesire || archDef.midnightThought) && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-white/40 tracking-widest uppercase text-center">内面の深層</h3>
                    {archDef.innerContradiction && (
                      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-1">
                        <p className="text-[10px] text-purple-400/60 font-semibold">内なる矛盾</p>
                        <p className="text-white/80 text-xs leading-relaxed">{archDef.innerContradiction}</p>
                      </div>
                    )}
                    {archDef.secretDesire && (
                      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-1">
                        <p className="text-[10px] text-amber-400/60 font-semibold">秘めた願望</p>
                        <p className="text-white/80 text-xs leading-relaxed">{archDef.secretDesire}</p>
                      </div>
                    )}
                    {archDef.midnightThought && (
                      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-1">
                        <p className="text-[10px] text-blue-400/60 font-semibold">深夜の思考</p>
                        <p className="text-white/80 text-xs leading-relaxed">{archDef.midnightThought}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Growth key */}
                <div className="rounded-xl border border-amber-400/15 bg-amber-500/[0.04] p-4 space-y-1">
                  <p className="text-[10px] text-amber-400/60 font-semibold">成長の鍵</p>
                  <p className="text-white/80 text-xs leading-relaxed">{archDef.growthKey}</p>
                </div>

                {/* Close button */}
                <button
                  onClick={() => setShowTypeDetail(false)}
                  className="w-full py-3 rounded-xl text-sm font-medium transition-all active:scale-95"
                  style={{
                    color: "rgba(190,170,110,0.9)",
                    background: "rgba(190,170,110,0.08)",
                    border: "1px solid rgba(190,170,110,0.2)",
                  }}
                >
                  閉じる
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
