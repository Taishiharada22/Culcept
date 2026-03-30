// app/stargazer/_components/CompatibilitySection.tsx
// 相性セクション — 恋愛 / 仕事 / 友達の3文脈で相性傾向を可視化
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ScoreRing from "./ScoreRing";
import type { ContextFaces, ResolvedType } from "@/types/stargazer";
import { getAxisLabels, type TraitAxisKey } from "@/lib/stargazer/traitAxes";

interface CompatibilityData {
  romance: ContextScore;
  work: ContextScore;
  friends: ContextScore;
}

interface ContextScore {
  overallScore: number; // 0–100
  subElements: SubElement[];
  reasons: string[];
  style: string;
}

interface SubElement {
  label: string;
  score: number; // 0–100
  description?: string;
}

interface Props {
  resolvedType: ResolvedType | null;
  compatibility: CompatibilityData | null;
  lightMode?: boolean;
}

type ContextKey = "romance" | "work" | "friends";

const CONTEXT_CONFIG: {
  key: ContextKey;
  emoji: string;
  label: string;
  color: string;
  bgActive: string;
  borderActive: string;
}[] = [
  {
    key: "romance",
    emoji: "💕",
    label: "恋愛",
    color: "rgba(244,114,182,0.8)",
    bgActive: "rgba(244,114,182,0.08)",
    borderActive: "rgba(244,114,182,0.2)",
  },
  {
    key: "work",
    emoji: "💼",
    label: "仕事",
    color: "rgba(96,165,250,0.8)",
    bgActive: "rgba(96,165,250,0.08)",
    borderActive: "rgba(96,165,250,0.2)",
  },
  {
    key: "friends",
    emoji: "🧩",
    label: "友達",
    color: "rgba(170,150,90,0.85)",
    bgActive: "rgba(190,170,110,0.08)",
    borderActive: "rgba(190,170,110,0.2)",
  },
];

