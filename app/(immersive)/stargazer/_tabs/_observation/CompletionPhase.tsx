"use client";

// CompletionPhase — 3段階リビール
// Stage 1: 暗転 + タイピングアニメーション (Peak-End Rule: End を最大化)
// Stage 2: サマリーカード（stat カウントアップ）
// Stage 3: 詳細ドロワー（Progressive Disclosure）

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { TypeDefLike } from "@/lib/stargazer/dailyInsightEngine";
import type { ObservationCompletionInsight } from "@/lib/stargazer/dailyInsightEngine";
import type { ObservationState } from "@/lib/stargazer/fluctuationEngine";
import {
  ENERGY_OPTIONS,
  EMOTION_OPTIONS,
  SOCIAL_OPTIONS,
} from "@/lib/stargazer/fluctuationEngine";
import {
  getPostObservationActions,
  type PostObservationAction,
} from "@/lib/stargazer/primaryAction";
import {
  getJustUnlocked,
  getNextUnlock,
  markUnlockNotified,
  type FeatureGate,
} from "@/lib/stargazer/featureUnlock";
import { useHaptics } from "@/hooks/useHaptics";
import { useStargazerSounds } from "@/hooks/useStargazerSounds";

// ── Typing Animation ──
function TypingReveal({
  text,
  onComplete,
  speed = 40,
}: {
  text: string;
  onComplete: () => void;
  speed?: number;
}) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setTimeout(() => setDone(true), 1500);
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
          className="inline-block w-[2px] h-[0.9em] bg-current ml-0.5 align-middle"
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        />
      )}
    </span>
  );
}

// ── Counter Animation ──
function CountUp({
  target,
  duration = 1.2,
  suffix = "",
}: {
  target: number;
  duration?: number;
  suffix?: string;
}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / (duration * 1000), 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [target, duration]);

  return (
    <span>
      {value}
      {suffix}
    </span>
  );
}

interface CompletionPhaseProps {
  completionInsight: ObservationCompletionInsight;
  todayAnswers: {
    questionId: string;
    optionId: string;
    responseTimeMs: number;
    axisId?: TraitAxisKey;
  }[];
  axisScores: Partial<Record<TraitAxisKey, number>>;
  totalObservations: number;
  typeDef: TypeDefLike | null;
  capturedState: ObservationState | null;
  streak: number;
  /** Render the full PostObservationProgress content */
  renderDetailContent?: () => React.ReactNode;
}

