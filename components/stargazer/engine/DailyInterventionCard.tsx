"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  GlassCard,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import ReasonTracePanel from "./ReasonTracePanel";
import type { ReasonTrace } from "@/lib/stargazer/reasonTrace";

// ---------------------------------------------------------------------------
// Types — API レスポンスの実構造に合わせる
// ---------------------------------------------------------------------------

type Phase = "morning" | "noon" | "evening" | "night";

interface DailyInterventionData {
  phase: Phase;
  state: {
    estimatedEnergy?: number;
    estimatedSocialBattery?: number;
    estimatedCognitiveLoad?: number;
    estimatedStress?: number;
    vulnerabilityScore?: number;
    vulnerabilityFactors?: string[];
  };
  intervention: {
    message?: string;
    phase?: string;
    stateUpdate?: Record<string, number>;
    decisionSupport?: boolean;
    selfVsOraclePrompt?: boolean;
    suggestions?: string[];
    warnings?: string[];
    focus?: string;
    energyAdvice?: string;
  };
  reasonTrace?: ReasonTrace;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PHASE_META: Record<Phase, { label: string; icon: string }> = {
  morning: { label: "朝の観測", icon: "☀️" },
  noon:    { label: "昼の観測", icon: "🌤" },
  evening: { label: "夕方の観測", icon: "🌅" },
  night:   { label: "夜の観測", icon: "🌙" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DailyInterventionCard() {
  const [data, setData] = useState<DailyInterventionData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stargazer/daily-intervention")
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((raw) => {
        // API は { data: { phase, state, intervention }, ok: true } でラップ
        const d = raw?.data ?? raw;
        setData(d);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // -- Loading skeleton -----------------------------------------------------
  if (loading) {
    return (
      <GlassCard className="p-5 space-y-3 animate-pulse">
        <div className="h-5 w-24 rounded bg-white/20" />
        <div className="h-6 w-3/4 rounded bg-white/15" />
        <div className="h-4 w-1/2 rounded bg-white/10" />
      </GlassCard>
    );
  }

  // -- Error fallback -------------------------------------------------------
  if (error || !data) {
    return (
      <GlassCard className="p-5 text-center text-sm text-gray-500">
        今日の観測データを取得できませんでした。あとでもう一度お試しください。
      </GlassCard>
    );
  }

  const phase = data.phase ?? "morning";
  const state = data.state ?? {};
  const intervention = data.intervention ?? {};
  const meta = PHASE_META[phase] ?? PHASE_META.morning;

  const vulnScore = state.vulnerabilityScore ?? 0;
  const vulnPct = Math.min(vulnScore / 5, 1) * 100;
  const vulnFactors = state.vulnerabilityFactors ?? [];

  const message = intervention.message ?? "今日も観測を続けましょう。";
  const suggestions = intervention.suggestions ?? [];
  const warnings = intervention.warnings ?? [];

  return (
    <FadeInView>
      <GlassCard className="p-5 space-y-4">
        {/* Phase badge */}
        <GlassBadge variant="default">
          {meta.icon} {meta.label}
        </GlassBadge>

        {/* Main message */}
        <p className="text-lg font-semibold leading-relaxed">
          {message}
        </p>

        {/* Focus & energy advice */}
        {intervention.focus && (
          <p className="text-sm text-gray-600">
            <span className="font-medium">今日のフォーカス:</span>{" "}
            {intervention.focus}
          </p>
        )}
        {intervention.energyAdvice && (
          <p className="text-sm text-gray-500">{intervention.energyAdvice}</p>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <GlassBadge key={i} variant="default" size="sm">
                {s}
              </GlassBadge>
            ))}
          </div>
        )}

        {/* Warnings — "ズレやすさ" */}
        {(warnings.length > 0 || vulnFactors.length > 0) && (
          <div className="rounded-lg border border-amber-300/50 bg-amber-50/40 p-3 space-y-1">
            <p className="text-xs font-semibold text-amber-700">
              ズレやすさシグナル
            </p>
            {[...warnings, ...vulnFactors].map((w, i) => (
              <p key={i} className="text-sm text-amber-800">
                {w}
              </p>
            ))}
          </div>
        )}

        {/* Reason Trace */}
        <ReasonTracePanel trace={data.reasonTrace} label="なぜこの状態推定？" />

        {/* ブレやすさバー — データ不足時は非表示 */}
        {vulnScore > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-gray-400">
              今日のブレやすさ{" "}
              {vulnScore <= 1
                ? "安定"
                : vulnScore <= 2.5
                  ? "やや不安定"
                  : vulnScore <= 4
                    ? "揺れやすい"
                    : "要注意"}
            </p>
            <div className="h-1.5 w-full rounded-full bg-gray-200/50 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-amber-400"
                initial={{ width: 0 }}
                animate={{ width: `${vulnPct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        )}
      </GlassCard>
    </FadeInView>
  );
}
