"use client";

/**
 * SyncExperienceView - 同期体験フルスクリーンコンポーネント
 *
 * States:
 * 1. Waiting - 相手を待っています... (breathing pulse)
 * 2. Countdown - 3-2-1 (shared timer)
 * 3. Answering - 質問 + タイマー + 入力
 * 4. WaitingOther - あなたの答えを預かりました
 * 5. Reveal - 同時開示 + 共鳴アニメーション
 * 6. Insight - 共鳴スコア + インサイト
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";
import type {
  SyncSession,
  SyncQuestion,
  SyncResonanceType,
} from "@/lib/rendezvous/syncExperience";

// ============================================================
// Types
// ============================================================

type Props = {
  session: SyncSession;
  question: SyncQuestion;
  onAnswer: (answer: string) => void;
  onComplete: () => void;
};

type Phase =
  | "waiting"
  | "countdown"
  | "answering"
  | "waiting_other"
  | "revealing"
  | "insight";

// ============================================================
// Particle colors by resonance type
// ============================================================

const RESONANCE_COLORS: Record<SyncResonanceType, string[]> = {
  harmony: ["#FFD700", "#FFA500", "#FFE066", "#FFFACD"],
  surprise: ["#FF6B6B", "#4ECDC4", "#FFE66D", "#A78BFA", "#F472B6"],
  mirror: ["#818CF8", "#6366F1", "#C4B5FD", "#A78BFA"],
  contrast: ["#06B6D4", "#F97316", "#3B82F6", "#EC4899"],
};

const RESONANCE_LABELS: Record<SyncResonanceType, string> = {
  harmony: "調和",
  surprise: "発見",
  mirror: "共鳴",
  contrast: "対照",
};

// ============================================================
// Component
// ============================================================

export default function SyncExperienceView({
  session,
  question,
  onAnswer,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<Phase>("waiting");
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(question.timerSeconds);
  const [draft, setDraft] = useState("");
  const [scaleValue, setScaleValue] = useState(50);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [showInsight, setShowInsight] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Phase transitions from session status ──
  useEffect(() => {
    if (session.status === "waiting") {
      setPhase("waiting");
    } else if (session.status === "both_ready") {
      setPhase("countdown");
    } else if (session.status === "answering") {
      if (session.myAnswer) {
        setPhase("waiting_other");
      } else {
        setPhase("answering");
      }
    } else if (session.status === "revealing") {
      setPhase("revealing");
    } else if (session.status === "completed") {
      setPhase("insight");
    }
  }, [session.status, session.myAnswer]);

  // ── Countdown timer ──
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      setPhase("answering");
      setTimeLeft(question.timerSeconds);
      return;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, countdown, question.timerSeconds]);

  // ── Answering timer ──
  useEffect(() => {
    if (phase !== "answering") return;
    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }
    timerRef.current = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft]);

  // ── Reveal → Insight transition ──
  useEffect(() => {
    if (phase !== "revealing") return;
    const id = setTimeout(() => {
      setShowInsight(true);
      setPhase("insight");
    }, 3000);
    return () => clearTimeout(id);
  }, [phase]);

  // ── Submit answer ──
  const handleSubmit = useCallback(() => {
    let answer = "";
    if (question.answerType === "text") {
      answer = draft.trim() || "(無回答)";
    } else if (question.answerType === "choice") {
      answer = selectedChoice || question.options?.[0]?.id || "";
    } else if (question.answerType === "scale") {
      answer = String(scaleValue);
    }
    onAnswer(answer);
    setPhase("waiting_other");
  }, [draft, selectedChoice, scaleValue, question, onAnswer]);

  // ── Timer progress ──
  const timerProgress = timeLeft / question.timerSeconds;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #0F0A1E 0%, #1A1040 40%, #0D0B20 100%)",
        overflow: "hidden",
      }}
    >
      {/* Background ambient particles */}
      <AmbientParticles />

      <AnimatePresence mode="wait">
        {/* ── Phase: Waiting ── */}
        {phase === "waiting" && (
          <motion.div
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ textAlign: "center", padding: "0 24px" }}
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(99,102,241,0.3), transparent 70%)",
                margin: "0 auto 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(139,92,246,0.6), rgba(99,102,241,0.2))",
                }}
              />
            </motion.div>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 16, fontWeight: 600 }}>
              相手を待っています...
            </p>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 8 }}>
              二人が揃ったら始まります
            </p>
          </motion.div>
        )}

        {/* ── Phase: Countdown ── */}
        {phase === "countdown" && (
          <motion.div
            key="countdown"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            style={{ textAlign: "center" }}
          >
            <motion.div
              key={countdown}
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{
                fontSize: 96,
                fontWeight: 800,
                color: "#fff",
                textShadow: "0 0 40px rgba(99,102,241,0.5)",
              }}
            >
              {countdown > 0 ? countdown : ""}
            </motion.div>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginTop: 12 }}>
              同時に始まります
            </p>
          </motion.div>
        )}

        {/* ── Phase: Answering ── */}
        {phase === "answering" && (
          <motion.div
            key="answering"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              width: "100%",
              maxWidth: 440,
              padding: "0 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 24,
            }}
          >
            {/* Timer ring */}
            <TimerRing progress={timerProgress} seconds={timeLeft} />

            {/* Question */}
            <GlassCard className="w-full p-6 text-center">
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "rgba(139,92,246,0.8)",
                  letterSpacing: 2,
                  marginBottom: 12,
                  textTransform: "uppercase",
                }}
              >
                {question.category}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#fff",
                  lineHeight: 1.6,
                }}
              >
                {question.question}
              </div>
            </GlassCard>

            {/* Input area */}
            {question.answerType === "text" && (
              <TextInput
                value={draft}
                onChange={setDraft}
                onSubmit={handleSubmit}
                disabled={!draft.trim()}
              />
            )}

            {question.answerType === "choice" && question.options && (
              <ChoiceInput
                options={question.options}
                selected={selectedChoice}
                onSelect={setSelectedChoice}
                onSubmit={handleSubmit}
              />
            )}

            {question.answerType === "scale" && question.scaleRange && (
              <ScaleInput
                range={question.scaleRange}
                value={scaleValue}
                onChange={setScaleValue}
                onSubmit={handleSubmit}
              />
            )}
          </motion.div>
        )}

        {/* ── Phase: Waiting for other ── */}
        {phase === "waiting_other" && (
          <motion.div
            key="waiting_other"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            style={{ textAlign: "center", padding: "0 24px" }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              style={{
                width: 80,
                height: 80,
                margin: "0 auto 24px",
                borderRadius: "50%",
                border: "2px solid transparent",
                borderTopColor: "rgba(139,92,246,0.6)",
                borderRightColor: "rgba(99,102,241,0.3)",
              }}
            />
            <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 16, fontWeight: 600 }}>
              あなたの答えを預かりました
            </p>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginTop: 8 }}>
              相手が考え中...
            </p>
            <div
              className="mt-6 mx-auto rounded-xl"
              style={{
                maxWidth: 320,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(12px)",
                padding: "12px 16px",
              }}
            >
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>
                あなたの回答
              </div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
                {formatAnswer(session.myAnswer, question)}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Phase: Revealing ── */}
        {phase === "revealing" && (
          <motion.div
            key="revealing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              width: "100%",
              maxWidth: 440,
              padding: "0 20px",
              textAlign: "center",
            }}
          >
            {/* Expanding circle reveal */}
            <motion.div
              initial={{ scale: 0, opacity: 0.8 }}
              animate={{ scale: 6, opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              style={{
                position: "absolute",
                width: 100,
                height: 100,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(139,92,246,0.4), transparent)",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
              }}
            />

            {/* Question reminder */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: 14,
                marginBottom: 24,
                fontWeight: 500,
              }}
            >
              {question.question}
            </motion.p>

            {/* Two answers side by side */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <RevealCard
                label="あなた"
                answer={formatAnswer(session.myAnswer, question)}
                color="rgba(99,102,241,0.2)"
                borderColor="rgba(99,102,241,0.3)"
                delay={0.5}
                revealStyle={question.revealStyle}
              />
              <RevealCard
                label="相手"
                answer={formatAnswer(session.theirAnswer, question)}
                color="rgba(236,72,153,0.15)"
                borderColor="rgba(236,72,153,0.3)"
                delay={0.8}
                revealStyle={question.revealStyle}
              />
            </div>

            {/* Resonance particles */}
            {session.resonanceType && (
              <ResonanceParticles type={session.resonanceType} />
            )}
          </motion.div>
        )}

        {/* ── Phase: Insight ── */}
        {phase === "insight" && showInsight && (
          <motion.div
            key="insight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              width: "100%",
              maxWidth: 440,
              padding: "0 20px",
              textAlign: "center",
            }}
          >
            {/* Question */}
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 20 }}>
              {question.question}
            </p>

            {/* Answers */}
            <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
              <AnswerBubble
                label="あなた"
                answer={formatAnswer(session.myAnswer, question)}
                color="rgba(99,102,241,0.15)"
              />
              <AnswerBubble
                label="相手"
                answer={formatAnswer(session.theirAnswer, question)}
                color="rgba(236,72,153,0.1)"
              />
            </div>

            {/* Resonance score ring */}
            {session.resonanceScore != null && session.resonanceType && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3, type: "spring" }}
                style={{ marginBottom: 20 }}
              >
                <ResonanceScoreRing
                  score={session.resonanceScore}
                  type={session.resonanceType}
                />
              </motion.div>
            )}

            {/* Insight text */}
            {session.resonanceInsight && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                <div
                  className="rounded-xl"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    backdropFilter: "blur(12px)",
                    padding: "16px 20px",
                    marginBottom: 24,
                  }}
                >
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", lineHeight: 1.7 }}>
                    {session.resonanceInsight}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Complete button */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
            >
              <GlassButton
                onClick={onComplete}
                style={{
                  background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))",
                  border: "1px solid rgba(139,92,246,0.3)",
                  color: "#fff",
                  padding: "12px 40px",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                体験を閉じる
              </GlassButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

