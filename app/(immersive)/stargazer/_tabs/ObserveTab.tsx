// app/stargazer/_tabs/ObserveTab.tsx
// 観測タブ v5 — 状態キャプチャ + 時間帯挨拶 + シナリオ質問 + 深掘りフロー + 寄り添いインサイト
"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { generateMicroInsight, type MicroInsight } from "@/lib/architecture/edgeMicroInsights";
import { determineAdaptation, type SessionAnswer, type PlannedQuestion, type AdaptationDecision } from "@/lib/stargazer/intraSessionAdapter";
import type { TypeDefLike } from "@/lib/stargazer/dailyInsightEngine";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";
import {
  getDailyScenarios,
  THEME_LABELS,
  type ScenarioQuestion,
  type ScenarioOption,
  type FollowUpQuestion,
} from "@/lib/stargazer/situationalQuestions";
import {
  generateCompletionInsight,
  type DailyGreeting,
  type DailyWhisper,
  type ObservationCompletionInsight,
} from "@/lib/stargazer/dailyInsightEngine";
import { getTimeOfDay, type TimeOfDay } from "@/lib/shared/timeOfDay";
import InitialOnboardingFlow from "../_components/InitialOnboardingFlow";
import OnboardingOrchestrator from "../_components/OnboardingOrchestrator";
import MicroInsightOverlay from "./_observation/MicroInsightOverlay";
import CelebrationOverlay from "./_observation/CelebrationOverlay";
import type { ResolvedResult, QuestionAnswer } from "@/lib/stargazer/typeResolver";
import type { CfAnswer } from "@/lib/stargazer/cognitiveFitQuestions";
import { computeCognitiveFitScores } from "@/lib/stargazer/cognitiveFitScoring";
import {
  ENERGY_OPTIONS,
  EMOTION_OPTIONS,
  SOCIAL_OPTIONS,
  type ObservationState,
  type EnergyLevel,
  type EmotionalTone,
  type SocialContext,
} from "@/lib/stargazer/fluctuationEngine";
import PostObservationProgress from "../_components/PostObservationProgress";
import PostOnboardingFeedback, { hasSubmittedFeedback } from "../_components/PostOnboardingFeedback";
import FeedbackToast from "../_components/FeedbackToast";
import { NoObservationsYet } from "../_components/EmptyStates";
import { ObserveSkeleton } from "../_components/SkeletonLoaders";
import AccuracyDecayWarning from "../_components/AccuracyDecayWarning";
import DeepProbeUnlockCard from "../_components/DeepProbeUnlockCard";
import ServerDailyObservationTab from "./ServerDailyObservationTab";
import DailyInsightCard, { type DailyInsightData } from "../_components/DailyInsightCard";
import { useHaptics } from "@/hooks/useHaptics";
import { useStargazerSounds } from "@/hooks/useStargazerSounds";
import { updateEngagementField } from "@/lib/stargazer/engagementScore";

interface ObserveTabProps {
  hasData: boolean;
  axisScores: Partial<Record<TraitAxisKey, number>>;
  totalObservations: number;
  typeDef: TypeDefLike | null;
  greeting: DailyGreeting | null;
  whisper: DailyWhisper | null;
  onDataRefresh?: () => void;
  onStartStage2?: () => void;
  onFirstObservationSaved?: () => void;
  previewMode?: boolean;
  /** RV-only mode: user came via ?rv=start to do relationship observation */
  rvStartMode?: boolean;
  /** Existing profile data for RV-only mode (to merge RV results on top) */
  existingProfile?: { resolvedType: string; axisScores: Record<TraitAxisKey, number>; confidence: number; topMatches: { code: string; score: number }[] };
  /** Called when RV flow completes (to clean up URL params & refresh data) */
  onRvFlowDone?: () => void;
}

const TIME_GREETINGS: Record<TimeOfDay, { emoji: string; text: string }> = {
  morning: {
    emoji: "🌅",
    text: "おはようございます。今日の自分を観測してみましょう。",
  },
  afternoon: {
    emoji: "☀️",
    text: "午後の自分はどんな感じですか？朝とは違う答えになるかも。",
  },
  night: {
    emoji: "🌙",
    text: "一日の終わりに、今日の自分を振り返ってみましょう。",
  },
};

// ── localStorage persistence ──
const SG_OBSERVE_KEY_PREFIX = "culcept_sg_observe_v1_";
const DAILY_SCENARIO_COUNT = 8;

