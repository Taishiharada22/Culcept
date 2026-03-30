// app/stargazer/_components/Stage2Flow.tsx
// Stage 2: Neural Deep Probe フロー管理
// 心理的設計: テーマ別雰囲気 + ステップ間呼吸 + 深度進行 + マルチセッション
// 原則: 深層の判断構造・揺れ・矛盾を観測するため、心理的安全を確保しつつ深く導く
"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ProbeCard from "./ProbeCard";
import BreathingTransition from "./BreathingTransition";
import {
  PROBE_CONTEXT_COLORS,
  type ProbeTheme,
  type ProbeStepAnswer,
  type ProbeThemeResult,
} from "@/lib/stargazer/stage2Probes";
import { scoreProbeTheme } from "@/lib/stargazer/stage2Resolver";
import {
  STAGE2_ATMOSPHERE,
  getAdaptiveBreathingMs,
  PROBE_DEPTH_LEVELS,
} from "@/lib/stargazer/atmosphereConfig";

interface Props {
  availableThemes: ProbeTheme[];
  completedThemeIds?: string[];
  onThemeComplete: (result: ProbeThemeResult) => void;
  onAllComplete: (results: ProbeThemeResult[]) => void;
  lightMode?: boolean;
}

type FlowState =
  | "theme_select"
  | "theme_intro"
  | "probing"
  | "step_breathing"
  | "theme_done";

