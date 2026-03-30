"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

type Props = {
  /** 今日の提案テキスト（NarrativeSynthesis や prophecy から生成） */
  proposal?: string | null;
  /** 確信度 0–1 */
  confidence?: number;
  /** 別案 */
  alternative?: string | null;
  /** 注意点 */
  caution?: string | null;
  /** 提案の元データソース */
  sources?: string[];
  /** 観測数（表示制御） */
  observationCount?: number;
};

export default function AnswerCard({
  proposal,
  confidence = 0,
  alternative,
  caution,
  sources = [],
  observationCount = 0,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  // 未観測 or データ不足時
  if (!proposal || observationCount < 5) {
    return (
      <section className="px-4 pb-3">
        <div
          className="rounded-2xl p-5 relative overflow-hidden"
          style={{
            background: "linear-gradient(145deg, rgba(99,102,241,0.04), rgba(139,92,246,0.06))",
            border: "1px solid rgba(99,102,241,0.08)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs">✦</span>
            <span
              className="text-[9px] font-mono tracking-wider"
              style={{ color: "#6366F1", opacity: 0.6 }}
            >
              あなたへの提案
            </span>
          </div>
          <p className="text-sm text-text2 leading-relaxed">
            {observationCount === 0
              ? "まだあなたのことを観測できていません。Stargazerで最初の質問に答えると、ここにあなた専用の提案が現れます。"
              : "もう少し観測を重ねると、あなた専用の「今日の一手」をここに表示します。"}
          </p>
          <Link
            href="/stargazer"
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full"
            style={{
              background: "rgba(99,102,241,0.1)",
              color: "#6366F1",
            }}
          >
            観測を始める →
          </Link>
        </div>
      </section>
    );
  }

  const confidenceLabel =
    confidence >= 0.8 ? "高い確信" :
    confidence >= 0.5 ? "中程度" : "探索中";
  const confidenceColor =
    confidence >= 0.8 ? "#22c55e" :
    confidence >= 0.5 ? "#F59E0B" : "#8888a0";

  return (
    <section className="px-4 pb-3">
      <motion.div
        layout
        className="rounded-xl relative overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.45)",
          border: "1px solid rgba(99,102,241,0.08)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.02)",
        }}
      >
        <div className="px-3.5 py-3 relative z-1">
          {/* Header */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px]" style={{ opacity: 0.5 }}>✦</span>
              <span
                className="text-[9px] font-mono tracking-wider"
                style={{ color: "#6366F1", opacity: 0.5 }}
              >
                今日の一手
              </span>
            </div>
            <span
              className="text-[9px] font-mono px-2 py-0.5 rounded-full"
              style={{
                background: `${confidenceColor}12`,
                color: confidenceColor,
                border: `1px solid ${confidenceColor}20`,
              }}
            >
              {confidenceLabel} {Math.round(confidence * 100)}%
            </span>
          </div>

          {/* Main proposal */}
          <p className="text-[12px] font-semibold text-text1 leading-relaxed mb-2.5">
            {proposal}
          </p>

          {/* Source badges */}
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {sources.map((s) => (
                <span
                  key={s}
                  className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: "rgba(99,102,241,0.06)",
                    color: "#6366F1",
                    opacity: 0.6,
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* Expand for details */}
          {(alternative || caution) && (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-[10px] font-medium text-text3 flex items-center gap-1"
              >
                <motion.span
                  animate={{ rotate: expanded ? 90 : 0 }}
                  transition={{ duration: 0.15 }}
                >
                  ›
                </motion.span>
                {expanded ? "閉じる" : "別案・注意点を見る"}
              </button>

              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 mt-3 border-t border-black/[0.04] space-y-2.5">
                      {alternative && (
                        <div>
                          <span className="text-[9px] font-mono text-text4 tracking-wider">別案</span>
                          <p className="text-[12px] text-text2 leading-relaxed mt-0.5">{alternative}</p>
                        </div>
                      )}
                      {caution && (
                        <div>
                          <span className="text-[9px] font-mono text-text4 tracking-wider">注意点</span>
                          <p className="text-[12px] text-text2 leading-relaxed mt-0.5">{caution}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {/* "あなた向け" badge */}
          <div className="mt-2 pt-2 border-t border-black/[0.04]">
            <p className="text-[9px] text-text4 italic">
              これは一般論ではなく、{observationCount}回の観測データに基づくあなた専用の提案です
            </p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
