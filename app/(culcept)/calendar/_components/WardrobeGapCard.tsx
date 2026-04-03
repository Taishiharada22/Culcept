"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { GapAnalysis, WardrobeGap } from "../_lib/wardrobeGapDetector";

const SEVERITY_STYLES: Record<string, { bg: string; border: string; badge: string }> = {
  high: { bg: "bg-red-50/50", border: "border-red-200/40", badge: "bg-red-100/80 text-red-600" },
  medium: { bg: "bg-amber-50/50", border: "border-amber-200/40", badge: "bg-amber-100/80 text-amber-600" },
  low: { bg: "bg-blue-50/50", border: "border-blue-200/40", badge: "bg-blue-100/80 text-blue-500" },
};

const SEVERITY_LABEL: Record<string, string> = { high: "重要", medium: "推奨", low: "あると便利" };

export default function WardrobeGapCard({ analysis }: { analysis: GapAnalysis }) {
  const [expanded, setExpanded] = React.useState(false);

  if (analysis.gaps.length === 0) return null;

  const topGaps = analysis.gaps.slice(0, 2);
  const restGaps = analysis.gaps.slice(2);

  return (
    <div className="rounded-2xl bg-white/30 backdrop-blur-xl border border-white/40 p-3">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">🔍</span>
          <span className="text-[10px] font-bold tracking-widest text-gray-400">ワードローブ分析</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-8 h-8">
            <svg viewBox="0 0 36 36" className="w-8 h-8 transform -rotate-90">
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="3" />
              <circle cx="18" cy="18" r="14" fill="none"
                stroke={analysis.overallScore >= 80 ? "#10b981" : analysis.overallScore >= 50 ? "#f59e0b" : "#ef4444"}
                strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${(analysis.overallScore / 100) * 88} 88`} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[7px] font-black text-gray-600">{analysis.overallScore}</span>
          </div>
        </div>
      </div>

      {/* 強みポイント */}
      {analysis.strongPoints.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {analysis.strongPoints.map((sp, i) => (
            <span key={i} className="text-[9px] font-medium text-emerald-600 bg-emerald-50/60 border border-emerald-200/30 rounded-full px-2 py-0.5">
              ✓ {sp}
            </span>
          ))}
        </div>
      )}

      {/* ギャップリスト */}
      <div className="space-y-2">
        {topGaps.map((gap, i) => (
          <GapItem key={i} gap={gap} />
        ))}
      </div>

      {/* 展開部分 */}
      <AnimatePresence>
        {expanded && restGaps.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 mt-2">
              {restGaps.map((gap, i) => (
                <GapItem key={i} gap={gap} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 mt-2">
        {restGaps.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] font-bold text-violet-500 hover:text-violet-600 transition"
          >
            {expanded ? "閉じる" : `他 ${restGaps.length} 件の改善ポイント`}
          </button>
        )}
        <Link href="/my-style?tab=closet"
          className="ml-auto flex items-center gap-1 rounded-full bg-violet-50/80 border border-violet-200/40 px-3 py-1.5 text-[10px] font-bold text-violet-600 hover:bg-violet-100/80 transition no-underline">
          手持ちを見る
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </Link>
      </div>
    </div>
  );
}

function GapItem({ gap }: { gap: WardrobeGap }) {
  const style = SEVERITY_STYLES[gap.severity] ?? SEVERITY_STYLES.low;
  return (
    <div className={`rounded-xl ${style.bg} border ${style.border} p-3`}>
      <div className="flex items-start gap-2.5">
        <span className="text-base shrink-0 mt-0.5">{gap.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-bold text-gray-700">{gap.title}</span>
            <span className={`text-[8px] font-bold rounded-full px-1.5 py-0.5 ${style.badge}`}>
              {SEVERITY_LABEL[gap.severity] ?? gap.severity}
            </span>
          </div>
          <p className="text-[10px] text-gray-500 mb-1">{gap.description}</p>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium text-gray-600">💡 {gap.suggestion}</p>
            <Link href="/my-style?tab=closet"
              className="shrink-0 text-[9px] font-bold text-violet-500 hover:text-violet-600 no-underline ml-2">
              追加する →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
