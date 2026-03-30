"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trackFeatureView, trackInteraction } from "@/lib/stargazer/trackClient";
import Link from "next/link";
import {
  GlassCard,
  GlassButton,
  GlassBadge,
  GlassInput,
  FadeInView,
  LightBackground,
} from "@/components/ui/glassmorphism-design";
import type { OracleResponse } from "@/lib/stargazer/decisionOracle";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseIdealReason(raw: unknown): { patternReference: string; verificationQuestion: string } | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      patternReference: parsed?.patternReference ?? "",
      verificationQuestion: parsed?.verificationQuestion ?? "",
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface OracleHistoryEntry {
  id: string;
  date: string;
  decision: string;
  options: string[];
  response: OracleResponse;
  actualChoice?: string;
}

// ---------------------------------------------------------------------------
// Oracle Ritual Animation (loading state)
// ---------------------------------------------------------------------------
function OracleRitual() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="py-16"
    >
      <div className="relative flex items-center justify-center">
        {/* Outer ritual circle */}
        <motion.div
          className="absolute w-32 h-32 rounded-full"
          style={{
            border: "1px solid rgba(168,85,247,0.15)",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        />

        {/* Middle circle -- counter rotation */}
        <motion.div
          className="absolute w-24 h-24 rounded-full"
          style={{
            border: "1px solid rgba(168,85,247,0.1)",
            borderTopColor: "rgba(168,85,247,0.3)",
          }}
          animate={{ rotate: -360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        />

        {/* Inner pulsing orb */}
        <motion.div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{
            background: "radial-gradient(circle, rgba(168,85,247,0.15), rgba(168,85,247,0.03))",
          }}
          animate={{
            scale: [1, 1.15, 1],
            boxShadow: [
              "0 0 20px rgba(168,85,247,0.1)",
              "0 0 40px rgba(168,85,247,0.2)",
              "0 0 20px rgba(168,85,247,0.1)",
            ],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <motion.span
            className="text-3xl"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            &#x1F52E;
          </motion.span>
        </motion.div>

        {/* Floating rune-like dots */}
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const angle = (i * 60 * Math.PI) / 180;
          return (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-purple-400/40"
              animate={{
                x: [Math.cos(angle) * 55, Math.cos(angle + 0.5) * 60, Math.cos(angle) * 55],
                y: [Math.sin(angle) * 55, Math.sin(angle + 0.5) * 60, Math.sin(angle) * 55],
                opacity: [0.2, 0.6, 0.2],
              }}
              transition={{
                duration: 3 + i * 0.5,
                delay: i * 0.3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          );
        })}
      </div>

      {/* Status text */}
      <div className="text-center mt-8">
        <motion.p
          className="text-sm font-display tracking-wider"
          style={{ color: "rgba(120,100,160,0.7)" }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          あなたの判断パターンを読み取っています
        </motion.p>
        <motion.div
          className="mt-3 mx-auto"
          style={{
            width: 60,
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.3), transparent)",
          }}
          animate={{ scaleX: [0.5, 1, 0.5], opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Oracle Card -- reveals with ancient wisdom aesthetic
// ---------------------------------------------------------------------------
function OracleCard({
  icon,
  badge,
  badgeVariant,
  children,
  bgStyle,
  delay,
}: {
  icon: string;
  badge: string;
  badgeVariant: "info" | "default" | "success";
  children: React.ReactNode;
  bgStyle?: React.CSSProperties;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 35, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 180, damping: 22, delay }}
    >
      <GlassCard className="relative overflow-hidden" style={bgStyle}>
        {/* Decorative corner marks */}
        <div className="absolute top-2 left-2 w-4 h-4 border-t border-l border-slate-300/20 rounded-tl-lg" />
        <div className="absolute bottom-2 right-2 w-4 h-4 border-b border-r border-slate-300/20 rounded-br-lg" />

        <div className="absolute top-3 right-3">
          <motion.span
            className="text-2xl"
            animate={{ opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 4, repeat: Infinity }}
          >
            {icon}
          </motion.span>
        </div>
        <GlassBadge variant={badgeVariant} size="sm" className="mb-3">
          {badge}
        </GlassBadge>
        {children}
      </GlassCard>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function OracleClient() {
  useEffect(() => { trackFeatureView("decision_oracle"); }, []);

  const [decision, setDecision] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [context, setContext] = useState("");
  const [result, setResult] = useState<OracleResponse | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealStep, setRevealStep] = useState(0);
  const [history, setHistory] = useState<OracleHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // ── 履歴をAPIから取得 ──
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/stargazer/oracle");
      if (!res.ok) return;
      const data = await res.json();
      const entries: OracleHistoryEntry[] = (data.history ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (row: any) => ({
          id: row.id,
          date: row.created_at?.slice(0, 10) ?? "",
          decision: row.decision_question,
          options: row.decision_options ?? [],
          response: {
            predictedChoice: row.predicted_choice,
            predictedReason: row.predicted_reason,
            shadowChoice: row.shadow_choice,
            idealChoice: row.ideal_choice,
            confidenceLevel: row.predicted_confidence,
            narrative: row.narrative,
            patternReference: parseIdealReason(row.ideal_reason)?.patternReference ?? "",
            verificationQuestion: parseIdealReason(row.ideal_reason)?.verificationQuestion ?? "",
            insight: row.shadow_reason ?? "",
          } as OracleResponse,
          actualChoice: row.actual_choice ?? undefined,
        }),
      );
      setHistory(entries);
      setHistoryLoaded(true);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const addOption = useCallback(() => {
    if (options.length < 4) setOptions((prev) => [...prev, ""]);
  }, [options.length]);

  const updateOption = useCallback((idx: number, val: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  }, []);

  const removeOption = useCallback((idx: number) => {
    if (options.length > 2) {
      setOptions((prev) => prev.filter((_, i) => i !== idx));
    }
  }, [options.length]);

  // ── 予測実行: API経由 ──
  const handleSubmit = useCallback(async () => {
    if (!decision.trim()) return;
    setLoading(true);
    setResult(null);
    setResultId(null);
    setRevealStep(0);

    try {
      const res = await fetch("/api/stargazer/oracle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: decision.trim(),
          options: options.filter(Boolean),
          context: context.trim() || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error("API error");
      }

      const data = await res.json();
      const response = data.response as OracleResponse;

      setResult(response);
      setResultId(data.id ?? null);
      setLoading(false);
      trackInteraction("decision_oracle", "oracle_consulted", {
        predictedChoice: response.predictedChoice,
      });

      setTimeout(() => setRevealStep(1), 500);
      setTimeout(() => setRevealStep(2), 1500);
      setTimeout(() => setRevealStep(3), 2500);

      // 履歴を先頭に追加
      const entry: OracleHistoryEntry = {
        id: data.id ?? `oracle_${Date.now()}`,
        date: (data.createdAt ?? new Date().toISOString()).slice(0, 10),
        decision: decision.trim(),
        options: options.filter(Boolean),
        response,
      };
      setHistory((prev) => [entry, ...prev].slice(0, 30));
    } catch {
      setLoading(false);
      // TODO: エラー表示
    }
  }, [decision, options, context]);

  // ── 実際の選択を記録: API経由 ──
  const recordActual = useCallback(async (id: string, choice: string) => {
    setHistory((prev) =>
      prev.map((e) => (e.id === id ? { ...e, actualChoice: choice } : e)),
    );

    try {
      await fetch("/api/stargazer/oracle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, actualChoice: choice }),
      });
    } catch {
      // silent — ローカル状態は更新済み
    }
  }, []);

  const resetForm = useCallback(() => {
    setDecision("");
    setOptions(["", ""]);
    setContext("");
    setResult(null);
    setResultId(null);
    setRevealStep(0);
  }, []);

  return (
    <LightBackground>
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-32">
        {/* Header */}
        <FadeInView>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/stargazer"
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 font-display">
                判断の道標
              </h1>
            </div>
          </div>
          <p className="text-sm text-slate-500 mb-8 leading-relaxed">
            判断パターンの観測データから、あなたの選択・もうひとりの自分の選択・理想の選択を照らし出す
          </p>
        </FadeInView>

        {/* Decision Input */}
        {!result && !loading && (
          <FadeInView delay={0.1}>
            <GlassCard className="mb-6 relative overflow-hidden">
              {/* Decorative oracle border */}
              <motion.div
                className="absolute inset-0 rounded-3xl pointer-events-none"
                style={{
                  border: "1px solid rgba(168,85,247,0.06)",
                }}
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 6, repeat: Infinity }}
              />

              <div className="space-y-5 relative z-10">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    何に迷っていますか？
                  </label>
                  <GlassInput
                    placeholder="例: 転職するかどうか"
                    value={decision}
                    onChange={setDecision}
                    size="lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    選択肢
                  </label>
                  <div className="space-y-3">
                    {options.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <GlassBadge variant="info" size="sm">
                          {String.fromCharCode(65 + idx)}
                        </GlassBadge>
                        <div className="flex-1">
                          <GlassInput
                            placeholder={`選択肢 ${String.fromCharCode(65 + idx)}`}
                            value={opt}
                            onChange={(v) => updateOption(idx, v)}
                          />
                        </div>
                        {options.length > 2 && (
                          <button
                            onClick={() => removeOption(idx)}
                            className="text-slate-400 hover:text-red-400 transition-colors p-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {options.length < 4 && (
                    <button
                      onClick={addOption}
                      className="mt-2 text-sm text-purple-500 hover:text-purple-700 font-medium transition-colors"
                    >
                      + 選択肢を追加
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    背景・文脈（任意）
                  </label>
                  <textarea
                    className="w-full rounded-2xl bg-white/80 backdrop-blur-lg border border-slate-200/80 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-400 focus:bg-white transition-all duration-300 px-4 py-3 text-sm resize-none"
                    rows={3}
                    placeholder="この決断の背景を教えてください..."
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                  />
                </div>

                <GlassButton
                  variant="gradient"
                  fullWidth
                  onClick={handleSubmit}
                  disabled={!decision.trim()}
                  loading={loading}
                >
                  予測を見る
                </GlassButton>
              </div>
            </GlassCard>
          </FadeInView>
        )}

        {/* Loading Ritual */}
        <AnimatePresence>
          {loading && <OracleRitual />}
        </AnimatePresence>

        {/* Oracle Response */}
        <AnimatePresence>
          {result && !loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              {/* Decision echo */}
              <FadeInView>
                <div className="text-center mb-6">
                  <motion.div
                    className="mx-auto mb-3"
                    style={{
                      width: 80,
                      height: 1,
                      background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.3), transparent)",
                    }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 1 }}
                  />
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-mono-sg">
                    あなたの問い
                  </p>
                  <p className="text-lg font-bold text-slate-800 mt-1 font-display">
                    {decision}
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <GlassBadge variant="gradient" size="sm">
                      確信度 {Math.round(result.confidenceLevel * 100)}%
                    </GlassBadge>
                  </div>
                </div>
              </FadeInView>

              {/* Card 1: Predicted Choice */}
              <AnimatePresence>
                {revealStep >= 1 && (
                  <OracleCard
                    icon="&#x1F52E;"
                    badge="予測される選択"
                    badgeVariant="info"
                    bgStyle={{
                      background: "linear-gradient(135deg, rgba(255,255,255,0.85), rgba(99,102,241,0.04))",
                    }}
                    delay={0}
                  >
                    <p className="text-base font-semibold text-slate-800 leading-relaxed">
                      {result.predictedChoice}
                    </p>
                    <p className="text-sm text-slate-500 mt-3 leading-relaxed">
                      {result.predictedReason}
                    </p>
                  </OracleCard>
                )}
              </AnimatePresence>

              {/* Card 2: Shadow Choice */}
              <AnimatePresence>
                {revealStep >= 2 && (
                  <OracleCard
                    icon="&#x1F311;"
                    badge="もうひとりの選択"
                    badgeVariant="default"
                    bgStyle={{
                      background: "linear-gradient(135deg, rgba(30,27,75,0.06), rgba(88,28,135,0.08))",
                    }}
                    delay={0}
                  >
                    <p className="text-base font-semibold text-slate-800 leading-relaxed whitespace-pre-line">
                      {result.shadowChoice}
                    </p>
                  </OracleCard>
                )}
              </AnimatePresence>

              {/* Card 3: Ideal Choice */}
              <AnimatePresence>
                {revealStep >= 3 && (
                  <OracleCard
                    icon="&#x2728;"
                    badge="理想の選択"
                    badgeVariant="success"
                    bgStyle={{
                      background: "linear-gradient(135deg, rgba(250,204,21,0.06), rgba(168,85,247,0.05))",
                    }}
                    delay={0}
                  >
                    <p className="text-base font-semibold text-slate-800 leading-relaxed whitespace-pre-line">
                      {result.idealChoice}
                    </p>
                  </OracleCard>
                )}
              </AnimatePresence>

              {/* Insight */}
              <AnimatePresence>
                {revealStep >= 3 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                  >
                    <GlassCard variant="bordered" className="mt-6 relative overflow-hidden">
                      {/* Wisdom line decoration */}
                      <motion.div
                        className="absolute top-0 left-0 right-0 h-px"
                        style={{
                          background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.2), transparent)",
                        }}
                        animate={{ opacity: [0.3, 0.7, 0.3] }}
                        transition={{ duration: 4, repeat: Infinity }}
                      />

                      <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2 font-display">
                        洞察
                      </p>
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                        {result.insight}
                      </p>

                      <motion.div
                        className="mt-4 pt-3"
                        style={{
                          borderTop: "1px solid rgba(148,163,184,0.1)",
                        }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1 }}
                      >
                        <p className="text-xs text-slate-400 italic">
                          {result.patternReference}
                        </p>
                      </motion.div>
                    </GlassCard>

                    <div className="mt-6 flex gap-3">
                      <GlassButton
                        variant="secondary"
                        onClick={resetForm}
                        className="flex-1"
                      >
                        別の決断を問う
                      </GlassButton>
                      <GlassButton
                        variant="ghost"
                        onClick={() => setShowHistory((p) => !p)}
                        className="flex-1"
                      >
                        過去の予測
                      </GlassButton>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Past Oracles */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-8 overflow-hidden"
            >
              <h2 className="text-lg font-bold text-slate-800 mb-4 font-display">
                過去の予測
              </h2>
              {history.length === 0 ? (
                <p className="text-sm text-slate-400">まだ記録がありません</p>
              ) : (
                <div className="space-y-3">
                  {history.map((entry) => (
                    <GlassCard key={entry.id} padding="sm">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-400 font-mono-sg">{entry.date}</p>
                          <p className="text-sm font-semibold text-slate-800 truncate mt-1">
                            {entry.decision}
                          </p>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            予測: {entry.response.predictedChoice}
                          </p>
                          {entry.actualChoice && (
                            <div className="mt-2">
                              <GlassBadge variant="success" size="sm">
                                実際: {entry.actualChoice}
                              </GlassBadge>
                            </div>
                          )}
                        </div>
                        {!entry.actualChoice && (
                          <button
                            onClick={() => {
                              const choice = window.prompt("実際にどちらを選びましたか？");
                              if (choice) recordActual(entry.id, choice);
                            }}
                            className="ml-2 text-xs text-purple-500 hover:text-purple-700 font-medium whitespace-nowrap"
                          >
                            結果を記録
                          </button>
                        )}
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </LightBackground>
  );
}
