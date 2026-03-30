// app/sns/profile/_components/MetamorphosisChronicle.tsx
// 変容の法則 — 周期パターン・トリガー・レジリエンス・変容ベクトル
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ────────────────────────────────────────────── types */

export interface MetamorphosisChronicleProps {
  cyclicalPatterns: Array<{
    axisId: string;
    cycleType: string;
    description: string;
    amplitude: number;
    confidence: number;
    peakCondition: string;
    troughCondition: string;
  }>;
  triggerPatterns: Array<{
    trigger: string;
    affectedAxes: string[];
    direction: "positive" | "negative";
    magnitude: number;
    observedCount: number;
    interpretation: string;
  }>;
  resilience: {
    overallResilience: number;
    quickRecoveryAxes: string[];
    slowRecoveryAxes: string[];
    pattern: string;
    description: string;
  } | null;
  transformationVectors: Array<{
    axisId: string;
    pastScore: number;
    currentScore: number;
    velocity: number;
    consistency: number;
    interpretation: string;
  }>;
}

/* ────────────────────────────────────────────── shared */

const CARD =
  "relative overflow-hidden rounded-2xl border border-white/70 bg-white/72 shadow-lg shadow-black/8 backdrop-blur-xl p-4";

const TAG_BASE =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium";

function SectionTitle({ title }: { title: string }) {
  return (
    <motion.h3
      className="text-sm font-bold text-slate-700 mb-3"
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4 }}
    >
      {title}
    </motion.h3>
  );
}

/* ────────────────────────────────────────────── resilience ring */

function ResilienceRing({ value }: { value: number }) {
  const pct = Math.min(Math.max(value, 0), 1);
  const R = 38;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - pct);

  return (
    <div className="relative flex items-center justify-center w-24 h-24 shrink-0">
      <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
        <circle
          cx={48}
          cy={48}
          r={R}
          fill="none"
          stroke="rgba(148,163,184,0.18)"
          strokeWidth={7}
        />
        <motion.circle
          cx={48}
          cy={48}
          r={R}
          fill="none"
          stroke="url(#resGrad)"
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
        <defs>
          <linearGradient id="resGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-lg font-bold text-slate-800">
        {(pct * 100).toFixed(0)}
      </span>
    </div>
  );
}

/* ────────────────────────────────────────────── main */

export default function MetamorphosisChronicle({
  cyclicalPatterns,
  triggerPatterns,
  resilience,
  transformationVectors,
}: MetamorphosisChronicleProps) {
  const hasContent =
    cyclicalPatterns.length > 0 ||
    triggerPatterns.length > 0 ||
    resilience !== null ||
    transformationVectors.length > 0;

  if (!hasContent) return null;

  return (
    <section className="space-y-6">
      {/* ── Section 1: 変容の法則 ── */}
      {(cyclicalPatterns.length > 0 || triggerPatterns.length > 0) && (
        <div className="space-y-3">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-lg font-bold text-slate-800">変容の法則</h2>
            <p className="text-xs text-slate-500">
              周期的なパターンと変化のトリガー
            </p>
          </motion.div>

          {/* cyclical */}
          {cyclicalPatterns.length > 0 && (
            <div className="space-y-2">
              <SectionTitle title="周期パターン" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {cyclicalPatterns.map((cp, i) => (
                  <motion.div
                    key={`${cp.axisId}-${cp.cycleType}`}
                    className={CARD}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.4 }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-slate-700">
                        {cp.axisId}
                      </span>
                      <span
                        className={`${TAG_BASE} bg-violet-100 text-violet-700`}
                      >
                        {cp.cycleType}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">
                      {cp.description}
                    </p>
                    <div className="flex gap-3 text-[11px]">
                      <span className="text-emerald-600">
                        \u25B2 {cp.peakCondition}
                      </span>
                      <span className="text-amber-600">
                        \u25BC {cp.troughCondition}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* triggers */}
          {triggerPatterns.length > 0 && (
            <div className="space-y-2">
              <SectionTitle title="トリガーパターン" />
              <div className="space-y-2">
                {triggerPatterns.map((tp, i) => (
                  <motion.div
                    key={`${tp.trigger}-${i}`}
                    className={CARD}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.4 }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-700">
                        {tp.trigger}
                      </span>
                      <span className="text-slate-400">\u2192</span>
                      {tp.affectedAxes.map((ax) => (
                        <span
                          key={ax}
                          className={`${TAG_BASE} ${
                            tp.direction === "positive"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {ax}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {tp.interpretation}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                      <span>観測数: {tp.observedCount}</span>
                      <span>強度: {(tp.magnitude * 100).toFixed(0)}%</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Section 2: レジリエンス ── */}
      {resilience && (
        <div className="space-y-3">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-lg font-bold text-slate-800">レジリエンス</h2>
            <p className="text-xs text-slate-500">回復のプロフィール</p>
          </motion.div>

          <motion.div
            className={CARD}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="flex items-start gap-4">
              <ResilienceRing value={resilience.overallResilience} />

              <div className="flex-1 min-w-0 space-y-2">
                <div>
                  <span
                    className={`${TAG_BASE} bg-cyan-100 text-cyan-700 mb-1`}
                  >
                    {resilience.pattern}
                  </span>
                  <p className="text-xs text-slate-500 mt-1">
                    {resilience.description}
                  </p>
                </div>

                {resilience.quickRecoveryAxes.length > 0 && (
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">
                      回復が早い軸
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {resilience.quickRecoveryAxes.map((ax) => (
                        <span
                          key={ax}
                          className={`${TAG_BASE} bg-emerald-100 text-emerald-700`}
                        >
                          {ax}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {resilience.slowRecoveryAxes.length > 0 && (
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">
                      回復が遅い軸
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {resilience.slowRecoveryAxes.map((ax) => (
                        <span
                          key={ax}
                          className={`${TAG_BASE} bg-amber-100 text-amber-700`}
                        >
                          {ax}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Section 3: 変容ベクトル ── */}
      {transformationVectors.length > 0 && (
        <div className="space-y-3">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-lg font-bold text-slate-800">変容ベクトル</h2>
            <p className="text-xs text-slate-500">過去から現在への変化</p>
          </motion.div>

          <div className="space-y-2">
            {transformationVectors.map((tv, i) => {
              const delta = tv.currentScore - tv.pastScore;
              const isPositive = delta >= 0;
              return (
                <motion.div
                  key={tv.axisId}
                  className={CARD}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.4 }}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-sm font-semibold text-slate-700">
                      {tv.axisId}
                    </span>

                    {/* before → after */}
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-slate-400">
                        {tv.pastScore.toFixed(1)}
                      </span>
                      <span
                        className={
                          isPositive ? "text-emerald-500" : "text-rose-500"
                        }
                      >
                        \u2192
                      </span>
                      <span className="font-bold text-slate-700">
                        {tv.currentScore.toFixed(1)}
                      </span>
                    </div>

                    {/* velocity */}
                    <span
                      className={`${TAG_BASE} ml-auto ${
                        isPositive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {(tv.velocity * 100).toFixed(0)}%
                    </span>
                  </div>

                  <p className="text-xs text-slate-500">{tv.interpretation}</p>

                  {/* consistency bar */}
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-violet-400 to-indigo-400"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.min(tv.consistency * 100, 100)}%`,
                      }}
                      transition={{ duration: 0.8, delay: i * 0.06 + 0.2 }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    一貫性 {(tv.consistency * 100).toFixed(0)}%
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
