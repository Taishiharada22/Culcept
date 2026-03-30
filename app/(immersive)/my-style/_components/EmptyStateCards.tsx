"use client";

import React from "react";
import { motion } from "framer-motion";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";

/* ------------------------------------------------------------------ */
/*  Shared types & helpers                                            */
/* ------------------------------------------------------------------ */

interface EmptyStateProps {
  onAction: () => void;
  onDemo?: () => void;
}

const hiddenStyle = { opacity: 0, scale: 0.95, y: 16 };
const visibleStyle = { opacity: 1, scale: 1, y: 0 };
const containerTransition = { duration: 0.5, ease: "easeOut" as const };

function ProgressChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 border border-violet-200/60 px-3 py-1 text-xs font-medium text-violet-600">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
      </span>
      {label}
    </span>
  );
}

function DemoLink({ onDemo }: { onDemo?: () => void }) {
  if (!onDemo) return null;
  return (
    <button
      onClick={onDemo}
      className="mt-3 text-sm text-slate-400 hover:text-violet-500 transition-colors underline underline-offset-2 decoration-slate-300 hover:decoration-violet-400"
    >
      デモデータで体験
    </button>
  );
}

function Shell({
  children,
  gradient,
}: {
  children: React.ReactNode;
  gradient: string;
}) {
  return (
    <motion.div
      initial={hiddenStyle}
      animate={visibleStyle}
      transition={containerTransition}
      className="flex items-center justify-center py-12 px-4"
    >
      <GlassCard
        variant="gradient"
        padding="lg"
        hoverEffect={false}
        className="relative max-w-sm w-full text-center overflow-hidden"
      >
        {/* Subtle background gradient accent */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07] rounded-3xl"
          style={{ background: gradient }}
        />

        <div className="relative z-10 flex flex-col items-center gap-5">
          {children}
        </div>
      </GlassCard>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Wardrobe empty state                                              */
/* ------------------------------------------------------------------ */

export function WardrobeEmptyState({ onAction, onDemo }: EmptyStateProps) {
  return (
    <Shell gradient="linear-gradient(135deg, #ec4899 0%, #a855f7 100%)">
      <motion.span
        className="text-6xl"
        animate={{ rotate: [0, -6, 6, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      >
        👕
      </motion.span>

      <h3 className="text-lg font-bold text-slate-900">
        最初の一着が、すべてを動かす
      </h3>

      <p className="text-sm leading-relaxed text-slate-500">
        持っている服を登録すると、色の傾向・素材分析・コーデ提案が始まります
      </p>

      <ProgressChip label="あと1着で開始" />

      <GlassButton variant="primary" size="md" onClick={onAction}>
        アイテムを追加
      </GlassButton>

      <DemoLink onDemo={onDemo} />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/*  Setups empty state                                                */
/* ------------------------------------------------------------------ */

export function SetupsEmptyState({ onAction, onDemo }: EmptyStateProps) {
  return (
    <Shell gradient="linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)">
      <motion.span
        className="text-6xl"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        🎨
      </motion.span>

      <h3 className="text-lg font-bold text-slate-900">
        コーデを組む、実験する
      </h3>

      <p className="text-sm leading-relaxed text-slate-500">
        手持ちの服でコーディネートを作成。フラットレイで並べて、配色スコアも確認できます
      </p>

      <ProgressChip label="アイテムを2着以上登録すると解放" />

      <GlassButton variant="primary" size="md" onClick={onAction}>
        まず持ち物を登録
      </GlassButton>

      <DemoLink onDemo={onDemo} />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles empty state                                                */
/* ------------------------------------------------------------------ */

export function StylesEmptyState({ onAction, onDemo }: EmptyStateProps) {
  return (
    <Shell gradient="linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)">
      <motion.span
        className="text-6xl"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      >
        🔮
      </motion.span>

      <h3 className="text-lg font-bold text-slate-900">
        あなたのスタイル言語を発見する
      </h3>

      <p className="text-sm leading-relaxed text-slate-500">
        スワイプで好みを学習。あなただけのスタイル軸が浮かび上がります
      </p>

      <GlassButton variant="gradient" size="md" onClick={onAction}>
        スワイプ学習を始める
      </GlassButton>

      <DemoLink onDemo={onDemo} />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/*  Identity empty state                                              */
/* ------------------------------------------------------------------ */

export function IdentityEmptyState({ onAction, onDemo }: EmptyStateProps) {
  return (
    <Shell gradient="linear-gradient(135deg, #10b981 0%, #3b82f6 100%)">
      <motion.span
        className="text-6xl"
        animate={{ rotateY: [0, 360] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        🧬
      </motion.span>

      <h3 className="text-lg font-bold text-slate-900">
        12軸のスタイルDNAが待っている
      </h3>

      <p className="text-sm leading-relaxed text-slate-500">
        5着以上の登録とスタイル学習で、あなたの深層スタイル傾向を12軸で可視化します
      </p>

      <ProgressChip label="あと○着 + スワイプ学習で解放" />

      <GlassButton variant="primary" size="md" onClick={onAction}>
        持ち物を登録
      </GlassButton>

      <DemoLink onDemo={onDemo} />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/*  Insights empty state                                              */
/* ------------------------------------------------------------------ */

export function InsightsEmptyState({ onAction, onDemo }: EmptyStateProps) {
  return (
    <Shell gradient="linear-gradient(135deg, #6366f1 0%, #ec4899 50%, #f59e0b 100%)">
      <motion.span
        className="text-6xl"
        animate={{ opacity: [1, 0.6, 1], scale: [1, 1.05, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        🌌
      </motion.span>

      <h3 className="text-lg font-bold text-slate-900">
        全機能が交差する場所
      </h3>

      <p className="text-sm leading-relaxed text-slate-500">
        DNA・ペルソナ・素材・考古学の全データが統合され、あなただけのインサイトが生まれます
      </p>

      <ProgressChip label="各機能のデータが揃うと解放" />

      <GlassButton variant="gradient" size="md" onClick={onAction}>
        データを育てる
      </GlassButton>

      <DemoLink onDemo={onDemo} />
    </Shell>
  );
}
