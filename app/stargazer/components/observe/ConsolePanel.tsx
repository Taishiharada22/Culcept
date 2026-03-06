"use client";

import { motion } from "framer-motion";

interface ObservationStats {
  totalAnswered: number;
  avgResponseTimeMs: number;
  fastAnswerCount: number;
  slowAnswerCount: number;
  avgHesitation: number;
  phaseBreakdown?: { initial: number; daily: number; core: number };
}

interface Props {
  stats: ObservationStats | null;
  contextFilter: string;
  onContextFilterChange: (ctx: string) => void;
  periodFilter: string;
  onPeriodFilterChange: (p: string) => void;
}

const CONTEXT_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "romance", label: "恋愛" },
  { value: "work", label: "仕事" },
  { value: "friends", label: "友達" },
];

const PERIOD_OPTIONS = [
  { value: "today", label: "今日" },
  { value: "week", label: "今週" },
  { value: "month", label: "今月" },
  { value: "all", label: "全期間" },
];

export default function ConsolePanel({
  stats,
  contextFilter,
  onContextFilterChange,
  periodFilter,
  onPeriodFilterChange,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-xl p-4 font-mono text-[11px] leading-relaxed"
      style={{
        background: "rgba(0,0,0,0.3)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-4">
        <div className="space-y-1">
          <span className="text-amber-400/50 text-[10px]">context:</span>
          <div className="flex gap-1">
            {CONTEXT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onContextFilterChange(opt.value)}
                className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                  contextFilter === opt.value
                    ? "bg-amber-500/15 text-amber-300/80 border border-amber-500/20"
                    : "text-white/30 hover:text-white/50 border border-transparent"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-amber-400/50 text-[10px]">period:</span>
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onPeriodFilterChange(opt.value)}
                className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                  periodFilter === opt.value
                    ? "bg-amber-500/15 text-amber-300/80 border border-amber-500/20"
                    : "text-white/30 hover:text-white/50 border border-transparent"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-1.5 text-white/30">
        <div>
          <span className="text-amber-400/50">observations:</span>{" "}
          <span className="text-white/50">{stats?.totalAnswered ?? 0}</span>
        </div>
        <div>
          <span className="text-amber-400/50">avg_response:</span>{" "}
          <span className="text-white/50">
            {stats?.avgResponseTimeMs
              ? `${(stats.avgResponseTimeMs / 1000).toFixed(1)}s`
              : "—"}
          </span>
        </div>
        <div>
          <span className="text-amber-400/50">hesitation:</span>{" "}
          <span className="text-white/50">
            {stats?.avgHesitation != null
              ? `${Math.round(stats.avgHesitation)}%`
              : "—"}
          </span>
        </div>
        {stats?.phaseBreakdown && (
          <div>
            <span className="text-amber-400/50">breakdown:</span>{" "}
            <span className="text-white/40">
              core:{stats.phaseBreakdown.core} initial:{stats.phaseBreakdown.initial} daily:{stats.phaseBreakdown.daily}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
