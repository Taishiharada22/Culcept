// app/stargazer/_tabs/star-map/OverviewSubView.tsx
// アーキタイプタブ「概要」サブビュー — アイデンティティの要約を1画面で
"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import ArchetypeHero from "../../_components/ArchetypeHero";
import { MottoCard } from "./shared";
import EmptyState from "../../_shared/EmptyState";
import { useArchetypeTheme } from "../../_components/ArchetypeThemeProvider";
import { hexToRgba } from "../../_utils/color";
import { hapticLight } from "@/lib/rendezvous/haptics";
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";
import type { ArchetypeResult } from "@/lib/stargazer/archetypeResolver";
import type { StarMapSubView } from "./StarMapSubNav";
import type { WeeklyReport } from "@/lib/stargazer/weeklyReportGenerator";
import WeeklyReportMiniCard from "./WeeklyReportMiniCard";

interface OverviewSubViewProps {
  hasData: boolean;
  archetypeResult?: ArchetypeResult | null;
  totalObservations: number;
  insightTeaser?: string;
  weeklyReport?: WeeklyReport | null;
  onNavigateToSubView: (view: StarMapSubView) => void;
  onNavigateToObserve?: () => void;
  onOpenWeeklyReport?: () => void;
}

export default function OverviewSubView({
  hasData,
  archetypeResult,
  totalObservations,
  insightTeaser,
  weeklyReport,
  onNavigateToSubView,
  onNavigateToObserve,
  onOpenWeeklyReport,
}: OverviewSubViewProps) {
  const { theme } = useArchetypeTheme();
  const primary = theme?.palette.primary ?? "#C9A96E";

  // ── 完全空状態: データなし ──
  if (!hasData) {
    return (
      <EmptyState
        message="観測を重ねると、あなたのアーキタイプがここに浮かび上がります。"
        submessage="最初の観測から、あなたの内面のパターンが形成されはじめます"
        actionLabel="観測を始める"
        onAction={onNavigateToObserve}
      />
    );
  }

  const archetypeDef = archetypeResult
    ? getArchetypeByCode(archetypeResult.code)
    : null;

  // ── 部分データ: アーキタイプ未確定 ──
  if (!archetypeResult || !archetypeDef) {
    const requiredObs = 5;
    const progress = Math.min(totalObservations / requiredObs, 1);

    return (
      <div className="space-y-4 sm:space-y-6 lg:space-y-8 pb-6 sm:pb-8 lg:pb-12 xl:max-w-4xl xl:mx-auto">
        {/* プログレスカード */}
        <motion.div
          className="relative rounded-2xl overflow-hidden p-6 text-center"
          style={{
            background: theme
              ? `linear-gradient(135deg, ${hexToRgba(theme.palette.primary, 0.06)}, ${hexToRgba(theme.palette.primary, 0.02)})`
              : "linear-gradient(135deg, rgba(176,144,80,0.06), rgba(176,144,80,0.02))",
            border: `1px solid ${theme ? hexToRgba(theme.palette.primary, 0.12) : "rgba(176,144,80,0.12)"}`,
          }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
        >
          {/* プログレスリング */}
          <div className="mx-auto w-20 h-20 mb-4 relative">
            <svg viewBox="0 0 80 80" className="w-full h-full" aria-hidden="true">
              <circle
                cx="40"
                cy="40"
                r="34"
                fill="none"
                stroke={
                  theme
                    ? hexToRgba(theme.palette.primary, 0.1)
                    : "rgba(176,144,80,0.1)"
                }
                strokeWidth="4"
              />
              <motion.circle
                cx="40"
                cy="40"
                r="34"
                fill="none"
                stroke={
                  theme?.palette.primary ?? "rgba(176,144,80,0.8)"
                }
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 34}`}
                initial={{
                  strokeDashoffset: 2 * Math.PI * 34,
                }}
                animate={{
                  strokeDashoffset:
                    2 * Math.PI * 34 * (1 - progress),
                }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                transform="rotate(-90 40 40)"
              />
            </svg>
            <div
              className="absolute inset-0 flex items-center justify-center font-mono-sg text-lg font-bold"
              style={{
                color:
                  theme?.palette.textLabel ?? "rgba(140,120,60,0.9)",
              }}
            >
              {totalObservations}/{requiredObs}
            </div>
          </div>

          <p
            className="font-display text-base font-bold"
            style={{
              color: theme?.palette.text ?? "rgba(20,25,45,0.95)",
            }}
          >
            あなたの原型を観測中
          </p>
          <p
            className="text-sm mt-2 leading-relaxed"
            style={{
              color:
                theme?.palette.textMuted ?? "rgba(60,65,85,0.7)",
            }}
          >
            あと{Math.max(requiredObs - totalObservations, 1)}
            回の観測で、あなたの内面の原型が浮かび上がります
          </p>
        </motion.div>

        <NavigationCTAs onNavigateToSubView={onNavigateToSubView} />
      </div>
    );
  }

  // ── 完全データ: メインビュー ──
  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 pb-6 sm:pb-8 lg:pb-12">
      {/* Archetype Hero — the hero moment */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, delay: 0.1 }}
      >
        <ArchetypeHero
          archetypeCode={archetypeResult.code}
          confidence={archetypeResult.confidence}
          observationCount={totalObservations}
        />
      </motion.div>

      {/* Motto Card */}
      {archetypeDef.motto && (
        <MottoCard
          motto={archetypeDef.motto}
          code={archetypeResult.code}
          englishName={archetypeDef.englishName}
        />
      )}

      {/* 4軸レーダーチャート — あなた vs 平均 */}
      <AxisRadarChart archetypeResult={archetypeResult} />

      {/* Insight Teaser — actionable daily hint */}
      {insightTeaser && (
        <motion.div
          className="rounded-xl p-4"
          style={{
            background: theme
              ? hexToRgba(theme.palette.primary, 0.04)
              : "rgba(176,144,80,0.04)",
            borderLeft: `3px solid ${theme ? hexToRgba(theme.palette.primary, 0.3) : "rgba(176,144,80,0.3)"}`,
          }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <div className="flex items-start gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme?.palette.textLabel ?? "rgba(140,120,60,0.8)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <div>
              <span
                className="text-[10px] font-mono-sg uppercase tracking-wider block mb-1"
                style={{ color: theme?.palette.textLabel ?? "rgba(140,120,60,0.7)" }}
              >
                今日の観測ヒント
              </span>
              <p
                className="text-sm leading-relaxed"
                style={{ color: theme?.palette.text ?? "rgba(20,25,45,0.85)" }}
              >
                {insightTeaser}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Weekly Report Mini */}
      {weeklyReport && weeklyReport.slides.length > 0 && (
        <WeeklyReportMiniCard
          report={weeklyReport}
          onOpenFull={onOpenWeeklyReport}
        />
      )}

      {/* Navigation CTAs */}
      <NavigationCTAs onNavigateToSubView={onNavigateToSubView} />

      {/* 他のタイプも見る */}
      <Link
        href="/type"
        className="flex items-center justify-center gap-2 mt-6 py-3 px-5 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
        style={{
          background: theme ? hexToRgba(primary, 0.06) : "rgba(176,144,80,0.06)",
          border: `1px solid ${theme ? hexToRgba(primary, 0.12) : "rgba(176,144,80,0.12)"}`,
        }}
      >
        <span
          className="text-sm font-semibold"
          style={{ color: theme?.palette.text ?? "rgba(20,25,45,0.7)" }}
        >
          24のタイプを見る
        </span>
        <span style={{ color: theme?.palette.textMuted ?? "rgba(60,65,85,0.4)", fontSize: 14 }}>→</span>
      </Link>
    </div>
  );
}

// ── CTA Cards ──

function NavigationCTAs({
  onNavigateToSubView,
}: {
  onNavigateToSubView: (view: StarMapSubView) => void;
}) {
  const { theme } = useArchetypeTheme();

  const primary = theme?.palette.primary ?? "#C9A96E";
  const accent = theme?.palette.accent ?? "#7C3AED";

  const ctas = [
    {
      key: "map" as StarMapSubView,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
          <line x1="12" y1="7" x2="5" y2="17" /><line x1="12" y1="7" x2="19" y2="17" /><line x1="7" y1="19" x2="17" y2="19" />
        </svg>
      ),
      title: "特性マップを見る",
      description: "特性マップで強みと矛盾を発見する",
      borderColor: hexToRgba(primary, 0.4),
    },
    {
      key: "profile" as StarMapSubView,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
      ),
      title: "強み・関係性を見る",
      description: "強みの活かし方と関係性のパターンを知る",
      borderColor: hexToRgba(accent, 0.4),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 xl:gap-4">
      {ctas.map((cta, i) => (
        <motion.button
          key={cta.key}
          onClick={() => { onNavigateToSubView(cta.key); hapticLight(); }}
          className="card-section text-left p-4 group"
          style={{ borderLeft: `3px solid ${cta.borderColor}` }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 + i * 0.1 }}
          whileTap={{ scale: 0.97 }}
        >
          <span
            className="block mb-2"
            style={{
              color:
                theme?.palette.textLabel ?? "rgba(140,120,60,0.8)",
            }}
          >
            {cta.icon}
          </span>
          <span
            className="font-display text-sm font-bold block"
            style={{
              color: theme?.palette.text ?? "rgba(20,25,45,0.95)",
            }}
          >
            {cta.title}
          </span>
          <span
            className="text-xs mt-1 block leading-relaxed"
            style={{
              color:
                theme?.palette.textMuted ?? "rgba(60,65,85,0.6)",
            }}
          >
            {cta.description}
          </span>
          <span
            className="text-xs font-bold mt-2 block group-hover:translate-x-1 transition-transform"
            style={{
              color:
                theme?.palette.textLabel ?? "rgba(140,120,60,0.7)",
            }}
          >
            →
          </span>
        </motion.button>
      ))}
    </div>
  );
}

// ── 4軸レーダーチャート ──

const AXIS_LABELS = [
  { key: "cognition", label: "認知", sub: "分析 ↔ 直感 ↔ 体感" },
  { key: "emotion", label: "感情", sub: "静穏 ↔ 躍動" },
  { key: "social", label: "社会性", sub: "内向 ↔ 外向" },
  { key: "execution", label: "実行", sub: "最適化 ↔ 探索" },
] as const;

function AxisRadarChart({ archetypeResult }: { archetypeResult: ArchetypeResult }) {
  const { theme } = useArchetypeTheme();
  const primary = theme?.palette.primary ?? "#C9A96E";
  const accent = theme?.palette.accent ?? "#7C3AED";

  // ユーザーの4軸スコアを0-1の強度に変換
  const userScores = [
    archetypeResult.layer1?.score ?? 0, // cognition: 偏りの強さ
    archetypeResult.layer2?.score ?? 0, // emotion
    archetypeResult.layer3?.score ?? 0, // social
    archetypeResult.layer4?.score ?? 0, // execution
  ].map((s) => Math.min(Math.abs(s) * 1.2 + 0.3, 1)); // 0.3-1.0 に正規化

  // 平均値（タイプ平均は偏りが少ない = 0.5前後）
  const avgScores = [0.5, 0.5, 0.5, 0.5];

  // ユーザーの方向（＋/-）
  const userDirections = [
    archetypeResult.layer1?.code ?? "A", // A/N/S
    archetypeResult.layer2?.code ?? "C", // C/V
    archetypeResult.layer3?.code ?? "I", // I/E
    archetypeResult.layer4?.code ?? "O", // O/X
  ];

  const directionLabels: Record<string, string> = {
    A: "分析型", N: "直感型", S: "体感型",
    C: "静穏型", V: "躍動型",
    I: "内向型", E: "外向型",
    O: "最適化型", X: "探索型",
  };

  const cx = 120, cy = 120, r = 85;
  const n = 4;

  // 多角形頂点の計算
  const getPoint = (i: number, val: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * r * val,
      y: cy + Math.sin(angle) * r * val,
    };
  };

  const toPath = (scores: number[]) =>
    scores
      .map((s, i) => {
        const p = getPoint(i, s);
        return `${i === 0 ? "M" : "L"}${p.x},${p.y}`;
      })
      .join(" ") + " Z";

  // グリッド線
  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  return (
    <motion.div
      className="rounded-2xl p-5"
      style={{
        background: theme
          ? `linear-gradient(135deg, ${hexToRgba(primary, 0.04)}, ${hexToRgba(primary, 0.01)})`
          : "linear-gradient(135deg, rgba(176,144,80,0.04), rgba(176,144,80,0.01))",
        border: `1px solid ${theme ? hexToRgba(primary, 0.1) : "rgba(176,144,80,0.1)"}`,
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
    >
      {/* ヘッダー */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[10px] font-mono-sg uppercase tracking-wider"
          style={{ color: theme?.palette.textLabel ?? "rgba(140,120,60,0.7)" }}
        >
          Your Axis Profile
        </span>
      </div>

      {/* SVGレーダー */}
      <div className="flex justify-center">
        <svg viewBox="0 0 240 240" className="w-full max-w-[240px]" aria-label="4軸レーダーチャート">
          {/* グリッド */}
          {gridLevels.map((lv) => (
            <polygon
              key={lv}
              points={Array.from({ length: n }, (_, i) => {
                const p = getPoint(i, lv);
                return `${p.x},${p.y}`;
              }).join(" ")}
              fill="none"
              stroke={theme ? hexToRgba(primary, 0.08) : "rgba(176,144,80,0.08)"}
              strokeWidth={lv === 1.0 ? 1 : 0.5}
            />
          ))}

          {/* 軸線 */}
          {Array.from({ length: n }, (_, i) => {
            const p = getPoint(i, 1);
            return (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={p.x}
                y2={p.y}
                stroke={theme ? hexToRgba(primary, 0.1) : "rgba(176,144,80,0.1)"}
                strokeWidth={0.5}
              />
            );
          })}

          {/* 平均エリア */}
          <motion.path
            d={toPath(avgScores)}
            fill={hexToRgba(accent, 0.06)}
            stroke={hexToRgba(accent, 0.25)}
            strokeWidth={1}
            strokeDasharray="4 3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          />

          {/* ユーザーエリア */}
          <motion.path
            d={toPath(userScores)}
            fill={hexToRgba(primary, 0.12)}
            stroke={primary}
            strokeWidth={1.5}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.5, ease: "easeOut" }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />

          {/* ユーザーの頂点ドット */}
          {userScores.map((s, i) => {
            const p = getPoint(i, s);
            return (
              <motion.circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={3.5}
                fill={primary}
                stroke="white"
                strokeWidth={1.5}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 + i * 0.1 }}
              />
            );
          })}

          {/* ラベル */}
          {AXIS_LABELS.map((axis, i) => {
            const p = getPoint(i, 1.25);
            return (
              <text
                key={axis.key}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="font-display"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  fill: theme?.palette.text ?? "rgba(20,25,45,0.85)",
                }}
              >
                {axis.label}
              </text>
            );
          })}
        </svg>
      </div>

      {/* 軸ごとのスコア詳細 */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        {AXIS_LABELS.map((axis, i) => (
          <div
            key={axis.key}
            className="rounded-lg p-2.5"
            style={{
              background: theme ? hexToRgba(primary, 0.03) : "rgba(176,144,80,0.03)",
              border: `1px solid ${theme ? hexToRgba(primary, 0.06) : "rgba(176,144,80,0.06)"}`,
            }}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="text-xs font-bold"
                style={{ color: theme?.palette.text ?? "rgba(20,25,45,0.9)" }}
              >
                {axis.label}
              </span>
              <span
                className="text-[10px] font-mono-sg px-1.5 py-0.5 rounded"
                style={{
                  background: hexToRgba(primary, 0.08),
                  color: primary,
                  fontWeight: 600,
                }}
              >
                {directionLabels[userDirections[i]] ?? userDirections[i]}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: hexToRgba(primary, 0.08) }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: primary }}
                initial={{ width: 0 }}
                animate={{ width: `${userScores[i] * 100}%` }}
                transition={{ delay: 0.8 + i * 0.1, duration: 0.5 }}
              />
            </div>
            <span
              className="text-[9px] mt-1 block"
              style={{ color: theme?.palette.textMuted ?? "rgba(60,65,85,0.5)" }}
            >
              {Math.round(userScores[i] * 100)}% の偏り
            </span>
          </div>
        ))}
      </div>

      {/* 凡例 */}
      <div className="flex items-center justify-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-full" style={{ background: primary }} />
          <span className="text-[9px]" style={{ color: theme?.palette.textMuted ?? "rgba(60,65,85,0.5)" }}>あなた</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded-full" style={{ background: hexToRgba(accent, 0.4), borderTop: `1px dashed ${hexToRgba(accent, 0.6)}` }} />
          <span className="text-[9px]" style={{ color: theme?.palette.textMuted ?? "rgba(60,65,85,0.5)" }}>全ユーザー平均</span>
        </div>
      </div>
    </motion.div>
  );
}
