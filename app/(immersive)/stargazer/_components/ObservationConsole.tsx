// app/stargazer/_components/ObservationConsole.tsx
// 観測コンソール — 反応速度・迷い度・変動幅・完了率 + コンテクスト/期間切替
"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface ObservationStats {
  totalAnswered: number;
  avgResponseTimeMs: number;
  fastAnswerCount: number;
  slowAnswerCount: number;
  avgHesitation: number;
}

interface Props {
  stats: ObservationStats;
  totalQuestions: number;
}

type Context = "total" | "romance" | "work" | "friends";
type Period = "today" | "7d" | "30d";

const CONTEXTS: { key: Context; label: string }[] = [
  { key: "total", label: "総合" },
  { key: "romance", label: "恋愛" },
  { key: "work", label: "仕事" },
  { key: "friends", label: "友人" },
];

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "7d", label: "7日" },
  { key: "30d", label: "30日" },
];

export default function ObservationConsole({ stats, totalQuestions }: Props) {
  const [context, setContext] = useState<Context>("total");
  const [period, setPeriod] = useState<Period>("30d");

  const avgTime = (stats.avgResponseTimeMs / 1000).toFixed(1);
  const hesitation = Math.round(stats.avgHesitation * 100);
  const effectiveTotal = Math.max(totalQuestions, stats.totalAnswered);
  const completionRate =
    effectiveTotal > 0
      ? Math.min(
          100,
          Math.round((stats.totalAnswered / effectiveTotal) * 100)
        )
      : 0;
  // 変動幅 = fast/slow回答の偏り（0%=一定, 100%=極端に偏り）
  const totalFastSlow = stats.fastAnswerCount + stats.slowAnswerCount;
  const variation =
    totalFastSlow > 0 && stats.totalAnswered > 0
      ? Math.round((totalFastSlow / stats.totalAnswered) * 100)
      : 0;

  const metrics = [
    { label: "反応速度", value: `${avgTime}s` },
    { label: "迷い度", value: `${hesitation}%` },
    { label: "変動幅", value: `${variation}%` },
    { label: "完了率", value: `${completionRate}%` },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.22 }}
      className="rounded-xl p-4"
      style={{
        background: "rgba(255,255,255,0.7)",
        border: "1px solid rgba(160,170,200,0.12)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: "rgba(190,170,110,0.5)",
            animation: "sg-glow-pulse 3s ease-in-out infinite",
          }}
        />
        <span
          className="font-mono-sg text-xs tracking-[0.2em] uppercase font-semibold"
          style={{ color: "rgba(100,105,130,0.5)" }}
        >
          Console
        </span>
      </div>

      {/* Context toggle */}
      <div className="flex gap-1 mb-2">
        {CONTEXTS.map((c) => (
          <button
            key={c.key}
            onClick={() => setContext(c.key)}
            className="font-body text-xs px-2 py-0.5 rounded-md transition-all"
            style={
              context === c.key
                ? {
                    background: "rgba(190,170,110,0.1)",
                    border: "1px solid rgba(190,170,110,0.2)",
                    color: "rgba(170,150,90,0.85)",
                  }
                : {
                    background: "transparent",
                    border: "1px solid rgba(160,170,200,0.1)",
                    color: "rgba(120,125,140,0.4)",
                  }
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Period toggle */}
      <div className="flex gap-1 mb-3">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className="font-body text-xs px-2 py-0.5 rounded-md transition-all"
            style={
              period === p.key
                ? {
                    background: "rgba(120,125,140,0.08)",
                    border: "1px solid rgba(120,125,140,0.15)",
                    color: "rgba(100,105,130,0.7)",
                  }
                : {
                    background: "transparent",
                    border: "1px solid rgba(160,170,200,0.1)",
                    color: "rgba(120,125,140,0.35)",
                  }
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 4-metric grid */}
      <div className="grid grid-cols-4 gap-3">
        {metrics.map((m, i) => (
          <motion.div
            key={m.label}
            className="text-center"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 + i * 0.05 }}
          >
            <p
              className="font-mono-sg text-lg font-semibold tabular-nums mb-0.5"
              style={{ color: "rgba(30,35,55,0.8)" }}
            >
              {m.value}
            </p>
            <p
              className="font-body text-xs"
              style={{ color: "rgba(120,125,140,0.45)" }}
            >
              {m.label}
            </p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
