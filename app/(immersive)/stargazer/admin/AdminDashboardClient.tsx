// app/stargazer/admin/AdminDashboardClient.tsx
// Stargazer admin analytics dashboard — client component with visualizations.
"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  GlassCard,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import type { RetentionMetrics, FeaturePopularity } from "@/lib/stargazer/analytics";

// ═══ Types ═══

interface DashboardData {
  kpi: {
    totalUsers: number;
    totalObservations: number;
    todayActiveUsers: number;
    avgProphecyAccuracy: number;
  };
  retention: RetentionMetrics;
  popularity: FeaturePopularity[];
  whisperFunnel: {
    shown: number;
    clicked: number;
    alterTurns: number;
  };
  phaseDistribution: Record<string, number>;
}

interface Props {
  data: DashboardData;
}

// ═══ Feature label map (Japanese) ═══

const FEATURE_LABELS: Record<string, { label: string; icon: string }> = {
  inner_weather: { label: "内なる天気", icon: "\u{1F324}\u{FE0F}" },
  blind_spot: { label: "見えない自分", icon: "\u{1F4A7}" },
  prophecy: { label: "行動予言", icon: "\u{1F52E}" },
  unseen_map: { label: "未知の地図", icon: "\u{1F5FA}\u{FE0F}" },
  alter: { label: "もうひとりの自分", icon: "\u{1F464}" },
  ghost_resonance: { label: "似た星の共鳴", icon: "\u{1F47B}" },
  decision_oracle: { label: "選択の予測", icon: "\u{2696}\u{FE0F}" },
  psyche_signature: { label: "心の指紋", icon: "\u{2726}" },
};

const PHASE_LABELS: Record<string, { label: string; color: string }> = {
  surface: { label: "表層", color: "bg-slate-400" },
  awakening: { label: "覚醒", color: "bg-indigo-500" },
  maturity: { label: "成熟", color: "bg-purple-500" },
  deep: { label: "深層", color: "bg-violet-700" },
};

const RANK_BADGES = [
  { bg: "bg-amber-100 text-amber-800 border-amber-300", label: "1st" },
  { bg: "bg-slate-100 text-slate-600 border-slate-300", label: "2nd" },
  { bg: "bg-orange-50 text-orange-700 border-orange-300", label: "3rd" },
];

// ═══ Main Component ═══

