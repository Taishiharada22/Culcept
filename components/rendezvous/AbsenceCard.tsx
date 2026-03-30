"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";
import type { AbsenceSuggestion } from "@/lib/rendezvous/absenceDesign";

// =============================================================================
// Props
// =============================================================================

type AbsenceCardProps = {
  suggestion: AbsenceSuggestion;
  onAccept: () => void;
  onDecline: () => void;
  onCustomize: (hours: number) => void;
};

// =============================================================================
// Zen Circle SVG
// =============================================================================

function ZenCircle() {
  return (
    <motion.svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      className="mx-auto mb-4"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.2, ease: "easeOut" }}
    >
      <motion.circle
        cx="32"
        cy="32"
        r="28"
        fill="none"
        stroke="url(#zenGrad)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="176"
        strokeDashoffset="20"
        initial={{ strokeDashoffset: 176 }}
        animate={{ strokeDashoffset: 20 }}
        transition={{ duration: 2, ease: "easeInOut" }}
      />
      <defs>
        <linearGradient id="zenGrad" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
      </defs>
    </motion.svg>
  );
}

// =============================================================================
// AbsenceCard
// =============================================================================

export default function AbsenceCard({
  suggestion,
  onAccept,
  onDecline,
  onCustomize,
}: AbsenceCardProps) {
  const [showSlider, setShowSlider] = useState(false);
  const [customHours, setCustomHours] = useState(suggestion.suggestedHours);

  const handleCustomize = () => {
    if (showSlider) {
      onCustomize(customHours);
    } else {
      setShowSlider(true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <GlassCard className="relative overflow-hidden">
        {/* Deep blue/purple gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none rounded-2xl"
          style={{
            background:
              "linear-gradient(135deg, rgba(30,27,75,0.08) 0%, rgba(88,28,135,0.06) 50%, rgba(30,58,138,0.08) 100%)",
          }}
        />

        <div className="relative z-10 p-6 text-center">
          {/* Zen Circle */}
          <ZenCircle />

          {/* Poetic Message */}
          <motion.p
            className="text-lg font-medium text-slate-800 leading-relaxed mb-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            {suggestion.poeticMessage}
          </motion.p>

          {/* Reason */}
          <motion.p
            className="text-sm text-slate-500 mb-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.5 }}
          >
            {suggestion.reason}
          </motion.p>

          {/* Duration */}
          <motion.div
            className="mb-5 py-2 px-4 inline-block rounded-full bg-indigo-50/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.5 }}
          >
            <span className="text-sm text-indigo-600 font-medium">
              推奨：{suggestion.suggestedHours}時間の静寂
            </span>
          </motion.div>

          {/* Custom Slider */}
          <AnimatePresence>
            {showSlider && (
              <motion.div
                className="mb-5"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <input
                  type="range"
                  min={1}
                  max={72}
                  step={1}
                  value={customHours}
                  onChange={(e) => setCustomHours(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <p className="text-sm text-slate-600 mt-1">
                  {customHours}時間
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Buttons */}
          <motion.div
            className="flex flex-col gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.5 }}
          >
            <GlassButton onClick={onAccept}>受け入れる</GlassButton>
            <button
              onClick={handleCustomize}
              className="text-sm text-indigo-500 hover:text-indigo-700 transition-colors py-2"
            >
              {showSlider ? "この時間で始める" : "時間を変える"}
            </button>
            <button
              onClick={onDecline}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors py-1"
            >
              今はまだ
            </button>
          </motion.div>

          {/* Reunion Hint */}
          <motion.p
            className="mt-5 text-xs text-slate-400 italic"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 1.4, duration: 0.6 }}
          >
            再会のとき：{suggestion.reunionHint}
          </motion.p>
        </div>
      </GlassCard>
    </motion.div>
  );
}