/** Circular timer ring */
function TimerRing({ progress, seconds }: { progress: number; seconds: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);
  const isLow = seconds <= 10;

  return (
    <div style={{ position: "relative", width: 80, height: 80 }}>
      <svg width={80} height={80} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={40}
          cy={40}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={4}
        />
        <motion.circle
          cx={40}
          cy={40}
          r={radius}
          fill="none"
          stroke={isLow ? "#EF4444" : "#8B5CF6"}
          strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          animate={isLow ? { opacity: [1, 0.5, 1] } : {}}
          transition={isLow ? { duration: 0.5, repeat: Infinity } : {}}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          fontWeight: 700,
          color: isLow ? "#EF4444" : "rgba(255,255,255,0.8)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {seconds}
      </div>
    </div>
  );
}

/** Text input for text-type questions */
function TextInput({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <div style={{ width: "100%" }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="あなたの答えを書いてください..."
        style={{
          width: "100%",
          minHeight: 100,
          padding: "14px 16px",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(10px)",
          fontSize: 15,
          color: "#fff",
          resize: "none",
          outline: "none",
          fontFamily: "inherit",
          lineHeight: 1.6,
        }}
      />
      <GlassButton
        onClick={onSubmit}
        disabled={disabled}
        style={{
          width: "100%",
          marginTop: 12,
          padding: "14px 0",
          background: disabled
            ? "rgba(255,255,255,0.05)"
            : "linear-gradient(135deg, #6366F1, #8B5CF6)",
          color: disabled ? "rgba(255,255,255,0.3)" : "#fff",
          fontSize: 14,
          fontWeight: 700,
          border: "none",
        }}
      >
        回答を送る
      </GlassButton>
    </div>
  );
}

/** Choice grid for choice-type questions */
function ChoiceInput({
  options,
  selected,
  onSelect,
  onSubmit,
}: {
  options: { id: string; label: string; emoji: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: options.length <= 4 ? "1fr 1fr" : "1fr 1fr 1fr",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {options.map((opt) => (
          <motion.button
            key={opt.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => onSelect(opt.id)}
            style={{
              padding: "16px 12px",
              borderRadius: 14,
              border:
                selected === opt.id
                  ? "2px solid rgba(139,92,246,0.6)"
                  : "1px solid rgba(255,255,255,0.1)",
              background:
                selected === opt.id
                  ? "rgba(139,92,246,0.15)"
                  : "rgba(255,255,255,0.04)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              transition: "all 0.2s",
            }}
          >
            <span style={{ fontSize: 28 }}>{opt.emoji}</span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: selected === opt.id ? "#C4B5FD" : "rgba(255,255,255,0.6)",
              }}
            >
              {opt.label}
            </span>
          </motion.button>
        ))}
      </div>
      <GlassButton
        onClick={onSubmit}
        disabled={!selected}
        style={{
          width: "100%",
          padding: "14px 0",
          background: !selected
            ? "rgba(255,255,255,0.05)"
            : "linear-gradient(135deg, #6366F1, #8B5CF6)",
          color: !selected ? "rgba(255,255,255,0.3)" : "#fff",
          fontSize: 14,
          fontWeight: 700,
          border: "none",
        }}
      >
        この答えで決める
      </GlassButton>
    </div>
  );
}