export default function CompatibilitySection({
  resolvedType,
  compatibility,
  lightMode = true,
}: Props) {
  const [activeContext, setActiveContext] = useState<ContextKey>("romance");

  const textPrimary = lightMode
    ? "rgba(30,40,60,0.85)"
    : "rgba(30,40,60,0.85)";
  const textSecondary = lightMode
    ? "rgba(60,70,90,0.6)"
    : "rgba(100,105,130,0.6)";
  const textTertiary = lightMode
    ? "rgba(80,90,110,0.4)"
    : "rgba(120,125,140,0.4)";
  const cardBg = lightMode
    ? "rgba(255,255,255,0.75)"
    : "rgba(255,255,255,0.75)";
  const cardBorder = lightMode
    ? "rgba(160,170,200,0.12)"
    : "rgba(160,170,200,0.12)";
  const inactiveBg = lightMode
    ? "rgba(0,0,0,0.02)"
    : "rgba(0,0,0,0.02)";
  const inactiveBorder = lightMode
    ? "rgba(0,0,0,0.04)"
    : "rgba(160,170,200,0.1)";
  const inactiveText = lightMode
    ? "rgba(80,90,110,0.5)"
    : "rgba(100,105,130,0.5)";

  const activeConfig = CONTEXT_CONFIG.find((c) => c.key === activeContext)!;
  const currentData = compatibility?.[activeContext];

  // ContextFaces がある場合のフォールバック表示
  const contextFaces = resolvedType?.contextFaces;
  const currentFaces = contextFaces?.[activeContext];
  const faceEntries = currentFaces
    ? Object.entries(currentFaces).sort(([, a], [, b]) => b - a)
    : [];

  return (
    <div className="space-y-6">
      {/* セクションヘッダー */}
      <div className="flex items-center gap-3">
        <div
          className="h-px flex-1"
          style={{
            background: lightMode
              ? "linear-gradient(to right, rgba(100,110,130,0.15), transparent)"
              : "linear-gradient(to right, rgba(160,170,200,0.15), transparent)",
          }}
        />
        <span
          className="font-mono-sg text-xs tracking-[0.25em] uppercase font-medium"
          style={{ color: textTertiary }}
        >
          相性傾向
        </span>
        <div
          className="h-px flex-1"
          style={{
            background: lightMode
              ? "linear-gradient(to left, rgba(100,110,130,0.15), transparent)"
              : "linear-gradient(to left, rgba(160,170,200,0.15), transparent)",
          }}
        />
      </div>

      {/* 文脈切替タブ */}
      <div className="flex gap-2">
        {CONTEXT_CONFIG.map((tab) => {
          const isActive = activeContext === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveContext(tab.key)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-body text-sm font-semibold transition-all duration-200"
              style={
                isActive
                  ? {
                      background: tab.bgActive,
                      border: `1px solid ${tab.borderActive}`,
                      color: tab.color,
                    }
                  : {
                      background: inactiveBg,
                      border: `1px solid ${inactiveBorder}`,
                      color: inactiveText,
                    }
              }
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* コンテンツ */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeContext}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="rounded-2xl overflow-hidden"
          style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
            backdropFilter: lightMode ? "blur(16px)" : "blur(12px)",
            boxShadow: lightMode ? "0 4px 24px rgba(0,0,0,0.04)" : "none",
          }}
        >
          <div className="p-6 sm:p-8">
            {currentData ? (
              /* ── 相性データがある場合 ── */
              <>
                <div className="flex flex-col sm:flex-row items-center gap-6 mb-8">
                  {/* スコアリング */}
                  <ScoreRing
                    value={currentData.overallScore}
                    size={130}
                    strokeWidth={4}
                    color={activeConfig.color}
                    trackColor={lightMode ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.04)"}
                    subLabel="相性スコア"
                    delay={0.1}
                    variant={lightMode ? "light" : "dark"}
                  />

                  <div className="flex-1 text-center sm:text-left">
                    <p className="font-body text-sm font-semibold mb-1" style={{ color: textPrimary }}>
                      {activeConfig.label}における関係性スタイル
                    </p>
                    <p className="font-body text-sm leading-relaxed" style={{ color: textSecondary }}>
                      {currentData.style}
                    </p>
                  </div>
                </div>

                {/* サブ要素 */}
                {currentData.subElements.length > 0 && (
                  <div className="mb-6">
                    <p
                      className="font-mono-sg text-xs tracking-[0.15em] uppercase font-semibold mb-4"
                      style={{ color: textTertiary }}
                    >
                      構成要素
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {currentData.subElements.map((el, i) => (
                        <motion.div
                          key={el.label}
                          className="rounded-xl p-4"
                          style={{
                            background: lightMode
                              ? "rgba(0,0,0,0.02)"
                              : "rgba(0,0,0,0.02)",
                            border: `1px solid ${cardBorder}`,
                          }}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.15 + i * 0.05 }}
                        >
                          <div className="flex items-baseline justify-between mb-1">
                            <span className="font-body text-xs font-semibold" style={{ color: textPrimary }}>
                              {el.label}
                            </span>
                            <span className="font-mono-sg text-xs tabular-nums" style={{ color: activeConfig.color }}>
                              {el.score}
                            </span>
                          </div>
                          <div
                            className="h-1 rounded-full overflow-hidden"
                            style={{ background: lightMode ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.04)" }}
                          >
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: activeConfig.color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${el.score}%` }}
                              transition={{ delay: 0.3 + i * 0.05, duration: 0.25 }}
                            />
                          </div>
                          {el.description && (
                            <p className="font-body text-xs mt-1.5" style={{ color: textTertiary }}>
                              {el.description}
                            </p>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 理由 */}
                {currentData.reasons.length > 0 && (
                  <div>
                    <p
                      className="font-mono-sg text-xs tracking-[0.15em] uppercase font-semibold mb-3"
                      style={{ color: textTertiary }}
                    >
                      観測からわかったこと
                    </p>
                    <div className="space-y-2">
                      {currentData.reasons.map((reason, i) => (
                        <motion.div
                          key={i}
                          className="flex gap-2 items-start"
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + i * 0.06 }}
                        >
                          <div
                            className="w-1 h-1 rounded-full mt-2 flex-shrink-0"
                            style={{ background: activeConfig.color }}
                          />
                          <p className="font-body text-sm leading-relaxed" style={{ color: textSecondary }}>
                            {reason}
                          </p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : faceEntries.length > 0 ? (
              /* ── ContextFaces のみ — 中心ゼロゲージ ── */
              <>
                <p className="font-body text-sm mb-6 leading-relaxed" style={{ color: textSecondary }}>
                  同じ人格が、{activeConfig.label}の文脈ではどう傾くか
                </p>
                <div className="space-y-4">
                  {faceEntries.map(([dim, score], i) => {
                    const labels = getAxisLabels(dim as TraitAxisKey);
                    const isLeft = score < 0;
                    const dirLabel = isLeft ? labels?.left : labels?.right;
                    const absScore = Math.abs(score);

                    return (
                      <motion.div
                        key={dim}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + i * 0.05 }}
                      >
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="font-body text-sm font-semibold" style={{ color: textPrimary }}>
                            {dirLabel || dim}
                          </span>
                          <span className="font-mono-sg text-xs tabular-nums" style={{ color: activeConfig.color }}>
                            {score > 0 ? "+" : ""}{score.toFixed(2)}
                          </span>
                        </div>
                        {/* 中心ゼロゲージ */}
                        <div
                          className="relative h-1.5 rounded-full overflow-hidden"
                          style={{
                            background: lightMode
                              ? "rgba(0,0,0,0.04)"
                              : "rgba(0,0,0,0.04)",
                          }}
                        >
                          {/* 中心線 */}
                          <div
                            className="absolute top-0 bottom-0 w-px left-1/2"
                            style={{
                              background: lightMode
                                ? "rgba(0,0,0,0.08)"
                                : "rgba(160,170,200,0.15)",
                            }}
                          />
                          {score >= 0 ? (
                            <motion.div
                              className="absolute top-0 bottom-0 rounded-r-full"
                              style={{ left: "50%", background: activeConfig.color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${absScore * 50}%` }}
                              transition={{ delay: 0.2 + i * 0.06, duration: 0.25 }}
                            />
                          ) : (
                            <motion.div
                              className="absolute top-0 bottom-0 rounded-l-full"
                              style={{ right: "50%", background: activeConfig.color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${absScore * 50}%` }}
                              transition={{ delay: 0.2 + i * 0.06, duration: 0.25 }}
                            />
                          )}
                        </div>
                        {/* 両端ラベル */}
                        {labels && (
                          <div className="flex justify-between mt-0.5">
                            <span className="font-body text-xs" style={{ color: textTertiary }}>
                              {labels.left}
                            </span>
                            <span className="font-body text-xs" style={{ color: textTertiary }}>
                              {labels.right}
                            </span>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </>
            ) : (
              /* ── データなし ── */
              <div className="text-center py-8">
                <p className="font-body text-sm" style={{ color: textTertiary }}>
                  {activeConfig.label}の相性データはまだ十分に蓄積されていません
                </p>
                <p className="font-body text-xs mt-2" style={{ color: textTertiary }}>
                  観測を続けることで、精度が向上します
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
