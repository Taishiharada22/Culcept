"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassButton,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import SasScoreBadge from "./SasScoreBadge";
import ReasonTracePanel from "./ReasonTracePanel";
import type { ReasonTrace } from "@/lib/stargazer/reasonTrace";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Scenario {
  id: string;
  category: string;
  situation: string;
  optionA: string;
  optionB: string;
}

interface Challenge {
  id: string;
  scenarios: Scenario[];
  status: "pending" | "user_predicted" | "verified" | "completed";
  /** 各シナリオの Oracle Reason Trace（verified 後に表示） */
  reasonTraces?: Record<string, ReasonTrace>;
}

interface ScoreData {
  score: number;
  level: string;
  oracleAccuracy: number;
  gap: number;
  totalChallenges: number;
}

type Choices = Record<string, "A" | "B">;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TRANSITION = { duration: 0.35, ease: "easeInOut" } as const;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const raw = await res.json();
  // API は { data: { ... }, ok: true } でラップされる場合がある
  return (raw?.data ?? raw) as T;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SelfVsOracleCard() {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [oraclePredictions, setOraclePredictions] = useState<Choices | null>(null);
  const [scoreData, setScoreData] = useState<ScoreData | null>(null);
  const [predictions, setPredictions] = useState<Choices>({});
  const [actuals, setActuals] = useState<Choices>({});
  const [submitting, setSubmitting] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  // --- Fetch challenge + score on mount ---
  useEffect(() => {
    fetchJson<{ challenge: Challenge; oraclePredictions?: Choices }>(
      "/api/stargazer/self-vs-oracle",
    ).then(({ challenge: c, oraclePredictions: op }) => {
      setChallenge(c);
      if (op) setOraclePredictions(op);
    }).catch(() => {});

    fetchJson<ScoreData>("/api/stargazer/self-vs-oracle/score")
      .then(setScoreData)
      .catch(() => {});
  }, []);

  // --- Actions ---
  const submitPredictions = useCallback(async () => {
    if (!challenge) return;
    setSubmitting(true);
    try {
      const data = await fetchJson<{ challenge: Challenge; oraclePredictions?: Choices }>(
        "/api/stargazer/self-vs-oracle",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "predict", challengeId: challenge.id, predictions }),
        },
      );
      setChallenge(data.challenge);
      if (data.oraclePredictions) setOraclePredictions(data.oraclePredictions);
      setCurrentIdx(0); // verify フェーズ用にリセット
    } finally {
      setSubmitting(false);
    }
  }, [challenge, predictions]);

  const submitActuals = useCallback(async () => {
    if (!challenge) return;
    setSubmitting(true);
    try {
      const data = await fetchJson<{ challenge: Challenge; oraclePredictions?: Choices }>(
        "/api/stargazer/self-vs-oracle",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify", challengeId: challenge.id, actuals }),
        },
      );
      setChallenge(data.challenge);
      if (data.oraclePredictions) setOraclePredictions(data.oraclePredictions);
      // Refresh score
      fetchJson<ScoreData>("/api/stargazer/self-vs-oracle/score")
        .then(setScoreData)
        .catch(() => {});
    } finally {
      setSubmitting(false);
    }
  }, [challenge, actuals]);

  // --- Derived ---
  if (!challenge) {
    return (
      <GlassCard className="p-5 space-y-3">
        <h3 className="text-lg font-bold text-slate-800">Self vs Oracle</h3>
        <p className="text-sm text-slate-500">今日の自分を、どこまで予測できる？</p>
        <p className="text-xs text-slate-400 text-center py-4">
          チャレンジデータを準備中です...
        </p>
      </GlassCard>
    );
  }

  const scenarios = challenge.scenarios;
  const status = challenge.status;
  const allPredicted = scenarios.every((s) => predictions[s.id]);
  const allActuals = scenarios.every((s) => actuals[s.id]);

  // --- Choice button helper ---
  const ChoiceBtn = ({
    scenarioId,
    option,
    label,
    selected,
    onSelect,
  }: {
    scenarioId: string;
    option: "A" | "B";
    label: string;
    selected: boolean;
    onSelect: (sid: string, o: "A" | "B") => void;
  }) => (
    <GlassButton
      size="sm"
      variant={selected ? "primary" : "ghost"}
      onClick={() => onSelect(scenarioId, option)}
      className="flex-1 text-left"
    >
      {option}. {label}
    </GlassButton>
  );

  return (
    <GlassCard className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Self vs Oracle</h3>
          <p className="text-sm text-slate-500">
            今日の自分を、どこまで予測できる？
          </p>
        </div>
        {scoreData && (
          <SasScoreBadge score={scoreData.score} level={scoreData.level} />
        )}
      </div>

      {/* State machine */}
      <AnimatePresence mode="wait">
        {/* ---- State 1: Pending (1件ずつ表示) ---- */}
        {status === "pending" && (
          <motion.div
            key={`pending-${currentIdx}`}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={TRANSITION}
            className="space-y-3"
          >
            {/* Progress */}
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {scenarios.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 rounded-full transition-all ${
                      i < currentIdx
                        ? "w-6 bg-purple-400"
                        : i === currentIdx
                          ? "w-6 bg-purple-600"
                          : "w-3 bg-slate-200"
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-slate-400 ml-auto">
                {currentIdx + 1} / {scenarios.length}
              </span>
            </div>

            {/* Current scenario */}
            {(() => {
              const s = scenarios[currentIdx];
              if (!s) return null;
              return (
                <GlassCard className="p-4 space-y-3">
                  <p className="text-sm font-medium text-slate-700 leading-relaxed">
                    {s.situation}
                  </p>
                  <div className="space-y-2">
                    <ChoiceBtn
                      scenarioId={s.id}
                      option="A"
                      label={s.optionA}
                      selected={predictions[s.id] === "A"}
                      onSelect={(sid, o) => {
                        setPredictions((prev) => ({ ...prev, [sid]: o }));
                        // 自動で次へ（少し遅延）
                        if (currentIdx < scenarios.length - 1) {
                          setTimeout(() => setCurrentIdx((i) => i + 1), 350);
                        }
                      }}
                    />
                    <ChoiceBtn
                      scenarioId={s.id}
                      option="B"
                      label={s.optionB}
                      selected={predictions[s.id] === "B"}
                      onSelect={(sid, o) => {
                        setPredictions((prev) => ({ ...prev, [sid]: o }));
                        if (currentIdx < scenarios.length - 1) {
                          setTimeout(() => setCurrentIdx((i) => i + 1), 350);
                        }
                      }}
                    />
                  </div>
                </GlassCard>
              );
            })()}

            {/* 戻る / 確定 */}
            <div className="flex gap-2">
              {currentIdx > 0 && (
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentIdx((i) => i - 1)}
                >
                  戻る
                </GlassButton>
              )}
              {allPredicted && (
                <GlassButton
                  variant="primary"
                  size="sm"
                  disabled={submitting}
                  onClick={submitPredictions}
                  className="flex-1"
                >
                  {submitting ? "送信中..." : "予測を確定する"}
                </GlassButton>
              )}
            </div>
          </motion.div>
        )}

        {/* ---- State 2: User predicted, awaiting verification (1件ずつ) ---- */}
        {status === "user_predicted" && (
          <motion.div
            key={`verify-${currentIdx}`}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={TRANSITION}
            className="space-y-3"
          >
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center space-y-1">
              <p className="font-semibold text-emerald-700">答え合わせの時間です</p>
              <p className="text-xs text-emerald-600">
                今日の行動を振り返って、実際どうだったか選んでください
              </p>
              <p className="text-[10px] text-emerald-500">
                {scenarios.length}問 × 選ぶだけ（1分以内）
              </p>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {scenarios.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 rounded-full transition-all ${
                      i < currentIdx
                        ? "w-6 bg-emerald-400"
                        : i === currentIdx
                          ? "w-6 bg-emerald-600"
                          : "w-3 bg-slate-200"
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-slate-400 ml-auto">
                {currentIdx + 1} / {scenarios.length}
              </span>
            </div>

            {(() => {
              const s = scenarios[currentIdx];
              if (!s) return null;
              return (
                <GlassCard className="p-4 space-y-3">
                  <p className="text-xs text-slate-400">実際はどうだった？</p>
                  <p className="text-sm font-medium text-slate-700 leading-relaxed">
                    {s.situation}
                  </p>
                  <div className="space-y-2">
                    <ChoiceBtn
                      scenarioId={s.id}
                      option="A"
                      label={s.optionA}
                      selected={actuals[s.id] === "A"}
                      onSelect={(sid, o) => {
                        setActuals((prev) => ({ ...prev, [sid]: o }));
                        if (currentIdx < scenarios.length - 1) {
                          setTimeout(() => setCurrentIdx((i) => i + 1), 350);
                        }
                      }}
                    />
                    <ChoiceBtn
                      scenarioId={s.id}
                      option="B"
                      label={s.optionB}
                      selected={actuals[s.id] === "B"}
                      onSelect={(sid, o) => {
                        setActuals((prev) => ({ ...prev, [sid]: o }));
                        if (currentIdx < scenarios.length - 1) {
                          setTimeout(() => setCurrentIdx((i) => i + 1), 350);
                        }
                      }}
                    />
                  </div>
                </GlassCard>
              );
            })()}

            <div className="flex gap-2">
              {currentIdx > 0 && (
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentIdx((i) => i - 1)}
                >
                  戻る
                </GlassButton>
              )}
              {allActuals && (
                <GlassButton
                  variant="primary"
                  size="sm"
                  disabled={submitting}
                  onClick={submitActuals}
                  className="flex-1"
                >
                  {submitting ? "送信中..." : "結果を確定する"}
                </GlassButton>
              )}
            </div>

            <p className="text-[10px] text-slate-400 text-center">
              まだ行動していない場合は、夜または明日の朝にもう一度開いてください
            </p>
          </motion.div>
        )}

        {/* ---- State 3: Verified / Results ---- */}
        {status === "verified" && oraclePredictions && (
          <motion.div
            key="verified"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={TRANSITION}
            className="space-y-3"
          >
            {(() => {
              let userCorrect = 0;
              let oracleCorrect = 0;
              return (
                <>
                  {scenarios.map((s) => {
                    const actual = actuals[s.id];
                    const userHit = predictions[s.id] === actual;
                    const oracleHit = oraclePredictions[s.id] === actual;
                    if (userHit) userCorrect++;
                    if (oracleHit) oracleCorrect++;
                    return (
                      <FadeInView key={s.id} delay={0.05}>
                        <GlassCard className="p-3 space-y-1">
                          <p className="text-sm font-medium text-slate-700">
                            {s.situation}
                          </p>
                          <div className="grid grid-cols-3 gap-1 text-xs text-center">
                            <div className={userHit ? "text-emerald-600 font-bold" : "text-red-500"}>
                              あなた: {predictions[s.id]} {userHit ? "○" : "×"}
                            </div>
                            <div className={oracleHit ? "text-emerald-600 font-bold" : "text-red-500"}>
                              Oracle: {oraclePredictions[s.id]} {oracleHit ? "○" : "×"}
                            </div>
                            <div className="text-slate-600 font-semibold">
                              実際: {actual}
                            </div>
                          </div>
                          <ReasonTracePanel
                            trace={challenge?.reasonTraces?.[s.id]}
                            label="Oracleの予測根拠"
                          />
                        </GlassCard>
                      </FadeInView>
                    );
                  })}

                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-center space-y-1">
                    <p className="text-sm font-bold text-slate-800">
                      あなた: {userCorrect}/{scenarios.length}{"  "}Oracle: {oracleCorrect}/{scenarios.length}
                    </p>
                    {scoreData && scoreData.gap !== 0 && (
                      <p className="text-xs text-slate-500">
                        ギャップ: {scoreData.gap > 0 ? "+" : ""}{scoreData.gap}%
                      </p>
                    )}
                  </div>

                  {scoreData && (
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.3, duration: 0.4 }}
                      className="flex justify-center"
                    >
                      <SasScoreBadge score={scoreData.score} level={scoreData.level} />
                    </motion.div>
                  )}
                </>
              );
            })()}
          </motion.div>
        )}

        {/* ---- State 3b: verified but no oracle predictions yet ---- */}
        {status === "verified" && !oraclePredictions && (
          <motion.div
            key="verified-no-oracle"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={TRANSITION}
            className="text-center space-y-3 py-4"
          >
            <p className="text-sm font-medium text-slate-700">結果を記録しました</p>
            <p className="text-xs text-slate-500">明日も新しいチャレンジが届きます</p>
          </motion.div>
        )}

        {/* ---- State 4: Completed ---- */}
        {status === "completed" && (
          <motion.div
            key="completed"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={TRANSITION}
            className="text-center space-y-3 py-4"
          >
            <p className="text-sm text-slate-600">
              今日のチャレンジは完了です
            </p>
            {scoreData && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="flex justify-center"
              >
                <SasScoreBadge score={scoreData.score} level={scoreData.level} className="text-base px-4 py-1.5" />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