interface SavedObservation {
  date: string;
  answers: { questionId: string; optionId: string; responseTimeMs: number }[];
  capturedState: ObservationState | null;
  completedAt: string; // ISO
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadTodayObservation(): SavedObservation | null {
  try {
    const raw = localStorage.getItem(`${SG_OBSERVE_KEY_PREFIX}${todayStr()}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveTodayObservation(data: SavedObservation): void {
  const key = `${SG_OBSERVE_KEY_PREFIX}${data.date}`;
  try {
    localStorage.setItem(key, JSON.stringify(data));
    // Also save lightweight marker for 30-day calendar
    localStorage.setItem(`${SG_OBSERVED_MARKER_PREFIX}${data.date}`, "1");
  } catch {
    // Quota exceeded — cleanup old entries and retry
    cleanupOldSgObservations();
    try {
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem(`${SG_OBSERVED_MARKER_PREFIX}${data.date}`, "1");
    } catch { /* give up */ }
  }
}

/** Marker prefix for recording that observation happened on a given date (lightweight) */
const SG_OBSERVED_MARKER_PREFIX = "culcept_sg_observed_";

function cleanupOldSgObservations(): void {
  const today = todayStr();
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(SG_OBSERVE_KEY_PREFIX) && !k.endsWith(today)) {
      // Before removing the full observation data, save a lightweight marker
      // so the 30-day activity calendar can show this date as observed
      const dateStr = k.replace(SG_OBSERVE_KEY_PREFIX, "");
      try {
        localStorage.setItem(`${SG_OBSERVED_MARKER_PREFIX}${dateStr}`, "1");
      } catch { /* */ }
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  // Clean up markers older than 60 days
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(SG_OBSERVED_MARKER_PREFIX)) {
      const dateStr = k.replace(SG_OBSERVED_MARKER_PREFIX, "");
      if (dateStr < sixtyDaysAgo.toISOString().slice(0, 10)) {
        try { localStorage.removeItem(k); } catch { /* */ }
      }
    }
  }
}

function getTodayObservationSnapshot(): SavedObservation | null {
  if (typeof window === "undefined") return null;
  cleanupOldSgObservations();
  return loadTodayObservation();
}

// ── Partial progress (mid-session resume) ──
const SG_PARTIAL_KEY = "culcept_sg_partial_v1";

interface PartialProgress {
  date: string;
  answeredCount: number;
  totalCount: number;
  answers: { questionId: string; optionId: string; responseTimeMs: number }[];
  currentIdx: number;
  capturedState: ObservationState | null;
}

function savePartialProgress(data: PartialProgress): void {
  try { localStorage.setItem(SG_PARTIAL_KEY, JSON.stringify(data)); } catch { /* */ }
}

function loadPartialProgress(): PartialProgress | null {
  try {
    const raw = localStorage.getItem(SG_PARTIAL_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PartialProgress;
    if (data.date !== todayStr()) {
      localStorage.removeItem(SG_PARTIAL_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

function clearPartialProgress(): void {
  try { localStorage.removeItem(SG_PARTIAL_KEY); } catch { /* */ }
}

function buildDailyScenarios(date: string): ScenarioQuestion[] {
  return getDailyScenarios(date, [], DAILY_SCENARIO_COUNT);
}

function buildCompletionInsight(
  saved: SavedObservation | null,
  axisScores: Partial<Record<TraitAxisKey, number>>,
  totalObservations: number,
  typeDef: TypeDefLike | null
): ObservationCompletionInsight | null {
  if (!saved?.completedAt || saved.answers.length === 0) {
    return null;
  }

  return generateCompletionInsight(
    saved.answers,
    axisScores,
    totalObservations,
    typeDef
  );
}

function loadSavedOnboardingResult(): {
  result: ResolvedResult;
  answers: QuestionAnswer[];
} | null {
  if (typeof window === "undefined") return null;

  const doneKey = "culcept_sg_onboarding_done_v1";
  const resultKey = "culcept_sg_onboarding_result_v1";

  try {
    const doneFlag = localStorage.getItem(doneKey);
    if (doneFlag) return null;

    const saved = localStorage.getItem(resultKey);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    if (parsed?.result && parsed?.answers?.length) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export default function ObserveTab({
  hasData,
  axisScores,
  totalObservations,
  typeDef,
  greeting,
  whisper,
  onDataRefresh,
  onStartStage2,
  onFirstObservationSaved,
  previewMode = false,
  rvStartMode = false,
  existingProfile,
  onRvFlowDone,
}: ObserveTabProps) {
  const initialSavedObservation = useMemo(
    () => getTodayObservationSnapshot(),
    []
  );
  const initialObservationDate = initialSavedObservation?.date ?? todayStr();
  const [phase, setPhase] = useState<
    "intro" | "state_capture" | "scenario" | "followup" | "micro_insight" | "celebration" | "done"
  >(initialSavedObservation?.completedAt ? "done" : "intro");
  const [currentMicroInsight, setCurrentMicroInsight] = useState<MicroInsight | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioQuestion[]>(() =>
    buildDailyScenarios(initialObservationDate)
  );
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<ScenarioOption | null>(
    null
  );
  const [currentFollowUp, setCurrentFollowUp] =
    useState<FollowUpQuestion | null>(null);
  const [answers, setAnswers] = useState<
    { questionId: string; optionId: string; responseTimeMs: number }[]
  >(() => initialSavedObservation?.answers ?? []);
  const questionStartRef = useRef<number>(0);

  // ── 状態キャプチャ ──
  const [capturedState, setCapturedState] = useState<ObservationState | null>(
    initialSavedObservation?.capturedState ?? null
  );
  const [stateEnergy, setStateEnergy] = useState<EnergyLevel | null>(null);
  const [stateEmotion, setStateEmotion] = useState<EmotionalTone | null>(null);
  const [stateSocial, setStateSocial] = useState<SocialContext | null>(null);
  const [stateCaptureStep, setStateCaptureStep] = useState<0 | 1 | 2>(0);
  const [todayObservation, setTodayObservation] =
    useState<SavedObservation | null>(initialSavedObservation);
  const [observationDate, setObservationDate] = useState(initialObservationDate);

  // ── Haptics & Sound for scenario interactions ──
  const haptics = useHaptics();
  const { playInsightReveal } = useStargazerSounds();
  const [showConfirmParticles, setShowConfirmParticles] = useState(false);
  const [fastAnswer, setFastAnswer] = useState(false);
  const [showHesitationMsg, setShowHesitationMsg] = useState(false);
  const hesitationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scenarioCardRef = useRef<HTMLDivElement>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [feedbackToastShow, setFeedbackToastShow] = useState(false);
  const [feedbackToastMsg, setFeedbackToastMsg] = useState<string | null>(null);

  const timeOfDay = useMemo(() => getTimeOfDay(), []);
  const timeGreeting = TIME_GREETINGS[timeOfDay];
  const formattedObservationDate = useMemo(() => {
    const date = new Date(`${observationDate}T12:00:00`);
    return new Intl.DateTimeFormat("ja-JP", {
      month: "long",
      day: "numeric",
      weekday: "short",
    }).format(date);
  }, [observationDate]);

  const restoreCompletedObservation = useCallback(
    (saved: SavedObservation) => {
      setTodayObservation(saved);
      setObservationDate(saved.date);
      setScenarios(buildDailyScenarios(saved.date));
      setCurrentIdx(0);
      setSelectedOption(null);
      setCurrentFollowUp(null);
      setAnswers(saved.answers);
      setCapturedState(saved.capturedState);
      setPhase("done");
    },
    []
  );

  const resetObservationForDate = useCallback((date: string) => {
    setTodayObservation(null);
    setObservationDate(date);
    setScenarios(buildDailyScenarios(date));
    setCurrentIdx(0);
    setSelectedOption(null);
    setCurrentFollowUp(null);
    setAnswers([]);
    setCapturedState(null);
    setStateEnergy(null);
    setStateEmotion(null);
    setStateSocial(null);
    setStateCaptureStep(0);
    setPhase("intro");
  }, []);

  useEffect(() => {
    const syncTodayObservation = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      cleanupOldSgObservations();
      const currentDate = todayStr();
      const saved = loadTodayObservation();

      if (saved?.completedAt) {
        restoreCompletedObservation(saved);
        return;
      }

      if (observationDate !== currentDate) {
        resetObservationForDate(currentDate);
      }
    };

    syncTodayObservation();
    window.addEventListener("focus", syncTodayObservation);
    document.addEventListener("visibilitychange", syncTodayObservation);

    return () => {
      window.removeEventListener("focus", syncTodayObservation);
      document.removeEventListener("visibilitychange", syncTodayObservation);
    };
  }, [observationDate, resetObservationForDate, restoreCompletedObservation]);
  const completionInsight = useMemo(() => {
    if (todayObservation?.completedAt) {
      return buildCompletionInsight(
        todayObservation,
        axisScores,
        totalObservations,
        typeDef
      );
    }

    if ((phase === "done" || phase === "celebration") && answers.length > 0) {
      return generateCompletionInsight(
        answers,
        axisScores,
        totalObservations,
        typeDef
      );
    }

    return null;
  }, [todayObservation, phase, answers, axisScores, totalObservations, typeDef]);

  function startObservation() {
    setPhase("state_capture");
    setStateCaptureStep(0);
  }

  // Focus management: move focus to card on question change
  useEffect(() => {
    if ((phase === "scenario" || phase === "followup") && scenarioCardRef.current) {
      scenarioCardRef.current.focus({ preventScroll: true });
    }
  }, [phase, currentIdx]);

  // Offline detection (B1)
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    if (typeof window !== "undefined") {
      setIsOffline(!navigator.onLine);
      window.addEventListener("offline", goOffline);
      window.addEventListener("online", goOnline);
      return () => {
        window.removeEventListener("offline", goOffline);
        window.removeEventListener("online", goOnline);
      };
    }
  }, []);

  // Hesitation message: show after 5s of no selection in scenario phase
  useEffect(() => {
    if (phase !== "scenario" && phase !== "followup") return;
    setShowHesitationMsg(false);
    if (hesitationTimerRef.current) clearTimeout(hesitationTimerRef.current);
    hesitationTimerRef.current = setTimeout(() => setShowHesitationMsg(true), 5000);
    return () => { if (hesitationTimerRef.current) clearTimeout(hesitationTimerRef.current); };
  }, [phase, currentIdx]);

  function completeStateCapture() {
    if (!stateEnergy || !stateEmotion || !stateSocial) return;
    const state: ObservationState = {
      energy: stateEnergy,
      emotion: stateEmotion,
      social: stateSocial,
      timeOfDay,
      timestamp: new Date().toISOString(),
    };
    setCapturedState(state);
    setPhase("scenario");
    questionStartRef.current = Date.now();
  }

  function selectOption(opt: ScenarioOption) {
    // Clear hesitation message
    setShowHesitationMsg(false);
    if (hesitationTimerRef.current) clearTimeout(hesitationTimerRef.current);

    setSelectedOption(opt);
    haptics.light();

    // Check if fast answer
    const elapsed = Date.now() - questionStartRef.current;
    setFastAnswer(elapsed < 1500);
    // 明示的「次へ」ボタンで確定（自動確定は廃止）
  }

  function confirmSelection(optOverride?: ScenarioOption) {
    const opt = optOverride ?? selectedOption;
    if (!opt) return;

    // Feedback: haptics + particles + sound
    haptics.medium();
    setShowConfirmParticles(true);
    setTimeout(() => setShowConfirmParticles(false), 500);

    const elapsed = Date.now() - questionStartRef.current;
    const current = scenarios[currentIdx];
    const answer = {
      questionId: current.id,
      optionId: opt.id,
      responseTimeMs: elapsed,
    };
    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);

    // Save partial progress for resume
    savePartialProgress({
      date: todayStr(),
      answeredCount: newAnswers.length,
      totalCount: scenarios.length,
      answers: newAnswers,
      currentIdx: currentIdx + 1,
      capturedState,
    });

    // Check for follow-up
    const followUp = current.followUps?.find(
      (f) => f.triggeredBy === opt.id
    );
    if (followUp && phase === "scenario") {
      haptics.light();
      setCurrentFollowUp(followUp);
      setPhase("followup");
      setSelectedOption(null);
      setFastAnswer(false);
      questionStartRef.current = Date.now();
      return;
    }

    // Next question or done
    setSelectedOption(null);
    setCurrentFollowUp(null);
    setFastAnswer(false);

    if (currentIdx + 1 < scenarios.length) {
      // マイクロインサイト生成（<50ms、確率的に表示）
      const current = scenarios[currentIdx];
      const elapsed = Date.now() - questionStartRef.current;
      // theme をキーにマイクロインサイトを生成（ScenarioQuestion に axisId はないため）
      const insight = generateMicroInsight(
        current.theme ?? current.id,
        0,
        elapsed,
      );
      if (insight) {
        setCurrentMicroInsight(insight);
        setPhase("micro_insight");
      } else {
        setCurrentIdx(currentIdx + 1);
        setPhase("scenario");
        questionStartRef.current = Date.now();
      }
    } else {
      // Completion → セレブレーション
      playInsightReveal();
      setPhase("celebration");
      const completedObservation = {
        date: todayStr(),
        answers: newAnswers,
        capturedState,
        completedAt: new Date().toISOString(),
      };
      clearPartialProgress();
      saveTodayObservation(completedObservation);
      setTodayObservation(completedObservation);
      setObservationDate(completedObservation.date);

      // XP: 観測完了 +50pt
      updateEngagementField("observationCompleted", true);

      // Save to DB via daily-observation API
      (async () => {
        try {
          await fetch("/api/stargazer/daily-observation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              answers: newAnswers.map((a) => ({
                variantId: a.questionId,
                score: 0,
                responseTimeMs: a.responseTimeMs,
                optionId: a.optionId,
              })),
              observationState: capturedState ? {
                energy: capturedState.energy,
                emotion: capturedState.emotion,
                social: capturedState.social,
                timeOfDay: capturedState.timeOfDay ?? "",
                timestamp: capturedState.timestamp ?? new Date().toISOString(),
              } : null,
              observationDate: completedObservation.date,
              isPartial: false,
            }),
          });
          // Refresh parent data to update milestones and stats
          onDataRefresh?.();
        } catch (err) {
          console.warn("[ObserveTab] Failed to save daily observation to DB:", err);
        }
      })();
    }
  }

  // ── Save state management ──
  const [onboardingResult, setOnboardingResult] = useState<{
    result: ResolvedResult;
    answers: QuestionAnswer[];
  } | null>(() => loadSavedOnboardingResult());
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "success" | "error" | "auth_required"
  >("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  // localStorage key for persisting unsaved onboarding results
  const SG_ONBOARDING_RESULT_KEY = "culcept_sg_onboarding_result_v1";
  const SG_ONBOARDING_DONE_KEY = "culcept_sg_onboarding_done_v1";

  // ── Intra-Session Adaptation: セッション内リアルタイム適応 ──
  const [sessionAnswers, setSessionAnswers] = useState<SessionAnswer[]>([]);
  const getNextAdaptation = useCallback((currentAnswer: SessionAnswer, remainingQs: PlannedQuestion[], idx: number) => {
    const decision = determineAdaptation(currentAnswer, sessionAnswers, remainingQs, idx);
    setSessionAnswers((prev) => [...prev, currentAnswer]);
    return decision;
  }, [sessionAnswers]);

  const doSave = useCallback(async (result: ResolvedResult, allAnswers: QuestionAnswer[], cfAnswers?: CfAnswer[]) => {
    setSaveState("saving");
    setSaveError(null);
    console.log("[Stargazer] doSave: Starting save with", allAnswers.length, "answers, CF answers:", cfAnswers?.length ?? 0);

    // Compute cognitive fit scores if CF answers are present
    let cfScores: Record<string, number> | undefined;
    let cfConfidences: Record<string, number> | undefined;
    if (cfAnswers && cfAnswers.length > 0) {
      const cfResult = computeCognitiveFitScores(cfAnswers);
      cfScores = {};
      cfConfidences = {};
      for (const s of cfResult.scores) {
        cfScores[s.axis] = s.rawScore;
        cfConfidences[s.axis] = s.confidence;
      }
      console.log("[Stargazer] doSave: Computed CF scores:", cfScores);
    }

    try {
      // ── Step 1: Save to DB via API ──
      const res = await fetch("/api/stargazer/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: "semantic_differential",
          answers: allAnswers.map((a) => ({
            questionId: a.questionId,
            value: a.value,
            responseTimeMs: a.responseTimeMs ?? 0,
          })),
          resolvedType: result.reactionType,
          axisScores: result.axisScores,
          confidence: result.confidence,
          // Include CF scores for persistence
          ...(cfScores ? { cfScores, cfConfidences } : {}),
        }),
      });

      if (res.status === 401) {
        console.warn("[Stargazer] doSave: 401 Unauthorized");
        setSaveState("auth_required");
        return;
      }

      // Parse response body for detailed error info
      // API format: { ok: true, data: { saved: true, observationCount: N, ... } }
      let raw: Record<string, unknown> | null = null;
      try {
        raw = await res.json();
      } catch {
        raw = null;
      }
      // apiOk() wraps in { ok, data }, unwrap to get the inner payload
      const envelope = raw as { ok?: boolean; data?: Record<string, unknown>; error?: string; detail?: string; errors?: string[] } | null;
      const payload: Record<string, unknown> = (envelope?.data ?? envelope ?? {}) as Record<string, unknown>; // fallback: legacy APIs that don't wrap in data
      console.log("[Stargazer] doSave: API response status:", res.status, "body:", raw);

      // Check HTTP status first
      if (!res.ok) {
        const errorDetail = envelope?.errors?.join("; ") ?? envelope?.detail ?? envelope?.error ?? `HTTP ${res.status}`;
        setSaveState("error");
        setSaveError(`DB保存に失敗しました: ${errorDetail}`);
        console.error("[Stargazer] doSave: API returned error:", res.status, raw);
        return;
      }

      // Verify response body confirms actual save success
      if (!envelope?.ok || !payload?.saved) {
        setSaveState("error");
        setSaveError(`APIは200を返しましたが、保存が確認できません: ${JSON.stringify(raw)}`);
        console.error("[Stargazer] doSave: API returned 200 but ok/saved is false:", raw);
        return;
      }

      // Verify observation count is nonzero (confirm data actually persisted)
      const observationCount = (payload?.observationCount as number) ?? 0;
      if (observationCount === 0) {
        setSaveState("error");
        setSaveError("保存後のデータ確認で観測数が0でした。再試行してください。");
        console.error("[Stargazer] doSave: observationCount is 0 despite save 'success'");
        return;
      }

      // ── Step 2: Verify profile was saved by re-fetching ──
      console.log("[Stargazer] doSave: Save succeeded, verifying profile re-fetch...");
      let profileVerified = false;
      try {
        const profileRes = await fetch("/api/stargazer/profile", {
          credentials: "include",
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          profileVerified = !!(
            (profileData?.observationStats?.totalAnswered ?? 0) > 0 ||
            profileData?.resolvedType?.archetypeCode ||
            profileData?.starMap?.coreStar?.archetypeCode
          );
          console.log(
            "[Stargazer] doSave: Profile verify result:",
            profileVerified,
            "totalObs:",
            profileData?.observationStats?.totalAnswered ?? 0
          );
        } else {
          console.warn("[Stargazer] doSave: Profile re-fetch failed with status:", profileRes.status);
        }
      } catch (profileErr) {
        console.warn("[Stargazer] doSave: Profile re-fetch exception:", profileErr);
      }

      if (!profileVerified) {
        // Save succeeded but re-fetch failed — show warning, not full error
        console.warn("[Stargazer] doSave: Save OK but profile re-fetch could not verify. Continuing with success.");
      }

      // ── All checks passed: genuine success ──
      setSaveState("success");
      // XP: 観測完了 +50pt
      updateEngagementField("observationCompleted", true);
      console.log("[Stargazer] doSave: ✅ Save confirmed. observationCount:", observationCount);

      // Notify parent that first observation was saved (for cross-feature reco)
      onFirstObservationSaved?.();

      // Persist completion flag
      try {
        localStorage.setItem(
          SG_ONBOARDING_DONE_KEY,
          JSON.stringify({ completedAt: new Date().toISOString(), resolvedType: result.reactionType })
        );
        // Clean up unsaved result
        localStorage.removeItem(SG_ONBOARDING_RESULT_KEY);
      } catch { /* localStorage quota — non-critical */ }

      // Refresh parent data after short delay for visual feedback
      setTimeout(() => {
        onDataRefresh?.();
      }, 800);
    } catch (err) {
      setSaveState("error");
      const msg = err instanceof Error ? err.message : "通信エラーが発生しました";
      setSaveError(`通信エラー: ${msg}`);
      console.error("[Stargazer] doSave: Network/fetch exception:", err);
    }
  }, [onDataRefresh, onFirstObservationSaved]);

  const handleOnboardingComplete = useCallback((result: ResolvedResult, allAnswers: QuestionAnswer[], cfAnswers?: CfAnswer[]) => {
    // Store result in state and localStorage (in case of failure/reload)
    const payload = { result, answers: allAnswers, cfAnswers };
    setOnboardingResult(payload);
    try {
      localStorage.setItem(SG_ONBOARDING_RESULT_KEY, JSON.stringify(payload));
    } catch { /* localStorage quota — non-critical */ }

    // Trigger save (with CF answers for scoring & persistence)
    doSave(result, allAnswers, cfAnswers);
  }, [doSave]);

  // Auto-advance when all 3 state-capture fields selected
  const handleAllSelected = useCallback(() => {
    if (stateEnergy && stateEmotion && stateSocial) {
      setTimeout(() => completeStateCapture(), 400);
    }
  }, [stateEnergy, stateEmotion, stateSocial, completeStateCapture]);

  // ── Compute accuracy decay for intro phase ──
  const daysSinceLastObs = useMemo(() => {
    if (typeof window === "undefined") return 0;
    try {
      const lastDate = localStorage.getItem("culcept_sg_last_completed");
      if (!lastDate) return totalObservations > 0 ? 7 : 0;
      const diff = Date.now() - new Date(lastDate).getTime();
      return Math.floor(diff / (1000 * 60 * 60 * 24));
    } catch { return 0; }
  }, [totalObservations]);

  // ── RV-only mode: User already completed Phase 1, entering RV via ?rv=start ──
  if (rvStartMode && hasData && existingProfile) {
    return (
      <div
        className="rounded-2xl p-4 sm:p-6 -mx-1"
        style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.04), 0 8px 40px rgba(0,0,0,0.06)",
          border: "1px solid rgba(140,150,180,0.12)",
        }}
      >
        <InitialOnboardingFlow
          onComplete={(result, allAnswers, cfAnswers) => {
            // Save the RV-merged result
            doSave(result, allAnswers, cfAnswers);
            onRvFlowDone?.();
          }}
          startFromRv
          existingProfile={existingProfile}
        />
      </div>
    );
  }

  // ── Onboarding: First-time user ──
  // hasData は初期観測（オンボーディング）完了を表す。
  // daily_observation 等の継続観測は含まれない。totalObservations は表示用の総数。
  if (phase === "intro" && !hasData) {
    // If we have completed results waiting to save, show save status UI
    if (onboardingResult && saveState !== "idle") {
      return (
        <div
          className="rounded-2xl p-6 sm:p-8 -mx-1"
          style={{
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(24px)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.04), 0 8px 40px rgba(0,0,0,0.06)",
            border: "1px solid rgba(140,150,180,0.15)",
          }}
        >
          <div className="space-y-6 py-8 text-center max-w-sm mx-auto">
            {/* Saving... */}
            {saveState === "saving" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <motion.div
                  className="text-4xl"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  🔭
                </motion.div>
                <p className="font-display text-base" style={{ color: "rgba(30,35,55,0.88)" }}>
                  観測結果を保存しています...
                </p>
                <div
                  className="h-1 rounded-full overflow-hidden mx-8"
                  style={{ background: "rgba(140,150,180,0.12)" }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "rgba(120,80,230,0.5)" }}
                    initial={{ width: "10%" }}
                    animate={{ width: "90%" }}
                    transition={{ duration: 3 }}
                  />
                </div>
              </motion.div>
            )}

            {/* Success → Feedback */}
            {saveState === "success" && !showFeedback && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4"
              >
                <motion.div
                  className="text-5xl"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 8 }}
                >
                  ✨
                </motion.div>
                <p className="font-display text-lg" style={{ color: "rgba(30,35,55,0.92)" }}>
                  観測結果を保存しました
                </p>
                <p className="text-sm" style={{ color: "rgba(60,65,85,0.65)" }}>
                  毎日の観測で、あなたの性格の分析がさらに正確になります。
                </p>
                {!hasSubmittedFeedback() && (
                  <motion.button
                    onClick={() => setShowFeedback(true)}
                    className="mt-4 px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
                    style={{
                      background: "rgba(22,28,48,0.06)",
                      border: "1px solid rgba(22,28,48,0.08)",
                      color: "rgba(22,28,48,0.7)",
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5 }}
                  >
                    初回の感想を聞かせてください →
                  </motion.button>
                )}
              </motion.div>
            )}
            {saveState === "success" && showFeedback && (
              <PostOnboardingFeedback
                onComplete={() => {
                  setShowFeedback(false);
                  if (onDataRefresh) onDataRefresh();
                }}
              />
            )}

            {/* Error */}
            {saveState === "error" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <div className="text-4xl">⚠️</div>
                <p className="font-display text-base" style={{ color: "rgba(180,60,60,0.9)" }}>
                  保存に失敗しました
                </p>
                {saveError && (
                  <div
                    className="text-xs px-4 py-3 rounded-lg mx-2 text-left space-y-1.5"
                    style={{
                      background: "rgba(220,60,60,0.06)",
                      border: "1px solid rgba(220,60,60,0.15)",
                      color: "rgba(160,50,50,0.8)",
                    }}
                  >
                    <p className="font-semibold">エラー詳細:</p>
                    <p className="break-all">{saveError}</p>
                    {saveError.includes("ENOTFOUND") && (
                      <p className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(220,60,60,0.1)" }}>
                        💡 Supabaseサーバーに接続できません。Supabaseプロジェクトが一時停止している可能性があります。
                        <a
                          href="https://supabase.com/dashboard"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline ml-1"
                          style={{ color: "rgba(100,70,220,0.8)" }}
                        >
                          ダッシュボードを確認
                        </a>
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs" style={{ color: "rgba(80,85,105,0.6)" }}>
                  回答データはブラウザに保存されています。再試行しても失われません。
                </p>
                <button
                  onClick={() => onboardingResult && doSave(onboardingResult.result, onboardingResult.answers)}
                  disabled={!onboardingResult}
                  className="w-full py-3.5 rounded-xl font-display text-sm font-semibold"
                  style={{
                    background: "linear-gradient(135deg, rgba(100,70,220,0.18), rgba(150,130,70,0.12))",
                    border: "1px solid rgba(100,70,220,0.3)",
                    color: "rgba(20,25,45,0.95)",
                    boxShadow: "0 2px 12px rgba(100,70,220,0.1)",
                  }}
                >
                  再試行する
                </button>
              </motion.div>
            )}

            {/* Auth required */}
            {saveState === "auth_required" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <div className="text-4xl">🔐</div>
                <p className="font-display text-base" style={{ color: "rgba(30,35,55,0.88)" }}>
                  ログインが必要です
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(60,65,85,0.68)" }}>
                  観測結果を保存するにはログインしてください。
                  回答データはブラウザに保存されているので、ログイン後に再試行できます。
                </p>
                <a
                  href="/login?redirect=/stargazer"
                  className="block w-full py-3.5 rounded-xl font-display text-sm font-semibold text-center"
                  style={{
                    background: "linear-gradient(135deg, rgba(100,70,220,0.18), rgba(150,130,70,0.12))",
                    border: "1px solid rgba(100,70,220,0.3)",
                    color: "rgba(20,25,45,0.95)",
                    boxShadow: "0 2px 12px rgba(100,70,220,0.1)",
                  }}
                >
                  ログインページへ →
                </a>
                <button
                  onClick={() => onboardingResult && doSave(onboardingResult.result, onboardingResult.answers)}
                  disabled={!onboardingResult}
                  className="w-full py-2.5 rounded-xl font-display text-xs"
                  style={{
                    background: "rgba(0,0,0,0.03)",
                    border: "1px solid rgba(140,150,180,0.18)",
                    color: "rgba(80,85,105,0.65)",
                  }}
                >
                  再試行する（すでにログイン済みの場合）
                </button>
              </motion.div>
            )}
          </div>
        </div>
      );
    }

    // V5 オンボーディング: 18問 → 中間結果 → 64問 → 完了
    return (
      <OnboardingOrchestrator onComplete={handleOnboardingComplete} />
    );
  }

  if (!previewMode) {
    return (
      <ServerDailyObservationTab
        axisScores={axisScores}
        totalObservations={totalObservations}
        typeDef={typeDef}
        greeting={greeting}
        whisper={whisper}
        onDataRefresh={onDataRefresh}
      />
    );
  }
  const decayPercentLost = Math.min(20, Math.max(0, (daysSinceLastObs - 2) * 4));
  const decayCurrentLevel = Math.max(10, 80 - decayPercentLost);

  // ── Intro Phase ──
  if (phase === "intro") {
    return (
      <div className="space-y-5">
        {daysSinceLastObs >= 3 && totalObservations > 0 && (
          <AccuracyDecayWarning
            daysSinceLastObservation={daysSinceLastObs}
            percentageLost={decayPercentLost}
            currentLevel={decayCurrentLevel}
            onResumeObservation={() => {
              // scroll to scenario start
              scenarioCardRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
          />
        )}
        <motion.div
          className="card-section flex items-start gap-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.14), rgba(251,191,36,0.14))",
              border: "1px solid rgba(139,92,246,0.2)",
              boxShadow: "0 8px 24px rgba(90,80,180,0.08)",
            }}
          >
            <span className="text-2xl">{timeGreeting.emoji}</span>
          </div>
          <div className="min-w-0 space-y-1.5">
            <span className="sg-text-micro">日次観測</span>
            <p className="sg-text-subtitle">
              今日の輪郭をつかむための、1日1回の観測です
            </p>
            <p className="sg-text-body">
              {timeGreeting.text}
            </p>
          </div>
        </motion.div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
          <motion.div
            className="card-hero-star"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <span className="sg-text-micro">今日の観測</span>
                <p
                  className="font-display text-[1.85rem] leading-[1.15]"
                  style={{ color: "rgba(18,24,44,0.96)" }}
                >
                  {greeting?.headline ?? "今の自分を観測して、今日の傾きを見つける"}
                </p>
              </div>
              <div
                className="rounded-2xl px-4 py-3 text-right"
                style={{
                  background: "rgba(255,255,255,0.62)",
                  border: "1px solid rgba(186,166,110,0.2)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
                }}
              >
                <span
                  className="font-mono-sg block text-[0.68rem]"
                  style={{
                    letterSpacing: "0.14em",
                    color: "rgba(128,112,74,0.88)",
                  }}
                >
                  {formattedObservationDate}
                </span>
                <span className="mt-1 block sg-text-caption">
                  1日1回のみ
                </span>
              </div>
            </div>

            <p className="mt-4 sg-text-body leading-7">
              {greeting?.subtext ??
                "正解を当てるためではなく、今の自分がどこに傾いているかを確かめるための観測です。"}
            </p>

            {whisper && (
              <div
                className="mt-5 rounded-2xl p-4"
                style={{
                  background: "rgba(255,255,255,0.54)",
                  border: "1px solid rgba(139,92,246,0.12)",
                }}
              >
                <span className="sg-text-micro">注目</span>
                <p className="mt-2 sg-text-body leading-7">
                  {whisper.text}
                </p>
              </div>
            )}
          </motion.div>

          <motion.div
            className="card-instrument flex flex-col gap-4"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.16 }}
          >
            <div className="space-y-2">
              <span className="sg-text-micro">観測ステータス</span>
              <p className="sg-text-subtitle">
                今日の観測を終えると、残るのは結果表示だけです
              </p>
              <p className="sg-text-body leading-7">
                観測は日付ごとに一度だけ。完了後はこの画面に結果のみが表示され、次回の開始は明日になります。
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="sg-stat-card">
                <span className="sg-stat-label">累計観測数</span>
                <span className="sg-stat-value">
                  {totalObservations}
                </span>
                <span className="sg-text-caption">
                  これまでの観測数
                </span>
              </div>
              <div className="sg-stat-card">
                <span className="sg-stat-label">アーキタイプ</span>
                <span className="sg-text-title mt-2 block">
                  {(() => {
                    const observedAxes = Object.values(axisScores).filter((v) => typeof v === "number" && Math.abs(v) > 0.01).length;
                    if (observedAxes < 5) return "観測中";
                    const result = resolveArchetype(axisScores);
                    const def = getArchetypeByCode(result.code);
                    return def ? `${def.emoji} ${def.name}` : "観測中";
                  })()}
                </span>
                <span className="sg-text-caption">
                  観測から見えてきた輪郭
                </span>
              </div>
            </div>

            <div className="card-info">
              <span className="sg-text-micro">観測の流れ</span>
              <p className="mt-2 sg-text-body font-medium">
                状態を記録する → 場面に答える → 今日の結果を見る
              </p>
              <p className="mt-1 sg-text-caption leading-6">
                正解はありません。迷い方や反応の速さも、今日の観測データとして残ります。
              </p>
              <p className="mt-2 sg-text-caption leading-6 flex items-center gap-1.5" style={{ color: "rgba(120,125,140,0.45)" }}>
                <span style={{ fontSize: "0.7rem" }}>🔒</span>
                回答はあなたのデバイスに保存され、あなた以外には公開されません。
              </p>
            </div>

            <motion.button
              onClick={startObservation}
              className="btn-primary-sg w-full py-4 text-base tracking-wide"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              🔭 今日の観測を始める
            </motion.button>

            <p className="text-center sg-text-caption leading-6" style={{ color: "rgba(170,150,90,0.45)" }}>
              約2-3分 — {DAILY_SCENARIO_COUNT}問の観測
            </p>

            {/* Resume partial progress */}
            {(() => {
              const partial = loadPartialProgress();
              if (!partial || partial.answeredCount === 0) return null;
              return (
                <motion.button
                  onClick={() => {
                    // Restore partial state
                    setAnswers(partial.answers);
                    setCurrentIdx(partial.currentIdx);
                    if (partial.capturedState) setCapturedState(partial.capturedState);
                    setPhase("scenario");
                    questionStartRef.current = Date.now();
                  }}
                  className="w-full py-3 rounded-xl text-sm transition-all"
                  style={{
                    background: "rgba(139,92,246,0.06)",
                    border: "1px solid rgba(139,92,246,0.15)",
                    color: "rgba(80,60,160,0.7)",
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {partial.answeredCount}/{partial.totalCount}問まで回答済み — 続きから始める
                </motion.button>
              );
            })()}

            {!hasData && (
              <p className="text-center sg-text-caption leading-6">
                初回でも気負わなくて大丈夫です。今の答え方が、そのまま観測の基準になります。
              </p>
            )}
          </motion.div>
        </div>

        {/* ── Daily Insight Card — 今日の気づき ── */}
        {hasData && totalObservations >= 3 && (() => {
          // Generate a daily insight based on available data
          const insightPool: DailyInsightData[] = [
            {
              text: "あなたの判断パターンは、エネルギーが高い時と低い時で違う傾向があります。今日はどちらでしょう？",
              category: "discovery",
              surpriseScore: 0.6,
              relatedFeature: "/stargazer",
            },
            {
              text: "前回の観測では、普段と少し違う回答が見られました。状況の変化が影響しているかもしれません。",
              category: "warning",
              surpriseScore: 0.4,
            },
            {
              text: `${totalObservations}回の観測で、あなたの核となる傾向が安定してきています。今日の観測でさらに精度が上がります。`,
              category: "affirmation",
              surpriseScore: 0.3,
            },
            {
              text: "ある場面では慎重に、別の場面では大胆に。あなたの中の矛盾が、実は適応力の証かもしれません。",
              category: "contradiction",
              surpriseScore: 0.7,
              relatedFeature: "/stargazer",
            },
          ];
          // Pick one based on the day
          const dayIdx = new Date().getDate() % insightPool.length;
          const insight = insightPool[dayIdx];

          // Calculate streak from localStorage
          let streak = 0;
          try {
            const today = new Date();
            for (let i = 0; i < 30; i++) {
              const d = new Date(today);
              d.setDate(d.getDate() - i);
              const key = `culcept_sg_observe_v1_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              if (typeof window !== "undefined" && localStorage.getItem(key)) {
                streak++;
              } else if (i > 0) break;
            }
          } catch { /* ignore */ }

          return (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <DailyInsightCard
                insight={insight}
                streak={streak}
                todayPattern={whisper?.text}
              />
            </motion.div>
          );
        })()}
      </div>
    );
  }

  // ── State Capture Phase (ワンタップ1画面) ──
  if (phase === "state_capture") {
    const allSelected = stateEnergy && stateEmotion && stateSocial;

    const sections = [
      {
        label: "エネルギー",
        options: ENERGY_OPTIONS,
        selected: stateEnergy,
        onSelect: (v: string) => { setStateEnergy(v as EnergyLevel); },
        accentBg: "rgba(190,170,110,0.1)",
        accentBorder: "rgba(190,170,110,0.3)",
      },
      {
        label: "気分",
        options: EMOTION_OPTIONS,
        selected: stateEmotion,
        onSelect: (v: string) => { setStateEmotion(v as EmotionalTone); },
        accentBg: "rgba(139,92,246,0.1)",
        accentBorder: "rgba(139,92,246,0.3)",
      },
      {
        label: "環境",
        options: SOCIAL_OPTIONS,
        selected: stateSocial,
        onSelect: (v: string) => { setStateSocial(v as SocialContext); },
        accentBg: "rgba(100,140,255,0.1)",
        accentBorder: "rgba(100,140,255,0.3)",
      },
    ];

    return (
      <motion.div
        className="flex flex-col min-h-[calc(100vh-160px)]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mb-4">
          <span className="text-section-header">今の状態を記録</span>
          <p className="text-xs mt-1" style={{ color: "rgba(120,125,140,0.45)" }}>
            3つ選ぶだけ — 今の状態で回答が変わります
          </p>
          <p className="text-xs mt-2 italic" style={{ color: "rgba(170,150,90,0.4)" }}>
            {[
              "正解はありません。今の自分をそのまま記録するだけです。",
              "迷うこと自体が、大切な観測データです。",
              "直感を信じてください。考えすぎなくて大丈夫です。",
              "どの答えも、あなたの一面を映しています。",
            ][new Date().getDate() % 4]}
          </p>
        </div>
        <div className="mt-auto space-y-5">
          {sections.map((section, si) => (
          <motion.div
            key={section.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: si * 0.06 }}
          >
            <p
              className="font-mono-sg text-[10px] tracking-[0.15em] uppercase mb-2"
              style={{ color: "rgba(120,125,140,0.5)" }}
            >
              {section.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {section.options.map((opt) => {
                const isSelected = section.selected === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      section.onSelect(opt.value);
                      // Check if this completes all 3
                      const nextEnergy = section.label === "エネルギー" ? opt.value : stateEnergy;
                      const nextEmotion = section.label === "気分" ? opt.value : stateEmotion;
                      const nextSocial = section.label === "環境" ? opt.value : stateSocial;
                      if (nextEnergy && nextEmotion && nextSocial) {
                        setTimeout(() => completeStateCapture(), 500);
                      }
                    }}
                    className="px-3 py-2 rounded-xl transition-all text-sm"
                    style={{
                      background: isSelected ? section.accentBg : "rgba(255,255,255,0.5)",
                      border: isSelected
                        ? `1px solid ${section.accentBorder}`
                        : "1px solid rgba(160,170,200,0.12)",
                      color: isSelected ? "rgba(30,35,55,0.95)" : "rgba(100,105,130,0.6)",
                    }}
                  >
                    <span className="mr-1">{opt.icon}</span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </motion.div>
        ))}

        {/* Auto-advance indicator */}
        {allSelected && (
          <motion.div
            className="text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <p className="text-xs" style={{ color: "rgba(170,150,90,0.5)" }}>
              観測を開始しています...
            </p>
          </motion.div>
        )}
        </div>
      </motion.div>
    );
  }

  // ── Scenario / FollowUp Phase ──
  if (phase === "scenario" || phase === "followup") {
    const current = scenarios[currentIdx];
    if (!current) return null;

    const isFollowUp = phase === "followup" && currentFollowUp;
    const prompt = isFollowUp ? currentFollowUp!.prompt : current.prompt;
    const options = isFollowUp ? currentFollowUp!.options : current.options;
    const theme =
      THEME_LABELS[current.theme as keyof typeof THEME_LABELS] ||
      current.theme;
    const progressPct = ((currentIdx + (isFollowUp ? 0.5 : 0)) / scenarios.length) * 100;
    const isNearEnd = currentIdx >= scenarios.length - 2;
    const optionLabels = ["a", "b", "c", "d"];

    return (
      <div className="flex flex-col min-h-[calc(100vh-160px)] relative">
        {/* Confirm particles */}
        <AnimatePresence>
          {showConfirmParticles && (
            <>
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={`sp-${i}`}
                  className="absolute rounded-full pointer-events-none z-20"
                  style={{
                    width: 4, height: 4,
                    background: "rgba(190,170,110,0.7)",
                    left: "50%", top: "60%",
                  }}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{
                    x: Math.cos((i / 3) * Math.PI * 2) * 50,
                    y: Math.sin((i / 3) * Math.PI * 2) * 40 - 20,
                    opacity: 0, scale: 0.3,
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                />
              ))}
            </>
          )}
        </AnimatePresence>

        {/* Progress header */}
        <div className="flex items-center justify-between">
          <span
            className="text-section-header"
            style={{ color: "rgba(170,150,90,0.5)" }}
          >
            {theme}
          </span>
          <span
            className="font-mono-sg text-xs tabular-nums"
            style={{ color: "rgba(120,125,140,0.35)" }}
          >
            {currentIdx + 1}/{scenarios.length}
          </span>
        </div>

        {/* Progress bar — thicker + glow near end */}
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ background: "rgba(160,170,200,0.1)" }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{
              background: isNearEnd
                ? "linear-gradient(90deg, rgba(170,150,90,0.7), rgba(251,191,36,0.5))"
                : "linear-gradient(90deg, rgba(139,92,246,0.6), rgba(251,191,36,0.4))",
              boxShadow: isNearEnd ? "0 0 8px rgba(251,191,36,0.3)" : "none",
            }}
            initial={{ width: "0%" }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.18 }}
          />
        </div>

        {/* Offline banner */}
        {isOffline && (
          <div className="text-xs p-2 rounded-lg text-center" style={{ background: "rgba(220,180,80,0.1)", color: "rgba(180,140,40,0.7)" }}>
            オフラインです。回答はデバイスに保存されます。
          </div>
        )}

        {/* Screen reader announcement for question changes */}
        <div aria-live="polite" className="sr-only">
          質問 {currentIdx + 1} / {scenarios.length}: {prompt}
        </div>

        {/* Scenario Card — pushed to bottom for thumb reach */}
        <AnimatePresence mode="wait">
          <motion.div
            ref={scenarioCardRef}
            tabIndex={-1}
            key={current.id + (isFollowUp ? "-fu" : "")}
            className="card-instrument mt-auto outline-none"
            initial={{ opacity: 0, x: 30, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -30, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Story context */}
            {!isFollowUp && (
              <p
                className="font-body text-sm leading-relaxed mb-4"
                style={{ color: "rgba(100,105,130,0.65)" }}
              >
                {current.scenario}
              </p>
            )}

            {/* Prompt */}
            <div className="flex items-start gap-2 mb-4">
              <span className="text-lg">🔭</span>
              <h3
                className="font-display text-base font-medium"
                style={{ color: "rgba(30,35,55,0.88)" }}
              >
                {prompt}
              </h3>
            </div>

            {/* Follow-up indicator */}
            {isFollowUp && (
              <motion.div
                className="mb-3 flex items-center gap-2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(139,92,246,0.1)",
                    color: "rgba(139,92,246,0.6)",
                    border: "1px solid rgba(139,92,246,0.15)",
                  }}
                >
                  ↳ 深掘り
                </span>
              </motion.div>
            )}

            {/* Options — with labels, haptic selection, auto-confirm */}
            <div className="space-y-2" role="listbox" aria-label="回答の選択肢">
              {options.map((opt: ScenarioOption, i: number) => {
                const isSelected = selectedOption?.id === opt.id;
                const isFastSelected = isSelected && fastAnswer;
                return (
                  <motion.button
                    key={opt.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => selectOption(opt)}
                    className="w-full text-left p-3.5 rounded-xl transition-all flex items-start gap-3 min-h-[48px]"
                    style={{
                      background: isSelected
                        ? "rgba(139,92,246,0.08)"
                        : "rgba(255,255,255,0.5)",
                      border: isSelected
                        ? "1px solid rgba(139,92,246,0.3)"
                        : "1px solid rgba(160,170,200,0.1)",
                      color: isSelected
                        ? "rgba(30,35,55,0.92)"
                        : "rgba(80,85,105,0.55)",
                      boxShadow: isFastSelected
                        ? "0 0 12px rgba(190,170,110,0.2)"
                        : isSelected
                          ? "0 0 8px rgba(139,92,246,0.08)"
                          : "none",
                    }}
                    whileTap={{ scale: 0.98 }}
                    animate={isSelected ? { scale: [1, 1.015, 1] } : {}}
                    transition={isSelected ? { duration: 0.2 } : {}}
                  >
                    {/* Option label badge */}
                    <span
                      className="font-mono-sg text-[10px] w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{
                        background: isSelected
                          ? "rgba(139,92,246,0.15)"
                          : "rgba(160,170,200,0.08)",
                        color: isSelected
                          ? "rgba(100,70,200,0.7)"
                          : "rgba(120,125,140,0.4)",
                        border: isSelected
                          ? "1px solid rgba(139,92,246,0.2)"
                          : "1px solid rgba(160,170,200,0.1)",
                      }}
                    >
                      {optionLabels[i] ?? i + 1}
                    </span>
                    <span className="text-sm leading-relaxed">{opt.text}</span>
                    {/* Fast answer indicator */}
                    {isFastSelected && (
                      <motion.span
                        className="ml-auto flex-shrink-0 text-xs"
                        style={{ color: "rgba(170,150,90,0.5)" }}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                      >
                        ✦
                      </motion.span>
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* Hesitation reassurance */}
            <AnimatePresence>
              {showHesitationMsg && !selectedOption && (
                <motion.p
                  className="text-xs italic text-center mt-3"
                  style={{ color: "rgba(170,150,90,0.4)" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  ここで迷うのは自然なことです
                </motion.p>
              )}
            </AnimatePresence>

            {/* 明示的確定ボタン（自動確定を廃止） */}
            {selectedOption && (
              <motion.button
                onClick={() => confirmSelection()}
                className="btn-primary-sg sg-cta-pulse w-full py-4 mt-4 text-base"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                次へ →
              </motion.button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // ── Micro-Insight Phase ── (回答間の即時インサイト)
  if (phase === "micro_insight" && currentMicroInsight) {
    return (
      <AnimatePresence>
        <MicroInsightOverlay
          insight={currentMicroInsight}
          onDone={() => {
            setCurrentMicroInsight(null);
            setCurrentIdx((prev) => prev + 1);
            setPhase("scenario");
            questionStartRef.current = Date.now();
          }}
        />
      </AnimatePresence>
    );
  }

  // ── Celebration Phase ── (完了セレブレーション)
  if (phase === "celebration") {
    return (
      <AnimatePresence>
        <CelebrationOverlay
          totalAnswered={answers.length}
          onDone={() => setPhase("done")}
        />
      </AnimatePresence>
    );
  }

  // ── Done Phase ──
  if (phase === "done" && completionInsight) {
    // RV（相手別質問）の完了状態を確認
    const rvCompleted = typeof window !== "undefined" && localStorage.getItem("culcept_sg_rv_completed_v1") === "true";

    return (
      <>
        <PostObservationProgress
          todayAnswers={answers}
          axisScores={axisScores}
          totalObservations={totalObservations}
          typeDef={typeDef}
          capturedState={capturedState}
          completionInsight={completionInsight}
        />

        {/* RV（関係性観測）への導線 — 未完了の場合のみ表示 */}
        {hasData && !rvCompleted && (
          <motion.div
            className="mt-6 rounded-2xl p-5 space-y-3"
            style={{
              background: "rgba(160,150,210,0.06)",
              border: "1px solid rgba(160,150,210,0.15)",
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🔭</span>
              <h4 className="font-display text-sm" style={{ color: "rgba(30,35,55,0.85)" }}>
                関係性の深層観測
              </h4>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(60,65,85,0.6)" }}>
              恋愛・友情・共創・家族・結婚相手 —— 6つの関係の中で現れる「もう一人の自分」を観測します。
            </p>
            <div className="flex flex-wrap gap-1.5">
              {["💕 恋愛", "🤝 友達", "🛠️ 共創", "🏠 家族", "💍 結婚相手"].map((tag) => (
                <span
                  key={tag}
                  className="inline-flex px-2 py-0.5 rounded-full text-[10px]"
                  style={{
                    background: "rgba(160,150,210,0.08)",
                    color: "rgba(100,95,130,0.8)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
            <motion.button
              onClick={() => {
                window.location.href = "/stargazer?rv=start";
              }}
              className="w-full py-3 text-sm rounded-xl font-display tracking-wide"
              style={{
                background: "rgba(160,150,210,0.12)",
                border: "1px solid rgba(160,150,210,0.2)",
                color: "rgba(80,75,110,0.9)",
              }}
              whileTap={{ scale: 0.97 }}
            >
              相手別の観測を始める
            </motion.button>
          </motion.div>
        )}

        {totalObservations >= 10 && (
          <div className="mt-6">
            <DeepProbeUnlockCard
              onStart={() => {
                if (onStartStage2) {
                  onStartStage2();
                } else {
                  setFeedbackToastMsg("深層プローブを準備中...");
                  setFeedbackToastShow(true);
                  setTimeout(() => setFeedbackToastShow(false), 3000);
                }
              }}
              lightMode
            />
          </div>
        )}
        <FeedbackToast
          show={feedbackToastShow}
          feedback={null}
          message={feedbackToastMsg ?? undefined}
          type="success"
          onClose={() => setFeedbackToastShow(false)}
        />
      </>
    );
  }

  return null;
}
