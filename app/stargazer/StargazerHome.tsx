"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import type {
  StarMap,
  ObservationFeedback,
  CoreObservationAnswer,
  CoreObservationQuestion,
  ResolvedType,
  ContradictionProbe,
  InsightCardCollection,
  PersonalityProfile,
} from "@/types/stargazer";
import type { StargazerQuestion } from "@/types/stargazer";
import type { EnhancedDailyAnswer } from "@/types/stargazer";
import FeedbackToast from "./_components/FeedbackToast";

// New architecture components
import ModeTabBar from "./components/ModeTabBar";
type StargazerMode = "observe" | "results";
import ObserveView from "./components/observe/ObserveView";
import ResultsView from "./components/results/ResultsView";

import {
  mockStarMap,
  mockPersonalityProfile,
  mockResolvedType,
  mockDimensionDetails,
  mockObservationStats,
  mockInsightCards,
} from "./_utils/mockData";

import "./components/shared/design-tokens.css";

interface DimensionDetail {
  id: string;
  score: number;
  confidence: number;
  evidenceCount: number;
  category: string;
  labelLeft: string;
  labelRight: string;
}

interface ObservationStats {
  totalAnswered: number;
  avgResponseTimeMs: number;
  fastAnswerCount: number;
  slowAnswerCount: number;
  avgHesitation: number;
  phaseBreakdown?: {
    initial: number;
    daily: number;
    core: number;
  };
}

type AppState = "loading" | "ready";
type ObservationPhase = "core" | "initial" | "daily" | "completed" | null;