/** Scale slider for scale-type questions */
function ScaleInput({
  range,
  value,
  onChange,
  onSubmit,
}: {
  range: { min: number; max: number; minLabel: string; maxLabel: string };
  value: number;
  onChange: (v: number) => void;
  onSubmit: () => void;
}) {
  const percent = ((value - range.min) / (range.max - range.min)) * 100;

  return (
    <div style={{ width: "100%", maxWidth: 360 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 12,
          fontSize: 13,
          color: "rgba(255,255,255,0.5)",
          fontWeight: 600,
        }}
      >
        <span>{range.minLabel}</span>
        <span>{range.maxLabel}</span>
      </div>

      {/* Custom slider */}
      <div style={{ position: "relative", height: 40, marginBottom: 20 }}>
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 0,
            right: 0,
            height: 6,
            borderRadius: 3,
            background: "rgba(255,255,255,0.1)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 0,
            width: `${percent}%`,
            height: 6,
            borderRadius: 3,
            background: "linear-gradient(90deg, #6366F1, #8B5CF6)",
          }}
        />
        <input
          type="range"
          min={range.min}
          max={range.max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            position: "absolute",
            top: 8,
            left: 0,
            width: "100%",
            height: 24,
            opacity: 0,
            cursor: "pointer",
            zIndex: 2,
          }}
        />
        <motion.div
          style={{
            position: "absolute",
            top: 8,
            left: `calc(${percent}% - 12px)`,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "#8B5CF6",
            boxShadow: "0 0 16px rgba(139,92,246,0.5)",
            pointerEvents: "none",
          }}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </div>

      <GlassButton
        onClick={onSubmit}
        style={{
          width: "100%",
          padding: "14px 0",
          background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          border: "none",
        }}
      >
        この位置で決める
      </GlassButton>
    </div>
  );
}

