"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface SelfGapDimension {
  dimension: string;
  label: string;
  normalValue: number;
  stressedValue: number;
  gap: number;
}

interface StateMirrorProps {
  selfGap: SelfGapDimension[] | null;
  onStateChange?: (state: string) => void;
}

const STATES = [
  { key: "normal", label: "通常", icon: "☀️" },
  { key: "tired", label: "疲れ", icon: "🌙" },
  { key: "excited", label: "高揚", icon: "⚡" },
  { key: "tense", label: "緊張", icon: "🌀" },
] as const;

type StateKey = (typeof STATES)[number]["key"];

function gapColor(gap: number): string {
  const abs = Math.abs(gap);
  if (abs > 0.3) return "text-rose-500";
  if (abs < 0.1) return "text-emerald-500";
  return "text-amber-500";
}

function gapBgColor(gap: number): string {
  const abs = Math.abs(gap);
  if (abs > 0.3) return "bg-rose-400";
  if (abs < 0.1) return "bg-emerald-400";
  return "bg-amber-400";
}

function barColor(highlighted: boolean): string {
  return highlighted ? "bg-violet-500" : "bg-slate-300";
}

/** Convert a -1..1 value to a 0..100 percentage for bar positioning */
function toPercent(v: number): number {
  return Math.round(((v + 1) / 2) * 100);
}

function computeDisplayValue(
  dim: SelfGapDimension,
  state: StateKey,
): { primary: number; secondary: number | null; showGap: boolean } {
  switch (state) {
    case "normal":
      return { primary: dim.normalValue, secondary: null, showGap: false };
    case "tired":
    case "tense":
      return {
        primary: dim.stressedValue,
        secondary: dim.normalValue,
        showGap: true,
      };
    case "excited":
      return {
        primary: Math.min(1, dim.normalValue + Math.abs(dim.gap) * 0.3),
        secondary: null,
        showGap: false,
      };
    default:
      return { primary: dim.normalValue, secondary: null, showGap: false };
  }
}

function DimensionBar({
  dim,
  state,
}: {
  dim: SelfGapDimension;
  state: StateKey;
}) {
  const { primary, secondary, showGap } = computeDisplayValue(dim, state);
  const primaryPct = toPercent(primary);
  const secondaryPct = secondary !== null ? toPercent(secondary) : null;

  const left = secondaryPct !== null ? Math.min(primaryPct, secondaryPct) : primaryPct;
  const right = secondaryPct !== null ? Math.max(primaryPct, secondaryPct) : primaryPct;
  const gapWidth = right - left;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">{dim.label}</span>
        {showGap && (
          <span className={`text-[10px] font-semibold ${gapColor(dim.gap)}`}>
            差分 {Math.abs(dim.gap).toFixed(2)}
          </span>
        )}
      </div>

      {/* Bar track */}
      <div className="relative h-3 w-full rounded-full bg-slate-100">
        {/* Gap zone */}
        {showGap && gapWidth > 0 && (
          <motion.div
            className={`absolute top-0 h-full rounded-full opacity-25 ${gapBgColor(dim.gap)}`}
            initial={{ left: `${left}%`, width: 0 }}
            animate={{ left: `${left}%`, width: `${gapWidth}%` }}
            transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
          />
        )}

        {/* Secondary marker (normal baseline when in stress state) */}
        {secondaryPct !== null && (
          <motion.div
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-400 shadow-sm"
            initial={{ left: `${secondaryPct}%` }}
            animate={{ left: `${secondaryPct}%` }}
            transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
          />
        )}

        {/* Primary marker */}
        <motion.div
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ${barColor(true)}`}
          initial={{ left: `${primaryPct}%` }}
          animate={{ left: `${primaryPct}%` }}
          transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
        />

        {/* Gap arrow */}
        {showGap && gapWidth > 5 && (
          <motion.div
            className={`absolute top-1/2 -translate-y-1/2 h-0.5 ${gapBgColor(dim.gap)}`}
            style={{ left: `${left + 1}%` }}
            initial={{ width: 0 }}
            animate={{ width: `${gapWidth - 2}%` }}
            transition={{ duration: 0.6, ease: EASE_OUT_EXPO, delay: 0.15 }}
          />
        )}
      </div>

      {/* Scale labels */}
      <div className="flex justify-between">
        <span className="text-[9px] text-slate-400">-1.0</span>
        <span className="text-[9px] text-slate-400">0</span>
        <span className="text-[9px] text-slate-400">+1.0</span>
      </div>
    </div>
  );
}

export default function StateMirror({ selfGap, onStateChange }: StateMirrorProps) {
  const [selectedState, setSelectedState] = useState<StateKey>("normal");

  function handleStateChange(key: StateKey) {
    setSelectedState(key);
    onStateChange?.(key);
  }

  return (
    <div className="rounded-[24px] border border-white/70 bg-white/72 shadow-lg shadow-black/8 backdrop-blur-xl p-5">
      {/* Header */}
      <h3 className="mb-4 text-sm font-semibold text-slate-700">
        状態ミラー
      </h3>

      {/* State chips */}
      <div className="mb-5 flex flex-wrap gap-2">
        {STATES.map((s) => {
          const isSelected = selectedState === s.key;
          return (
            <motion.button
              key={s.key}
              onClick={() => handleStateChange(s.key)}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                isSelected
                  ? "bg-violet-500 text-white shadow-md"
                  : "bg-slate-100 text-slate-500"
              }`}
              whileTap={{ scale: 0.95 }}
              layout
            >
              <span className="mr-1">{s.icon}</span>
              {s.label}
            </motion.button>
          );
        })}
      </div>

      {/* Visualization */}
      <AnimatePresence mode="wait">
        {selfGap === null ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
            className="flex min-h-[120px] items-center justify-center rounded-2xl bg-slate-50 px-4"
          >
            <p className="text-center text-xs leading-relaxed text-slate-400">
              状態データが蓄積されると、
              <br />
              あなたの状態変化が見えてきます
            </p>
          </motion.div>
        ) : (
          <motion.div
            key={selectedState}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
            className="space-y-4"
          >
            {/* Legend */}
            {(selectedState === "tired" || selectedState === "tense") && (
              <div className="flex items-center gap-3 text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
                  {selectedState === "tired" ? "疲れ時" : "緊張時"}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
                  通常時
                </span>
              </div>
            )}

            {selfGap.map((dim) => (
              <DimensionBar
                key={dim.dimension}
                dim={dim}
                state={selectedState}
              />
            ))}

            {/* Summary note */}
            <p className="pt-1 text-[10px] leading-relaxed text-slate-400">
              {selectedState === "normal" && "現在の通常モードの傾向です"}
              {selectedState === "tired" && "疲れた時、通常との差が大きい次元に注意"}
              {selectedState === "excited" && "高揚時は通常値がやや増幅されます"}
              {selectedState === "tense" && "緊張時、通常との差が大きい次元に注意"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