export default function AdminDashboardClient({ data }: Props) {
  const { kpi, retention, popularity, whisperFunnel, phaseDistribution } = data;

  const stickiness =
    retention.mau > 0
      ? Math.round((retention.dau / retention.mau) * 100)
      : 0;

  const phaseTotal = Object.values(phaseDistribution).reduce(
    (s, v) => s + v,
    0,
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white">
      {/* Background particles */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(1px 1px at 20% 30%, rgba(168,162,255,0.6) 0%, transparent 100%), radial-gradient(1px 1px at 70% 60%, rgba(168,162,255,0.4) 0%, transparent 100%), radial-gradient(1px 1px at 40% 80%, rgba(200,180,255,0.3) 0%, transparent 100%)",
            backgroundSize: "400px 400px, 300px 300px, 500px 500px",
          }}
        />
        <motion.div
          className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
          animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-20 left-10 w-[400px] h-[400px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
          animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24">
        {/* Header */}
        <FadeInView>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Stargazer Analytics
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                管理者ダッシュボード / 過去30日間
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/stargazer/admin/home-alter"
                className="text-sm text-indigo-400 hover:text-white transition-colors"
              >
                Home Alter
              </Link>
              <Link
                href="/stargazer"
                className="text-sm text-slate-400 hover:text-white transition-colors"
              >
                Stargazer に戻る
              </Link>
            </div>
          </div>
        </FadeInView>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: "総ユーザー数",
              value: kpi.totalUsers,
              unit: "人",
              icon: "\u{1F465}",
              gradient: "from-indigo-500/20 to-purple-500/20",
            },
            {
              label: "総観測回数",
              value: kpi.totalObservations,
              unit: "回",
              icon: "\u{1F52D}",
              gradient: "from-cyan-500/20 to-blue-500/20",
            },
            {
              label: "本日アクティブ",
              value: kpi.todayActiveUsers,
              unit: "人",
              icon: "\u{26A1}",
              gradient: "from-emerald-500/20 to-teal-500/20",
            },
            {
              label: "予言精度",
              value: kpi.avgProphecyAccuracy,
              unit: "%",
              icon: "\u{1F3AF}",
              gradient: "from-amber-500/20 to-orange-500/20",
            },
          ].map((card, i) => (
            <FadeInView key={card.label} delay={i * 0.08}>
              <GlassCard
                className={`!bg-white/[0.06] !border-white/[0.1] !backdrop-blur-xl`}
                hoverEffect={false}
                padding="md"
              >
                <div
                  className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${card.gradient} opacity-40 pointer-events-none`}
                />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{card.icon}</span>
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                      {card.label}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <motion.span
                      className="text-3xl sm:text-4xl font-bold text-white"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.1, duration: 0.22 }}
                    >
                      {typeof card.value === "number"
                        ? card.value.toLocaleString()
                        : card.value}
                    </motion.span>
                    <span className="text-sm text-slate-400">{card.unit}</span>
                  </div>
                </div>
              </GlassCard>
            </FadeInView>
          ))}
        </div>

        {/* Two-column layout */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Retention Metrics */}
          <FadeInView delay={0.15}>
            <GlassCard
              className="!bg-white/[0.06] !border-white/[0.1] !backdrop-blur-xl"
              hoverEffect={false}
              padding="lg"
            >
              <h2 className="text-lg font-bold mb-6 text-white">
                リテンション指標
              </h2>

              {/* DAU / WAU / MAU bars */}
              <div className="space-y-4 mb-6">
                {[
                  { label: "DAU", value: retention.dau, color: "bg-indigo-500" },
                  { label: "WAU", value: retention.wau, color: "bg-purple-500" },
                  { label: "MAU", value: retention.mau, color: "bg-violet-500" },
                ].map((metric) => {
                  const maxVal = Math.max(retention.mau, 1);
                  const pct = Math.round((metric.value / maxVal) * 100);
                  return (
                    <div key={metric.label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-slate-300">
                          {metric.label}
                        </span>
                        <span className="text-sm font-bold text-white">
                          {metric.value.toLocaleString()} 人
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-white/[0.08] overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${metric.color}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Stickiness */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-400/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                      DAU / MAU 比率 (Stickiness)
                    </p>
                    <p className="mt-1 text-2xl font-bold text-white">
                      {stickiness}%
                    </p>
                  </div>
                  <div className="w-14 h-14 rounded-full border-4 border-indigo-400/40 flex items-center justify-center">
                    <span className="text-sm font-bold text-indigo-300">
                      {stickiness}
                    </span>
                  </div>
                </div>
              </div>
            </GlassCard>
          </FadeInView>

          {/* Shadow Whisper Funnel */}
          <FadeInView delay={0.2}>
            <GlassCard
              className="!bg-white/[0.06] !border-white/[0.1] !backdrop-blur-xl"
              hoverEffect={false}
              padding="lg"
            >
              <h2 className="text-lg font-bold mb-6 text-white">
                Shadow Whisper ファネル
              </h2>

              <FunnelVisualization
                steps={[
                  { label: "Whisper 表示", value: whisperFunnel.shown },
                  { label: "クリック", value: whisperFunnel.clicked },
                  { label: "Alter 対話", value: whisperFunnel.alterTurns },
                ]}
              />
            </GlassCard>
          </FadeInView>
        </div>

        {/* Feature Popularity */}
        <FadeInView delay={0.25}>
          <GlassCard
            className="!bg-white/[0.06] !border-white/[0.1] !backdrop-blur-xl mb-8"
            hoverEffect={false}
            padding="lg"
          >
            <h2 className="text-lg font-bold mb-6 text-white">
              機能別ランキング（過去30日）
            </h2>

            {popularity.length === 0 ? (
              <p className="text-sm text-slate-500">データがありません</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs font-medium text-slate-400 uppercase tracking-wider border-b border-white/[0.08]">
                      <th className="pb-3 pr-4">順位</th>
                      <th className="pb-3 pr-4">機能</th>
                      <th className="pb-3 pr-4 text-right">
                        イベント数
                      </th>
                      <th className="pb-3 pr-4 text-right">
                        ユニークユーザー
                      </th>
                      <th className="pb-3 text-right">イベント / ユーザー</th>
                    </tr>
                  </thead>
                  <tbody>
                    {popularity.map((feat, i) => {
                      const meta = FEATURE_LABELS[feat.feature] ?? {
                        label: feat.feature,
                        icon: "\u{2B50}",
                      };
                      const eventsPerUser =
                        feat.uniqueUsers > 0
                          ? (feat.totalEvents / feat.uniqueUsers).toFixed(1)
                          : "0";
                      const rankBadge = i < 3 ? RANK_BADGES[i] : null;

                      return (
                        <motion.tr
                          key={feat.feature}
                          className="border-b border-white/[0.04] last:border-0"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + i * 0.05 }}
                        >
                          <td className="py-3 pr-4">
                            {rankBadge ? (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${rankBadge.bg}`}
                              >
                                {rankBadge.label}
                              </span>
                            ) : (
                              <span className="text-sm text-slate-500 pl-2">
                                {i + 1}
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{meta.icon}</span>
                              <span className="text-sm font-medium text-white">
                                {meta.label}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-right">
                            <span className="text-sm font-semibold text-white">
                              {feat.totalEvents.toLocaleString()}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-right">
                            <span className="text-sm text-slate-300">
                              {feat.uniqueUsers.toLocaleString()}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <span className="text-sm text-slate-400">
                              {eventsPerUser}
                            </span>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </FadeInView>

        {/* Phase Distribution */}
        <FadeInView delay={0.3}>
          <GlassCard
            className="!bg-white/[0.06] !border-white/[0.1] !backdrop-blur-xl"
            hoverEffect={false}
            padding="lg"
          >
            <h2 className="text-lg font-bold mb-6 text-white">
              深度フェーズ分布
            </h2>

            {/* Stacked bar */}
            {phaseTotal > 0 ? (
              <>
                <div className="h-8 rounded-full overflow-hidden flex mb-6">
                  {(
                    ["surface", "awakening", "maturity", "deep"] as const
                  ).map((phase) => {
                    const count = phaseDistribution[phase] ?? 0;
                    const pct =
                      phaseTotal > 0
                        ? Math.round((count / phaseTotal) * 100)
                        : 0;
                    if (pct === 0) return null;
                    const meta = PHASE_LABELS[phase];
                    return (
                      <motion.div
                        key={phase}
                        className={`${meta.color} flex items-center justify-center text-xs font-bold text-white/90`}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        title={`${meta.label}: ${count}人 (${pct}%)`}
                      >
                        {pct >= 8 && `${pct}%`}
                      </motion.div>
                    );
                  })}
                </div>

                {/* Legend cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(
                    ["surface", "awakening", "maturity", "deep"] as const
                  ).map((phase) => {
                    const count = phaseDistribution[phase] ?? 0;
                    const pct =
                      phaseTotal > 0
                        ? Math.round((count / phaseTotal) * 100)
                        : 0;
                    const meta = PHASE_LABELS[phase];
                    return (
                      <div
                        key={phase}
                        className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className={`w-3 h-3 rounded-full ${meta.color}`}
                          />
                          <span className="text-xs font-medium text-slate-400">
                            {meta.label}
                          </span>
                        </div>
                        <p className="text-xl font-bold text-white">
                          {count.toLocaleString()}
                          <span className="text-xs font-normal text-slate-500 ml-1">
                            人 ({pct}%)
                          </span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">データがありません</p>
            )}
          </GlassCard>
        </FadeInView>
      </div>
    </div>
  );
}

// ═══ Funnel Visualization ═══

function FunnelVisualization({
  steps,
}: {
  steps: { label: string; value: number }[];
}) {
  const maxVal = Math.max(...steps.map((s) => s.value), 1);

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const widthPct = Math.max(
          Math.round((step.value / maxVal) * 100),
          12,
        );
        const prevVal = i > 0 ? steps[i - 1].value : null;
        const convRate =
          prevVal !== null && prevVal > 0
            ? Math.round((step.value / prevVal) * 100)
            : null;

        return (
          <div key={step.label}>
            {/* Conversion rate arrow */}
            {convRate !== null && (
              <div className="flex items-center gap-2 ml-4 mb-1">
                <svg
                  className="w-3 h-3 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
                <span className="text-xs font-medium text-slate-400">
                  {convRate}% 転換
                </span>
              </div>
            )}

            {/* Bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-300">
                    {step.label}
                  </span>
                  <span className="text-sm font-bold text-white">
                    {step.value.toLocaleString()}
                  </span>
                </div>
                <div className="h-6 rounded-lg bg-white/[0.06] overflow-hidden">
                  <motion.div
                    className="h-full rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${widthPct}%` }}
                    transition={{
                      duration: 0.4,
                      delay: i * 0.15,
                      ease: "easeOut",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