/** Reveal card with animation */
function RevealCard({
  label,
  answer,
  color,
  borderColor,
  delay,
  revealStyle,
}: {
  label: string;
  answer: string;
  color: string;
  borderColor: string;
  delay: number;
  revealStyle: string;
}) {
  const [displayedText, setDisplayedText] = useState("");
  const [fullyRevealed, setFullyRevealed] = useState(false);

  useEffect(() => {
    if (revealStyle === "simultaneous") {
      const id = setTimeout(() => {
        setDisplayedText(answer);
        setFullyRevealed(true);
      }, delay * 1000);
      return () => clearTimeout(id);
    }

    if (revealStyle === "word_by_word") {
      const chars = answer.split("");
      let i = 0;
      const baseDelay = delay * 1000;
      const id = setTimeout(() => {
        const interval = setInterval(() => {
          if (i < chars.length) {
            setDisplayedText(chars.slice(0, i + 1).join(""));
            i++;
          } else {
            clearInterval(interval);
            setFullyRevealed(true);
          }
        }, 60);
        return () => clearInterval(interval);
      }, baseDelay);
      return () => clearTimeout(id);
    }

    // gradual
    const baseDelay = delay * 1000;
    const id = setTimeout(() => {
      setDisplayedText(answer);
      setFullyRevealed(true);
    }, baseDelay);
    return () => clearTimeout(id);
  }, [answer, delay, revealStyle]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      style={{
        flex: 1,
        padding: "14px 16px",
        borderRadius: 14,
        background: color,
        border: `1px solid ${borderColor}`,
        backdropFilter: "blur(8px)",
        minHeight: 80,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "rgba(255,255,255,0.5)",
          marginBottom: 6,
          letterSpacing: 1,
        }}
      >
        {label}
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: fullyRevealed ? 1 : 0.7 }}
        style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.9)",
          lineHeight: 1.6,
        }}
      >
        {displayedText || "\u00A0"}
      </motion.div>
    </motion.div>
  );
}

