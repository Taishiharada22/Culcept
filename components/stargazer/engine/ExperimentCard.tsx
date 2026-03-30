"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassButton,
  GlassBadge,
} from "@/components/ui/glassmorphism-design";
import ReasonTracePanel from "./ReasonTracePanel";
import type { ReasonTrace } from "@/lib/stargazer/reasonTrace";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Experiment {
  id: string;
  title: string;
  description: string;
  targetPattern: string;
  difficulty: string;
  reportPrompt: string;
  status: string;
  reasonTrace?: ReasonTrace;
}

interface ModelUpdate {
  axisUpdates: {
    axis: string;
    previousMu: number;
    newMu: number;
  }[];
  insightGenerated: string;
}

type Phase = "loading" | "empty" | "proposed" | "report" | "completed";

const PATTERN_LABEL: Record<string, string> = {
  avoidance: "回避パターン",
  fixation: "固定化パターン",
  contradiction: "二面性",
  blind_spot: "盲点",
};

const DIFFICULTY_DOTS: Record<string, string> = {
  micro: "●○○",
  small: "●●○",
  medium: "●●●",
};

const OUTCOME_OPTIONS = [
  { key: "did_it", label: "やった", emoji: "✓" },
  { key: "tried_but_different", label: "違うことをした", emoji: "↻" },
  { key: "could_not", label: "できなかった", emoji: "…" },
] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function ExperimentCard() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [modelUpdate, setModelUpdate] = useState<ModelUpdate | null>(null);

  // report form state
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [surpriseLevel, setSurpriseLevel] = useState(3);
  const [wouldRepeat, setWouldRepeat] = useState(false);
  const [reflection, setReflection] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Fetch experiment ──
  const fetchExperiment = useCallback(async () => {
    try {
      const res = await fetch("/api/stargazer/experiment");
      if (!res.ok) {
        setPhase("empty");
        return;
      }
      const json = await res.json();
      const data = json.data ?? json;

      if (!data.experiment) {
        setPhase("empty");
        return;
      }

      setExperiment(data.experiment);
      const status = data.experiment.status ?? data.status;
      if (status === "completed") {
        setPhase("completed");
      } else if (status === "accepted") {
        setPhase("report");
      } else {
        setPhase("proposed");
      }
    } catch {
      setPhase("empty");
    }
  }, []);

  useEffect(() => {
    fetchExperiment();
  }, [fetchExperiment]);

  // ── Accept ──
  const handleAccept = async () => {
    if (!experiment) return;
    try {
      await fetch("/api/stargazer/experiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentId: experiment.id }),
      });
      setPhase("report");
    } catch {
      // ベストエフォート
    }
  };

  // ── Submit report ──
  const handleSubmitReport = async () => {
    if (!experiment || !selectedOutcome || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stargazer/experiment/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experimentId: experiment.id,
          outcome: selectedOutcome,
          surpriseLevel,
          wouldRepeat,
          reflection: reflection || undefined,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const data = json.data ?? json;
        setModelUpdate(data.modelUpdate ?? null);
        setPhase("completed");
      }
    } catch {
      // ベストエフォート
    } finally {
      setSubmitting(false);
    }
  };

  // ── Skip ──
  const handleSkip = async () => {
    if (!experiment) return;
    try {
      await fetch("/api/stargazer/experiment/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experimentId: experiment.id,
          outcome: "skipped",
          surpriseLevel: 1,
          wouldRepeat: false,
        }),
      });
      setPhase("completed");
      setModelUpdate({
        axisUpdates: [],
        insightGenerated: "今回の実験はスキップされました。次回、別の角度から提案します。",
      });
    } catch {
      // ベストエフォート
    }
  };

  // ── Render ──
  if (phase === "loading") {
    return (
      <GlassCard variant="bordered" padding="md">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 rounded bg-slate-200/40" />
          <div className="h-3 w-full rounded bg-slate-200/30" />
          <div className="h-3 w-2/3 rounded bg-slate-200/30" />
        </div>
      </GlassCard>
    );
  }

  if (phase === "empty" || !experiment) {
    return null; // 実験がない週は何も表示しない
  }

  return (
    <GlassCard variant="bordered" padding="md">
      <AnimatePresence mode="wait">
        {phase === "proposed" && (
          <ProposalView
            key="proposed"
            experiment={experiment}
            onAccept={handleAccept}
            onSkip={handleSkip}
          />
        )}
        {phase === "report" && (
          <ReportView
            key="report"
            experiment={experiment}
            selectedOutcome={selectedOutcome}
            onSelectOutcome={setSelectedOutcome}
            surpriseLevel={surpriseLevel}
            onSurpriseChange={setSurpriseLevel}
            wouldRepeat={wouldRepeat}
            onWouldRepeatChange={setWouldRepeat}
            reflection={reflection}
            onReflectionChange={setReflection}
            onSubmit={handleSubmitReport}
            onSkip={handleSkip}
            submitting={submitting}
          />
        )}
        {phase === "completed" && (
          <CompletedView
            key="completed"
            experiment={experiment}
            modelUpdate={modelUpdate}
          />
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 1: Proposal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ProposalView({
  experiment,
  onAccept,
  onSkip,
}: {
  experiment: Experiment;
  onAccept: () => void;
  onSkip: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <GlassBadge variant="info" size="sm">今週のチャレンジ</GlassBadge>
      </div>

      {/* Title & Description */}
      <h3 className="text-base font-semibold tracking-tight">
        {experiment.title}
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed">
        {experiment.description}
      </p>

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span>
          難易度: {DIFFICULTY_DOTS[experiment.difficulty] ?? "●○○"}
        </span>
        <span>
          ターゲット: {PATTERN_LABEL[experiment.targetPattern] ?? experiment.targetPattern}
        </span>
      </div>

      {/* Reason Trace */}
      <ReasonTracePanel
        trace={experiment.reasonTrace}
        label="なぜこの実験？"
      />

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <GlassButton variant="primary" size="sm" onClick={onAccept}>
          やってみる
        </GlassButton>
        <button
          onClick={onSkip}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          スキップ
        </button>
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 2: Report
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ReportView({
  experiment,
  selectedOutcome,
  onSelectOutcome,
  surpriseLevel,
  onSurpriseChange,
  wouldRepeat,
  onWouldRepeatChange,
  reflection,
  onReflectionChange,
  onSubmit,
  onSkip,
  submitting,
}: {
  experiment: Experiment;
  selectedOutcome: string | null;
  onSelectOutcome: (v: string) => void;
  surpriseLevel: number;
  onSurpriseChange: (v: number) => void;
  wouldRepeat: boolean;
  onWouldRepeatChange: (v: boolean) => void;
  reflection: string;
  onReflectionChange: (v: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  submitting: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <GlassBadge variant="warning" size="sm">結果を報告</GlassBadge>
      </div>

      <h3 className="text-base font-semibold tracking-tight">
        {experiment.title}
      </h3>

      {/* Report prompt */}
      <p className="text-sm text-slate-500 leading-relaxed">
        {experiment.reportPrompt}
      </p>

      {/* Outcome selection */}
      <div className="flex flex-wrap gap-2">
        {OUTCOME_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onSelectOutcome(opt.key)}
            className={`
              rounded-lg border px-3 py-1.5 text-sm transition-all
              ${selectedOutcome === opt.key
                ? "border-blue-400 bg-blue-50/60 text-blue-700"
                : "border-slate-200 bg-white/40 text-slate-600 hover:border-slate-300"
              }
            `}
          >
            <span className="mr-1">{opt.emoji}</span>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Surprise level */}
      {selectedOutcome && selectedOutcome !== "skipped" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="space-y-3"
        >
          <div>
            <label className="text-xs text-slate-500 mb-1 block">
              驚きレベル（予想とどれくらい違った？）
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => onSurpriseChange(n)}
                  className={`text-lg transition-colors ${
                    n <= surpriseLevel ? "text-amber-400" : "text-slate-200"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          {/* Would repeat */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">また試したい？</label>
            <button
              onClick={() => onWouldRepeatChange(true)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-all ${
                wouldRepeat
                  ? "border-green-400 bg-green-50/60 text-green-700"
                  : "border-slate-200 text-slate-500"
              }`}
            >
              はい
            </button>
            <button
              onClick={() => onWouldRepeatChange(false)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-all ${
                !wouldRepeat
                  ? "border-slate-400 bg-slate-50/60 text-slate-700"
                  : "border-slate-200 text-slate-500"
              }`}
            >
              いいえ
            </button>
          </div>

          {/* Reflection (optional) */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">
              気づいたこと（任意）
            </label>
            <textarea
              value={reflection}
              onChange={(e) => onReflectionChange(e.target.value)}
              placeholder="感じたこと、発見したこと..."
              rows={2}
              className="w-full rounded-lg border border-slate-200 bg-white/40 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-300 focus:border-blue-300 focus:outline-none resize-none"
            />
          </div>
        </motion.div>
      )}

      {/* Submit */}
      <div className="flex items-center gap-2 pt-1">
        <GlassButton
          variant="primary"
          size="sm"
          onClick={onSubmit}
          disabled={!selectedOutcome || submitting}
          loading={submitting}
        >
          報告する
        </GlassButton>
        <button
          onClick={onSkip}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          スキップ
        </button>
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3: Completed
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CompletedView({
  experiment,
  modelUpdate,
}: {
  experiment: Experiment;
  modelUpdate: ModelUpdate | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <GlassBadge variant="success" size="sm">実験完了</GlassBadge>
      </div>

      <h3 className="text-base font-semibold tracking-tight">
        {experiment.title}
      </h3>

      {/* Insight message */}
      {modelUpdate?.insightGenerated && (
        <p className="text-sm text-slate-600 leading-relaxed">
          {modelUpdate.insightGenerated}
        </p>
      )}

      {/* Axis updates */}
      {modelUpdate?.axisUpdates && modelUpdate.axisUpdates.length > 0 && (
        <div className="space-y-1">
          {modelUpdate.axisUpdates.map((u) => {
            const delta = u.newMu - u.previousMu;
            const direction = delta > 0 ? "+" : "";
            return (
              <div
                key={u.axis}
                className="flex items-center gap-2 text-xs text-slate-500"
              >
                <span className="text-slate-400">◆</span>
                <span>モデル調整: {direction}{(delta * 100).toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Reason Trace */}
      <ReasonTracePanel
        trace={experiment.reasonTrace}
        label="なぜこの実験だったか"
      />
    </motion.div>
  );
}
