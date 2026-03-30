"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import type { BehavioralLawsResult } from "@/lib/origin/v7/behavioralLaws";
import { getPeriodLabel } from "@/lib/origin/v7/periods";

type Props = {
  laws: BehavioralLawsResult;
};

/**
 * BehavioralLawsPanel (v6 簡素化版)
 * 反復パターン + 判断原理のみ表示。
 * 崩壊/成長 → CollapseGrowthPanel
 * 矛盾 → ContradictionExplorer
 * 残響 → EchoTraceView
 * にそれぞれ分離。
 */
export default function BehavioralLawsPanel({ laws }: Props) {
  const [expanded, setExpanded] = useState(false);

  const hasData =
    laws.repeatingPatterns.length > 0 ||
    laws.decisionPrinciples.length > 0;

  if (!hasData) return null;

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mt-3"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="mb-2 flex w-full items-center gap-2 text-left"
      >
        <span className="text-sm">🧬</span>
        <h3 className="text-xs font-semibold text-gray-700">行動法則</h3>
        <span className="ml-auto text-[10px] text-gray-400">
          {expanded ? "閉じる" : "展開"}
        </span>
      </button>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-3"
        >
          {/* 反復パターン */}
          {laws.repeatingPatterns.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-medium text-amber-600/70">
                繰り返されるパターン
              </p>
              <div className="space-y-1">
                {laws.repeatingPatterns.slice(0, 4).map((rp) => (
                  <div
                    key={rp.id}
                    className="rounded-xl border border-amber-100/50 bg-amber-50/30 px-3 py-2"
                  >
                    <p className="text-xs font-medium text-gray-700">
                      {rp.pattern}
                    </p>
                    <p className="mt-0.5 text-[10px] text-gray-400">
                      {rp.appearances.map((a) => getPeriodLabel(a.period)).join(" → ")}
                      <span className="ml-1 text-amber-500/70">
                        ({rp.appearances.length}回出現)
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 判断原理 */}
          {laws.decisionPrinciples.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-medium text-amber-600/70">
                判断原理
              </p>
              <div className="space-y-1">
                {laws.decisionPrinciples.slice(0, 3).map((dp) => (
                  <div
                    key={dp.id}
                    className="rounded-xl border border-amber-100/50 bg-white/40 px-3 py-2"
                  >
                    <p className="text-xs font-medium text-gray-700">
                      「{dp.principle}」
                    </p>
                    <p className="mt-0.5 text-[10px] text-gray-400">
                      {dp.evidence[0]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </motion.section>
  );
}
