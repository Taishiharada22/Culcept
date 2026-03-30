"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { GlassButton, GlassBadge } from "@/components/ui/glassmorphism-design";
import type { FaceRefOption, FaceComparisonCategory } from "@/lib/face/references";
import type { CategorySelection } from "@/types/face-phenotype";

interface Props {
  category: FaceComparisonCategory;
  userImage: string;
  existing?: CategorySelection;
  onSelect: (selection: CategorySelection) => void;
}

export default function ComparisonStep({
  category,
  userImage,
  existing,
  onSelect,
}: Props) {
  const options = category.options;
  const initialIdx = existing?.primary
    ? Math.max(0, options.findIndex((o) => o.key === existing.primary))
    : 0;
  const [idx, setIdx] = useState(initialIdx);
  const [opacity, setOpacity] = useState(0.5);
  const [primarySelected, setPrimarySelected] = useState<string | null>(
    existing?.primary ?? null,
  );

  const current = options[idx];

  const next = useCallback(
    () => setIdx((i) => (i + 1) % options.length),
    [options.length],
  );
  const prev = useCallback(
    () => setIdx((i) => (i - 1 + options.length) % options.length),
    [options.length],
  );

  const handleDrag = useCallback(
    (_: unknown, info: PanInfo) => {
      if (Math.abs(info.offset.x) > 60) {
        info.offset.x > 0 ? prev() : next();
      }
    },
    [prev, next],
  );

  const handleConfirm = useCallback(() => {
    if (!primarySelected) {
      // First tap: set primary
      setPrimarySelected(current.key);
    } else if (primarySelected === current.key) {
      // Confirm primary (no runner-up)
      onSelect({ primary: primarySelected });
    } else {
      // Different from primary → this becomes runner-up
      onSelect({ primary: primarySelected, runner_up: current.key });
    }
  }, [primarySelected, current.key, onSelect]);

  return (
    <div className="space-y-4">
      <h3 className="text-center text-lg font-bold text-slate-800">
        {category.icon} {category.label}を比較
      </h3>

      {/* Comparison container */}
      <div
        className="relative w-full rounded-2xl overflow-hidden bg-black/30"
        style={{ aspectRatio: "3/4" }}
      >
        {/* User image (base layer) */}
        <img
          src={userImage}
          alt="あなたの顔"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Template overlay — text-based description card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 flex items-end justify-center p-4"
            style={{ opacity }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.3}
            onDragEnd={handleDrag}
          >
            <div className="w-full rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{current.icon}</span>
                <span className="text-lg font-bold text-white/90">
                  {current.label}
                </span>
              </div>
              <p className="text-sm text-white/70 leading-relaxed">
                {current.desc}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Type badge */}
        <div className="absolute top-3 left-3">
          <GlassBadge variant="info">
            {idx + 1} / {options.length}
          </GlassBadge>
        </div>

        {/* Primary marker */}
        {primarySelected === current.key && (
          <div className="absolute top-3 right-3">
            <GlassBadge variant="success">選択中</GlassBadge>
          </div>
        )}
      </div>

      {/* Opacity slider */}
      <div className="flex items-center gap-3 px-2">
        <span className="text-xs text-slate-400">薄</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="flex-1 accent-amber-500"
        />
        <span className="text-xs text-slate-400">濃</span>
      </div>

      {/* Candidate grid */}
      <div className="grid grid-cols-3 gap-2 px-1">
        {options.map((opt, i) => (
          <button
            key={opt.key}
            onClick={() => setIdx(i)}
            className={`rounded-xl p-2 text-center transition-all border-2 ${
              i === idx
                ? "border-amber-500/80 bg-amber-500/10"
                : primarySelected === opt.key
                  ? "border-green-500/50 bg-green-500/5"
                  : "border-slate-200 bg-white/60 hover:border-slate-300"
            }`}
          >
            <span className="text-xl block">{opt.icon}</span>
            <span className="text-[10px] text-slate-600 block mt-1 truncate">
              {opt.label}
            </span>
          </button>
        ))}
      </div>

      {/* Swipe hint */}
      <p className="text-center text-[11px] text-slate-400">
        左右スワイプで切り替え
      </p>

      {/* Confirm button */}
      <GlassButton onClick={handleConfirm} className="w-full">
        {!primarySelected
          ? `「${current.label}」が一番近い`
          : primarySelected === current.key
            ? "次点なしで確定する"
            : `「${current.label}」を次点にして確定`}
      </GlassButton>

      {/* Reset selection */}
      {primarySelected && (
        <button
          onClick={() => setPrimarySelected(null)}
          className="w-full text-xs text-slate-400 underline"
        >
          選び直す
        </button>
      )}
    </div>
  );
}
