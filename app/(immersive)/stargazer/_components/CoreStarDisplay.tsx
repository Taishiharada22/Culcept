// app/stargazer/_components/CoreStarDisplay.tsx
// Core Star セクション — 観測された傾向の構造化表示
// 暗い背景上で、精密な計器感覚で特性を表示する
"use client";

import { motion } from "framer-motion";
import type { CoreStar, ResolvedType, PersonalityProfile } from "@/types/stargazer";
import { getReactionType, type ReactionTypeCode } from "@/lib/stargazer/reactionTypes";

interface DimensionDetail {
  id: string;
  score: number;
  confidence: number;
  evidenceCount: number;
  category: string;
  labelLeft: string;
  labelRight: string;
}

interface ObservationStats {
  totalAnswered: number;
  avgResponseTimeMs: number;
  fastAnswerCount: number;
  slowAnswerCount: number;
  avgHesitation: number;
}

interface Props {
  coreStar: CoreStar;
  resolvedType: ResolvedType | null;
  personalityProfile: PersonalityProfile | null;
  dimensionDetails: DimensionDetail[];
  observationStats: ObservationStats | null;
  reactionType?: ReactionTypeCode;
  shortCode?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  core: "コア",
  relational: "関係性",
  context: "文脈",
  motion: "行動",
  aesthetic: "美意識",
  emotional: "感情",
  // 旧カテゴリ（後方互換）
  values: "価値観",
  decision: "判断",
  social: "対人",
};

