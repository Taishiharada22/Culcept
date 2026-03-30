// app/stargazer/transform/TransformClient.tsx
// Layer 6: 変容の可能性 — クライアントコンポーネント
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  GlassCard,
  GlassBadge,
  GlassButton,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import TransformationStageCard from "@/app/stargazer/_components/TransformationStageCard";
import ChangeResistanceMap from "@/app/stargazer/_components/ChangeResistanceMap";
import { CORE_WOUND_MODELS } from "@/lib/stargazer/alter";
import {
  loadIntents,
  saveIntent,
  removeIntent,
  checkProgress,
  type TransformationIntent,
} from "@/lib/stargazer/transformationIntent";
import { TRAIT_AXES } from "@/lib/stargazer/traitAxes";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { TraitEvolutionResult } from "@/lib/stargazer/traitEvolution";
import { extractImplicitValues } from "@/lib/stargazer/implicitValuesExtractor";
import type { ImplicitValuesResult } from "@/lib/stargazer/implicitValuesExtractor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Default data (未観測時のフォールバック)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_EVOLUTION: TraitEvolutionResult = {
  mostChanged: [],
  mostStable: [],
  summary: "観測データが蓄積されると、変容のパターンが見えてきます。",
  changeStage: "pre_contemplation",
  changeStageLabel: "観測開始期",
  changeStageDescription:
    "まだ観測データが少ない段階です。日々の観測を続けることで、あなたの変容パターンが浮かび上がってきます。",
  accelerating: [],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Progress bar colors
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PROGRESS_COLORS: Record<"toward" | "away" | "neutral", string> = {
  toward: "bg-emerald-400/80",
  away: "bg-rose-400/70",
  neutral: "bg-white/20",
};

