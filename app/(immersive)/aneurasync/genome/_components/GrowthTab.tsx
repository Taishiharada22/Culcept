"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { EvolutionTimeline } from "@/lib/aneurasync/personaGenome";
import EvolutionSpiral from "./EvolutionSpiral";
import InsightNarrative from "./InsightNarrative";

interface GrowthTabProps {
  evolution: EvolutionTimeline;
}

const MIN_SNAPSHOTS = 1;

export default function GrowthTab({ evolution }: GrowthTabProps) {
  if (evolution.snapshots.length < MIN_SNAPSHOTS) {
    return <EmptyGrowth count={evolution.snapshots.length} />;
  }

  const stabilityPct = Math.round(evolution.stability * 100);
  const latestLabel =
    evolution.snapshots.at(-1)?.archetypeLabel ?? "—";
  const trendLabel =
    evolution.overallDrift < 0.3
      ? "安定"
      : evolution.overallDrift < 0.7
        ? "緩やかに変化"
        : "大きく変化";

  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      role="region"
      aria-label="パーソナリティの進化"
    >
      <div className="rounded-[32px] border border-white/85 bg-white/76 p-7 sm:p-8 shadow-[0_18px_48px_rgba(148,163,184,0.14)] ring-1 ring-slate-200/55 backdrop-blur-xl">
        <div
          className="text-center text-xl font-semibold text-slate-900"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          パーソナリティの進化
        </div>
        <p className="mt-2 text-center text-sm text-slate-500">
          あなたは変化し続けている — 週ごとの観測が描く、内面の軌跡
        </p>

        <div className="mt-4">
          <EvolutionSpiral evolution={evolution} />
        </div>

        {/* Stats footer */}
        <div className="mt-6 grid grid-cols-3 gap-4" role="region" aria-label="進化の統計">
          <StatCard label="安定度" value={`${stabilityPct}%`} />
          <StatCard label="最新型" value={latestLabel} />
          <StatCard label="傾向" value={trendLabel} />
        </div>
      </div>

      {/* Growth Insight */}
      {evolution.stability < 0.5 && (
        <InsightNarrative
          insight="最近の変化が活発です — 新しい自分を発見しつつあるかもしれません"
          detail="安定度が低いことは悪いことではありません。成長期にある証拠です。"
          icon="🌱"
          accentColor="#14b8a6"
        />
      )}
      {evolution.stability >= 0.7 && (
        <InsightNarrative
          insight="あなたの内面は安定しています — 確固たる自己を持っている証です"
          icon="🏔️"
          accentColor="#6366f1"
        />
      )}

      {/* Evolution cards - horizontal scroll on mobile, grid on desktop */}
      {evolution.cards.length > 0 && (
        <div
          className="mt-5 -mx-2 flex gap-3 overflow-x-auto px-2 pb-2 scrollbar-none lg:grid lg:grid-cols-3 lg:overflow-visible"
          role="list"
          aria-label="進化のハイライト"
        >
          {evolution.cards.map((card, i) => (
            <motion.div
              key={i}
              className="min-w-[260px] flex-shrink-0 lg:min-w-0 rounded-[24px] border border-white/85 bg-white/70 px-5 py-4 shadow-sm"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.35 }}
              role="listitem"
            >
              <div className="text-sm font-semibold text-slate-700">
                {card.periodLabel}
              </div>
              <p className="mt-1 text-xs text-slate-500">{card.summary}</p>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-[20px] border border-white/80 bg-white/60 p-4 text-center backdrop-blur-md"
      role="status"
      aria-label={`${label}: ${value}`}
    >
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-base font-bold text-slate-800">{value}</div>
    </div>
  );
}

function EmptyGrowth({ count }: { count: number }) {
  return (
    <div className="space-y-5" role="region" aria-label="進化データ蓄積中">
      {/* Faint spiral preview */}
      <div className="relative rounded-[32px] border border-white/85 bg-white/76 px-8 py-14 text-center shadow-[0_18px_48px_rgba(148,163,184,0.14)] ring-1 ring-slate-200/55 backdrop-blur-xl">
        {/* Decorative spiral SVG */}
        <svg
          viewBox="0 0 200 200"
          className="mx-auto mb-4 block h-32 w-32 opacity-15"
          aria-hidden="true"
        >
          <path
            d={generateDecorativeSpiral(200)}
            fill="none"
            stroke="rgba(139,92,246,0.5)"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>

        <motion.div
          className="text-4xl"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden="true"
        >
          📈
        </motion.div>

        <div
          className="mt-4 text-xl font-semibold text-slate-800"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          進化データを蓄積中
        </div>
        <p className="mx-auto mt-2 max-w-[380px] text-sm text-slate-500">
          進化は静かに始まる — 3回の観測で、あなたの変化の物語が見えてきます
        </p>
        <div className="mt-2 text-xs text-slate-400" role="status" aria-label={`進捗: ${count}/${MIN_SNAPSHOTS}件`}>
          現在: {count}/{MIN_SNAPSHOTS}件
        </div>

        {/* Progress dots */}
        <div className="mt-4 flex items-center justify-center gap-2" aria-hidden="true">
          {Array.from({ length: MIN_SNAPSHOTS }, (_, i) => (
            <div
              key={i}
              className={`h-3 w-3 rounded-full ${
                i < count
                  ? "bg-violet-400"
                  : "border border-slate-200 bg-slate-50"
              }`}
            />
          ))}
        </div>

        <Link
          href="/stargazer"
          className="mt-6 inline-flex items-center justify-center rounded-[18px] bg-slate-900 px-5 py-3 text-sm font-semibold text-white no-underline shadow-[0_12px_30px_rgba(15,23,42,0.18)] transition hover:bg-slate-800"
        >
          観測を続ける
        </Link>
      </div>
    </div>
  );
}

function generateDecorativeSpiral(size: number): string {
  const cx = size / 2;
  const cy = size / 2;
  const a = 8;
  const b = 4;
  const totalPoints = 120;
  const maxTheta = Math.PI * 5;

  return Array.from({ length: totalPoints + 1 }, (_, i) => {
    const theta = (i / totalPoints) * maxTheta;
    const r = a + b * theta;
    const x = cx + r * Math.cos(theta - Math.PI / 2);
    const y = cy + r * Math.sin(theta - Math.PI / 2);
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}
