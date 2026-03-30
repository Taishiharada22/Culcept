// app/sns/profile/_components/PredictiveSelf.tsx
// 予測的自己 — シナリオ予測 & クローン精度
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ────────────────────────────────────────────── types */

interface Prediction {
  scenarioId: string;
  scenario: string;
  category: string;
  predictedChoice: { optionId: string; label: string; probability: number };
  distribution: Array<{
    optionId: string;
    label: string;
    probability: number;
  }>;
  confidence: number;
  cloneReasoning: string;
  contextSensitivity: number;
}

export interface PredictiveSelfProps {
  predictions: Prediction[];
  cloneAccuracy: number;
  cloneSummary: string;
}

/* ────────────────────────────────────────────── shared */

const CARD =
  "relative overflow-hidden rounded-2xl border border-white/70 bg-white/72 shadow-lg shadow-black/8 backdrop-blur-xl p-4";

/* ────────────────────────────────────────────── accuracy ring */

function AccuracyRing({ value }: { value: number }) {
  const pct = Math.min(Math.max(value, 0), 1);
  const R = 46;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - pct);

  return (
    <div className="relative flex items-center justify-center w-28 h-28 mx-auto">
      <svg viewBox="0 0 108 108" className="w-full h-full -rotate-90">
        <circle
          cx={54}
          cy={54}
          r={R}
          fill="none"
          stroke="rgba(148,163,184,0.15)"
          strokeWidth={8}
        />
        <motion.circle
          cx={54}
          cy={54}
          r={R}
          fill="none"
          stroke="url(#predGrad)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
        <defs>
          <linearGradient id="predGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold text-slate-800">
          {(pct * 100).toFixed(0)}
        </span>
        <span className="text-[10px] text-slate-400">%</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────── probability bar */

function ProbBar({
  probability,
  primary,
}: {
  probability: number;
  primary?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${
            primary
              ? "bg-gradient-to-r from-violet-500 to-purple-400"
              : "bg-slate-300"
          }`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(probability * 100, 100)}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </div>
      <span className="text-[11px] font-medium text-slate-500 w-10 text-right">
        {(probability * 100).toFixed(0)}%
      </span>
    </div>
  );
}

/* ────────────────────────────────────────────── prediction card */

function PredictionCard({
  prediction,
  index,
}: {
  prediction: Prediction;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      className={CARD}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.45 }}
    >
      {/* scenario */}
      <p className="text-sm font-semibold text-slate-700 mb-2">
        {prediction.scenario}
      </p>

      {/* predicted choice */}
      <div className="mb-1.5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-violet-600 font-medium">
            {prediction.predictedChoice.label}
          </span>
        </div>
        <ProbBar probability={prediction.predictedChoice.probability} primary />
      </div>

      {/* alternatives (distribution excluding predicted choice) */}
      {prediction.distribution.filter(d => d.optionId !== prediction.predictedChoice.optionId).length > 0 && (
        <div className="space-y-1 mb-2">
          {prediction.distribution
            .filter(d => d.optionId !== prediction.predictedChoice.optionId)
            .map((alt) => (
            <div key={alt.optionId}>
              <span className="text-[11px] text-slate-500">{alt.label}</span>
              <ProbBar probability={alt.probability} />
            </div>
          ))}
        </div>
      )}

      {/* confidence */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] text-slate-400">確信度</span>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`h-1.5 w-3 rounded-full ${
                n <= Math.round(prediction.confidence * 5)
                  ? "bg-violet-400"
                  : "bg-slate-200"
              }`}
            />
          ))}
        </div>
      </div>

      {/* context sensitivity */}
      {prediction.contextSensitivity != null && prediction.contextSensitivity > 0 && (
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] text-slate-400">状況依存度</span>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className={`h-1.5 w-1.5 rounded-full ${
                  n <= Math.round(prediction.contextSensitivity * 5)
                    ? "bg-amber-400"
                    : "bg-slate-200"
                }`}
              />
            ))}
          </div>
          <span className="text-[10px] text-amber-600/70">
            {prediction.contextSensitivity > 0.7
              ? "場面で大きく変わる"
              : prediction.contextSensitivity > 0.4
                ? "やや場面依存"
                : "比較的安定"}
          </span>
        </div>
      )}

      {/* expandable reasoning */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-[11px] text-violet-500 hover:text-violet-700 transition-colors mt-1"
      >
        {expanded ? "理由を閉じる" : "理由を見る"}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.p
            className="text-xs text-slate-500 mt-2 leading-relaxed"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {prediction.cloneReasoning}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ────────────────────────────────────────────── main */

export default function PredictiveSelf({
  predictions,
  cloneAccuracy,
  cloneSummary,
}: PredictiveSelfProps) {
  if (!predictions || predictions.length === 0) return null;

  return (
    <section className="space-y-4">
      {/* header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-lg font-bold text-slate-800">予測的自己</h2>
        <p className="text-xs text-slate-500">
          あなたのクローンはこう判断する
        </p>
      </motion.div>

      {/* clone accuracy */}
      <motion.div
        className={CARD}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <AccuracyRing value={cloneAccuracy} />
        <p className="text-xs text-slate-500 text-center mt-3 leading-relaxed">
          {cloneSummary}
        </p>
      </motion.div>

      {/* predictions */}
      <div className="space-y-3">
        {predictions.map((p, i) => (
          <PredictionCard key={p.scenarioId} prediction={p} index={i} />
        ))}
      </div>
    </section>
  );
}