export default function CoreStarDisplay({
  coreStar,
  resolvedType,
  dimensionDetails,
  observationStats,
  reactionType,
  shortCode,
}: Props) {
  const rtDef = reactionType ? getReactionType(reactionType) : null;
  const strongDimensions = [...dimensionDetails]
    .filter((d) => d.confidence > 0.25 && Math.abs(d.score) > 0.15)
    .sort(
      (a, b) =>
        b.confidence * Math.abs(b.score) - a.confidence * Math.abs(a.score)
    )
    .slice(0, 5);

  const waveringDimensions = [...dimensionDetails]
    .filter(
      (d) =>
        d.confidence > 0.15 &&
        d.confidence < 0.55 &&
        Math.abs(d.score) < 0.25
    )
    .slice(0, 3);

  const avgTime = observationStats?.avgResponseTimeMs
    ? `${(observationStats.avgResponseTimeMs / 1000).toFixed(1)}s`
    : "—";

  return (
    <div className="space-y-6">
      {/* セクションヘッダー */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1" style={{ background: "linear-gradient(to right, rgba(160,170,200,0.15), transparent)" }} />
        <span
          className="font-mono-sg text-xs tracking-[0.25em] uppercase font-medium"
          style={{ color: "rgba(120,125,140,0.45)" }}
        >
          観測の核心
        </span>
        <div className="h-px flex-1" style={{ background: "linear-gradient(to left, rgba(160,170,200,0.15), transparent)" }} />
      </div>

      {/* メインカード */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl overflow-hidden relative"
        style={{
          background:
            "linear-gradient(145deg, rgba(190,170,110,0.06) 0%, rgba(255,255,255,0.7) 50%, rgba(190,170,110,0.03) 100%)",
          border: "1px solid rgba(190,170,110,0.15)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 0 40px rgba(0,0,0,0.03), 0 0 80px rgba(0,0,0,0.01)",
        }}
      >
        {/* Corner reticle decorations */}
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 rounded-tl-2xl pointer-events-none" style={{ borderColor: "rgba(190,170,110,0.3)" }} />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 rounded-br-2xl pointer-events-none" style={{ borderColor: "rgba(190,170,110,0.3)" }} />

        {/* 上部: タイプ情報 */}
        <div className="p-6 sm:p-8 text-center border-b" style={{ borderColor: "rgba(160,170,200,0.1)" }}>
          <div className="flex items-center justify-center gap-2 mb-4">
            <span
              className="text-3xl"
              style={{ filter: "drop-shadow(0 2px 8px rgba(160,150,120,0.15))" }}
            >
              {coreStar.archetypeEmoji || "⭐"}
            </span>
            <div>
              <h3
                className="font-display text-2xl font-semibold"
                style={{ color: "rgba(30,35,55,0.85)" }}
              >
                {coreStar.archetypeLabel || "観測中..."}
              </h3>
              {rtDef && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-display"
                    style={{
                      background: rtDef.visualModifier.accentColor.replace(/[\d.]+\)$/, "0.12)"),
                      border: `1px solid ${rtDef.visualModifier.accentColor.replace(/[\d.]+\)$/, "0.25)")}`,
                      color: rtDef.visualModifier.accentColor,
                    }}
                  >
                    {rtDef.emoji} {rtDef.label}
                  </span>
                  {shortCode && (
                    <span
                      className="font-mono-sg text-xs tracking-widest"
                      style={{ color: "rgba(120,125,140,0.5)" }}
                    >
                      {shortCode}
                    </span>
                  )}
                </div>
              )}
              {!rtDef && resolvedType?.family && (
                <p
                  className="font-body text-xs font-semibold tracking-[0.15em] uppercase"
                  style={{ color: "rgba(120,125,140,0.6)" }}
                >
                  {resolvedType.family.name}
                </p>
              )}
            </div>
          </div>

          {/* 観測統計 */}
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <StatPill label="観測回数" value={`${observationStats?.totalAnswered || 0}回`} />
            <StatPill label="平均応答" value={avgTime} />
            <StatPill
              label="観測精度"
              value={`${Math.round(coreStar.confidenceScore * 100)}%`}
              highlight
            />
          </div>
        </div>

        {/* 下部: 強く観測された傾向 */}
        <div className="p-6 sm:p-8">
          {strongDimensions.length > 0 && (
            <>
              <p
                className="font-mono-sg text-xs tracking-[0.2em] uppercase font-semibold mb-5"
                style={{ color: "rgba(120,125,140,0.45)" }}
              >
                強く観測された傾向
              </p>
              <div className="space-y-4">
                {strongDimensions.map((dim, i) => {
                  const isLeft = dim.score < 0;
                  const label = isLeft ? dim.labelLeft : dim.labelRight;
                  const strength = Math.abs(dim.score);
                  const pct = Math.round(strength * 100);

                  return (
                    <motion.div
                      key={dim.id}
                      initial={{ opacity: 0, x: -12 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.06, duration: 0.22 }}
                    >
                      <div className="flex items-baseline justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="font-body text-sm font-semibold"
                            style={{ color: "rgba(30,35,55,0.75)" }}
                          >
                            {label}
                          </span>
                          <span
                            className="font-body text-xs px-1.5 py-0.5 rounded"
                            style={{
                              background: "rgba(160,170,200,0.08)",
                              color: "rgba(120,125,140,0.5)",
                            }}
                          >
                            {CATEGORY_LABELS[dim.category] || dim.category}
                          </span>
                        </div>
                        <span
                          className="font-mono-sg text-xs tabular-nums"
                          style={{ color: "rgba(120,125,140,0.6)" }}
                        >
                          {pct}
                        </span>
                      </div>

                      {/* バー */}
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ background: "rgba(0,0,0,0.04)" }}
                      >
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background:
                              "linear-gradient(90deg, rgba(160,150,120,0.3), rgba(160,150,120,0.5))",
                          }}
                          initial={{ width: 0 }}
                          whileInView={{ width: `${pct}%` }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.3 + i * 0.06, duration: 0.4, ease: "easeOut" }}
                        />
                      </div>

                      {/* 両端ラベル */}
                      <div className="flex justify-between mt-1">
                        <span className="font-body text-xs" style={{ color: "rgba(100,105,130,0.35)" }}>
                          {dim.labelLeft}
                        </span>
                        <span className="font-body text-xs" style={{ color: "rgba(100,105,130,0.35)" }}>
                          {dim.labelRight}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}

          {/* まだ揺れている要素 */}
          {waveringDimensions.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5, duration: 0.25 }}
              className="mt-8"
            >
              <div className="flex items-center gap-2 mb-3">
                <motion.div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "rgba(160,150,120,0.3)" }}
                  animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.7, 0.3] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
                <span
                  className="font-mono-sg text-xs tracking-[0.15em] uppercase font-medium"
                  style={{ color: "rgba(120,125,140,0.4)" }}
                >
                  まだ揺れている要素
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {waveringDimensions.map((dim) => (
                  <span
                    key={dim.id}
                    className="font-body text-xs px-3 py-1.5 rounded-full"
                    style={{
                      background: "rgba(160,170,200,0.05)",
                      border: "1px solid rgba(160,170,200,0.1)",
                      color: "rgba(100,105,130,0.5)",
                    }}
                  >
                    {dim.labelLeft} ⇔ {dim.labelRight}
                    <span
                      className="ml-1.5 font-mono-sg text-xs"
                      style={{ color: "rgba(120,125,140,0.35)" }}
                    >
                      {dim.evidenceCount}件
                    </span>
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function StatPill({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
      style={{
        background: highlight
          ? "rgba(190,170,110,0.1)"
          : "rgba(160,170,200,0.06)",
        border: highlight
          ? "1px solid rgba(190,170,110,0.2)"
          : "1px solid rgba(160,170,200,0.12)",
      }}
    >
      <span
        className="font-body text-xs"
        style={{ color: "rgba(120,125,140,0.5)" }}
      >
        {label}
      </span>
      <span
        className="font-mono-sg text-xs font-semibold tabular-nums"
        style={{
          color: highlight
            ? "rgba(140,120,80,0.8)"
            : "rgba(30,35,55,0.65)",
        }}
      >
        {value}
      </span>
    </div>
  );
}