const PROGRESS_LABELS: Record<"toward" | "away" | "neutral", string> = {
  toward: "変化中",
  away: "逆行",
  neutral: "変化なし",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: format date
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function TransformClient() {
  // ── State ──
  const [evolution, setEvolution] = useState<TraitEvolutionResult>(DEFAULT_EVOLUTION);
  const [axisScores, setAxisScores] = useState<Partial<Record<TraitAxisKey, number>>>({});
  const [healedState, setHealedState] = useState<string | null>(null);
  const [archetypeCode, setArchetypeCode] = useState<string | null>(null);
  const [intents, setIntents] = useState<TransformationIntent[]>([]);

  const [valuesResult, setValuesResult] = useState<ImplicitValuesResult | null>(null);

  // ── Form state ──
  const [selectedAxis, setSelectedAxis] = useState<TraitAxisKey>(TRAIT_AXES[0].id);
  const [selectedDirection, setSelectedDirection] = useState<"left" | "right">("right");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // ── Load from localStorage ──
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time hydration from localStorage */
    // Trait evolution
    try {
      const raw = localStorage.getItem("stargazer_trait_evolution_v1");
      if (raw) {
        const parsed: TraitEvolutionResult = JSON.parse(raw);
        setEvolution(parsed);
      }
    } catch {
      // keep default
    }

    // Axis scores
    try {
      const raw = localStorage.getItem("stargazer_axis_scores_v1");
      if (raw) {
        setAxisScores(JSON.parse(raw));
      }
    } catch {
      // keep empty
    }

    // Archetype code
    try {
      const code = localStorage.getItem("stargazer_archetype_v1");
      if (code) {
        setArchetypeCode(code);
        const model = CORE_WOUND_MODELS[code];
        if (model) {
          setHealedState(model.healed);
        }
      }
    } catch {
      // keep null
    }

    // Intents
    setIntents(loadIntents());

    // Values extraction (depends on axisScores loaded above)
    try {
      const raw = localStorage.getItem("stargazer_axis_scores_v1");
      if (raw) {
        const scores = JSON.parse(raw);
        setValuesResult(extractImplicitValues(scores));
      }
    } catch {
      // keep null
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // ── Derive stable axes from evolution data ──
  const stableAxes = evolution.mostStable.slice(0, 4).map((ax) => ({
    axis: ax.axis,
    axisLabel: ax.axisLabel,
    interpretation: ax.interpretation,
  }));

  // ── Submit new intent ──
  const handleSubmitIntent = useCallback(() => {
    if (!reason.trim()) return;
    setIsSubmitting(true);

    const currentScore = axisScores[selectedAxis] ?? 0;
    const newIntent: TransformationIntent = {
      intentId: `intent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      axisTarget: selectedAxis,
      initialScore: currentScore,
      desiredDirection: selectedDirection,
      reason: reason.trim(),
      createdAt: new Date().toISOString(),
      checkpoints: [],
    };

    saveIntent(newIntent);
    const updated = loadIntents();
    setIntents(updated);
    setReason("");
    setIsSubmitting(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  }, [selectedAxis, selectedDirection, reason, axisScores]);

  // ── Remove intent ──
  const handleRemoveIntent = useCallback((intentId: string) => {
    removeIntent(intentId);
    setIntents(loadIntents());
  }, []);

  // ── Get axis def for selected axis ──
  const selectedAxisDef = TRAIT_AXES.find((a) => a.id === selectedAxis);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-indigo-950/30 to-slate-950 px-4 py-12 pb-32">
      <div className="max-w-lg mx-auto space-y-10">

        {/* ── Page Header ── */}
        <FadeInView>
          <div className="text-center space-y-2 pt-4">
            <p className="text-xs font-mono tracking-[0.3em] uppercase text-indigo-300/60">
              深層観測
            </p>
            <h1 className="text-2xl font-light text-white/90 tracking-wide">
              変容の可能性
            </h1>
            <p className="text-xs tracking-widest text-white/32">
              変化の兆しと方向性
            </p>
            <p className="text-sm text-white/55 leading-relaxed mt-3 max-w-xs mx-auto">
              変わりたいという意図は、すでに変容の始まりです。
            </p>
          </div>
        </FadeInView>

        {/* ── Section 1: Prochaska Stage ── */}
        <FadeInView delay={0.1}>
          <TransformationStageCard
            changeStage={evolution.changeStage}
            changeStageLabel={evolution.changeStageLabel}
            changeStageDescription={evolution.changeStageDescription}
            accelerating={evolution.accelerating.slice(0, 3).map((ax) => ({
              axis: ax.axis,
              axisLabel: ax.axisLabel,
              velocity: ax.velocity,
              direction: ax.direction,
              interpretation: ax.interpretation,
            }))}
            mostStable={stableAxes}
          />
        </FadeInView>

        {/* ── Section 2: Change Resistance Map ── */}
        {stableAxes.length > 0 && (
          <FadeInView delay={0.15}>
            <ChangeResistanceMap mostStable={stableAxes} />
          </FadeInView>
        )}

        {/* ── Section 3: Healed State Explorer ── */}
        <FadeInView delay={0.2}>
          <div className="space-y-4">
            {/* Section header */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-yellow-400/25 to-transparent" />
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs font-mono tracking-[0.22em] uppercase text-yellow-300/75">
                  癒えた状態の探索
                </span>
                <span className="text-[10px] tracking-widest text-yellow-400/35">
                  癒えた姿を見つける
                </span>
              </div>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-yellow-400/25 to-transparent" />
            </div>

            {healedState ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <GlassCard className="p-0 overflow-hidden">
                  <div
                    className="p-6"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(202,138,4,0.10) 0%, rgba(161,98,7,0.06) 50%, rgba(217,119,6,0.08) 100%)",
                      borderBottom: "1px solid rgba(202,138,4,0.15)",
                    }}
                  >
                    {/* Archetype badge */}
                    {archetypeCode && (
                      <div className="flex items-center gap-2 mb-4">
                        <GlassBadge className="text-[10px] font-mono tracking-wider text-yellow-300/80">
                          {archetypeCode}
                        </GlassBadge>
                        <span className="text-[10px] text-white/35 tracking-wide">
                          の癒えた姿
                        </span>
                      </div>
                    )}

                    {/* Healed state text */}
                    <p className="text-sm leading-relaxed text-white/85 mb-5">
                      {healedState}
                    </p>

                    {/* Reflective question */}
                    <div
                      className="rounded-lg p-3"
                      style={{
                        background: "rgba(202,138,4,0.06)",
                        border: "1px solid rgba(202,138,4,0.18)",
                      }}
                    >
                      <p className="text-xs text-yellow-200/70 leading-relaxed">
                        この状態を想像してみてください。何を感じますか？
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ) : (
              <GlassCard className="p-5">
                <p className="text-sm text-white/45 text-center leading-relaxed">
                  アーキタイプが確定すると、癒えた状態が表示されます。
                </p>
                <div className="flex justify-center mt-3">
                  <Link href="/stargazer">
                    <GlassButton size="sm">観測を始める</GlassButton>
                  </Link>
                </div>
              </GlassCard>
            )}
          </div>
        </FadeInView>

        {/* ── Section 3.5: Values-Based Suggestions ── */}
        {valuesResult && valuesResult.values.length > 0 && (
          <FadeInView delay={0.22}>
            <div className="space-y-4">
              {/* Section header */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-emerald-400/25 to-transparent" />
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-xs font-mono tracking-[0.22em] uppercase text-emerald-300/75">
                    価値観からの示唆
                  </span>
                  <span className="text-[10px] tracking-widest text-emerald-400/35">
                    あなたの価値観が示す方向
                  </span>
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-emerald-400/25 to-transparent" />
              </div>

              <GlassCard className="p-5">
                <div className="space-y-3">
                  {valuesResult.values.slice(0, 2).map((value) => {
                    const topAxis = value.supportingAxes[0];
                    const axisDef = topAxis
                      ? TRAIT_AXES.find((a) => a.id === topAxis.axis)
                      : null;

                    return (
                      <div
                        key={value.name}
                        className="rounded-lg p-3"
                        style={{
                          background: "rgba(16,185,129,0.06)",
                          border: "1px solid rgba(16,185,129,0.15)",
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <GlassBadge className="text-[10px] font-mono tracking-wider text-emerald-300/80">
                            {value.name}
                          </GlassBadge>
                        </div>
                        <p className="text-xs text-white/60 leading-relaxed">
                          この価値観に基づくと、
                          {axisDef
                            ? `「${axisDef.labelLeft}」と「${axisDef.labelRight}」の間の軸が変容の鍵になるかもしれない。`
                            : "あなたの判断パターンに深く関わっている。"}
                        </p>
                      </div>
                    );
                  })}
                  {valuesResult.conflicts.length > 0 && (
                    <p className="text-[10px] text-white/40 leading-relaxed mt-2">
                      {valuesResult.conflicts[0].integrationHint}
                    </p>
                  )}
                </div>
              </GlassCard>
            </div>
          </FadeInView>
        )}

        {/* ── Section 4: Transformation Intent Declaration ── */}
        <FadeInView delay={0.25}>
          <div className="space-y-5">
            {/* Section header */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-violet-400/25 to-transparent" />
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs font-mono tracking-[0.22em] uppercase text-violet-300/75">
                  変容の宣言
                </span>
                <span className="text-[10px] tracking-widest text-violet-400/35">
                  変わりたい意思を記録する
                </span>
              </div>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-violet-400/25 to-transparent" />
            </div>

            {/* Intent form */}
            <GlassCard className="p-5">
              <div className="space-y-4">
                {/* Axis selector */}
                <div className="space-y-1.5">
                  <label className="text-xs text-white/55 tracking-wide">
                    変えたい軸
                  </label>
                  <select
                    value={selectedAxis}
                    onChange={(e) => setSelectedAxis(e.target.value as TraitAxisKey)}
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white/85 bg-white/6 border border-white/12 focus:border-violet-400/50 focus:outline-none transition-colors"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    {TRAIT_AXES.map((ax) => (
                      <option
                        key={ax.id}
                        value={ax.id}
                        style={{ background: "#1e1b4b", color: "white" }}
                      >
                        {ax.labelLeft} — {ax.labelRight}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Direction picker */}
                {selectedAxisDef && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-white/55 tracking-wide">
                      どちらの方向に変わりたいか
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedDirection("left")}
                        className={`rounded-lg px-3 py-2.5 text-xs text-center transition-all ${
                          selectedDirection === "left"
                            ? "bg-violet-500/25 border border-violet-400/50 text-violet-200"
                            : "bg-white/5 border border-white/10 text-white/55 hover:bg-white/8"
                        }`}
                      >
                        {selectedAxisDef.labelLeft}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDirection("right")}
                        className={`rounded-lg px-3 py-2.5 text-xs text-center transition-all ${
                          selectedDirection === "right"
                            ? "bg-violet-500/25 border border-violet-400/50 text-violet-200"
                            : "bg-white/5 border border-white/10 text-white/55 hover:bg-white/8"
                        }`}
                      >
                        {selectedAxisDef.labelRight}
                      </button>
                    </div>
                  </div>
                )}

                {/* Reason input */}
                <div className="space-y-1.5">
                  <label className="text-xs text-white/55 tracking-wide">
                    なぜ変わりたいのか
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="変えたい理由を書いてください..."
                    rows={3}
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white/80 placeholder-white/25 bg-white/6 border border-white/12 focus:border-violet-400/40 focus:outline-none transition-colors resize-none"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  />
                </div>

                {/* Submit */}
                <AnimatePresence mode="wait">
                  {showSuccess ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-lg py-2.5 text-center text-sm text-emerald-300/90"
                      style={{
                        background: "rgba(16,185,129,0.08)",
                        border: "1px solid rgba(16,185,129,0.2)",
                      }}
                    >
                      変容の意図を記録しました
                    </motion.div>
                  ) : (
                    <motion.div key="button" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <GlassButton
                        onClick={handleSubmitIntent}
                        disabled={!reason.trim() || isSubmitting}
                        className="w-full"
                      >
                        変容を宣言する
                      </GlassButton>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </GlassCard>

            {/* Existing intents */}
            {intents.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-white/40 tracking-wide">記録された変容の意図</p>
                {intents.map((intent, i) => {
                  const currentScore = axisScores[intent.axisTarget] ?? intent.initialScore;
                  const progress = checkProgress(intent, currentScore);
                  const axisDef = TRAIT_AXES.find((a) => a.id === intent.axisTarget);
                  const targetLabel =
                    intent.desiredDirection === "right"
                      ? (axisDef?.labelRight ?? "右")
                      : (axisDef?.labelLeft ?? "左");
                  const progressPct = Math.max(0, progress.progress) * 100;

                  return (
                    <motion.div
                      key={intent.intentId}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.07 }}
                    >
                      <GlassCard className="p-4">
                        <div
                          className="rounded-xl p-4"
                          style={{
                            background: "rgba(139,92,246,0.05)",
                            border: "1px solid rgba(139,92,246,0.14)",
                          }}
                        >
                          {/* Header row */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-xs font-medium text-violet-300/90">
                                  {axisDef
                                    ? `${axisDef.labelLeft} — ${axisDef.labelRight}`
                                    : intent.axisTarget}
                                </span>
                                <GlassBadge className="text-[10px]">
                                  → {targetLabel} 側へ
                                </GlassBadge>
                              </div>
                              <p className="text-xs text-white/55 leading-relaxed">
                                {intent.reason}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveIntent(intent.intentId)}
                              className="text-white/25 hover:text-rose-400/70 transition-colors text-xs flex-shrink-0 mt-0.5"
                              aria-label="削除"
                            >
                              ✕
                            </button>
                          </div>

                          {/* Progress bar */}
                          <div className="mt-3 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-white/35">
                                {formatDate(intent.createdAt)} から
                              </span>
                              <span
                                className={`text-[10px] font-medium ${
                                  progress.direction === "toward"
                                    ? "text-emerald-400/80"
                                    : progress.direction === "away"
                                      ? "text-rose-400/70"
                                      : "text-white/35"
                                }`}
                              >
                                {PROGRESS_LABELS[progress.direction]}
                              </span>
                            </div>
                            <div className="h-1 rounded-full bg-white/8 overflow-hidden">
                              <motion.div
                                className={`h-full rounded-full ${PROGRESS_COLORS[progress.direction]}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPct}%` }}
                                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                              />
                            </div>
                            <p className="text-[10px] text-white/42 leading-relaxed">
                              {progress.description}
                            </p>
                          </div>
                        </div>
                      </GlassCard>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </FadeInView>

        {/* ── Back link ── */}
        <FadeInView delay={0.3}>
          <div className="flex justify-center pt-4">
            <Link href="/stargazer">
              <GlassButton variant="ghost" size="sm">
                ← 深層観測に戻る
              </GlassButton>
            </Link>
          </div>
        </FadeInView>

      </div>
    </div>
  );
}
