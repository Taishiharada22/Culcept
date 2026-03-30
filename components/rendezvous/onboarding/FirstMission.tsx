"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton, GlassBadge } from "@/components/ui/glassmorphism-design";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

type Props = {
  onComplete: (data: {
    selectedQuestions: string[];
    enabledCategories: RendezvousCategory[];
  }) => void;
  saving?: boolean;
};

const QUESTIONS = [
  { id: "q1", label: "休日の過ごし方は？", emoji: "🏖️" },
  { id: "q2", label: "最近感動したことは？", emoji: "🥹" },
  { id: "q3", label: "人生で大切にしていることは？", emoji: "💎" },
  { id: "q4", label: "笑いのツボは？", emoji: "😂" },
  { id: "q5", label: "朝型？夜型？", emoji: "🌅" },
  { id: "q6", label: "ストレス解消法は？", emoji: "🧘" },
  { id: "q7", label: "最近ハマっていることは？", emoji: "🔥" },
  { id: "q8", label: "5年後の自分はどうなっていたい？", emoji: "🔮" },
] as const;

const CATEGORIES: {
  key: RendezvousCategory;
  label: string;
  emoji: string;
  color: string;
}[] = [
  { key: "romantic", label: "恋愛", emoji: "💕", color: "#FF6B9D" },
  { key: "friendship", label: "友達", emoji: "👥", color: "#4AEAFF" },
  { key: "cocreation", label: "共創", emoji: "💡", color: "#D4A017" },
  { key: "community", label: "コミュニティ", emoji: "🌍", color: "#8B5CF6" },
];

const MAX_QUESTIONS = 3;

export default function FirstMission({ onComplete, saving }: Props) {
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [enabledCategories, setEnabledCategories] = useState<RendezvousCategory[]>(["friendship"]);
  const [departed, setDeparted] = useState(false);

  const toggleQuestion = useCallback((id: string) => {
    setSelectedQuestions((prev) => {
      if (prev.includes(id)) return prev.filter((q) => q !== id);
      if (prev.length >= MAX_QUESTIONS) return prev;
      return [...prev, id];
    });
  }, []);

  const toggleCategory = useCallback((key: RendezvousCategory) => {
    setEnabledCategories((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key],
    );
  }, []);

  const handleDeparture = useCallback(() => {
    setDeparted(true);
    setTimeout(() => {
      onComplete({ selectedQuestions, enabledCategories });
    }, 1500);
  }, [selectedQuestions, enabledCategories, onComplete]);

  const canSubmit =
    selectedQuestions.length > 0 &&
    selectedQuestions.length <= MAX_QUESTIONS &&
    enabledCategories.length > 0;

  return (
    <div className="relative flex flex-col items-center min-h-[100dvh] px-5 pt-12 pb-8 overflow-hidden">
      {/* Avatar departure animation */}
      <AnimatePresence>
        {departed && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-center">
              <motion.div
                initial={{ x: 0, opacity: 1 }}
                animate={{ x: 300, opacity: 0 }}
                transition={{ duration: 1.2, ease: "easeIn" }}
                className="text-6xl mb-6 inline-block"
              >
                🌟
              </motion.div>
              {/* Trail particles */}
              {Array.from({ length: 8 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1.5 h-1.5 rounded-full bg-purple-400"
                  style={{ top: "50%", left: "50%" }}
                  initial={{ x: 0, opacity: 0 }}
                  animate={{
                    x: 100 + i * 25,
                    opacity: [0, 0.8, 0],
                    scale: [0, 1, 0],
                  }}
                  transition={{
                    duration: 1,
                    delay: i * 0.08,
                    ease: "easeOut",
                  }}
                />
              ))}
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="text-sm font-semibold text-slate-600"
              >
                24時間以内に最初のレポートが届きます
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8 w-full max-w-sm"
      >
        <h2 className="text-xl font-extrabold text-slate-900 mb-2">
          アバターに最初に聞いてほしいこと
        </h2>
        <p className="text-sm text-slate-500">
          3つまで選べます（{selectedQuestions.length}/{MAX_QUESTIONS}）
        </p>
      </motion.div>

      {/* Question cards */}
      <div className="w-full max-w-sm grid grid-cols-2 gap-3 mb-8">
        {QUESTIONS.map((q, i) => {
          const isSelected = selectedQuestions.includes(q.id);
          const isDisabled =
            !isSelected && selectedQuestions.length >= MAX_QUESTIONS;

          return (
            <motion.button
              key={q.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => toggleQuestion(q.id)}
              disabled={isDisabled}
              className={`
                relative rounded-2xl p-4 text-left transition-all duration-200
                ${
                  isSelected
                    ? "bg-gradient-to-br from-violet-500/10 to-pink-500/10 border-2 border-violet-400 shadow-lg shadow-violet-500/10"
                    : "bg-white/70 backdrop-blur-lg border border-slate-200/60 hover:border-slate-300"
                }
                ${isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              <span className="text-2xl block mb-2">{q.emoji}</span>
              <span className="text-xs font-semibold text-slate-700 leading-snug">
                {q.label}
              </span>
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center"
                >
                  <span className="text-white text-xs font-bold">✓</span>
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Category selection */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="w-full max-w-sm mb-8"
      >
        <h3 className="text-sm font-bold text-slate-700 mb-3">
          有効にするカテゴリ
        </h3>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => {
            const isActive = enabledCategories.includes(cat.key);
            return (
              <button
                key={cat.key}
                onClick={() => toggleCategory(cat.key)}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all duration-200
                  ${
                    isActive
                      ? "text-white shadow-lg"
                      : "bg-white/70 backdrop-blur-lg border border-slate-200/60 text-slate-600 hover:border-slate-300"
                  }
                `}
                style={
                  isActive
                    ? { backgroundColor: cat.color, boxShadow: `0 4px 14px ${cat.color}40` }
                    : undefined
                }
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Departure button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="w-full max-w-sm"
      >
        <GlassButton
          variant="gradient"
          fullWidth
          onClick={handleDeparture}
          disabled={!canSubmit || saving || departed}
          loading={saving}
        >
          送り出す →
        </GlassButton>
      </motion.div>
    </div>
  );
}
