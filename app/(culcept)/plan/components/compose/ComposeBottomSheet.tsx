"use client";

/**
 * ComposeBottomSheet — 予定追加 compose 専用のボトムシート（P2-1）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md（UI fidelity pass 2）
 *
 * CEO 2026-06-01: 予定作成は**全画面にしない**。**下端アンカーのボトムシート**にし、
 * **上側（シート外）タップ / grabber / Escape で閉じる**程度の素直なもの。
 *
 * 不変原則:
 *   - 共有 `GlassModal` は触らない（本コンポーネントは compose 専用）。
 *   - 全画面 add view にはしない（max-h で画面内に収め、内部スクロールで逃がす）。
 *   - safe-area 対応。背景の Plan 本体は破壊しない（fixed overlay）。
 */

import { useEffect } from "react";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

export interface ComposeBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function ComposeBottomSheet({
  isOpen,
  onClose,
  children,
}: ComposeBottomSheetProps) {
  const reduce = useReducedMotion();

  // Escape で閉じる（a11y）。
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="予定をつくる"
    >
      {/* 背景（上側＝シート外タップで閉じる） */}
      <div
        data-testid="compose-sheet-backdrop"
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
      />

      {/* シート本体（下端アンカー・全画面化しない） */}
      <motion.div
        initial={reduce ? false : { y: "100%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-3xl border border-white/70 bg-white/95 shadow-2xl shadow-black/20 backdrop-blur-2xl"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
      >
        {/* grabber（タップでも閉じる） */}
        <button
          type="button"
          data-testid="compose-sheet-grabber"
          aria-label="閉じる"
          onClick={onClose}
          className="mx-auto mt-2 flex h-6 w-full max-w-[140px] shrink-0 items-center justify-center"
        >
          <span className="h-1.5 w-10 rounded-full bg-slate-300" />
        </button>

        {/* 内容（内部スクロール＝キーボード時に逃がす） */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-1">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
