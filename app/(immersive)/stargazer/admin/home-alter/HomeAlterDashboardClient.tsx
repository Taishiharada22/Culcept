// app/(immersive)/stargazer/admin/home-alter/HomeAlterDashboardClient.tsx
// Home Alter 実運用ダッシュボード — Ambiguity Engine 指標を可視化
"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  GlassCard,
  FadeInView,
} from "@/components/ui/glassmorphism-design";

// ═══ Types ═══

interface DashboardData {
  period: string;
  totalJudgments: number;
  actionShapeDistribution: Record<string, number>;
  stanceDistribution: Record<string, number>;
  responseModeDistribution: Record<string, number>;
  queryDomainDistribution: Record<string, number>;
  ambiguityDistribution: { low: number; mid: number; high: number; extreme: number };
  dailyUsage: Record<string, number>;
  clarifyTotal: number;
  followup: {
    total: number;
    executed: number;
    notExecuted: number;
    satisfactionDistribution: Record<number, number>;
  };
}

interface Props {
  data: DashboardData;
}

// ═══ Label Maps ═══

const MODE_META: Record<string, { label: string; color: string; desc: string }> = {
  conclude: { label: "断言", color: "bg-emerald-500", desc: "情報十分 → 最善手提示" },
  branch:   { label: "分岐", color: "bg-indigo-500", desc: "中曖昧 → 主案+分岐" },
  clarify:  { label: "確認", color: "bg-amber-500", desc: "高リスク+極曖昧 → 質問" },
  unknown:  { label: "不明", color: "bg-slate-500", desc: "旧バージョン" },
};

const DOMAIN_META: Record<string, { label: string; icon: string; color: string }> = {
  romance:  { label: "恋愛", icon: "\u{1F497}", color: "bg-pink-500" },
  work:     { label: "仕事", icon: "\u{1F4BC}", color: "bg-blue-500" },
  friend:   { label: "友人", icon: "\u{1F91D}", color: "bg-green-500" },
  family:   { label: "家族", icon: "\u{1F3E0}", color: "bg-orange-500" },
  self:     { label: "自己", icon: "\u{1F31F}", color: "bg-purple-500" },
  general:  { label: "汎用", icon: "\u{1F30D}", color: "bg-slate-400" },
  unknown:  { label: "不明", icon: "\u{2753}", color: "bg-slate-500" },
};

const AMBIG_META: Record<string, { label: string; color: string }> = {
  low:     { label: "低 (0-0.3)", color: "bg-emerald-500" },
  mid:     { label: "中 (0.3-0.6)", color: "bg-sky-500" },
  high:    { label: "高 (0.6-0.83)", color: "bg-amber-500" },
  extreme: { label: "極高 (0.83+)", color: "bg-red-500" },
};

const SHAPE_LABELS: Record<string, string> = {
  bounded_go: "期限つき実行",
  skip: "見送り",
  defer_with_trigger: "条件付き延期",
  prepare_then_go: "準備→実行",
  observe_first: "まず観察",
  split_test: "小さく試す",
};

// ═══ Component ═══

