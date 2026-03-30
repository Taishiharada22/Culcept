"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassButton,
} from "@/components/ui/glassmorphism-design";
import type { SavedState } from "../_lib/types";
import { createDemoState, DEMO_WARDROBE } from "../_lib/demoData";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OnboardingWizardProps {
  onStartAdding: () => void;
  onLoadDemo: (demoState: Partial<SavedState>) => void;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Shared animation variants
// ---------------------------------------------------------------------------

const pageVariants = {
  enter: { opacity: 0, x: 60 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -60 },
};

const pageTrans = { duration: 0.45, ease: "easeOut" as const };

// ---------------------------------------------------------------------------
// Feature preview data
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    emoji: "\u{1F9EC}",
    title: "\u30B9\u30BF\u30A4\u30EBDNA",
    desc: "\u3042\u306A\u305F\u3060\u3051\u306E12\u8EF8\u30EC\u30FC\u30C0\u30FC",
    gradient: "from-violet-500/20 to-indigo-500/20",
    border: "border-violet-200/60",
  },
  {
    emoji: "\u{1F454}",
    title: "\u30B3\u30FC\u30C7\u63D0\u6848",
    desc: "AI\u304C\u6700\u9069\u306A\u7D44\u307F\u5408\u308F\u305B\u3092\u767A\u898B",
    gradient: "from-pink-500/20 to-rose-500/20",
    border: "border-pink-200/60",
  },
  {
    emoji: "\u{1F50D}",
    title: "\u7D20\u6750\u30EA\u30C6\u30E9\u30B7\u30FC",
    desc: "\u30EF\u30FC\u30C9\u30ED\u30FC\u30D6\u306E\u7D20\u6750\u50BE\u5411\u3092\u53EF\u8996\u5316",
    gradient: "from-amber-500/20 to-orange-500/20",
    border: "border-amber-200/60",
  },
] as const;

// ---------------------------------------------------------------------------
// Quick-start step visuals
// ---------------------------------------------------------------------------

