"use client";

import { motion } from "framer-motion";
import type { StarMap, ResolvedType, PersonalityProfile } from "@/types/stargazer";
import ConstellationHero from "../../_components/ConstellationHero";

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
  starMap: StarMap;
  resolvedType: ResolvedType | null;
  personalityProfile: PersonalityProfile | null;
  dimensionDetails: DimensionDetail[];
  observationStats: ObservationStats | null;
  archetypeInfo: {
    emoji: string;
    description: string;
    keywords: string[];
  } | null;
}

export default function TraitsTab({
  starMap,
  resolvedType,
  dimensionDetails,
  observationStats,
  archetypeInfo,
}: Props) {
  const coreStar = starMap.coreStar;
  if (!coreStar) return null;

  const topTraits = [...dimensionDetails]
    .filter((d) => d.evidenceCount > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return (
    <div className="space-y-10 max-w-[880px] mx-auto">
      {/* 特性マップ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(15,15,28,0.9) 0%, rgba(5,5,15,0.95) 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          minHeight: "320px",
        }}
      >
        <div className="p-4 sm:p-6">
          <ConstellationHero
            coreStar={coreStar}
            archetypeInfo={archetypeInfo}
            visual={resolvedType?.visual}
            dimensionDetails={dimensionDetails}
            observationStats={observationStats || undefined}
          />
        </div>
      </motion.div>

      {/* エンジン詳細 */}
      {resolvedType && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card-hero"
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">⚡</span>
            <h3 className="font-display text-xl font-semibold text-white">
              {resolvedType.family?.tagline || resolvedType.label || ""}{" "}
              {resolvedType.orbit?.tagline || ""}
            </h3>
          </div>

          {/* タグ */}
          <div className="flex flex-wrap gap-2 mb-5">
            {resolvedType.family && (
              <span className="px-3 py-1 rounded-full text-xs font-body font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/20">
                {resolvedType.family.name}
              </span>
            )}
            {resolvedType.orbit && (
              <span className="px-3 py-1 rounded-full text-xs font-body font-semibold bg-white/[0.06] text-white/60 border border-white/10">
                {resolvedType.orbit.key}
              </span>
            )}
            <span className="px-3 py-1 rounded-full text-xs font-mono-sg font-semibold bg-amber-500/10 text-amber-300/80 tabular-nums">
              {Math.round((coreStar.confidenceScore ?? 0) * 100)}%
            </span>
          </div>

          {/* 説明 */}
          {resolvedType.display?.tagline && (
            <div className="mb-5">
              <p className="font-body text-base font-medium text-white/80 mb-1">
                あなたを動かす中心動機:
              </p>
              <p
                className="text-lg italic text-white/70 leading-relaxed"
                style={{ fontFamily: "'Noto Serif JP', 'Cormorant Garamond', Georgia, serif" }}
              >
                「{resolvedType.display.tagline}」
              </p>
            </div>
          )}

          {/* 根拠 — card-info style */}
          <div className="card-info mb-6">
            <p className="font-mono-sg text-sm text-white/50">
              📊 根拠: 観測{observationStats?.totalAnswered || 0}件中、
              {topTraits.length > 0 && (
                <>
                  {topTraits[0].labelRight}スコア
                  {Math.round(topTraits[0].score * 100)}が最も高く
                  {topTraits.length > 1 &&
                    `、${topTraits[1].labelRight}${Math.round(topTraits[1].score * 100)}`}
                  {topTraits.length > 2 &&
                    `、${topTraits[2].labelRight}${Math.round(topTraits[2].score * 100)}と続く`}
                </>
              )}
            </p>
          </div>

          {/* 推進力バー — ラベルを上段配置 */}
          <div>
            <h4 className="font-body text-[13px] font-semibold tracking-[0.15em] text-white/45 uppercase mb-4">
              推進力の構成
            </h4>
            <div className="space-y-1">
              {topTraits.map((trait) => {
                const pct = Math.round(trait.score * 100);
                return (
                  <div key={trait.id} className="py-3">
                    {/* ラベルと数値を上段に */}
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="font-body text-sm font-semibold text-white/75">
                        {trait.labelRight}
                      </span>
                      <span className="font-mono-sg text-sm font-semibold text-amber-300 tabular-nums">
                        {pct}
                      </span>
                    </div>
                    {/* バー */}
                    <div className="h-4 bg-white/[0.03] rounded overflow-hidden">
                      <motion.div
                        className="h-full rounded bg-gradient-to-r from-amber-600/90 via-amber-400 to-amber-300 relative"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                      >
                        <div className="absolute right-0 top-0 h-full w-3 bg-gradient-to-l from-white/25 to-transparent" />
                      </motion.div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