export default function CompletionPhase({
  completionInsight,
  todayAnswers,
  axisScores,
  totalObservations,
  capturedState,
  streak,
  renderDetailContent,
}: CompletionPhaseProps) {
  const [stage, setStage] = useState<"reveal" | "summary" | "detail">(
    "reveal"
  );
  const [revealDone, setRevealDone] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const haptics = useHaptics();
  const { playInsightReveal } = useStargazerSounds();

  // Play sound on mount
  useEffect(() => {
    playInsightReveal();
    haptics.success();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRevealComplete = useCallback(() => {
    setRevealDone(true);
  }, []);

  const handleTapToSummary = useCallback(() => {
    if (!revealDone) return;
    setStage("summary");
    haptics.light();
  }, [revealDone, haptics]);

  const observedAxisCount = useMemo(
    () =>
      Object.values(axisScores).filter(
        (v) => typeof v === "number" && Math.abs(v) > 0.01
      ).length,
    [axisScores]
  );

  const stateLabel = useCallback(
    (
      type: "energy" | "emotion" | "social",
      value: string | undefined
    ): { icon: string; label: string } | null => {
      if (!value) return null;
      const options =
        type === "energy"
          ? ENERGY_OPTIONS
          : type === "emotion"
            ? EMOTION_OPTIONS
            : SOCIAL_OPTIONS;
      const opt = options.find((o) => o.value === value);
      return opt ? { icon: opt.icon, label: opt.label } : null;
    },
    []
  );

  // ── Stage 1: Dark Reveal ──
  if (stage === "reveal") {
    return (
      <motion.div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center px-8 cursor-pointer"
        style={{
          background:
            "linear-gradient(180deg, rgba(16,20,36,0.95) 0%, rgba(24,28,48,0.92) 100%)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        onClick={handleTapToSummary}
      >
        {/* Primary insight — typing reveal */}
        <motion.h2
          className="font-display text-[1.75rem] sm:text-[2.25rem] leading-[1.35] text-center max-w-lg"
          style={{ color: "rgba(255,255,255,0.96)" }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.22 }}
        >
          <TypingReveal
            text={completionInsight.primary}
            onComplete={handleRevealComplete}
            speed={45}
          />
        </motion.h2>

        {/* Tap prompt */}
        <AnimatePresence>
          {revealDone && (
            <motion.p
              className="mt-12 text-xs tracking-[0.2em]"
              style={{ color: "rgba(255,255,255,0.2)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              タップして続ける
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // ── Stage 2: Summary Card ──
  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Hero insight card */}
      <motion.div
        className="card-hero-star"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <span className="sg-text-micro">今日の観測</span>

        <p className="mt-3 font-display text-[1.65rem] leading-[1.3]" style={{ color: "var(--sg-text-heading)" }}>
          {completionInsight.primary}
        </p>

        {completionInsight.revealed && (
          <motion.p
            className="mt-3 sg-text-body leading-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {completionInsight.revealed}
          </motion.p>
        )}

        {/* Stat counters */}
        <div className="grid grid-cols-4 gap-2 mt-6">
          {[
            {
              label: "ストリーク",
              value: streak,
              suffix: "日",
              color: "rgba(170,150,90,0.7)",
            },
            {
              label: "累計観測",
              value: totalObservations + todayAnswers.length,
              suffix: "",
              color: "rgba(139,92,246,0.6)",
            },
            {
              label: "今日の軸",
              value: todayAnswers.length,
              suffix: "",
              color: "rgba(34,197,94,0.6)",
            },
            {
              label: "観測軸",
              value: observedAxisCount,
              suffix: "/33",
              color: "rgba(100,105,130,0.5)",
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              className="text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
            >
              <span
                className="font-display text-xl block"
                style={{ color: stat.color }}
              >
                <CountUp
                  target={stat.value}
                  duration={1.0 + i * 0.2}
                  suffix={stat.suffix}
                />
              </span>
              <span
                className="font-mono-sg text-[0.6rem] tracking-[0.1em] block mt-1"
                style={{ color: "rgba(120,125,140,0.6)" }}
              >
                {stat.label}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Mystery card */}
      {completionInsight.mystery && (
        <motion.div
          className="card-mystery"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <span className="sg-text-micro">まだ見えていないこと</span>
          <p className="mt-2 sg-text-body leading-8">
            {completionInsight.mystery}
          </p>
        </motion.div>
      )}

      {/* Observation state badges */}
      {capturedState && (
        <motion.div
          className="flex flex-wrap gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          {(
            [
              ["energy", capturedState.energy],
              ["emotion", capturedState.emotion],
              ["social", capturedState.social],
            ] as const
          ).map(([type, val]) => {
            const info = stateLabel(type, val);
            if (!info) return null;
            return (
              <span
                key={type}
                className="sg-badge sg-badge-silver text-xs"
              >
                <span>{info.icon}</span>
                {info.label}
              </span>
            );
          })}
        </motion.div>
      )}

      {/* Return prompt with blur seed (1.3) */}
      {(() => {
        const nextGate = getNextUnlock(totalObservations + todayAnswers.length);
        const hasConcretePreview = nextGate && nextGate.remaining <= 3;
        return (
          <motion.div
            className="rounded-2xl p-4"
            style={{
              background:
                "linear-gradient(135deg, rgba(139,92,246,0.05), rgba(190,170,110,0.05))",
              border: "1px solid rgba(160,170,200,0.1)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <span className="sg-text-micro">明日の予感</span>
            {hasConcretePreview ? (
              <p className="mt-2 sg-text-body leading-7">
                あと<span style={{ color: "rgba(201,169,110,0.9)", fontWeight: 700 }}>{nextGate.remaining}回</span>の観測で
                「<span style={{ color: "rgba(201,169,110,0.9)" }}>{nextGate.gate.icon} {nextGate.gate.label}</span>」が解放される
              </p>
            ) : completionInsight.returnPrompt ? (
              <p className="mt-2 sg-text-body leading-7">
                {completionInsight.returnPrompt.split("").slice(0, 12).join("")}
                <span style={{ filter: "blur(4px)", userSelect: "none" }}>
                  {completionInsight.returnPrompt.slice(12)}
                </span>
                <span className="block mt-1 text-[10px]" style={{ color: "rgba(139,92,246,0.4)" }}>
                  明日になったら読める
                </span>
              </p>
            ) : (
              <p className="mt-2 sg-text-body leading-7">
                明日の観測で、新しい一面が見えるかもしれない
              </p>
            )}
          </motion.div>
        );
      })()}

      {/* Post-observation action cascade (1.1) */}
      {(() => {
        const actions = getPostObservationActions({
          totalObservations: totalObservations + todayAnswers.length,
          prophecyVerifiable: false, // TODO: wire from parent state
          hasVanishingInsight: false, // TODO: wire from parent state
          vanishingInsightHoursLeft: 0,
          hasNewContradiction: false, // TODO: wire from parent state
          streakDays: streak,
        });
        if (actions.length === 0) return null;
        return (
          <motion.div
            className="space-y-2.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0 }}
          >
            <span
              className="font-mono-sg text-[0.6rem] tracking-[0.15em] block text-center mb-2"
              style={{ color: "rgba(120,125,140,0.5)" }}
            >
              NEXT ACTIONS
            </span>
            {actions.map((action, i) => (
              <motion.a
                key={action.id}
                href={action.href}
                className="block rounded-xl px-4 py-3 transition-colors"
                style={{
                  background: action.highlight
                    ? "linear-gradient(135deg, rgba(201,169,110,0.08), rgba(139,92,246,0.06))"
                    : "rgba(255,255,255,0.03)",
                  border: action.highlight
                    ? "1px solid rgba(201,169,110,0.2)"
                    : "1px solid rgba(160,170,200,0.08)",
                }}
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.1 + i * 0.15 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{action.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span
                      className="text-sm font-medium block"
                      style={{
                        color: action.highlight
                          ? "rgba(201,169,110,0.9)"
                          : "var(--sg-text-heading, rgba(220,220,230,0.85))",
                      }}
                    >
                      {action.label}
                    </span>
                    <span
                      className="text-xs block mt-0.5"
                      style={{ color: "rgba(120,125,140,0.55)" }}
                    >
                      {action.sublabel}
                    </span>
                  </div>
                  <span style={{ color: "rgba(160,170,200,0.3)" }}>→</span>
                </div>
              </motion.a>
            ))}
          </motion.div>
        );
      })()}

      {/* Detail drawer trigger */}
      {renderDetailContent && (
        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
        >
          <button
            onClick={() => setShowDrawer(!showDrawer)}
            className="btn-ghost-sg text-sm px-6 py-2.5"
          >
            {showDrawer ? "▴ 閉じる" : "▾ 観測の詳細を見る"}
          </button>

          <AnimatePresence>
            {showDrawer && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden mt-4"
              >
                {renderDetailContent()}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Footer */}
      <motion.div
        className="text-center py-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6 }}
      >
        <span
          className="font-mono-sg text-[0.7rem] tracking-[0.15em]"
          style={{ color: "rgba(34,197,94,0.45)" }}
        >
          ✓ 観測記録済み
        </span>
      </motion.div>
    </motion.div>
  );
}