export default function HomeAlterDashboardClient({ data }: Props) {
  const {
    totalJudgments,
    responseModeDistribution: modeDist,
    queryDomainDistribution: domainDist,
    ambiguityDistribution: ambigDist,
    actionShapeDistribution: shapeDist,
    dailyUsage,
    clarifyTotal,
    followup,
  } = data;

  const executionRate =
    followup.total > 0
      ? Math.round((followup.executed / followup.total) * 100)
      : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(1px 1px at 30% 40%, rgba(168,162,255,0.6) 0%, transparent 100%), radial-gradient(1px 1px at 60% 70%, rgba(168,162,255,0.4) 0%, transparent 100%)",
            backgroundSize: "400px 400px, 300px 300px",
          }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24">
        {/* Header */}
        <FadeInView>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Home Alter Analytics
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Ambiguity Engine / 過去{data.period}
              </p>
            </div>
            <Link
              href="/stargazer/admin"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Stargazer Admin に戻る
            </Link>
          </div>
        </FadeInView>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "総判断数", value: totalJudgments, unit: "回", gradient: "from-indigo-500/20 to-purple-500/20" },
            { label: "Clarify 発火", value: clarifyTotal, unit: "回", gradient: "from-amber-500/20 to-orange-500/20" },
            { label: "フォローアップ", value: followup.total, unit: "件", gradient: "from-cyan-500/20 to-blue-500/20" },
            { label: "実行率", value: executionRate ?? "N/A", unit: executionRate !== null ? "%" : "", gradient: "from-emerald-500/20 to-teal-500/20" },
          ].map((card, i) => (
            <FadeInView key={card.label} delay={i * 0.08}>
              <GlassCard className="!bg-white/[0.06] !border-white/[0.1] !backdrop-blur-xl" hoverEffect={false} padding="md">
                <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${card.gradient} opacity-40 pointer-events-none`} />
                <div className="relative">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{card.label}</span>
                  <div className="mt-2 flex items-baseline gap-1">
                    <motion.span
                      className="text-3xl font-bold text-white"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                    >
                      {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                    </motion.span>
                    <span className="text-sm text-slate-400">{card.unit}</span>
                  </div>
                </div>
              </GlassCard>
            </FadeInView>
          ))}
        </div>

        {/* Row: Response Mode + Query Domain */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Response Mode Distribution */}
          <FadeInView delay={0.15}>
            <GlassCard className="!bg-white/[0.06] !border-white/[0.1] !backdrop-blur-xl" hoverEffect={false} padding="lg">
              <h2 className="text-lg font-bold mb-6 text-white">応答モード分布</h2>
              <DistributionBars
                items={Object.entries(modeDist).map(([key, count]) => ({
                  key,
                  label: MODE_META[key]?.label ?? key,
                  desc: MODE_META[key]?.desc ?? "",
                  color: MODE_META[key]?.color ?? "bg-slate-500",
                  count,
                }))}
                total={totalJudgments}
              />
            </GlassCard>
          </FadeInView>

          {/* Query Domain Distribution */}
          <FadeInView delay={0.2}>
            <GlassCard className="!bg-white/[0.06] !border-white/[0.1] !backdrop-blur-xl" hoverEffect={false} padding="lg">
              <h2 className="text-lg font-bold mb-6 text-white">質問ドメイ���分布</h2>
              <DistributionBars
                items={Object.entries(domainDist)
                  .sort((a, b) => b[1] - a[1])
                  .map(([key, count]) => ({
                    key,
                    label: `${DOMAIN_META[key]?.icon ?? ""} ${DOMAIN_META[key]?.label ?? key}`,
                    color: DOMAIN_META[key]?.color ?? "bg-slate-500",
                    count,
                  }))}
                total={totalJudgments}
              />
            </GlassCard>
          </FadeInView>
        </div>

        {/* Row: Ambiguity + Action Shape */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Ambiguity Distribution */}
          <FadeInView delay={0.25}>
            <GlassCard className="!bg-white/[0.06] !border-white/[0.1] !backdrop-blur-xl" hoverEffect={false} padding="lg">
              <h2 className="text-lg font-bold mb-6 text-white">曖昧性ス���ア分布</h2>
              {totalJudgments > 0 ? (
                <>
                  {/* Stacked bar */}
                  <div className="h-8 rounded-full overflow-hidden flex mb-4">
                    {(["low", "mid", "high", "extreme"] as const).map((key) => {
                      const count = ambigDist[key];
                      const pct = totalJudgments > 0 ? Math.round((count / totalJudgments) * 100) : 0;
                      if (pct === 0) return null;
                      return (
                        <motion.div
                          key={key}
                          className={`${AMBIG_META[key].color} flex items-center justify-center text-xs font-bold text-white/90`}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                          title={`${AMBIG_META[key].label}: ${count}件 (${pct}%)`}
                        >
                          {pct >= 10 && `${pct}%`}
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="grid grid-cols-2 gap-3">
                    {(["low", "mid", "high", "extreme"] as const).map((key) => {
                      const count = ambigDist[key];
                      const pct = totalJudgments > 0 ? Math.round((count / totalJudgments) * 100) : 0;
                      return (
                        <div key={key} className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`w-3 h-3 rounded-full ${AMBIG_META[key].color}`} />
                            <span className="text-xs font-medium text-slate-400">{AMBIG_META[key].label}</span>
                          </div>
                          <p className="text-xl font-bold text-white">
                            {count}
                            <span className="text-xs font-normal text-slate-500 ml-1">件 ({pct}%)</span>
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

          {/* Action Shape Distribution */}
          <FadeInView delay={0.3}>
            <GlassCard className="!bg-white/[0.06] !border-white/[0.1] !backdrop-blur-xl" hoverEffect={false} padding="lg">
              <h2 className="text-lg font-bold mb-6 text-white">判断形状 (Action Shape)</h2>
              <DistributionBars
                items={Object.entries(shapeDist)
                  .sort((a, b) => b[1] - a[1])
                  .map(([key, count]) => ({
                    key,
                    label: SHAPE_LABELS[key] ?? key,
                    color: "bg-violet-500",
                    count,
                  }))}
                total={totalJudgments}
              />
            </GlassCard>
          </FadeInView>
        </div>

        {/* Satisfaction Distribution */}
        {followup.total > 0 && (
          <FadeInView delay={0.35}>
            <GlassCard className="!bg-white/[0.06] !border-white/[0.1] !backdrop-blur-xl mb-8" hoverEffect={false} padding="lg">
              <h2 className="text-lg font-bold mb-6 text-white">実行後の満足度</h2>
              <div className="grid grid-cols-5 gap-3">
                {[1, 2, 3, 4, 5].map((score) => {
                  const count = followup.satisfactionDistribution[score] ?? 0;
                  return (
                    <div key={score} className="text-center p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                      <p className="text-2xl mb-1">{"★".repeat(score)}{"☆".repeat(5 - score)}</p>
                      <p className="text-xl font-bold text-white">{count}</p>
                      <p className="text-xs text-slate-500">件</p>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          </FadeInView>
        )}

        {/* Daily Usage */}
        {Object.keys(dailyUsage).length > 0 && (
          <FadeInView delay={0.4}>
            <GlassCard className="!bg-white/[0.06] !border-white/[0.1] !backdrop-blur-xl" hoverEffect={false} padding="lg">
              <h2 className="text-lg font-bold mb-6 text-white">日次利用数</h2>
              <DailyChart data={dailyUsage} />
            </GlassCard>
          </FadeInView>
        )}
      </div>
    </div>
  );
}

// ═══ Shared: Distribution Bars ═══

function DistributionBars({
  items,
  total,
}: {
  items: { key: string; label: string; desc?: string; color: string; count: number }[];
  total: number;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">データがありません</p>;
  }

  const maxCount = Math.max(...items.map((i) => i.count), 1);

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
        const barPct = Math.max(Math.round((item.count / maxCount) * 100), 4);

        return (
          <div key={item.key}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                <span className="text-sm font-medium text-slate-300">{item.label}</span>
                {item.desc && (
                  <span className="text-xs text-slate-500 hidden sm:inline">{item.desc}</span>
                )}
              </div>
              <span className="text-sm font-bold text-white">
                {item.count} <span className="text-xs font-normal text-slate-500">({pct}%)</span>
              </span>
            </div>
            <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${item.color}`}
                initial={{ width: 0 }}
                animate={{ width: `${barPct}%` }}
                transition={{ duration: 0.4, delay: i * 0.05, ease: "easeOut" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══ Daily Chart (simple bar chart) ═══

function DailyChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14); // Last 14 days

  const maxVal = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div className="flex items-end gap-1 h-32">
      {entries.map(([day, count]) => {
        const heightPct = Math.max(Math.round((count / maxVal) * 100), 4);
        const shortDay = day.slice(5); // "03-29" format

        return (
          <div key={day} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs font-bold text-white">{count}</span>
            <motion.div
              className="w-full rounded-t-md bg-gradient-to-t from-indigo-600 to-purple-500"
              initial={{ height: 0 }}
              animate={{ height: `${heightPct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
            <span className="text-[10px] text-slate-500">{shortDay}</span>
          </div>
        );
      })}
    </div>
  );
}