export default function StargazerHome() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [starMap, setStarMap] = useState<StarMap | null>(null);
  const [questions, setQuestions] = useState<StargazerQuestion[]>([]);
  const [coreQuestions, setCoreQuestions] = useState<CoreObservationQuestion[]>(
    []
  );
  const [observationPhase, setObservationPhase] =
    useState<ObservationPhase>(null);
  const [progress, setProgress] = useState({ answered: 0, total: 45 });
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [feedback, setFeedback] = useState<ObservationFeedback | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [constellationInfo, setConstellationInfo] = useState<{
    emoji: string;
    description: string;
    keywords: string[];
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [resolvedType, setResolvedType] = useState<ResolvedType | null>(null);
  const [contradictionProbe, setContradictionProbe] =
    useState<ContradictionProbe | null>(null);
  const [insightCards, setInsightCards] =
    useState<InsightCardCollection | null>(null);
  const [personalityProfile, setPersonalityProfile] =
    useState<PersonalityProfile | null>(null);
  const [dimensionDetails, setDimensionDetails] = useState<DimensionDetail[]>(
    []
  );
  const [observationStats, setObservationStats] =
    useState<ObservationStats | null>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ═══ 新アーキテクチャ: 2モードタブ ═══
  const [activeMode, setActiveMode] = useState<StargazerMode>("observe");
  const [contextFilter, setContextFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("today");

  const hasStarMap = !!starMap?.coreStar;

  // 初期ロード
  const loadState = useCallback(async () => {
    try {
      // ?preview=1 (dev only): モックデータでフルUIを確認
      const isPreview =
        process.env.NODE_ENV === "development" &&
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("preview") === "1";

      if (isPreview) {
        setStarMap(mockStarMap);
        setConstellationInfo(mockStarMap.constellationInfo ?? null);
        setResolvedType(mockResolvedType);
        setPersonalityProfile(mockPersonalityProfile);
        setDimensionDetails(mockDimensionDetails);
        setObservationStats(mockObservationStats);
        setInsightCards(mockInsightCards);
        setObservationPhase("completed");
        setActiveMode("results");
        setAppState("ready");
        return;
      }

      const [dailyRes, profileRes, insightsRes] = await Promise.all([
        fetch("/api/stargazer/daily", { credentials: "include" }),
        fetch("/api/stargazer/profile", { credentials: "include" }),
        fetch("/api/stargazer/insights", { credentials: "include" }).catch(
          () => null
        ),
      ]);

      if (dailyRes.status === 401 || profileRes.status === 401) {
        setAuthError(true);
        setAppState("ready");
        return;
      }

      const dailyData = await dailyRes.json();
      const profileData = await profileRes.json();

      // Insight Cards
      if (insightsRes?.ok) {
        try {
          const insightsData = await insightsRes.json();
          if (insightsData.ok) {
            setInsightCards({
              cards: insightsData.cards || [],
              totalInsights: insightsData.totalInsights || 0,
              topDimensions: insightsData.topDimensions || [],
            });
          }
        } catch {
          /* insight fetch failure is non-critical */
        }
      }

      if (profileData.ok && profileData.starMap) {
        setStarMap(profileData.starMap);
        setConstellationInfo(profileData.starMap.constellationInfo || null);
        if (profileData.resolvedType) {
          setResolvedType(profileData.resolvedType);
        }
        if (profileData.personalityProfile) {
          setPersonalityProfile(profileData.personalityProfile);
        }
        if (profileData.dimensionDetails) {
          setDimensionDetails(profileData.dimensionDetails);
        }
        if (profileData.observationStats) {
          setObservationStats(profileData.observationStats);
        }
      }

      if (dailyData.ok) {
        // 矛盾プローブがあればセット
        if (dailyData.contradictionProbe) {
          setContradictionProbe(dailyData.contradictionProbe);
        }

        if (
          dailyData.phase === "core" &&
          dailyData.coreQuestions?.length > 0
        ) {
          setCoreQuestions(dailyData.coreQuestions);
          setProgress({
            answered: dailyData.progress?.answered || 0,
            total: dailyData.progress?.total || 10,
          });
          setObservationPhase("core");
          setCurrentQuestionIndex(0);
          setActiveMode("observe");
        } else if (
          dailyData.phase === "initial" &&
          dailyData.questions?.length > 0
        ) {
          setQuestions(dailyData.questions);
          setProgress({
            answered: dailyData.progress?.answered || 0,
            total: dailyData.progress?.total || 45,
          });
          setObservationPhase("initial");
          setCurrentQuestionIndex(0);
          setActiveMode("observe");
        } else if (
          dailyData.phase === "daily" &&
          !dailyData.progress?.dailyCompleted &&
          dailyData.questions?.length > 0
        ) {
          setQuestions(dailyData.questions);
          setObservationPhase("daily");
          setCurrentQuestionIndex(0);
          setActiveMode("observe");
        } else {
          setObservationPhase("completed");
          // 完了後はデフォルトで結果タブ
          if (profileData.ok && profileData.starMap?.coreStar) {
            setActiveMode("results");
          }
        }
      } else {
        setObservationPhase("completed");
        if (profileData.ok && profileData.starMap?.coreStar) {
          setActiveMode("results");
        }
      }

      setAppState("ready");
    } catch {
      setAppState("ready");
      setObservationPhase("completed");
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  // ═══ 回答ハンドラ（既存ロジック維持） ═══

  // 1問ごとに即時保存 + フィードバック (Initial/Binary)
  const handleAnswer = useCallback(
    async (
      questionId: string,
      answer: "A" | "B",
      shownAt: string,
      answeredAt: string,
      responseTimeMs: number,
      confidenceSelfReport: number,
      skipped: boolean
    ) => {
      if (isSubmitting) return;
      setIsSubmitting(true);

      try {
        const res = await fetch("/api/stargazer/observations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            observations: [
              {
                questionId,
                answer,
                shownAt,
                answeredAt,
                responseTimeMs,
                confidenceSelfReport,
                skipped,
              },
            ],
            phase: observationPhase,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error("Observation save failed:", errData);
          showErrorFeedback("保存に失敗しました。もう一度お試しください。");
          setIsSubmitting(false);
          return;
        }

        const data = await res.json();
        handleObservationSuccess(data, skipped);

        if (observationPhase === "initial") {
          setProgress((prev) => ({ ...prev, answered: prev.answered + 1 }));
        }

        advanceQuestion(data, questions.length);
      } catch (err) {
        console.error("Observation error:", err);
        showErrorFeedback("通信エラーが発生しました");
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, observationPhase, currentQuestionIndex, questions.length]
  );

  // Enhanced Daily 観測の回答ハンドラ
  const handleEnhancedDailyAnswer = useCallback(
    async (answer: EnhancedDailyAnswer) => {
      if (isSubmitting) return;
      setIsSubmitting(true);

      try {
        const answerValue = answer.reasonChipId
          ? {
              type: "reason_select" as const,
              binaryChoice: answer.binaryChoice,
              reasonChipId: answer.reasonChipId,
              reasonDimensionHints: answer.reasonDimensionHints,
            }
          : { type: "binary" as const, choice: answer.binaryChoice };

        const res = await fetch("/api/stargazer/observations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            observations: [
              {
                questionId: answer.questionId,
                answer: answer.binaryChoice,
                answerValue,
                shownAt: answer.shownAt,
                answeredAt: answer.answeredAt,
                responseTimeMs: answer.responseTimeMs,
                confidenceSelfReport: answer.confidenceSelfReport,
                skipped: answer.skipped,
              },
            ],
            phase: "daily",
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error("Enhanced daily save failed:", errData);
          showErrorFeedback("保存に失敗しました。もう一度お試しください。");
          setIsSubmitting(false);
          return;
        }

        const data = await res.json();
        handleObservationSuccess(
          data,
          answer.skipped,
          answer.reasonChipId
            ? "観測を深く記録しました"
            : "観測を記録しました"
        );
        advanceQuestion(data, questions.length);
      } catch (err) {
        console.error("Enhanced daily observation error:", err);
        showErrorFeedback("通信エラーが発生しました");
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, currentQuestionIndex, questions.length]
  );

  // Core観測の回答ハンドラ
  const handleCoreAnswer = useCallback(
    async (answer: CoreObservationAnswer) => {
      if (isSubmitting) return;
      setIsSubmitting(true);

      try {
        const now = new Date().toISOString();
        const res = await fetch("/api/stargazer/observations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            observations: [
              {
                questionId: answer.questionId,
                answer: answer.binaryChoice,
                answerValue: answer,
                shownAt: answer.binaryTimestamp,
                answeredAt: now,
                responseTimeMs: answer.totalResponseTimeMs,
                confidenceSelfReport: -1,
                skipped: false,
              },
            ],
            phase: "core",
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          let errData: Record<string, unknown> = {};
          try {
            errData = JSON.parse(errText);
          } catch {
            /* non-JSON */
          }
          console.error(
            "Core observation save failed:",
            res.status,
            errData,
            errText.slice(0, 200)
          );
          showErrorFeedback("保存に失敗しました。もう一度お試しください。");
          setIsSubmitting(false);
          return;
        }

        const data = await res.json();
        handleObservationSuccess(data, false);
        setProgress((prev) => ({ ...prev, answered: prev.answered + 1 }));

        const nextIndex = currentQuestionIndex + 1;
        if (nextIndex >= coreQuestions.length) {
          setObservationPhase("completed");
          setTimeout(() => loadState(), 500);
        } else {
          setCurrentQuestionIndex(nextIndex);
        }
      } catch (err) {
        console.error("Core observation error:", err);
        showErrorFeedback("通信エラーが発生しました");
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, currentQuestionIndex, coreQuestions.length]
  );

  // 矛盾プローブの回答ハンドラ
  const handleContradictionProbeAnswer = useCallback(
    async (probeId: string, chipId: string, chipInsightType: string) => {
      if (isSubmitting) return;
      setIsSubmitting(true);

      try {
        const now = new Date().toISOString();
        await fetch("/api/stargazer/observations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            observations: [
              {
                questionId: probeId,
                answer: "A",
                answerValue: {
                  type: "contradiction_probe",
                  chipId,
                  chipInsightType,
                },
                shownAt: now,
                answeredAt: now,
                responseTimeMs: 0,
                confidenceSelfReport: -1,
                skipped: false,
              },
            ],
            phase: "daily",
          }),
        });

        setContradictionProbe(null);
        showSuccessFeedback("揺らぎを記録しました");
      } catch (err) {
        console.error("Contradiction probe error:", err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting]
  );

  // ═══ ヘルパー関数 ═══

  function showErrorFeedback(message: string) {
    setFeedback({
      saved: false,
      observationCount: 0,
      liveSkyChanged: false,
      dimensionsUpdated: [],
      message,
    });
    setShowFeedback(true);
  }

  function showSuccessFeedback(message: string) {
    setFeedback({
      saved: true,
      observationCount: 1,
      liveSkyChanged: false,
      dimensionsUpdated: [],
      message,
    });
    setShowFeedback(true);
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(
      () => setShowFeedback(false),
      2500
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleObservationSuccess(data: any, skipped: boolean, customMessage?: string) {
    const fb: ObservationFeedback = {
      saved: true,
      observationCount: data.observationsSaved || 1,
      coreStar: data.coreStar
        ? {
            constellationCode: data.coreStar.constellationCode,
            constellationLabel: data.coreStar.constellationLabel,
            constellationEmoji: data.coreStar.constellationEmoji || "⭐",
            confidenceScore: data.coreStar.confidenceScore,
            changed: data.coreStar.changed || false,
          }
        : undefined,
      liveSky: data.liveSky || undefined,
      liveSkyChanged: data.liveSkyChanged || false,
      dimensionsUpdated: data.dimensionsUpdated || [],
      message: skipped
        ? "スキップしました"
        : customMessage || "観測を記録しました",
    };

    setFeedback(fb);
    setShowFeedback(true);
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(
      () => setShowFeedback(false),
      2500
    );

    if (data.coreStar) {
      setStarMap((prev) =>
        prev
          ? {
              ...prev,
              coreStar: {
                ...prev.coreStar!,
                constellationCode: data.coreStar.constellationCode,
                constellationLabel: data.coreStar.constellationLabel,
                confidenceScore: data.coreStar.confidenceScore,
                coreTraits:
                  data.coreStar.coreTraits ||
                  prev.coreStar?.coreTraits ||
                  {},
              },
            }
          : prev
      );
      if (data.coreStar.constellationEmoji) {
        setConstellationInfo((prev) => ({
          ...prev!,
          emoji: data.coreStar.constellationEmoji,
        }));
      }
    }

    if (data.liveSky) {
      setStarMap((prev) =>
        prev
          ? {
              ...prev,
              liveSky: { ...prev.liveSky!, ...data.liveSky },
            }
          : prev
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function advanceQuestion(_data: any, totalQuestions: number) {
    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex >= totalQuestions) {
      setObservationPhase("completed");
      setTimeout(() => loadState(), 500);
    } else {
      setCurrentQuestionIndex(nextIndex);
    }
  }

  // ═══ ローディング ═══
  if (appState === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <motion.div
          className="relative z-10 flex flex-col items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        >
          <motion.div className="relative mb-8">
            <motion.div
              className="w-20 h-20 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(251,191,36,0.4) 0%, rgba(251,191,36,0.1) 40%, transparent 70%)",
              }}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.6, 1, 0.6],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              animate={{ rotate: 360 }}
              transition={{
                duration: 20,
                repeat: Infinity,
                ease: "linear",
              }}
            >
              {[0, 60, 120, 180, 240, 300].map((deg) => (
                <motion.div
                  key={deg}
                  className="absolute w-1 h-1 rounded-full bg-amber-300/60"
                  style={{
                    transform: `rotate(${deg}deg) translateY(-30px)`,
                  }}
                  animate={{ opacity: [0.2, 0.8, 0.2] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: deg / 360,
                  }}
                />
              ))}
            </motion.div>
          </motion.div>

          <motion.p
            className="text-amber-200/50 text-sm tracking-[0.3em] uppercase font-medium"
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            Observing Stars
          </motion.p>
        </motion.div>
      </div>
    );
  }

  // ═══ 未認証: Locked UI ═══
  if (authError) {
    return (
      <div className="min-h-screen relative">
        <ModeTabBar
          activeMode={activeMode}
          onModeChange={setActiveMode}
          resultsLocked
        />
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* ロック表示CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="rounded-2xl p-8 mb-8 text-center relative overflow-hidden"
            style={{
              background:
                "linear-gradient(145deg, rgba(251,191,36,0.08) 0%, rgba(251,191,36,0.03) 50%, rgba(255,255,255,0.02) 100%)",
              border: "1px solid rgba(251,191,36,0.15)",
            }}
          >
            <motion.span
              className="text-5xl inline-block mb-4"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity }}
              style={{
                filter: "drop-shadow(0 0 16px rgba(251,191,36,0.3))",
              }}
            >
              🔭
            </motion.span>
            <h2 className="text-2xl font-semibold mb-2 bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 bg-clip-text text-transparent">
              観測結果を見るにはログインが必要です
            </h2>
            <p className="text-base text-white/50 mb-6 leading-relaxed">
              ログイン後、質問に答えることであなたの人格が観測されます
            </p>
            <Link
              href="/login?next=/stargazer"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-semibold transition-all"
              style={{
                background:
                  "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(251,191,36,0.08))",
                border: "1px solid rgba(251,191,36,0.25)",
                color: "rgba(253,230,138,0.9)",
              }}
            >
              ログインして観測を始める
              <motion.span
                animate={{ x: [0, 3, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                →
              </motion.span>
            </Link>
          </motion.div>

          {/* ブラー付きプレースホルダー */}
          <div className="relative min-h-[300px]">
            <div
              className="pointer-events-none select-none"
              style={{ filter: "blur(6px)", opacity: 0.4 }}
            >
              <SkeletonCards />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div
                  className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <span className="text-xl">🔒</span>
                </div>
                <p className="text-sm text-white/40">
                  ログインで表示されます
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══ メインUI ═══
  const currentQuestion =
    observationPhase === "core"
      ? coreQuestions[currentQuestionIndex] || null
      : questions[currentQuestionIndex] || null;

  const confidenceScore = starMap?.coreStar?.confidenceScore ?? 0;

  return (
    <div className="min-h-screen relative">
      {/* フィードバックトースト */}
      <FeedbackToast feedback={feedback} show={showFeedback} />

      {/* モードタブバー（常時固定） */}
      <ModeTabBar
        activeMode={activeMode}
        onModeChange={setActiveMode}
        resultsLocked={!hasStarMap && observationPhase !== "completed"}
      />

      {/* 1カラムレイアウト */}
      <div className="max-w-[720px] mx-auto">
        {/* メインコンテンツ */}
        <main className="px-4 py-6">
          {/* 観測モード */}
          {activeMode === "observe" && (
            <ObserveView
              observationPhase={observationPhase}
              currentQuestion={currentQuestion}
              progress={progress}
              currentQuestionIndex={currentQuestionIndex}
              isSubmitting={isSubmitting}
              confidenceScore={confidenceScore}
              observationStats={observationStats}
              contradictionProbe={contradictionProbe}
              starMap={starMap}
              contextFilter={contextFilter}
              onContextFilterChange={setContextFilter}
              periodFilter={periodFilter}
              onPeriodFilterChange={setPeriodFilter}
              onAnswer={handleAnswer}
              onEnhancedDailyAnswer={handleEnhancedDailyAnswer}
              onCoreAnswer={handleCoreAnswer}
              onContradictionProbeAnswer={handleContradictionProbeAnswer}
              onReload={loadState}
            />
          )}

          {/* 結果モード */}
          {activeMode === "results" && (
            <ResultsView
              starMap={starMap}
              resolvedType={resolvedType}
              personalityProfile={personalityProfile}
              dimensionDetails={dimensionDetails}
              observationStats={observationStats}
              insightCards={insightCards}
              constellationInfo={constellationInfo}
              hasStarMap={hasStarMap}
              isLocked={false}
              remainingForResults={
                observationPhase !== "completed" && !hasStarMap
                  ? Math.max(0, progress.total - progress.answered)
                  : undefined
              }
              periodFilter={periodFilter}
              onPeriodFilterChange={setPeriodFilter}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ═══ スケルトンカード（ロック時プレースホルダー） ═══
function SkeletonCards() {
  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl p-5"
        style={{
          background:
            "linear-gradient(145deg, rgba(12,12,28,0.9), rgba(10,15,30,0.95))",
          border: "1px solid rgba(251,191,36,0.08)",
        }}
      >
        <div className="text-center mb-4">
          <span className="text-4xl inline-block mb-2">⭐</span>
          <div className="h-6 w-32 mx-auto rounded bg-white/5 mb-2" />
          <div className="h-3 w-20 mx-auto rounded bg-white/[0.03]" />
        </div>
      </div>
      <div
        className="rounded-2xl p-5"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-3 w-24 rounded bg-white/5 mb-2" />
              <div className="h-2 bg-white/[0.04] rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <div
        className="rounded-2xl p-5"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="text-center">
          <span className="text-3xl inline-block mb-2">🌊</span>
          <div className="h-5 w-28 mx-auto rounded bg-white/5" />
        </div>
      </div>
    </div>
  );
}
