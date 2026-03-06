"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { StarMap, ResolvedType, PersonalityProfile } from "@/types/stargazer";
import GaugeMetric from "../shared/GaugeMetric";
import EvidenceLine from "../shared/EvidenceLine";

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
  constellationInfo: {
    emoji: string;
    description: string;
    keywords: string[];
  } | null;
  periodFilter: string;
  onPeriodFilterChange: (p: string) => void;
}

const PERIODS = [
  { key: "today", label: "今日" },
  { key: "7d", label: "7日" },
  { key: "30d", label: "30日" },
];

const QUICK_ACTIONS = [
  { icon: "🔗", label: "共鳴設定", desc: "他の人と比較", href: "/stargazer/settings" },
  { icon: "✨", label: "共鳴通知", desc: "変化を受け取る", href: "/stargazer/inbox" },
  { icon: "↗", label: "深掘り対話", desc: "AIと対話", href: "/stargazer/dialogue" },
];

export default function OverviewTab({
  starMap,
  resolvedType,
  dimensionDetails,
  observationStats,
  constellationInfo,
  periodFilter,
  onPeriodFilterChange,
}: Props) {
  const coreStar = starMap.coreStar;
  const hesitationLabel =
    (observationStats?.avgHesitation ?? 0) >= 70
      ? "高"
      : (observationStats?.avgHesitation ?? 0) >= 40
        ? "中"
        : "低";

  const avgTime = observationStats?.avgResponseTimeMs
    ? `${(observationStats.avgResponseTimeMs / 1000).toFixed(1)}s`
    : "—";

  const topDims = [...dimensionDetails]
    .sort((a, b) => b.evidenceCount - a.evidenceCount)
    .slice(0, 2);
  const themeStr =
    topDims.length >= 2
      ? `${topDims[0].labelRight}×${topDims[1].labelRight}`
      : topDims.length === 1
        ? topDims[0].labelRight
        : "";

  const liveSkyMetrics = dimensionDetails
    .filter((d) => d.evidenceCount > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((d) => ({
      id: d.id,
      name: d.labelRight,
      value: Math.round(d.score * 100),
      count: d.evidenceCount,
      avgLow: 35,
      avgHigh: 65,
    }));

  return (
    <div className="space-y-10 max-w-[720px] mx-auto">
      {/* ===== 星カード (Hero) ===== */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-hero relative overflow-hidden !py-12 !px-8 text-center"
      >
        {/* 背景グロー — 強化版 */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[350px] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 50% 30%, rgba(251,191,36,0.15) 0%, rgba(251,191,36,0.04) 50%, transparent 80%)",
            filter: "blur(60px)",
          }}
        />

        {/* 星アイコン */}
        <div className="relative mx-auto w-20 h-20 mb-6 flex items-center justify-center">
          <span className="text-5xl relative z-10">
            {constellationInfo?.emoji || "⭐"}
          </span>
          <div className="absolute inset-[-8px] rounded-full border border-amber-400/20 animate-[ping_3s_ease-in-out_infinite]" />
        </div>

        {/* 星の名前 — Noto Serif JP + Cormorant Garamond */}
        <h1
          className="text-4xl font-semibold text-white mb-1"
          style={{
            fontFamily: "'Noto Serif JP', 'Cormorant Garamond', Georgia, serif",
            textShadow: "0 0 40px rgba(251,191,36,0.25)",
          }}
        >
          {coreStar?.constellationLabel || "観測中..."}
        </h1>

        {/* ファミリー名 — ALTIS強化 */}
        {resolvedType && (
          <p
            className="font-body text-sm font-bold uppercase mb-6"
            style={{
              color: "rgba(251,191,36,0.8)",
              letterSpacing: "0.3em",
              fontSize: "0.75rem",
            }}
          >
            {resolvedType.family?.name || ""}
          </p>
        )}

        {/* キャッチフレーズ */}
        {constellationInfo?.description && (
          <p
            className="text-xl italic text-white/60 mb-2 max-w-lg mx-auto"
            style={{ fontFamily: "'Noto Serif JP', 'Cormorant Garamond', Georgia, serif" }}
          >
            「{constellationInfo.description}」
          </p>
        )}
        {resolvedType?.display?.tagline && (
          <p className="font-body text-base text-white/50 max-w-md mx-auto">
            {resolvedType.display.tagline}
          </p>
        )}

        {/* 根拠行 — pill型 強化 */}
        <div className="flex justify-center">
          <EvidenceLine
            count={observationStats?.totalAnswered || 0}
            avgResponseTime={avgTime}
            hesitation={hesitationLabel}
            theme={themeStr}
          />
        </div>
      </motion.div>

      {/* ===== LIVE SKY (Instrument card) ===== */}
      {liveSkyMetrics.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card-instrument"
        >
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="font-body text-xs font-semibold tracking-[0.2em] text-white/40 uppercase">
                Live Sky
              </span>
            </div>
            {/* 期間切替 */}
            <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => onPeriodFilterChange(p.key)}
                  className={`px-3 py-1 rounded-md font-body text-xs font-semibold transition-all ${
                    periodFilter === p.key
                      ? "bg-amber-500/20 text-amber-300 shadow-sm"
                      : "text-white/35 hover:text-white/60"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 計器リスト */}
          <div>
            {liveSkyMetrics.map((metric) => (
              <GaugeMetric
                key={metric.id}
                name={metric.name}
                value={metric.value}
                count={metric.count}
                avgLow={metric.avgLow}
                avgHigh={metric.avgHigh}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* ===== クイックアクション ===== */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-3 gap-3"
      >
        {QUICK_ACTIONS.map((action) => (
          <Link key={action.label} href={action.href}>
            <div className="group flex flex-col items-center gap-2 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-amber-500/[0.06] hover:border-amber-500/15 transition-all duration-200">
              <span className="text-xl group-hover:scale-110 transition-transform">
                {action.icon}
              </span>
              <span className="font-body text-sm font-semibold text-white/70 group-hover:text-white transition-colors">
                {action.label}
              </span>
              <span className="font-body text-xs text-white/30">
                {action.desc}
              </span>
            </div>
          </Link>
        ))}
      </motion.div>
    </div>
  );
}
