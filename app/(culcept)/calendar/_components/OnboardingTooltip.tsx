"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const ONBOARDING_KEY = "culcept_calendar_onboarding_v1";

const STEPS = [
  {
    icon: "🎯",
    title: "SYNCスコアとは？",
    text: "気候・TPO・調和・動きやすさ・好みの5軸であなたのコーデを評価します",
  },
  {
    icon: "📊",
    title: "着用記録で賢くなる",
    text: "毎日の提案をタップして詳細を確認。着用後に満足度を記録すると、提案がどんどんあなた好みに",
  },
  {
    icon: "🌤️",
    title: "天気連動",
    text: "天気が変わると自動で再提案。予定を追加するとTPOも最適化されます",
  },
];

export default function OnboardingTooltip() {
  const [step, setStep] = useState(() => {
    if (typeof window === "undefined") return -1;
    try {
      const seen = localStorage.getItem(ONBOARDING_KEY);
      if (!seen) return 0;
    } catch { /* ignore */ }
    return -1;
  });
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return !!localStorage.getItem(ONBOARDING_KEY);
    } catch { return true; }
  });

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleDismiss();
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(ONBOARDING_KEY, "1");
    } catch {
      // ignore
    }
  };

  if (dismissed || step < 0) return null;

  const current = STEPS[step];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 12, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.95 }}
        className="rounded-2xl bg-gradient-to-br from-violet-500/90 to-indigo-600/90 backdrop-blur-md border border-white/20 p-4 shadow-lg shadow-violet-500/20"
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0">{current.icon}</span>
          <div className="flex-1">
            <p className="text-[11px] font-bold text-white mb-1">{current.title}</p>
            <p className="text-[10px] text-white/80 leading-relaxed">{current.text}</p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3">
          {/* ステップインジケーター */}
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i === step ? "bg-white w-4" : i < step ? "bg-white/60" : "bg-white/30"
                }`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleDismiss}
              className="text-[9px] text-white/50 hover:text-white/80 transition-colors"
            >
              スキップ
            </button>
            <motion.button
              onClick={handleNext}
              className="rounded-lg bg-white/20 hover:bg-white/30 px-3 py-1 text-[10px] font-bold text-white transition-all"
              whileTap={{ scale: 0.95 }}
            >
              {step < STEPS.length - 1 ? "次へ" : "はじめる"}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
