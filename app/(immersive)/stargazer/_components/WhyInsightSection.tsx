// app/stargazer/_components/WhyInsightSection.tsx
// Phase 2 説明エンジン表示 — 「なぜそうなのか」を深度順に展開
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { WhyInsight, WhyDepth, WhyCategory } from "@/lib/stargazer/explanationEngine";

interface WhyInsightSectionProps {
  insights: WhyInsight[];
}

const DEPTH_CONFIG: Record<WhyDepth, { label: string; color: string; bg: string }> = {
  surface: {
    label: "表層",
    color: "rgba(96,165,250,0.7)",
    bg: "rgba(96,165,250,0.08)",
  },
  pattern: {
    label: "パターン",
    color: "rgba(139,92,246,0.7)",
    bg: "rgba(139,92,246,0.08)",
  },
  structural: {
    label: "構造",
    color: "rgba(170,150,90,0.7)",
    bg: "rgba(170,150,90,0.08)",
  },
};

const CATEGORY_ICONS: Record<WhyCategory, string> = {
  contradiction: "⊘",
  mirror_gap: "◑",
  context_shift: "◈",
  core_formation: "◉",
  change: "↻",
  protection: "⊡",
  blind_spot: "◌",
};

const CATEGORY_LABELS: Record<WhyCategory, string> = {
  contradiction: "矛盾",
  mirror_gap: "自己認識のズレ",
  context_shift: "文脈変化",
  core_formation: "判断の根っこ",
  change: "変化",
  protection: "自己防衛",
  blind_spot: "気づきにくい点",
};

export default function WhyInsightSection({ insights }: WhyInsightSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (insights.length === 0) return null;

  const visibleInsights = showAll ? insights : insights.slice(0, 5);

  return (
    <section>
      {/* Header */}
      <div className="mb-3">
        <span
          className="text-[10px] font-mono tracking-[0.2em] uppercase block mb-1"
          style={{ color: "rgba(146,118,56,0.6)" }}
        >
          自己解読エンジン
        </span>
        <h3
          className="font-display text-lg font-semibold"
          style={{ color: "rgba(24,30,50,0.94)" }}
        >
          なぜ、そうなのか
        </h3>
      </div>
      <p
        className="text-sm leading-[1.8] mb-5"
        style={{ color: "rgba(56,62,84,0.8)" }}
      >
        結果の裏にある「なぜ」を、浅いところから深いところへ掘り下げます。
      </p>

      {/* Depth legend */}
      <div className="flex gap-3 mb-4">
        {(["surface", "pattern", "structural"] as WhyDepth[]).map((d) => {
          const cfg = DEPTH_CONFIG[d];
          const count = insights.filter((i) => i.depth === d).length;
          if (count === 0) return null;
          return (
            <span
              key={d}
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: cfg.bg, color: cfg.color }}
            >
              {cfg.label} ({count})
            </span>
          );
        })}
      </div>

      {/* Insight cards */}
      <div className="space-y-3">
        {visibleInsights.map((insight, i) => {
          const depthCfg = DEPTH_CONFIG[insight.depth];
          const isExpanded = expandedId === insight.id;

          return (
            <motion.div
              key={insight.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-xl overflow-hidden cursor-pointer transition-colors"
              style={{
                background: isExpanded ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.45)",
                border: `1px solid ${isExpanded ? depthCfg.color.replace("0.7", "0.2") : "rgba(160,170,200,0.08)"}`,
              }}
              onClick={() => setExpandedId(isExpanded ? null : insight.id)}
            >
              {/* Header row */}
              <div className="px-4 py-3 flex items-start gap-3">
                {/* Depth indicator */}
                <div
                  className="w-1 rounded-full flex-shrink-0 mt-1"
                  style={{
                    height: insight.depth === "structural" ? 28 : insight.depth === "pattern" ? 20 : 12,
                    background: depthCfg.color,
                  }}
                />

                <div className="flex-1 min-w-0">
                  {/* Category + depth badges */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: depthCfg.bg, color: depthCfg.color }}
                    >
                      {CATEGORY_ICONS[insight.category]} {CATEGORY_LABELS[insight.category]}
                    </span>
                    {/* Confidence dot */}
                    <span
                      className="text-xs"
                      style={{
                        color: insight.confidence > 0.7
                          ? "rgba(64,184,104,0.84)"
                          : insight.confidence > 0.4
                            ? "rgba(214,156,34,0.84)"
                            : "rgba(98,104,126,0.8)",
                      }}
                    >
                      ● {(insight.confidence * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* Question */}
                  <p
                    className="text-base font-medium leading-relaxed"
                    style={{ color: "rgba(24,30,50,0.95)" }}
                  >
                    {insight.question}
                  </p>
                </div>

                {/* Expand indicator */}
                <span
                  className="text-sm flex-shrink-0 mt-1 transition-transform"
                  style={{
                    color: "rgba(86,92,116,0.82)",
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  ▼
                </span>
              </div>

              {/* Expanded content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="px-4 pb-4 pt-1 ml-4 border-l"
                      style={{ borderColor: depthCfg.color.replace("0.7", "0.15") }}
                    >
                      {/* Answer */}
                      <p
                        className="text-base leading-[1.9] mb-3"
                        style={{ color: "rgba(42,48,70,0.94)" }}
                      >
                        {insight.answer}
                      </p>

                      {/* Evidence */}
                      <div
                        className="text-sm px-3 py-2 rounded-lg mb-3"
                        style={{
                          background: "rgba(160,170,200,0.06)",
                          color: "rgba(58,64,86,0.9)",
                        }}
                      >
                        <span style={{ color: "rgba(146,118,56,0.84)" }}>根拠:</span>{" "}
                        {insight.evidence}
                      </div>

                      {/* Exploration prompt */}
                      {insight.explorationPrompt && (
                        <div
                          className="text-sm px-3 py-2 rounded-lg"
                          style={{
                            background: depthCfg.bg,
                            color: depthCfg.color,
                            borderLeft: `2px dashed ${depthCfg.color.replace("0.7", "0.3")}`,
                          }}
                        >
                          💭 {insight.explorationPrompt}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Show more */}
      {insights.length > 5 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full mt-3 text-sm py-3 rounded-xl transition-all active:scale-[0.99]"
          style={{
            background: "rgba(139,92,246,0.05)",
            color: "rgba(116,84,198,0.75)",
            border: "1px solid rgba(139,92,246,0.08)",
            minHeight: "44px",
          }}
        >
          さらに {insights.length - 5} 件の洞察を表示
        </button>
      )}
    </section>
  );
}