/** Static answer bubble for insight phase */
function AnswerBubble({
  label,
  answer,
  color,
}: {
  label: string;
  answer: string;
  color: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: "12px 14px",
        borderRadius: 14,
        background: color,
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "rgba(255,255,255,0.4)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>
        {answer}
      </div>
    </div>
  );
}

/** Resonance score ring */
function ResonanceScoreRing({
  score,
  type,
}: {
  score: number;
  type: SyncResonanceType;
}) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const colors = RESONANCE_COLORS[type];
  const label = RESONANCE_LABELS[type];

  return (
    <div style={{ position: "relative", width: 100, height: 100, margin: "0 auto" }}>
      <svg width={100} height={100} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={50}
          cy={50}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={5}
        />
        <motion.circle
          cx={50}
          cy={50}
          r={radius}
          fill="none"
          stroke={colors[0]}
          strokeWidth={5}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: colors[0],
            lineHeight: 1,
          }}
        >
          {score}
        </motion.span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 600, marginTop: 2 }}>
          {label}
        </span>
      </div>
    </div>
  );
}

/** Resonance-type particles animation */
function ResonanceParticles({ type }: { type: SyncResonanceType }) {
  const colors = RESONANCE_COLORS[type];
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 300 - 150,
    y: Math.random() * 300 - 150,
    size: 4 + Math.random() * 8,
    color: colors[i % colors.length],
    duration: 1.5 + Math.random() * 1.5,
    delay: Math.random() * 0.5,
  }));

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      }}
    >
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
          animate={{
            x: p.x,
            y: p.y,
            opacity: 0,
            scale: 1,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: "easeOut",
          }}
          style={{
            position: "absolute",
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: p.color,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
          }}
        />
      ))}
    </div>
  );
}

/** Ambient background particles */
function AmbientParticles() {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    left: `${10 + Math.random() * 80}%`,
    top: `${10 + Math.random() * 80}%`,
    size: 2 + Math.random() * 3,
    duration: 4 + Math.random() * 4,
    delay: Math.random() * 3,
  }));

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          animate={{
            opacity: [0, 0.4, 0],
            scale: [0.5, 1.2, 0.5],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            position: "absolute",
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: "rgba(139,92,246,0.6)",
          }}
        />
      ))}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function formatAnswer(answer: string | null, question: SyncQuestion): string {
  if (!answer) return "(未回答)";

  if (question.answerType === "choice") {
    const opt = question.options?.find((o) => o.id === answer);
    return opt ? `${opt.emoji} ${opt.label}` : answer;
  }

  if (question.answerType === "scale" && question.scaleRange) {
    const val = parseFloat(answer);
    if (!isNaN(val)) {
      const range = question.scaleRange;
      const percent = ((val - range.min) / (range.max - range.min)) * 100;
      if (percent < 30) return `${range.minLabel}寄り (${Math.round(val)})`;
      if (percent > 70) return `${range.maxLabel}寄り (${Math.round(val)})`;
      return `中間 (${Math.round(val)})`;
    }
  }

  return answer;
}
