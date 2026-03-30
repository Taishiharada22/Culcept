"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassButton,
  GlassInput,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import ReasonTracePanel from "./ReasonTracePanel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Simulation {
  option: string;
  compatibility: number;
  exhaustionRisk: number;
  regretProbability: number;
  recoveryEase: number;
  uncertainty: number;
  timelinePredictions?: string[];
  biasWarnings?: string[];
}

interface DecisionEngineOutput {
  withheld: boolean;
  withholdReason?: string;
  simulations: Simulation[];
  recommended: string | null;
  blindSpotWarning: string | null;
  overallUncertainty: number;
  reasonTrace?: import("@/lib/stargazer/reasonTrace").ReasonTrace;
}

type Phase = "input" | "result" | "satisfaction" | "thanks";

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PRESETS = [
  { label: "行く？行かない？", type: "social", question: "誘われたけど、行くかどうか迷っている" },
  { label: "返信する？しない？", type: "reply", question: "返信するかどうか迷っている" },
  { label: "休む？続ける？", type: "rest", question: "疲れているけど、休むか続けるか迷っている" },
  { label: "何を先にやる？", type: "priority", question: "やることが複数あって、優先順位に迷っている" },
] as const;

// ---------------------------------------------------------------------------
// Metric bar
// ---------------------------------------------------------------------------

const METRIC_LABELS: Record<string, string> = {
  compatibility: "相性",
  exhaustionRisk: "消耗リスク",
  regretProbability: "後悔確率",
  recoveryEase: "回復しやすさ",
  uncertainty: "不確実性",
};

function MetricBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-slate-500 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-purple-400 to-indigo-500"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <span className="w-8 text-right text-slate-400">{pct}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DecisionEngineCard() {
  const [phase, setPhase] = useState<Phase>("input");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DecisionEngineOutput | null>(null);
  const [extraContext, setExtraContext] = useState("");
  const [lastPayload, setLastPayload] = useState<Record<string, unknown> | null>(null);

  // ---- API call ----
  async function consult(payload: Record<string, unknown>) {
    setLoading(true);
    setLastPayload(payload);
    try {
      const res = await fetch("/api/stargazer/decision-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const raw = await res.json();
      const data: DecisionEngineOutput = raw?.data ?? raw;
      setResult(data);
      setPhase("result");
    } catch {
      // best-effort: stay on input
    } finally {
      setLoading(false);
    }
  }

  function handlePreset(p: (typeof PRESETS)[number]) {
    consult({ type: p.type, question: p.question, options: [], context: "", urgency: "medium", is_preset: true });
  }

  function handleFreeText(text: string) {
    if (!text.trim()) return;
    consult({ type: "free", question: text.trim(), options: [], context: "", urgency: "medium", is_preset: false });
  }

  function handleResubmit() {
    if (!lastPayload) return;
    consult({ ...lastPayload, context: extraContext });
  }

  function sendFeedback(feedback: string) {
    // best-effort, fire-and-forget — 正確性フィードバック
    fetch("/api/stargazer/decision-engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "feedback", feedback }),
    }).catch(() => {});
    setPhase("satisfaction");
  }

  function sendSatisfaction(rating: number) {
    // best-effort — 納得感5段階（正確性とは別送）
    fetch("/api/stargazer/decision-engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "feedback", satisfaction: rating }),
    }).catch(() => {});
    setPhase("thanks");
  }

  function reset() {
    setPhase("input");
    setResult(null);
    setExtraContext("");
    setLastPayload(null);
  }

  // ---- Render ----
  return (
    <GlassCard className="p-5">
      <AnimatePresence mode="wait">
        {/* ===== INPUT ===== */}
        {phase === "input" && (
          <motion.div key="input" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <FadeInView>
              <h2 className="text-lg font-bold text-slate-800">判断エンジン</h2>
              <p className="text-sm text-slate-500 mt-1 mb-4">迷ったら、未来の自分に聞いてみる</p>
            </FadeInView>

            {/* Preset grid */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {PRESETS.map((p) => (
                <GlassButton
                  key={p.type}
                  variant="secondary"
                  size="sm"
                  fullWidth
                  disabled={loading}
                  onClick={() => handlePreset(p)}
                >
                  {p.label}
                </GlassButton>
              ))}
            </div>

            {/* Free text */}
            <GlassInput
              placeholder="それとも、別の相談？"
              onSubmit={handleFreeText}
              disabled={loading}
            />

            {loading && (
              <p className="text-xs text-slate-400 mt-3 text-center animate-pulse">考えています...</p>
            )}
          </motion.div>
        )}

        {/* ===== RESULT ===== */}
        {phase === "result" && result && (
          <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            {result.withheld ? (
              /* --- Withheld --- */
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <GlassBadge variant="warning">保留</GlassBadge>
                </div>
                <p className="text-sm text-slate-700">{result.withholdReason}</p>
                <p className="text-xs text-slate-500">もう少し教えてください</p>
                <GlassInput
                  placeholder="補足を入力..."
                  onSubmit={(v) => { setExtraContext(v); }}
                  onChange={(v) => setExtraContext(v)}
                />
                <GlassButton size="sm" onClick={handleResubmit} disabled={!extraContext.trim() || loading} loading={loading}>
                  再相談する
                </GlassButton>
              </div>
            ) : (
              /* --- Simulations --- */
              <div className="space-y-4">
                {result.simulations.map((sim) => {
                  const isRecommended = result.recommended === sim.option;
                  return (
                    <FadeInView key={sim.option}>
                      <GlassCard className={`p-4 ${isRecommended ? "ring-2 ring-purple-400" : ""}`}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="font-semibold text-sm text-slate-800">{sim.option}</span>
                          {isRecommended && <GlassBadge variant="gradient" size="sm">おすすめ</GlassBadge>}
                        </div>
                        <div className="space-y-1.5">
                          {(["compatibility", "exhaustionRisk", "regretProbability", "recoveryEase", "uncertainty"] as const).map((k) => (
                            <MetricBar key={k} label={METRIC_LABELS[k]} value={sim[k]} />
                          ))}
                        </div>
                        {sim.timelinePredictions && sim.timelinePredictions.length > 0 && (
                          <ul className="mt-2 space-y-0.5">
                            {sim.timelinePredictions.map((t, i) => (
                              <li key={i} className="text-xs text-slate-500">- {t}</li>
                            ))}
                          </ul>
                        )}
                      </GlassCard>
                    </FadeInView>
                  );
                })}

                {result.blindSpotWarning && (
                  <FadeInView>
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                      {result.blindSpotWarning}
                    </div>
                  </FadeInView>
                )}

                {result.overallUncertainty > 0.5 && (
                  <p className="text-xs text-slate-400 text-center">
                    不確実性が高めです（{Math.round(result.overallUncertainty * 100)}%）
                  </p>
                )}

                <ReasonTracePanel trace={result.reasonTrace} />
              </div>
            )}

            {/* Feedback section */}
            {!result.withheld && (
              <FadeInView delay={0.3}>
                <div className="mt-5 pt-4 border-t border-slate-200/60">
                  <p className="text-xs text-slate-500 mb-2">この結果、どうだった？</p>
                  <div className="flex gap-2">
                    {[
                      { label: "当たってた", value: "accurate" },
                      { label: "ずれてた", value: "off" },
                      { label: "まだわからない", value: "unsure" },
                    ].map((fb) => (
                      <GlassButton key={fb.value} variant="secondary" size="xs" onClick={() => sendFeedback(fb.value)}>
                        {fb.label}
                      </GlassButton>
                    ))}
                  </div>
                </div>
              </FadeInView>
            )}
          </motion.div>
        )}

        {/* ===== SATISFACTION ===== */}
        {phase === "satisfaction" && (
          <motion.div key="satisfaction" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="text-center py-6 space-y-4">
            <p className="text-slate-700 font-medium">この結果、納得できた？</p>
            <div className="flex justify-center gap-2">
              {([
                { n: 1, label: "全然" },
                { n: 2, label: "微妙" },
                { n: 3, label: "まあまあ" },
                { n: 4, label: "納得" },
                { n: 5, label: "すごく" },
              ] as const).map(({ n, label }) => (
                <button
                  key={n}
                  onClick={() => sendSatisfaction(n)}
                  className="flex flex-col items-center gap-1 px-2 py-2 rounded-xl border border-slate-200 bg-white/60 backdrop-blur hover:bg-purple-100 hover:border-purple-300 transition-colors"
                >
                  <span className="text-sm font-semibold text-slate-600">{n}</span>
                  <span className="text-[10px] text-slate-400">{label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ===== THANKS ===== */}
        {phase === "thanks" && (
          <motion.div key="thanks" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center py-6 space-y-4">
            <p className="text-slate-700 font-medium">ありがとう</p>
            <p className="text-xs text-slate-400">あなたの判断傾向の精度が少し上がりました</p>
            <GlassButton variant="secondary" size="sm" onClick={reset}>もう一つ聞く</GlassButton>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
