"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassButton } from "@/components/ui/glassmorphism-design";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Props {
  pastRevelation?: { quote: string; date: string; emotion: string };
  contradiction?: {
    statement1: string;
    statement2: string;
    date1: string;
    date2: string;
  };
  avoidedTopic?: string;
  trustLevel: number; // 0-1
  onDismiss: () => void;
  onEngage: () => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Dismissal Tracking
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DISMISSAL_KEY = "stargazer_alter_confrontation_dismissals_v1";

function trackDismissal(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(DISMISSAL_KEY);
    const data: { count: number; dates: string[] } = raw
      ? JSON.parse(raw)
      : { count: 0, dates: [] };
    data.count += 1;
    data.dates.push(new Date().toISOString().slice(0, 10));
    // Keep only last 30 entries
    if (data.dates.length > 30) data.dates = data.dates.slice(-30);
    localStorage.setItem(DISMISSAL_KEY, JSON.stringify(data));
  } catch {
    // Non-fatal
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Confrontation Text Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildConfrontationText(props: Props): string {
  const { trustLevel, pastRevelation, contradiction, avoidedTopic } = props;

  // High trust (0.6+): Provocative confrontation about avoided topics
  if (trustLevel >= 0.6 && avoidedTopic) {
    return `......ねえ、${avoidedTopic}の話、ずっと避けてるよね。\n何回目の対話だっけ。もうそろそろいいんじゃない？`;
  }

  // Medium trust (0.3-0.6): Direct observation of contradictions
  if (trustLevel >= 0.3 && contradiction) {
    return `前回、あなたは「${contradiction.statement1.slice(0, 50)}」と言った。\nでも${contradiction.date2}には「${contradiction.statement2.slice(0, 50)}」。\n——どっちが本当のあなた？`;
  }

  // Low trust (< 0.3): Gentle opening referencing past revelation
  if (pastRevelation) {
    return `前回の続き、少し気になっていた。\nあなたが言った「${pastRevelation.quote.slice(0, 60)}」——覚えてる？`;
  }

  // Fallback for any trust level
  if (contradiction) {
    return `前回、あなたは「${contradiction.statement1.slice(0, 50)}」と言った。\nでも${contradiction.date2}には「${contradiction.statement2.slice(0, 50)}」。\n——どっちが本当のあなた？`;
  }

  if (avoidedTopic) {
    return `......${avoidedTopic}のこと、そろそろ話してみない？`;
  }

  return "......前回の対話のこと、ずっと考えてた。";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Typewriter Hook
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function useTypewriter(text: string, enabled: boolean, charDelay = 40): string {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!enabled) {
      setDisplayed("");
      return;
    }

    setDisplayed("");
    let index = 0;
    const timer = setInterval(() => {
      if (index < text.length) {
        setDisplayed(text.slice(0, index + 1));
        index++;
      } else {
        clearInterval(timer);
      }
    }, charDelay);

    return () => clearInterval(timer);
  }, [text, enabled, charDelay]);

  return displayed;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function AlterMemoryConfrontation(props: Props) {
  const { onDismiss, onEngage } = props;
  const [phase, setPhase] = useState<"silence" | "typing" | "complete">(
    "silence",
  );
  const [visible, setVisible] = useState(true);

  const confrontationText = buildConfrontationText(props);

  // 3-second silence before text appears
  useEffect(() => {
    const silenceTimer = setTimeout(() => {
      setPhase("typing");
    }, 3000);

    return () => clearTimeout(silenceTimer);
  }, []);

  // Typewriter effect
  const typedText = useTypewriter(
    confrontationText,
    phase === "typing" || phase === "complete",
  );

  // Mark complete when fully typed
  useEffect(() => {
    if (phase === "typing" && typedText === confrontationText) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived state transition
      setPhase("complete");
    }
  }, [typedText, confrontationText, phase]);

  const handleDismiss = useCallback(() => {
    trackDismissal();
    setVisible(false);
    // Allow exit animation to complete
    setTimeout(onDismiss, 400);
  }, [onDismiss]);

  const handleEngage = useCallback(() => {
    setVisible(false);
    setTimeout(onEngage, 400);
  }, [onEngage]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.22 }}
          className="w-full max-w-lg mx-auto mb-6"
        >
          {/* Dark glassmorphism card with purple tint */}
          <motion.div
            className="relative overflow-hidden rounded-3xl border border-purple-500/20"
            style={{
              background:
                "linear-gradient(135deg, rgba(30,10,50,0.92) 0%, rgba(50,20,80,0.88) 50%, rgba(25,10,45,0.94) 100%)",
              backdropFilter: "blur(20px)",
              boxShadow:
                "0 0 40px rgba(128,0,255,0.08), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            {/* Subtle purple glow at top */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse, rgba(168,85,247,0.15) 0%, transparent 70%)",
              }}
            />

            <div className="relative p-6">
              {/* Alter identity indicator */}
              <div className="flex items-center gap-2 mb-4">
                <motion.div
                  className="w-2 h-2 rounded-full bg-purple-400"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-[11px] font-medium text-purple-300/70 tracking-wider">
                  もうひとりの自分
                </span>
              </div>

              {/* Silence phase: blank with subtle breathing */}
              {phase === "silence" && (
                <motion.div
                  className="min-h-[60px] flex items-center"
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <span className="text-purple-300/40 text-sm">......</span>
                </motion.div>
              )}

              {/* Typing / Complete phase */}
              {(phase === "typing" || phase === "complete") && (
                <div className="min-h-[60px]">
                  <p className="text-sm leading-relaxed text-purple-50/90 whitespace-pre-line font-light">
                    {typedText}
                    {phase === "typing" && (
                      <motion.span
                        className="inline-block w-[2px] h-[14px] bg-purple-300/60 ml-0.5 align-middle"
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                      />
                    )}
                  </p>
                </div>
              )}

              {/* Action buttons (appear after text is complete) */}
              <AnimatePresence>
                {phase === "complete" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.22 }}
                    className="flex items-center gap-3 mt-6"
                  >
                    <GlassButton
                      variant="gradient"
                      size="sm"
                      onClick={handleEngage}
                      className="flex-1"
                    >
                      話してみる
                    </GlassButton>
                    <button
                      onClick={handleDismiss}
                      className="px-4 py-2 text-sm text-purple-300/60 hover:text-purple-200/80 transition-colors rounded-xl hover:bg-white/5"
                    >
                      今日は別の話がいい
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