const QUICK_STEPS = [
  {
    num: "1",
    label: "\u30AB\u30C6\u30B4\u30EA",
    icon: (
      <svg
        className="w-7 h-7 text-violet-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 8.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z"
        />
      </svg>
    ),
  },
  {
    num: "2",
    label: "\u30AB\u30E9\u30FC",
    icon: (
      <svg
        className="w-7 h-7 text-pink-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072"
        />
      </svg>
    ),
  },
  {
    num: "3",
    label: "\u540D\u524D",
    icon: (
      <svg
        className="w-7 h-7 text-amber-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
        />
      </svg>
    ),
  },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingWizard({
  onStartAdding,
  onLoadDemo,
  onDismiss,
}: OnboardingWizardProps) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);

  // ── Demo loading animation ──
  const handleLoadDemo = useCallback(() => {
    setStep(2);
    setLoadingDemo(true);
    setLoadedCount(0);

    // Simulate loading items one by one
    const total = DEMO_WARDROBE.length;
    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      setLoadedCount(current);
      if (current >= total) {
        clearInterval(interval);
        setLoadingDemo(false);
      }
    }, 120);
  }, []);

  const handleFinishDemo = useCallback(() => {
    onLoadDemo(createDemoState());
  }, [onLoadDemo]);

  return (
    <div id="onboarding-overlay" className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 backdrop-blur-sm">
    <div className="relative w-full max-w-lg mx-auto px-4 py-12">
      {/* Background glow */}
      <div
        className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[480px] h-[480px] rounded-full opacity-30"
        style={{
          background:
            "radial-gradient(circle, rgba(139,92,246,0.25) 0%, rgba(236,72,153,0.15) 40%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      {/* Skip button */}
      <div className="relative z-10 flex justify-end mb-2">
        <button
          onClick={onDismiss}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1"
        >
          スキップ
        </button>
      </div>

      {/* Step indicator */}
      <div className="relative z-10 flex justify-center gap-2 mb-8">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-1 rounded-full"
            animate={{
              width: step === i ? 32 : 12,
              backgroundColor:
                step === i ? "rgb(139,92,246)" : "rgb(203,213,225)",
            }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>

      {/* Screens */}
      <AnimatePresence mode="wait">
        {/* ── Screen 0: Welcome ── */}
        {step === 0 && (
          <motion.div
            key="welcome"
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTrans}
            className="relative z-10"
          >
            <div className="text-center mb-8">
              <motion.h1
                className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5 }}
              >
                あなたの輪郭を、
                <br />
                ここから育てる
              </motion.h1>
              <motion.p
                className="mt-4 text-sm text-slate-500 leading-relaxed max-w-xs mx-auto"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.5 }}
              >
                持っている服を登録するだけで、スタイルDNA・コーデ提案・素材分析が動き出します
              </motion.p>
            </div>

            {/* Feature cards */}
            <div className="flex flex-col gap-3 mb-8">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1, duration: 0.45 }}
                >
                  <GlassCard
                    variant="gradient"
                    padding="sm"
                    hoverEffect={false}
                    className={`border ${f.border}`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${f.gradient} flex items-center justify-center text-2xl shrink-0`}
                      >
                        {f.emoji}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-sm">
                          {f.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {f.desc}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-3">
              <GlassButton
                variant="gradient"
                size="lg"
                fullWidth
                onClick={handleLoadDemo}
              >
                体験してみる →
              </GlassButton>
              <GlassButton
                variant="secondary"
                size="lg"
                fullWidth
                onClick={() => setStep(1)}
              >
                自分の服を登録する →
              </GlassButton>
            </div>
          </motion.div>
        )}

        {/* ── Screen 1: Quick Start Guide ── */}
        {step === 1 && (
          <motion.div
            key="guide"
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTrans}
            className="relative z-10"
          >
            <div className="text-center mb-8">
              <motion.h2
                className="text-2xl font-bold text-slate-900"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                3つの情報だけでOK
              </motion.h2>
              <motion.p
                className="mt-3 text-sm text-slate-500 max-w-xs mx-auto"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                まずは3着から始めましょう。
                <br />
                あとから詳しく編集できます。
              </motion.p>
            </div>

            {/* Steps visual */}
            <div className="flex justify-center items-start gap-4 mb-10">
              {QUICK_STEPS.map((s, i) => (
                <motion.div
                  key={s.num}
                  className="flex flex-col items-center gap-2 w-24"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.12 }}
                >
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-white/80 backdrop-blur-lg border border-slate-200/60 shadow-lg flex items-center justify-center">
                      {s.icon}
                    </div>
                    <span className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white text-xs font-bold flex items-center justify-center shadow-md">
                      {s.num}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-slate-700">
                    {s.label}
                  </span>

                  {/* Connector arrow (not on last) */}
                  {i < QUICK_STEPS.length - 1 && (
                    <motion.div
                      className="absolute"
                      style={{
                        left: `calc(${(i + 1) * 33}% - 8px)`,
                        top: "32px",
                      }}
                    />
                  )}
                </motion.div>
              ))}
            </div>

            {/* Connector arrows between steps */}
            <div className="flex justify-center items-center gap-0 -mt-[72px] mb-8 px-8 pointer-events-none">
              <div className="w-24" />
              <svg
                className="w-6 h-6 text-slate-300 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              <div className="w-24" />
              <svg
                className="w-6 h-6 text-slate-300 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              <div className="w-24" />
            </div>

            <GlassButton
              variant="primary"
              size="lg"
              fullWidth
              onClick={onStartAdding}
            >
              最初のアイテムを追加 →
            </GlassButton>

            <button
              onClick={() => setStep(0)}
              className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600 transition-colors py-2"
            >
              ← 戻る
            </button>
          </motion.div>
        )}

        {/* ── Screen 2: Demo Loading ── */}
        {step === 2 && (
          <motion.div
            key="demo"
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTrans}
            className="relative z-10"
          >
            <div className="text-center mb-8">
              <motion.h2
                className="text-2xl font-bold text-slate-900"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                {loadingDemo
                  ? "サンプルデータを読み込み中..."
                  : "準備完了！"}
              </motion.h2>
            </div>

            {/* Loading animation */}
            <GlassCard variant="elevated" padding="lg" hoverEffect={false}>
              {/* Progress bar */}
              <div className="mb-6">
                <div className="flex justify-between text-xs text-slate-500 mb-2">
                  <span>読み込み中</span>
                  <span>
                    {loadedCount} / {DEMO_WARDROBE.length}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 via-pink-500 to-amber-500"
                    initial={{ width: "0%" }}
                    animate={{
                      width: `${(loadedCount / DEMO_WARDROBE.length) * 100}%`,
                    }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                  />
                </div>
              </div>

              {/* Item pills appearing */}
              <div className="flex flex-wrap gap-2 min-h-[80px]">
                {DEMO_WARDROBE.slice(0, loadedCount).map((item, i) => (
                  <motion.span
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.25 }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200/60 text-xs font-medium text-slate-700 shadow-sm"
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0 border border-slate-200/40"
                      style={{ backgroundColor: item.colorHex ?? "#ccc" }}
                    />
                    {item.name}
                  </motion.span>
                ))}
              </div>

              {/* Loaded message */}
              <AnimatePresence>
                {!loadingDemo && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mt-6 text-center"
                  >
                    <p className="text-sm text-slate-600 mb-1">
                      <span className="font-bold text-violet-600">
                        {DEMO_WARDROBE.length}着
                      </span>
                      のサンプルデータを読み込みました
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      すべての機能を体験できます。
                      <br />
                      いつでもリセットして自分のデータに切り替えられます。
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>

            {/* CTA */}
            <motion.div
              className="mt-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: loadingDemo ? 0.4 : 1 }}
              transition={{ duration: 0.3 }}
            >
              <GlassButton
                variant="gradient"
                size="lg"
                fullWidth
                disabled={loadingDemo}
                onClick={handleFinishDemo}
              >
                体験を始める
              </GlassButton>
            </motion.div>

            <button
              onClick={() => setStep(0)}
              className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600 transition-colors py-2"
            >
              ← 戻る
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </div>
  );
}