export default function Stage2Flow({
  availableThemes,
  completedThemeIds = [],
  onThemeComplete,
  onAllComplete,
  lightMode = false,
}: Props) {
  const [flowState, setFlowState] = useState<FlowState>("theme_select");
  const [currentThemeIndex, setCurrentThemeIndex] = useState<number | null>(
    null
  );
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [currentAnswers, setCurrentAnswers] = useState<ProbeStepAnswer[]>([]);
  const [completedResults, setCompletedResults] = useState<ProbeThemeResult[]>(
    []
  );
  const [doneIds, setDoneIds] = useState<string[]>(completedThemeIds);
  const [lastResponseTimeMs, setLastResponseTimeMs] = useState(3000);

  const remainingThemes = availableThemes.filter(
    (t) => !doneIds.includes(t.id)
  );
  const currentTheme =
    currentThemeIndex !== null ? availableThemes[currentThemeIndex] : null;
  const currentAtmosphere = currentTheme
    ? STAGE2_ATMOSPHERE[currentTheme.context]
    : null;

  const textPrimary = "rgba(30,40,60,0.85)";
  const textSecondary = "rgba(100,105,130,0.6)";
  const textTertiary = "rgba(120,125,140,0.4)";

  // テーマ選択
  const handleSelectTheme = useCallback((themeIndex: number) => {
    setCurrentThemeIndex(themeIndex);
    setCurrentStepIndex(0);
    setCurrentAnswers([]);
    setFlowState("theme_intro");
  }, []);

  // テーマイントロから開始
  const handleStartProbe = useCallback(() => {
    setFlowState("probing");
  }, []);

  // ステップ回答 — 呼吸トランジション付き
  const handleStepAnswer = useCallback(
    (answer: ProbeStepAnswer) => {
      const newAnswers = [...currentAnswers, answer];
      setCurrentAnswers(newAnswers);
      setLastResponseTimeMs(answer.responseTimeMs);

      if (!currentTheme) return;

      if (newAnswers.length >= currentTheme.steps.length) {
        // テーマ完了
        const result: ProbeThemeResult = {
          themeId: currentTheme.id,
          context: currentTheme.context,
          answers: newAnswers,
          completedAt: new Date().toISOString(),
          axisDeltas: scoreProbeTheme({
            themeId: currentTheme.id,
            context: currentTheme.context,
            answers: newAnswers,
            completedAt: new Date().toISOString(),
            axisDeltas: {},
          }),
        };

        const newResults = [...completedResults, result];
        setCompletedResults(newResults);
        setDoneIds((prev) => [...prev, currentTheme.id]);
        onThemeComplete(result);
        setFlowState("theme_done");
      } else {
        // 次のステップへ — 呼吸を挟む
        setFlowState("step_breathing");
      }
    },
    [currentAnswers, currentTheme, completedResults, onThemeComplete]
  );

  // ステップ間の呼吸完了
  const handleStepBreathingComplete = useCallback(() => {
    setCurrentStepIndex(currentAnswers.length);
    setFlowState("probing");
  }, [currentAnswers.length]);

  // テーマ完了後 → 次テーマ or 全完了
  const handleNextTheme = useCallback(() => {
    const remaining = availableThemes.filter(
      (t) => !doneIds.includes(t.id)
    );

    if (remaining.length === 0) {
      onAllComplete(completedResults);
    } else {
      setCurrentThemeIndex(null);
      setCurrentStepIndex(0);
      setCurrentAnswers([]);
      setFlowState("theme_select");
    }
  }, [availableThemes, doneIds, completedResults, onAllComplete]);

  const handleFinishEarly = useCallback(() => {
    onAllComplete(completedResults);
  }, [completedResults, onAllComplete]);

  // ── ステップ間呼吸 ──
  if (flowState === "step_breathing" && currentTheme) {
    const breathingMs = getAdaptiveBreathingMs(lastResponseTimeMs);
    const nextStepIndex = currentAnswers.length;
    const depthInfo =
      PROBE_DEPTH_LEVELS[nextStepIndex] ?? PROBE_DEPTH_LEVELS[4];

    // 深い層に行くほど呼吸メッセージが変化
    const breathingMessages = [
      undefined,
      "観測を深めています...",
      "条件を変えて見てみましょう",
      "逆の視点から観測します",
      "最後の層に入ります",
    ];

    return (
      <AnimatePresence mode="wait">
        <BreathingTransition
          key={`step_breath_${nextStepIndex}`}
          durationMs={breathingMs + depthInfo.depthFactor * 600}
          accentColor={currentAtmosphere?.primaryColor}
          onComplete={handleStepBreathingComplete}
          message={breathingMessages[nextStepIndex]}
          lightMode={lightMode}
        />
      </AnimatePresence>
    );
  }

  // ── テーマ選択画面 ──
  if (flowState === "theme_select") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="py-8 px-4"
      >
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <p
              className="font-mono-sg text-xs tracking-[0.3em] uppercase mb-3"
              style={{ color: textTertiary }}
            >
              Neural Deep Probe
            </p>
            <h2
              className="font-display text-xl font-semibold mb-2"
              style={{ color: textPrimary }}
            >
              深層観測テーマを選択
            </h2>
            <p
              className="font-body text-sm leading-relaxed mb-1"
              style={{ color: textSecondary }}
            >
              各テーマは5ステップの深掘り。一度にすべて行う必要はありません。
            </p>
            <p
              className="font-body text-xs leading-relaxed"
              style={{ color: textTertiary }}
            >
              どのテーマも、一つの回答だけでは判断しません
            </p>
          </div>

          <div className="flex flex-col gap-3 mb-8">
            {availableThemes.map((theme, i) => {
              const isDone = doneIds.includes(theme.id);
              const contextColor = PROBE_CONTEXT_COLORS[theme.context];
              const themeAtmo = STAGE2_ATMOSPHERE[theme.context];

              return (
                <motion.button
                  key={theme.id}
                  onClick={() => !isDone && handleSelectTheme(i)}
                  disabled={isDone}
                  className="w-full text-left rounded-xl p-4 transition-all relative overflow-hidden"
                  style={{
                    background: isDone
                      ? "rgba(0,0,0,0.02)"
                      : "rgba(255,255,255,0.7)",
                    border: `1px solid ${isDone ? "rgba(160,170,200,0.08)" : contextColor.accent.replace("0.8", "0.15")}`,
                    opacity: isDone ? 0.5 : 1,
                    cursor: isDone ? "not-allowed" : "pointer",
                    backdropFilter: "blur(12px)",
                  }}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: isDone ? 0.5 : 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  whileHover={!isDone ? { scale: 1.01 } : {}}
                  whileTap={!isDone ? { scale: 0.99 } : {}}
                >
                  {/* テーマのサブトルなグロウ */}
                  {!isDone && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: `radial-gradient(ellipse at 0% 50%, ${themeAtmo.primaryColor.replace(/[\d.]+\)$/, "0.04)")} 0%, transparent 50%)`,
                      }}
                    />
                  )}

                  <div className="flex items-center gap-3 relative z-10">
                    <span className="text-2xl">{theme.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="font-body text-sm font-semibold"
                          style={{
                            color: isDone ? textTertiary : textPrimary,
                          }}
                        >
                          {theme.title}
                        </span>
                        <span
                          className="font-mono-sg text-[9px] tracking-[0.15em] uppercase px-1.5 py-0.5 rounded-full"
                          style={{
                            background: contextColor.bg,
                            color: contextColor.accent,
                          }}
                        >
                          {contextColor.label}
                        </span>
                        {isDone && (
                          <span
                            className="font-mono-sg text-[9px] tracking-[0.1em] px-1.5 py-0.5 rounded-full"
                            style={{
                              background: "rgba(74,222,128,0.1)",
                              color: "rgba(74,222,128,0.7)",
                            }}
                          >
                            完了
                          </span>
                        )}
                      </div>
                      <p
                        className="font-body text-xs leading-relaxed"
                        style={{ color: textSecondary }}
                      >
                        {theme.description}
                      </p>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* 完了状況 + 終了ボタン */}
          <div className="text-center">
            <p
              className="font-mono-sg text-xs tracking-[0.15em] mb-4"
              style={{ color: textTertiary }}
            >
              {doneIds.length} / {availableThemes.length} テーマ完了
            </p>
            {completedResults.length > 0 && (
              <motion.button
                onClick={handleFinishEarly}
                className="px-6 py-2.5 rounded-xl font-body text-sm"
                style={{
                  background: "rgba(0,0,0,0.03)",
                  border: "1px solid rgba(160,170,200,0.12)",
                  color: textSecondary,
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                ここまでの結果を確認する
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // ── テーマイントロ画面 ──
  if (flowState === "theme_intro" && currentTheme) {
    const contextColor = PROBE_CONTEXT_COLORS[currentTheme.context];
    const themeNumber = doneIds.length + 1;

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex flex-col items-center justify-center py-16 text-center px-6 relative"
      >
        {/* テーマ雰囲気背景 */}
        {currentAtmosphere && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ background: currentAtmosphere.backgroundGradient }}
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
          {/* 呼吸するグロウ付きアイコン */}
          <motion.div className="relative mb-5">
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  currentAtmosphere?.primaryColor ?? contextColor.accent,
                filter: "blur(24px)",
              }}
              animate={{
                scale: [0.8, 1.3, 0.8],
                opacity: [0.1, 0.2, 0.1],
              }}
              transition={{
                duration:
                  (currentAtmosphere?.breathingCycleMs ?? 5000) / 1000,
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
              {currentTheme.emoji}
            </motion.div>
          </motion.div>

          <p
            className="font-mono-sg text-xs tracking-[0.3em] uppercase mb-3"
            style={{ color: contextColor.accent }}
          >
            Deep Probe {themeNumber} of {availableThemes.length}
          </p>
          <h2
            className="font-display text-2xl font-semibold mb-3"
            style={{ color: textPrimary }}
          >
            {currentTheme.title}
          </h2>
          <p
            className="font-body text-sm leading-relaxed mb-3 max-w-sm"
            style={{ color: textSecondary }}
          >
            {currentTheme.description}
          </p>

          {/* 心理的安全プライム */}
          {currentAtmosphere && (
            <motion.p
              className="font-body text-xs leading-relaxed mb-3 max-w-xs"
              style={{
                color: currentAtmosphere.primaryColor.replace(
                  /[\d.]+\)$/,
                  "0.4)"
                ),
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              {currentAtmosphere.safetyPrime}
            </motion.p>
          )}

          <p
            className="font-body text-xs leading-relaxed mb-8 max-w-xs"
            style={{ color: textTertiary }}
          >
            5つの視点から深く観測します。一つの回答だけでは判断しません。
          </p>

          {/* 深度プレビュー — 5ステップの深さを可視化 */}
          <div className="flex items-center gap-1 justify-center mb-8">
            {PROBE_DEPTH_LEVELS.map((depth, i) => (
              <motion.div
                key={depth.labelJa}
                className="flex flex-col items-center gap-1"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
              >
                <div
                  className="w-1 rounded-full"
                  style={{
                    height: 8 + i * 4,
                    background: contextColor.accent.replace(
                      "0.8",
                      `${0.15 + i * 0.1}`
                    ),
                  }}
                />
                <span
                  className="font-mono-sg text-[7px]"
                  style={{ color: textTertiary }}
                >
                  {depth.labelJa}
                </span>
              </motion.div>
            ))}
          </div>

          <motion.button
            onClick={handleStartProbe}
            className="px-6 py-3 rounded-xl font-body text-sm font-semibold"
            style={{
              background: contextColor.bg,
              border: `1px solid ${contextColor.accent.replace("0.8", "0.2")}`,
              color: contextColor.accent,
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

  // ── プロービング中 ──
  if (flowState === "probing" && currentTheme) {
    return (
      <div className="py-8 px-4 relative">
        {/* テーマ雰囲気背景 */}
        {currentAtmosphere && (
          <motion.div
            className="absolute inset-0 pointer-events-none -z-10"
            style={{ background: currentAtmosphere.backgroundGradient }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          />
        )}

        <AnimatePresence mode="wait">
          <ProbeCard
            key={`${currentTheme.id}_step${currentStepIndex}`}
            theme={currentTheme}
            currentStepIndex={currentStepIndex}
            previousAnswers={currentAnswers}
            onAnswer={handleStepAnswer}
            lightMode={lightMode}
          />
        </AnimatePresence>
      </div>
    );
  }

  // ── テーマ完了画面 ──
  if (flowState === "theme_done" && currentTheme) {
    const contextColor = PROBE_CONTEXT_COLORS[currentTheme.context];
    const allDone = remainingThemes.length === 0;

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 text-center px-6 relative"
      >
        {/* 完了の雰囲気 */}
        {currentAtmosphere && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ background: currentAtmosphere.backgroundGradient }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
          />
        )}

        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="relative z-10"
        >
          <motion.div
            className="text-4xl mb-4"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 300 }}
          >
            {currentTheme.emoji}
          </motion.div>

          <p
            className="font-mono-sg text-xs tracking-[0.3em] uppercase mb-3"
            style={{ color: contextColor.accent }}
          >
            Probe Complete
          </p>
          <h2
            className="font-display text-xl font-semibold mb-3"
            style={{ color: textPrimary }}
          >
            「{currentTheme.title}」の観測が完了しました
          </h2>
          <p
            className="font-body text-sm leading-relaxed mb-2 max-w-sm"
            style={{ color: textSecondary }}
          >
            {allDone
              ? "すべてのテーマの深層観測が完了しました。"
              : `残り ${remainingThemes.length} テーマの観測が可能です。`}
          </p>
          <p
            className="font-body text-xs leading-relaxed mb-8 max-w-xs"
            style={{ color: textTertiary }}
          >
            5つの視点を通じて、この領域の傾向を総合的に観測しました
          </p>

          <div className="flex flex-col gap-3">
            <motion.button
              onClick={handleNextTheme}
              className="px-6 py-3 rounded-xl font-body text-sm font-semibold"
              style={{
                background: contextColor.bg,
                border: `1px solid ${contextColor.accent.replace("0.8", "0.2")}`,
                color: contextColor.accent,
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {allDone ? "結果を確認する" : "次のテーマを選ぶ"}
            </motion.button>

            {!allDone && (
              <motion.button
                onClick={handleFinishEarly}
                className="px-6 py-2.5 rounded-xl font-body text-xs"
                style={{
                  background: "transparent",
                  border: "1px solid rgba(160,170,200,0.12)",
                  color: textTertiary,
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                ここまでの結果を確認する
              </motion.button>
            )}
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return null;
}
