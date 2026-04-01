"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { axisLabel } from "@/lib/stargazer/axisLabels";
import type { TypeDefLike } from "@/lib/stargazer/dailyInsightEngine";
import type {
  DailyGreeting,
  DailyWhisper,
  ObservationCompletionInsight,
} from "@/lib/stargazer/dailyInsightEngine";
import { generateCompletionInsight } from "@/lib/stargazer/dailyInsightEngine";
import { getTimeOfDay, type TimeOfDay } from "@/lib/shared/timeOfDay";
import type {
  ObservationState,
  EnergyLevel,
  EmotionalTone,
  SocialContext,
} from "@/lib/stargazer/fluctuationEngine";
import {
  ENERGY_OPTIONS,
  EMOTION_OPTIONS,
  SOCIAL_OPTIONS,
} from "@/lib/stargazer/fluctuationEngine";
import type {
  DailyObservationPlan,
  DeltaCheck,
} from "@/lib/stargazer/dailyOrchestrator";
import type { QuestionVariant } from "@/lib/stargazer/questionVariants";
import type { ShadowPlayQuestion } from "@/lib/stargazer/shadowPlayQuestions";
import {
  captureAnswerFootprints,
  captureSessionFootprints,
  recordFootprint,
} from "@/lib/stargazer/footprintCollector";
import {
  generateMetaObservationQuestions,
  interpretMetaObservation,
  type MetaObservationInsight,
} from "@/lib/stargazer/innovativeMechanisms";
import PostObservationProgress from "../_components/PostObservationProgress";
import StreakDisplay from "../_components/StreakDisplay";
import {
  savePauseState,
  loadPauseState,
  clearPauseState,
  markDailyDone,
  isDailyDone,
  cleanupOldDoneFlags,
  type PausedSession,
} from "@/lib/stargazer/sessionPause";
import {
  recordDailyObservation,
  type StreakState,
} from "@/lib/stargazer/streakIntelligence";
import { recordQuestionAnswer } from "@/lib/stargazer/questionIntelligence";
import {
  SignalCollector,
  type QuestionInsight,
} from "@/lib/stargazer/behavioralSignalCollector";
import BehavioralInsightPopup from "../_components/BehavioralInsightPopup";
import MicroInsightOverlay from "./_observation/MicroInsightOverlay";
import CelebrationOverlay from "./_observation/CelebrationOverlay";
import { getJustUnlocked, markUnlockNotified } from "@/lib/stargazer/featureUnlock";
import { generateMicroInsight, type MicroInsight } from "@/lib/architecture/edgeMicroInsights";
import IntroPhase from "./_observation/IntroPhase";
import DepthTransitionReveal from "./_observation/DepthTransitionReveal";
import QuestionPhase from "./_observation/QuestionPhase";
import type { PlanStep as QuestionPlanStep, StepOption as QuestionStepOption } from "./_observation/QuestionPhase";
import CompletionPhase from "./_observation/CompletionPhase";
import MirrorMomentOverlay from "../_components/MirrorMomentOverlay";
import { runContradictionDetection, type ContradictionResult } from "@/lib/stargazer/contradictionDetector";
import { axisLabel as getAxisLabelText } from "@/lib/stargazer/axisLabels";
import { computeObservationStreak } from "@/lib/stargazer/observationProgressUtils";
import { updateEngagementField } from "@/lib/stargazer/engagementScore";
import { detectPhaseTransition, DEPTH_PHASE_COLORS, type DepthPhase } from "@/lib/stargazer/depthPhaseController";

/** API /api/stargazer/adaptive-q2 のレスポンス型 (server-only のため再定義) */
type AdaptiveQuestion = {
  prompt: string;
  options: { label: string; score: number }[];
  targetAxisId: TraitAxisKey;
  strategy: string;
  reasoning?: string;
  questionKey?: string;
  isFallback: boolean;
  qualityScore: number;
};

interface ServerDailyObservationTabProps {
  axisScores: Partial<Record<TraitAxisKey, number>>;
  totalObservations: number;
  typeDef: TypeDefLike | null;
  greeting: DailyGreeting | null;
  whisper: DailyWhisper | null;
  onDataRefresh?: () => void;
}

type Phase =
  | "boot"
  | "intro"
  | "paused"
  | "state_capture"
  | "loading_plan"
  | "question"
  | "adaptive_loading"
  | "micro_insight"
  | "saving"
  | "meta_observation"
  | "celebration"
  | "done"
  | "error";

type VisualAnswer = {
  questionId: string;
  optionId: string;
  responseTimeMs: number;
  axisId?: TraitAxisKey;
};

type ApiAnswer = {
  variantId: string;
  score: number;
  responseTimeMs: number;
  optionId: string;
};

type SavedObservation = {
  date: string;
  answers: VisualAnswer[];
  capturedState: ObservationState | null;
  completedAt: string;
};

type StepOption = {
  id: string;
  label: string;
  score?: number;
  delta?: number;
};

type PlanStep =
  | {
      kind: "variant";
      key: string;
      label: string;
      prompt: string;
      note: string;
      options: StepOption[];
      variantId: string;
      axisId: TraitAxisKey;
      previousScore?: number;
      previousDate?: string;
      isReobservation?: boolean;
      uxHint?: string;
    }
  | {
      kind: "shadow_play";
      key: string;
      label: string;
      prompt: string;
      note: string;
      scenario: string;
      options: StepOption[];
      shadowPlayId: string;
      primaryAxis: TraitAxisKey;
      category: string;
    }
  | {
      kind: "delta";
      key: string;
      label: string;
      prompt: string;
      note: string;
      options: StepOption[];
      axisId: TraitAxisKey;
      previousScore: number;
      previousDate: string;
    }
  | {
      kind: "expansion";
      key: string;
      label: string;
      prompt: string;
      note: string;
      options: StepOption[];
      expansionQuestionId: string;
      axisId: TraitAxisKey;
    };

const TIME_GREETINGS: Record<TimeOfDay, { emoji: string; text: string }> = {
  morning: {
    emoji: "🌅",
    text: "朝の輪郭は繊細です。今の調子に合った問いから始めます。",
  },
  afternoon: {
    emoji: "☀️",
    text: "日中の動きが残る時間帯です。今日どこで揺れたかを拾っていきます。",
  },
  night: {
    emoji: "🌙",
    text: "一日の余韻が見えやすい時間です。今の自分に合う角度から観測します。",
  },
};

const SG_OBSERVE_KEY_PREFIX = "culcept_sg_observe_live_v1_";

function todayStr() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function loadObservation(date: string): SavedObservation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${SG_OBSERVE_KEY_PREFIX}${date}`);
    return raw ? (JSON.parse(raw) as SavedObservation) : null;
  } catch {
    return null;
  }
}

function cleanupOldObservations() {
  if (typeof window === "undefined") return;
  const today = todayStr();
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(SG_OBSERVE_KEY_PREFIX) && !key.endsWith(today)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    window.localStorage.removeItem(key);
  }
}

function saveObservation(observation: SavedObservation) {
  if (typeof window === "undefined") return;
  cleanupOldObservations();
  const key = `${SG_OBSERVE_KEY_PREFIX}${observation.date}`;
  const value = JSON.stringify(observation);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Quota exceeded — aggressively free space
    purgeOldStargazerStorage();
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Still failing — silently skip (server has the data)
      console.warn("[Stargazer] localStorage quota exceeded, skipping local save");
    }
  }
}

/** Remove non-essential stargazer localStorage to free quota */
function purgeOldStargazerStorage() {
  if (typeof window === "undefined") return;
  const purgeable = [
    "culcept_sg_footprints_v1",
    "culcept_sg_answer_interactions_v1",
    "culcept_sg_elimination_events_v1",
    "culcept_sg_meta_observations_v1",
    "culcept_sg_shadow_play_recent_v1",
    "culcept_sg_onboarding_result_v1",
    "culcept_sg_daily_energy_v1",
  ];
  for (const k of purgeable) {
    try { window.localStorage.removeItem(k); } catch { /* ignore */ }
  }
  // Also remove old observe keys (both v1 prefixes)
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && (k.startsWith("culcept_sg_observe_v1_") || k.startsWith("culcept_sg_observe_live_v1_"))) {
      keysToRemove.push(k);
    }
  }
  for (const k of keysToRemove) {
    try { window.localStorage.removeItem(k); } catch { /* ignore */ }
  }
}

function buildPlanSteps(plan: DailyObservationPlan): PlanStep[] {
  const steps: PlanStep[] = [];

  const pushVariant = (
    variant: QuestionVariant,
    label: string,
    note: string,
    extra?: {
      previousScore?: number;
      previousDate?: string;
      isReobservation?: boolean;
      uxHint?: string;
    },
  ) => {
    steps.push({
      kind: "variant",
      key: `${label}-${variant.id}`,
      label,
      prompt: variant.prompt,
      note,
      options: variant.options.map((option) => ({
        id: option.id,
        label: option.label,
        score: option.score,
      })),
      variantId: variant.id,
      axisId: variant.axisId,
      previousScore: extra?.previousScore,
      previousDate: extra?.previousDate,
      isReobservation: extra?.isReobservation,
      uxHint: extra?.uxHint,
    });
  };

  for (const variant of plan.stateQuestions) {
    pushVariant(
      variant,
      "状態観測",
      "今の状態に最も合う問いを選んでいます。",
    );
  }

  // Context questions (配列対応)
  const contextQs = plan.contextQuestions ?? (plan.contextQuestion ? [plan.contextQuestion] : []);
  for (const cq of contextQs) {
    pushVariant(
      cq,
      "文脈観測",
      "どの相手や場面で揺れるかを見ます。",
    );
  }

  // Deep questions (配列対応)
  const deepQs = plan.deepQuestions ?? (plan.deepQuestion ? [plan.deepQuestion] : []);
  for (const dq of deepQs) {
    pushVariant(
      dq,
      "深層観測",
      (dq as QuestionVariant & { uxHint?: string }).uxHint || "今日はここを少し深く掘るのが適切です。",
      { uxHint: (dq as QuestionVariant & { uxHint?: string }).uxHint },
    );
  }

  // 影絵質問 (Shadow Play): 投影法による深層観測
  if (plan.shadowPlayQuestion) {
    const spq = plan.shadowPlayQuestion;
    steps.push({
      kind: "shadow_play",
      key: `shadow-${spq.id}`,
      label: "影絵観測",
      prompt: spq.prompt,
      note: spq.scenario || "他者への反応に、あなた自身の価値基準が映ります。",
      scenario: spq.scenario,
      options: spq.options.map((o) => ({
        id: o.id,
        label: o.label,
        score: o.score,
      })),
      shadowPlayId: spq.id,
      primaryAxis: spq.primaryAxis,
      category: spq.category,
    });
  }

  if (plan.reobservation) {
    pushVariant(
      plan.reobservation.variant,
      "再観測",
      "以前の答えと比べて、今日は同じかを見ます。",
      {
        previousScore: plan.reobservation.previousScore,
        previousDate: plan.reobservation.previousDate,
        isReobservation: true,
      },
    );
  }

  // Delta checks (配列対応)
  const deltaChecks = plan.deltaChecks ?? (plan.deltaCheck ? [plan.deltaCheck] : []);
  for (const dc of deltaChecks) {
    steps.push({
      kind: "delta",
      key: `delta-${dc.axisId}`,
      label: "差分確認",
      prompt: dc.prompt,
      note: "前回からの変化を本人感覚で記録します。",
      options: dc.options.map((option) => ({
        id: option.id,
        label: option.label,
        delta: option.delta,
      })),
      axisId: dc.axisId,
      previousScore: dc.previousScore,
      previousDate: dc.previousDate,
    });
  }

  // P4 Phase D: 拡張軸質問（1日最大1問、セッション末尾に配置）
  if (plan.expansionQuestion) {
    const eq = plan.expansionQuestion;
    steps.push({
      kind: "expansion",
      key: `expansion-${eq.id}`,
      label: "拡張観測",
      prompt: eq.questionText,
      note: "あなたの新しい側面を探る質問です。直感で答えてください。",
      options: [
        { id: `${eq.id}_1`, label: eq.leftLabel, score: 1 },
        { id: `${eq.id}_2`, label: `やや ${eq.leftLabel.slice(0, 4)}…`, score: 2 },
        { id: `${eq.id}_3`, label: "どちらとも言えない", score: 3 },
        { id: `${eq.id}_4`, label: `やや ${eq.rightLabel.slice(0, 4)}…`, score: 4 },
        { id: `${eq.id}_5`, label: eq.rightLabel, score: 5 },
      ],
      expansionQuestionId: eq.id,
      axisId: eq.axisId,
    });
  }

  return steps;
}

function buildCompletionInsight(
  saved: SavedObservation | null,
  axisScores: Partial<Record<TraitAxisKey, number>>,
  totalObservations: number,
  typeDef: TypeDefLike | null,
): ObservationCompletionInsight | null {
  if (!saved?.completedAt || saved.answers.length === 0) {
    return null;
  }

  return generateCompletionInsight(
    saved.answers,
    axisScores,
    totalObservations,
    typeDef,
  );
}

export default function ServerDailyObservationTab({
  axisScores,
  totalObservations,
  typeDef,
  greeting,
  whisper,
  onDataRefresh,
}: ServerDailyObservationTabProps) {
  const [phase, setPhase] = useState<Phase>("boot");
  // CompletionPhase は今日のセッション中に1回だけ表示。再訪時はスキップ
  const [justCompleted, setJustCompleted] = useState(false);
  // 深度フェーズ遷移検知
  const [depthTransition, setDepthTransition] = useState<import("@/lib/stargazer/depthPhaseController").PhaseTransition | null>(null);
  // ミラーモーメント: 矛盾検出データ
  const [mirrorContradiction, setMirrorContradiction] = useState<{
    axisLabel: string; sideA: string; sideB: string; narrative: string;
    type?: "temporal" | "cross_axis" | "self_vs_behavior" | "stated_vs_chosen";
  } | null>(null);
  // 深度カラー（question phaseの左端ライン）
  const depthPhaseColor = useMemo(() => {
    // 簡易: 観測数からフェーズを推定
    const obs = totalObservations;
    if (obs >= 60) return DEPTH_PHASE_COLORS.deep;
    if (obs >= 20) return DEPTH_PHASE_COLORS.maturity;
    if (obs >= 5) return DEPTH_PHASE_COLORS.awakening;
    return DEPTH_PHASE_COLORS.surface;
  }, [totalObservations]);
  const [currentMicroInsight, setCurrentMicroInsight] = useState<MicroInsight | null>(null);
  const [todayObservation, setTodayObservation] = useState<SavedObservation | null>(
    null,
  );
  const [observationDate, setObservationDate] = useState(todayStr());
  const [capturedState, setCapturedState] = useState<ObservationState | null>(null);
  const [stateEnergy, setStateEnergy] = useState<EnergyLevel | null>(null);
  const [stateEmotion, setStateEmotion] = useState<EmotionalTone | null>(null);
  const [stateSocial, setStateSocial] = useState<SocialContext | null>(null);
  const [stateCaptureStep, setStateCaptureStep] = useState<0 | 1 | 2>(0);
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<StepOption | null>(null);
  const [answers, setAnswers] = useState<VisualAnswer[]>([]);
  const [apiAnswers, setApiAnswers] = useState<ApiAnswer[]>([]);
  const [deltaAnswer, setDeltaAnswer] = useState<DeltaCheck | null>(null);
  const [selectedDelta, setSelectedDelta] = useState<number | null>(null);
  const [reobservationAnswer, setReobservationAnswer] = useState<{
    variantId: string;
    score: number;
    previousScore: number;
    previousDate: string;
    responseTimeMs: number;
  } | null>(null);
  const [shadowPlayAnswers, setShadowPlayAnswers] = useState<{
    shadowPlayId: string;
    optionId: string;
    primaryAxis: TraitAxisKey;
    score: number;
    responseTimeMs: number;
  }[]>([]);
  // P4 Phase D: 拡張軸質問の回答（1日最大1問）
  const [expansionAnswer, setExpansionAnswer] = useState<{
    questionId: string;
    value: number;
    responseTimeMs: number;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [streakLevelUp, setStreakLevelUp] = useState<StreakState | null>(null);

  // ── Adaptive Q2: Q1回答後の適応的深掘り質問 ──
  /** セッション内の累積応答時間(平均計算用) */
  const adaptiveResponseTimesRef = useRef<number[]>([]);
  /** 適応的Q2を挿入済みかどうか (セッションで最初のvariant回答後1回だけ) */
  const adaptiveQ2InsertedRef = useRef(false);

  // ── Meta-Observation: 観測結果への反応を収集 ──
  const [metaQuestions, setMetaQuestions] = useState<ReturnType<typeof generateMetaObservationQuestions>>([]);
  const [metaCurrentIdx, setMetaCurrentIdx] = useState(0);
  const [metaSelectedReaction, setMetaSelectedReaction] = useState<string | null>(null);
  const [metaInsightsCollected, setMetaInsightsCollected] = useState<MetaObservationInsight[]>([]);

  // ── Behavioral Signal Collector: マイクロ行動捕捉 ──
  const signalCollectorRef = useRef<SignalCollector | null>(null);
  const [currentInsight, setCurrentInsight] = useState<QuestionInsight | null>(null);
  const [showInsight, setShowInsight] = useState(false);

  // Initialize SignalCollector on mount
  useEffect(() => {
    signalCollectorRef.current = new SignalCollector();
    return () => {
      signalCollectorRef.current?.destroy();
    };
  }, []);

  // ── Pause / Resume ──
  const [pausedSession, setPausedSession] = useState<PausedSession | null>(null);
  const [showPauseBtn, setShowPauseBtn] = useState(false);
  const pauseBtnTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Option Interaction Tracking: 幻肢選択 + 判断考古学用 ──
  const [optionClickLog, setOptionClickLog] = useState<
    { optionId: string; timestamp: number }[]
  >([]);
  const prevSelectedRef = useRef<string | null>(null);

  // ── Footprint: セッション開始時に行動信号を記録 ──
  const sessionStartRecorded = useRef(false);
  useEffect(() => {
    if (sessionStartRecorded.current) return;
    sessionStartRecorded.current = true;
    cleanupOldDoneFlags();
    const signals = captureSessionFootprints({
      startTime: new Date().toISOString(),
    });
    for (const signal of signals) {
      recordFootprint(signal);
    }
  }, []);

  const questionStartRef = useRef(0);
  const timeOfDay = useMemo(() => getTimeOfDay(), []);
  const completionInsight = useMemo(
    () =>
      buildCompletionInsight(
        todayObservation,
        axisScores,
        totalObservations,
        typeDef,
      ),
    [todayObservation, axisScores, totalObservations, typeDef],
  );
  const observedAxisCount = useMemo(
    () =>
      Object.values(axisScores).filter(
        (value) => typeof value === "number" && Math.abs(value) > 0.01,
      ).length,
    [axisScores],
  );
  const timeGreeting = TIME_GREETINGS[timeOfDay];
  const formattedObservationDate = useMemo(() => {
    const date = new Date(`${observationDate}T12:00:00`);
    return new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).format(date);
  }, [observationDate]);
  const currentStep = phase === "question" ? steps[currentIdx] : null;

  // Show "あとで答える" button after 2s delay per question
  useEffect(() => {
    if (phase !== "question") {
      setShowPauseBtn(false);
      return;
    }
    setShowPauseBtn(false);
    pauseBtnTimerRef.current = setTimeout(() => setShowPauseBtn(true), 2000);
    return () => {
      if (pauseBtnTimerRef.current) clearTimeout(pauseBtnTimerRef.current);
    };
  }, [phase, currentIdx]);

  const syncObservationState = useCallback(async (nextDate = todayStr()) => {
    cleanupOldObservations();
    const localSaved = loadObservation(nextDate);

    try {
      const res = await fetch(
        `/api/stargazer/daily-observation?date=${encodeURIComponent(nextDate)}&checkOnly=1`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setObservationDate(nextDate);

      if (data.alreadyCompleted && data.completedObservation) {
        const completed = data.completedObservation as SavedObservation;
        setTodayObservation(completed);
        setCapturedState(completed.capturedState ?? null);
        setAnswers(completed.answers ?? []);
        setApiAnswers([]);
        setDeltaAnswer(null);
        setSelectedDelta(null);
        setReobservationAnswer(null);
        saveObservation(completed);
        setPhase("done");
        return;
      }

      setTodayObservation(null);
      setCapturedState(null);
      setAnswers([]);
      setApiAnswers([]);
      setDeltaAnswer(null);
      setSelectedDelta(null);
      setReobservationAnswer(null);
      setSteps([]);
      setCurrentIdx(0);
      setSelectedOption(null);
      setStateEnergy(null);
      setStateEmotion(null);
      setStateSocial(null);
      setStateCaptureStep(0);
      setSaveError(null);

      // Check for paused session in localStorage
      const paused = loadPauseState();
      if (paused) {
        setPausedSession(paused);
        setPhase("paused");
      } else {
        setPhase("intro");
      }
    } catch {
      setObservationDate(nextDate);
      if (localSaved?.completedAt) {
        setTodayObservation(localSaved);
        setCapturedState(localSaved.capturedState ?? null);
        setAnswers(localSaved.answers ?? []);
        setPhase("done");
        return;
      }
      // Check for paused session in localStorage
      const paused = loadPauseState();
      if (paused) {
        setPausedSession(paused);
        setPhase("paused");
      } else {
        setPhase("intro");
      }
    }
  }, []);

  // Initial sync — mount only
  useEffect(() => {
    void syncObservationState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus/visibility handler — re-sync only when idle
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const observationDateRef = useRef(observationDate);
  observationDateRef.current = observationDate;

  useEffect(() => {
    const handleFocus = () => {
      if (document.visibilityState === "hidden") return;
      const currentPhase = phaseRef.current;
      if (currentPhase !== "boot" && currentPhase !== "intro" && currentPhase !== "paused" && currentPhase !== "done") return;
      const nextDate = todayStr();
      if (nextDate !== observationDateRef.current) {
        void syncObservationState(nextDate);
        return;
      }
      void syncObservationState(nextDate);
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [syncObservationState]);

  async function loadPlan(state: ObservationState) {
    setSaveError(null);
    setPhase("loading_plan");

    const params = new URLSearchParams({
      date: observationDate,
      energy: state.energy,
      emotion: state.emotion,
      social: state.social,
      timeOfDay: state.timeOfDay,
      timestamp: state.timestamp,
    });

    try {
      const res = await fetch(`/api/stargazer/daily-observation?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.alreadyCompleted && data.completedObservation) {
        const completed = data.completedObservation as SavedObservation;
        setTodayObservation(completed);
        setCapturedState(completed.capturedState ?? null);
        setAnswers(completed.answers ?? []);
        saveObservation(completed);
        setPhase("done");
        return;
      }

      const nextPlan = data.plan as DailyObservationPlan | undefined;
      const nextSteps = nextPlan ? buildPlanSteps(nextPlan) : [];
      if (!nextPlan || nextSteps.length === 0) {
        throw new Error("今日の観測プランを作れませんでした");
      }

      setSteps(nextSteps);
      setCurrentIdx(0);
      setSelectedOption(null);
      setApiAnswers([]);
      setDeltaAnswer(null);
      setSelectedDelta(null);
      setReobservationAnswer(null);
      setExpansionAnswer(null);
      setAnswers([]);
      adaptiveQ2InsertedRef.current = false;
      adaptiveResponseTimesRef.current = [];
      questionStartRef.current = Date.now();
      // Start behavioral signal tracking for first question
      if (nextSteps.length > 0) {
        signalCollectorRef.current?.startQuestion(nextSteps[0].key);
      }
      // 深度フェーズ遷移検知
      const currentDepth: DepthPhase =
        totalObservations >= 60 ? "deep" :
        totalObservations >= 20 ? "maturity" :
        totalObservations >= 5 ? "awakening" : "surface";
      const transition = detectPhaseTransition(currentDepth);
      if (transition) {
        setDepthTransition(transition);
        return; // DepthTransitionReveal表示後にquestionへ
      }
      setPhase("question");
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "今日の質問を読み込めませんでした。",
      );
      setPhase("error");
    }
  }

  function startObservation() {
    setSaveError(null);
    setPhase("state_capture");
    setStateCaptureStep(0);
  }

  /** 一時中断: 回答途中の状態をlocalStorageに保存 */
  async function handlePause() {
    // Save partial answers to server
    if (capturedState && apiAnswers.length > 0) {
      try {
        await fetch("/api/stargazer/daily-observation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            observationDate,
            answers: apiAnswers,
            deltaAnswer: deltaAnswer
              ? {
                  axisId: deltaAnswer.axisId,
                  delta: selectedDelta ?? 0,
                  previousScore: deltaAnswer.previousScore,
                }
              : null,
            observationState: capturedState,
            reobservationAnswer,
            shadowPlayAnswers: shadowPlayAnswers.length > 0 ? shadowPlayAnswers : undefined,
            isPartial: true,
          }),
        });
      } catch { /* non-critical */ }
    }

    // Save to localStorage for resume
    const session: PausedSession = {
      date: observationDate,
      answeredQuestionIds: answers.map((a) => a.questionId),
      answers: apiAnswers,
      deltaAnswers: [], // delta answers are tracked separately
      pausedAt: new Date().toISOString(),
      planSnapshot: null as unknown as PausedSession["planSnapshot"],
      nextQuestionIndex: currentIdx,
    };
    savePauseState(session);
    setPausedSession(session);
    setPhase("paused");
  }

  /** 中断した観測を再開 */
  function handleResume() {
    if (!pausedSession) return;
    clearPauseState();
    setPausedSession(null);
    // Re-start from state capture (plan will be regenerated)
    setPhase("state_capture");
    setStateCaptureStep(0);
  }

  async function completeStateCapture() {
    if (!stateEnergy || !stateEmotion || !stateSocial) return;
    const nextState: ObservationState = {
      energy: stateEnergy,
      emotion: stateEmotion,
      social: stateSocial,
      timeOfDay,
      timestamp: new Date().toISOString(),
    };
    setCapturedState(nextState);
    await loadPlan(nextState);
  }

  async function submitObservation(
    finalVisualAnswers: VisualAnswer[],
    finalApiAnswers: ApiAnswer[],
    finalDeltaAnswer: DeltaCheck | null,
    finalDeltaValue: number | null,
    finalReobservationAnswer: typeof reobservationAnswer,
    finalShadowPlayAnswers?: typeof shadowPlayAnswers,
    finalExpansionAnswer?: typeof expansionAnswer,
  ) {
    if (!capturedState) return;

    setPhase("saving");
    setSaveError(null);
    setShowInsight(false);

    // ── Behavioral Signal: セッション保存 ──
    signalCollectorRef.current?.saveSession();

    // 影絵質問の回答IDをlocalStorageに記録（次回以降の重複防止）
    const spAnswers = finalShadowPlayAnswers ?? shadowPlayAnswers;
    if (spAnswers.length > 0) {
      try {
        const key = "culcept_sg_shadow_play_recent_v1";
        const existing: string[] = JSON.parse(localStorage.getItem(key) ?? "[]");
        const newIds = spAnswers.map((a) => a.shadowPlayId);
        const merged = [...new Set([...existing, ...newIds])].slice(-20); // 直近20個まで
        localStorage.setItem(key, JSON.stringify(merged));
      } catch { /* non-critical */ }
    }

    try {
      const res = await fetch("/api/stargazer/daily-observation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          observationDate,
          answers: finalApiAnswers,
          deltaAnswer: finalDeltaAnswer
            ? {
                axisId: finalDeltaAnswer.axisId,
                delta: finalDeltaValue ?? 0,
                previousScore: finalDeltaAnswer.previousScore,
              }
            : null,
          observationState: capturedState,
          reobservationAnswer: finalReobservationAnswer,
          shadowPlayAnswers: spAnswers.length > 0 ? spAnswers : undefined,
          expansionAnswer: (finalExpansionAnswer ?? expansionAnswer) || undefined,
        }),
      });

      const resData = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(resData?.error || `HTTP ${res.status}`);
      }

      // ── ストリーク知性: 観測品質を記録 ──
      try {
        if (resData?.streakData) {
          const streakState = recordDailyObservation(resData.streakData);
          if (streakState.pendingLevelUp) {
            setStreakLevelUp(streakState);
          }
        }
      } catch {
        // ストリーク記録は非クリティカル
      }

      const completed: SavedObservation = {
        date: observationDate,
        answers: finalVisualAnswers,
        capturedState,
        completedAt: new Date().toISOString(),
      };

      saveObservation(completed);
      setTodayObservation(completed);
      setAnswers(finalVisualAnswers);
      setApiAnswers(finalApiAnswers);
      setReobservationAnswer(finalReobservationAnswer);
      markDailyDone();
      clearPauseState();

      // ── 横断システム同期: 他システムからの逆方向フィードバック適用 ──
      fetch("/api/stargazer/cross-system-sync", {
        method: "POST",
        credentials: "include",
      }).catch(() => { /* non-critical */ });

      // ── ストレス減衰曲線用: 日次エネルギー状態を記録 ──
      try {
        const energyKey = "culcept_sg_daily_energy_v1";
        const rawEnergy = localStorage.getItem(energyKey);
        const energyHistory: {
          date: string;
          energy: string;
          emotion: string;
          social: string;
        }[] = rawEnergy ? JSON.parse(rawEnergy) : [];
        // 同日のエントリがなければ追加
        if (!energyHistory.some((e) => e.date === observationDate) && capturedState) {
          energyHistory.push({
            date: observationDate,
            energy: capturedState.energy,
            emotion: capturedState.emotion,
            social: capturedState.social,
          });
          // 直近90日分を保持
          localStorage.setItem(
            energyKey,
            JSON.stringify(energyHistory.slice(-90)),
          );
        }
      } catch { /* non-critical */ }

      // XP: 観測完了 +50pt
      updateEngagementField("observationCompleted", true);

      // ── Meta-Observation トリガー ──
      // 3回目以降の観測かつ、十分な軸スコアがある場合に発動
      const shouldTriggerMeta = totalObservations >= 3 && Object.keys(axisScores).length >= 5;
      if (shouldTriggerMeta) {
        const questions = generateMetaObservationQuestions(axisScores);
        if (questions.length > 0) {
          // 最大2問に限定（ユーザー負担を軽減）
          setMetaQuestions(questions.slice(0, 2));
          setMetaCurrentIdx(0);
          setMetaSelectedReaction(null);
          setMetaInsightsCollected([]);
          setPhase("meta_observation");
          onDataRefresh?.();
          return;
        }
      }

      // 矛盾検出 → severity > 0.5 ならMirrorMoment発火
      try {
        const scoreEntries = Object.entries(axisScores)
          .filter(([, v]) => typeof v === "number")
          .map(([axisId, score]) => ({ axisId, score: score!, date: todayStr() }));
        const contradictions = runContradictionDetection({
          axisScores: Object.fromEntries(
            Object.entries(axisScores).filter(([, v]) => typeof v === "number")
          ) as Record<string, number>,
          scoreHistory: scoreEntries,
          behaviorSignals: [],
          scenarioResponses: [],
        });
        const top = contradictions.find((c) => c.severity >= 0.5);
        if (top) {
          const labelA = getAxisLabelText(top.axisA as any);
          const labelB = top.axisB !== top.axisA ? getAxisLabelText(top.axisB as any) : "";
          setMirrorContradiction({
            axisLabel: labelA + (labelB ? ` × ${labelB}` : ""),
            sideA: top.description.split("。")[0] || top.description,
            sideB: top.insightPotential,
            narrative: top.description,
            type: top.type as any,
          });
        }
      } catch { /* non-critical */ }

      setPhase("celebration");
      onDataRefresh?.();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "観測結果の保存に失敗しました。",
      );
      setPhase("error");
    }
  }

  // ── Adaptive Q2: Q1回答後に適応的Q2を取得し、次のステップとして挿入する ──
  async function fetchAndInsertAdaptiveQ2(
    q1Step: PlanStep & { kind: "variant" },
    chosenOption: StepOption,
    elapsed: number,
    afterIdx: number,
  ): Promise<boolean> {
    const avgResponseTime =
      adaptiveResponseTimesRef.current.length > 0
        ? adaptiveResponseTimesRef.current.reduce((a, b) => a + b, 0) /
          adaptiveResponseTimesRef.current.length
        : elapsed;

    // 回答変更検出
    const uniqueClicks = optionClickLog
      .map((c) => c.optionId)
      .filter((id, i, arr) => i === 0 || arr[i - 1] !== id);
    const answerChanged = uniqueClicks.length > 1;
    const previousAnswerLabel = answerChanged
      ? q1Step.options.find((o) => o.id === uniqueClicks[0])?.label
      : undefined;

    try {
      setPhase("adaptive_loading");

      const res = await fetch("/api/stargazer/adaptive-q2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          questionText: q1Step.prompt,
          axisId: q1Step.axisId,
          selectedOptionLabel: chosenOption.label,
          score: chosenOption.score ?? 0,
          options: q1Step.options.map((o) => ({
            label: o.label,
            score: o.score ?? 0,
          })),
          responseTimeMs: elapsed,
          averageResponseTimeMs: avgResponseTime,
          answerChanged,
          previousAnswerLabel,
          sessionDepth: afterIdx,
        }),
      });

      if (!res.ok) {
        console.warn("[adaptive-q2] API returned", res.status);
        return false;
      }

      const data = await res.json();
      if (!data.ok || !data.question) {
        console.warn("[adaptive-q2] Invalid response");
        return false;
      }

      const aq = data.question as AdaptiveQuestion;

      // 適応的Q2をPlanStepに変換して挿入
      const adaptiveStep: PlanStep = {
        kind: "variant",
        key: `adaptive-q2-${Date.now()}`,
        label: "深掘り観測",
        prompt: aq.prompt,
        note: aq.isFallback
          ? "Q1の回答を踏まえた追加観測です。"
          : "あなたのQ1回答から導かれた、適応的な深掘り質問です。",
        options: aq.options.map((o, i) => ({
          id: `aq2_opt_${i}`,
          label: o.label,
          score: o.score,
        })),
        variantId: aq.questionKey ?? `adaptive_q2_${aq.targetAxisId}_${Date.now()}`,
        axisId: aq.targetAxisId,
        uxHint: aq.isFallback
          ? undefined
          : "Q1の回答パターンに基づいて生成された質問です。",
      };

      // steps配列にafterId+1の位置に挿入
      setSteps((prev) => {
        const next = [...prev];
        next.splice(afterIdx + 1, 0, adaptiveStep);
        return next;
      });

      adaptiveQ2InsertedRef.current = true;
      return true;
    } catch (err) {
      console.warn("[adaptive-q2] Fetch failed:", err);
      return false;
    }
  }

  async function confirmSelection() {
    if (!currentStep || !selectedOption) return;

    const elapsed = Date.now() - questionStartRef.current;
    const didChange = optionClickLog.length > 1;

    // ── Behavioral Signal: 回答を記録しインサイト表示 ──
    if (signalCollectorRef.current) {
      const signal = signalCollectorRef.current.recordAnswer(
        currentStep.key,
        selectedOption.label,
      );
      const insight = signalCollectorRef.current.getQuestionInsight(signal);
      if (insight.hesitationMessage || insight.hoverInsight || insight.comparisonToAverage || insight.focusLostInsight) {
        setCurrentInsight(insight);
        setShowInsight(true);
      }
    }

    // ── 応答時間を記録(適応Q2の平均計算用) ──
    adaptiveResponseTimesRef.current.push(elapsed);

    // ── Question Intelligence: 質問の有効性を記録 ──
    try {
      const stepAxisId = currentStep.kind === "shadow_play"
        ? currentStep.primaryAxis
        : currentStep.kind === "variant" || currentStep.kind === "expansion"
        ? currentStep.axisId
        : undefined;
      if (stepAxisId) {
        const prevScore = axisScores[stepAxisId] ?? null;
        const newScore = selectedOption.score != null
          ? (selectedOption.score + (prevScore ?? 0)) / 2
          : null;
        recordQuestionAnswer({
          questionId: currentStep.key,
          axis: stepAxisId,
          score: selectedOption.score ?? selectedOption.delta ?? 0,
          responseTimeMs: elapsed,
          previousAxisScore: prevScore,
          newAxisScore: newScore,
          answerChanged: didChange,
          contradictionDetected:
            prevScore != null &&
            selectedOption.score != null &&
            Math.abs((selectedOption.score) - prevScore) > 0.8,
        });
      }
    } catch { /* non-critical */ }

    // ── Footprint: 回答行動を記録 ──
    const footprintSignals = captureAnswerFootprints({
      responseTimeMs: elapsed,
      didChange,
      didSkip: false,
      questionId: currentStep.key,
    });
    for (const signal of footprintSignals) {
      recordFootprint(signal);
    }

    // ── 幻肢選択 + 判断考古学データの記録 ──
    try {
      const stepAxisId = currentStep.kind === "shadow_play"
        ? currentStep.primaryAxis
        : (currentStep.kind === "variant" || currentStep.kind === "expansion") ? currentStep.axisId : undefined;

      // Phantom Choice: 選択肢変更の記録
      if (optionClickLog.length > 0) {
        const interactionKey = "culcept_sg_answer_interactions_v1";
        const rawInteractions = localStorage.getItem(interactionKey);
        const interactions: {
          questionId: string;
          chosenOptionId: string;
          responseTimeMs: number;
          optionChanges?: string[];
        }[] = rawInteractions ? JSON.parse(rawInteractions) : [];
        const uniqueClicks = optionClickLog
          .map((c) => c.optionId)
          .filter((id, i, arr) => i === 0 || arr[i - 1] !== id);
        interactions.push({
          questionId: currentStep.key,
          chosenOptionId: selectedOption.id,
          responseTimeMs: elapsed,
          optionChanges: uniqueClicks.length > 1 ? uniqueClicks : undefined,
        });
        // 直近50件まで
        localStorage.setItem(
          interactionKey,
          JSON.stringify(interactions.slice(-50)),
        );
      }

      // Judgment Archaeology: 排除イベントの記録
      if (currentStep.options.length >= 3) {
        const elimKey = "culcept_sg_elimination_events_v1";
        const rawElim = localStorage.getItem(elimKey);
        const events: {
          questionId: string;
          eliminationOrder: string[];
          chosenOptionId: string;
          eliminationTimings?: number[];
          axisId?: string;
        }[] = rawElim ? JSON.parse(rawElim) : [];

        // クリックログから排除順序を推定:
        // 最後にクリックした（=選んだ）以外のオプションを、
        // クリックされなかった順に排除とみなす
        const clickedIds = new Set(optionClickLog.map((c) => c.optionId));
        const notClicked = currentStep.options
          .filter((o) => o.id !== selectedOption.id && !clickedIds.has(o.id))
          .map((o) => o.id);
        const clickedButNotChosen = optionClickLog
          .filter((c) => c.optionId !== selectedOption.id)
          .map((c) => c.optionId)
          .filter((id, i, arr) => arr.indexOf(id) === i);

        const eliminationOrder = [...notClicked, ...clickedButNotChosen];
        const eliminationTimings = optionClickLog.length > 1
          ? optionClickLog
              .slice(1)
              .map((c, i) => c.timestamp - optionClickLog[i].timestamp)
          : [elapsed];

        events.push({
          questionId: currentStep.key,
          eliminationOrder,
          chosenOptionId: selectedOption.id,
          eliminationTimings,
          axisId: stepAxisId,
        });
        localStorage.setItem(elimKey, JSON.stringify(events.slice(-50)));
      }
    } catch { /* non-critical */ }

    // Reset option tracking for next question
    setOptionClickLog([]);
    prevSelectedRef.current = null;

    const stepAxisId = currentStep.kind === "shadow_play"
      ? currentStep.primaryAxis
      : currentStep.axisId;

    const nextVisualAnswers = [
      ...answers,
      {
        questionId:
          currentStep.kind === "variant"
            ? currentStep.variantId
            : currentStep.kind === "shadow_play"
            ? currentStep.shadowPlayId
            : currentStep.kind === "expansion"
            ? currentStep.expansionQuestionId
            : currentStep.key,
        optionId: selectedOption.id,
        responseTimeMs: elapsed,
        axisId: stepAxisId,
      },
    ];

    if (currentStep.kind === "delta") {
      const nextDeltaAnswer: DeltaCheck = {
        axisId: currentStep.axisId,
        previousScore: currentStep.previousScore,
        previousDate: currentStep.previousDate,
        prompt: currentStep.prompt,
        options: currentStep.options.map((option) => ({
          id: option.id,
          label: option.label,
          delta: option.delta ?? 0,
        })),
      };
      setAnswers(nextVisualAnswers);
      setDeltaAnswer(nextDeltaAnswer);
      setSelectedDelta(selectedOption.delta ?? 0);

      if (currentIdx === steps.length - 1) {
        await submitObservation(
          nextVisualAnswers,
          apiAnswers,
          nextDeltaAnswer,
          selectedOption.delta ?? 0,
          reobservationAnswer,
        );
        return;
      }
    } else if (currentStep.kind === "shadow_play") {
      // ── Shadow Play 回答処理 ──
      const nextShadowPlayAnswers = [
        ...shadowPlayAnswers,
        {
          shadowPlayId: currentStep.shadowPlayId,
          optionId: selectedOption.id,
          primaryAxis: currentStep.primaryAxis,
          score: selectedOption.score ?? 0,
          responseTimeMs: elapsed,
        },
      ];
      setAnswers(nextVisualAnswers);
      setShadowPlayAnswers(nextShadowPlayAnswers);

      if (currentIdx === steps.length - 1) {
        await submitObservation(
          nextVisualAnswers,
          apiAnswers,
          deltaAnswer,
          selectedDelta,
          reobservationAnswer,
          nextShadowPlayAnswers,
        );
        return;
      }
    } else if (currentStep.kind === "expansion") {
      // ── P4 Phase D: 拡張軸質問の回答（core とは分離して管理）──
      const nextExpansionAnswer = {
        questionId: currentStep.expansionQuestionId,
        value: selectedOption.score ?? 3,
        responseTimeMs: elapsed,
      };
      setAnswers(nextVisualAnswers);
      setExpansionAnswer(nextExpansionAnswer);

      if (currentIdx === steps.length - 1) {
        await submitObservation(
          nextVisualAnswers,
          apiAnswers,
          deltaAnswer,
          selectedDelta,
          reobservationAnswer,
          undefined,
          nextExpansionAnswer,
        );
        return;
      }
    } else {
      const nextApiAnswers = [
        ...apiAnswers,
        {
          variantId: currentStep.variantId,
          score: selectedOption.score ?? 0,
          responseTimeMs: elapsed,
          optionId: selectedOption.id,
        },
      ];
      const nextReobservationAnswer = currentStep.isReobservation
        ? {
            variantId: currentStep.variantId,
            score: selectedOption.score ?? 0,
            previousScore: currentStep.previousScore ?? 0,
            previousDate: currentStep.previousDate ?? observationDate,
            responseTimeMs: elapsed,
          }
        : reobservationAnswer;

      setAnswers(nextVisualAnswers);
      setApiAnswers(nextApiAnswers);
      setReobservationAnswer(nextReobservationAnswer);

      if (currentIdx === steps.length - 1) {
        await submitObservation(
          nextVisualAnswers,
          nextApiAnswers,
          deltaAnswer,
          selectedDelta,
          nextReobservationAnswer,
        );
        return;
      }
    }

    // ── Adaptive Q2: 最初のvariant回答後に適応的Q2を取得・挿入 ──
    // 条件: まだ挿入していない & 現在のステップがvariant & 再観測でない
    if (
      !adaptiveQ2InsertedRef.current &&
      currentStep.kind === "variant" &&
      !currentStep.isReobservation
    ) {
      const inserted = await fetchAndInsertAdaptiveQ2(
        currentStep,
        selectedOption,
        elapsed,
        currentIdx,
      );
      // 挿入成功・失敗に関わらず次へ進む
      // (挿入成功時はstepsが1つ増えている)
      setShowInsight(false);
      setPhase("question");
      setCurrentIdx((prev) => {
        const nextIdx = prev + 1;
        // Start behavioral signal tracking for next question
        const nextStep = steps[nextIdx] ?? (inserted ? steps[nextIdx] : null);
        if (nextStep) signalCollectorRef.current?.startQuestion(nextStep.key);
        return nextIdx;
      });
      setSelectedOption(null);
      questionStartRef.current = Date.now();
      return;
    }

    setShowInsight(false);

    // マイクロインサイト生成（<50ms）
    const microInsight = generateMicroInsight(
      currentStep?.key ?? `q${currentIdx}`,
      selectedOption?.score ?? 0,
      elapsed,
    );
    if (microInsight && currentIdx + 1 < steps.length) {
      setCurrentMicroInsight(microInsight);
      setPhase("micro_insight");
      setSelectedOption(null);
      return;
    }

    setCurrentIdx((prev) => {
      const nextIdx = prev + 1;
      const nextStep = steps[nextIdx];
      if (nextStep) signalCollectorRef.current?.startQuestion(nextStep.key);
      return nextIdx;
    });
    setSelectedOption(null);
    questionStartRef.current = Date.now();
  }

  if (phase === "boot") {
    return (
      <div className="flex items-center justify-center py-16">
        <motion.div
          className="h-8 w-8 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(170,150,90,0.36), rgba(139,92,246,0.12))",
          }}
          animate={{ scale: [1, 1.18, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        />
      </div>
    );
  }

  if (phase === "adaptive_loading") {
    return (
      <div className="card-instrument flex flex-col items-center justify-center gap-4 py-12">
        <motion.div
          className="h-6 w-6 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(190,170,110,0.45), rgba(139,92,246,0.2))",
          }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
        <p className="sg-text-subtitle text-center">
          分析中...
        </p>
        <p className="sg-text-caption text-center">
          あなたの回答を分析して、次の質問を生成しています
        </p>
      </div>
    );
  }

  if (phase === "saving") {
    return (
      <div className="card-instrument flex flex-col items-center justify-center gap-4 py-16">
        <motion.div
          className="h-8 w-8 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(170,150,90,0.36), rgba(139,92,246,0.18))",
          }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
        <p className="sg-text-subtitle text-center">
          今日の観測を保存しています
        </p>
        <p className="sg-text-caption text-center">
          完了後はこの日付の結果だけが表示され、同じ日の再入力は発生しません。
        </p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="card-instrument space-y-4 py-8 text-center">
        <span className="text-3xl">⚠️</span>
        <p className="sg-text-subtitle">観測フローを続けられませんでした</p>
        <p className="sg-text-body max-w-2xl mx-auto">
          {saveError ?? "通信か保存の途中で止まりました。もう一度読み込み直します。"}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => void syncObservationState(observationDate)}
            className="btn-primary-sg"
          >
            もう一度確認する
          </button>
          <button
            onClick={() => setPhase("intro")}
            className="btn-secondary-sg"
          >
            最初に戻る
          </button>
        </div>
      </div>
    );
  }

  // ── Meta-Observation Phase ──
  if (phase === "meta_observation" && metaQuestions.length > 0) {
    const currentMeta = metaQuestions[metaCurrentIdx];

    const handleMetaConfirm = () => {
      if (!metaSelectedReaction || !currentMeta) return;

      const reactionType = metaSelectedReaction as MetaObservationInsight["reactionType"];
      const insight = interpretMetaObservation(
        reactionType,
        currentMeta.targetAxis,
        axisScores[currentMeta.targetAxis] ?? 0,
      );
      const nextInsights = [...metaInsightsCollected, insight];
      setMetaInsightsCollected(nextInsights);

      if (metaCurrentIdx < metaQuestions.length - 1) {
        setMetaCurrentIdx((prev) => prev + 1);
        setMetaSelectedReaction(null);
      } else {
        // Save meta-observation results to localStorage
        try {
          const key = "culcept_sg_meta_observations_v1";
          const existing: MetaObservationInsight[] = JSON.parse(
            localStorage.getItem(key) ?? "[]",
          );
          const merged = [...existing, ...nextInsights].slice(-20);
          localStorage.setItem(key, JSON.stringify(merged));
        } catch { /* non-critical */ }
        setPhase("celebration");
      }
    };

    const handleMetaSkip = () => {
      // Skip remaining meta-observation questions
      if (metaInsightsCollected.length > 0) {
        try {
          const key = "culcept_sg_meta_observations_v1";
          const existing: MetaObservationInsight[] = JSON.parse(
            localStorage.getItem(key) ?? "[]",
          );
          const merged = [...existing, ...metaInsightsCollected].slice(-20);
          localStorage.setItem(key, JSON.stringify(merged));
        } catch { /* non-critical */ }
      }
      setPhase("celebration");
    };

    return (
      <div className="space-y-5">
        <motion.div
          className="card-instrument py-8"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
        >
          {/* Header */}
          <div className="text-center mb-6">
            <span className="sg-text-micro">META-OBSERVATION</span>
            <p className="mt-2 sg-text-subtitle">
              自分の結果への反応を観る
            </p>
            <p className="mt-1 sg-text-body opacity-70">
              あなたの分析結果に対する反応自体が、自己認識の深さを映す鏡です。
            </p>
          </div>

          {/* Progress */}
          <div className="flex items-center justify-center gap-2 mb-5">
            {metaQuestions.map((_, qi) => (
              <div
                key={qi}
                className="h-1 rounded-full transition-all duration-300"
                style={{
                  width: qi === metaCurrentIdx ? 24 : 8,
                  background: qi <= metaCurrentIdx
                    ? "rgba(139,92,246,0.6)"
                    : "rgba(139,92,246,0.15)",
                }}
              />
            ))}
          </div>

          {/* Meta Question */}
          {currentMeta && (
            <motion.div
              key={currentMeta.questionId}
              className="space-y-4"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div className="rounded-2xl p-4" style={{
                background: "rgba(255,255,255,0.6)",
                border: "1px solid rgba(139,92,246,0.12)",
              }}>
                <span className="sg-text-caption block mb-1">
                  {currentMeta.context}
                </span>
                <p className="sg-text-body leading-7">
                  {currentMeta.prompt}
                </p>
              </div>

              {/* Options */}
              <div className="space-y-2">
                {currentMeta.options.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setMetaSelectedReaction(option.reactionType)}
                    className="w-full text-left rounded-xl p-3 transition-all duration-200"
                    style={{
                      background:
                        metaSelectedReaction === option.reactionType
                          ? "rgba(139,92,246,0.1)"
                          : "rgba(255,255,255,0.5)",
                      border:
                        metaSelectedReaction === option.reactionType
                          ? "1px solid rgba(139,92,246,0.3)"
                          : "1px solid rgba(186,166,110,0.15)",
                      transform:
                        metaSelectedReaction === option.reactionType
                          ? "scale(1.01)"
                          : "scale(1)",
                    }}
                  >
                    <span className="sg-text-body text-sm">{option.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-6 px-1">
            <button
              onClick={handleMetaSkip}
              className="sg-text-caption hover:opacity-80 transition-opacity"
              style={{ color: "rgba(108,92,58,0.5)" }}
            >
              スキップ
            </button>
            {metaSelectedReaction && (
              <motion.button
                onClick={handleMetaConfirm}
                className="btn-primary-sg"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                {metaCurrentIdx < metaQuestions.length - 1
                  ? "次へ"
                  : "結果を見る"}
              </motion.button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Micro-Insight Phase ── (回答間の即時インサイト)
  if (phase === "micro_insight" && currentMicroInsight) {
    return (
      <MicroInsightOverlay
        insight={currentMicroInsight}
        onDone={() => {
          setCurrentMicroInsight(null);
          setCurrentIdx((prev) => {
            const nextIdx = prev + 1;
            const nextStep = steps[nextIdx];
            if (nextStep) signalCollectorRef.current?.startQuestion(nextStep.key);
            return nextIdx;
          });
          setPhase("question");
          setSelectedOption(null);
          questionStartRef.current = Date.now();
        }}
      />
    );
  }

  // ── Depth Transition Reveal ──
  if (depthTransition) {
    return (
      <DepthTransitionReveal
        transition={depthTransition}
        onDone={() => {
          setDepthTransition(null);
          setPhase("question");
        }}
      />
    );
  }

  // ── Celebration Phase ── (観測完了セレブレーション)
  if (phase === "celebration") {
    return (
      <CelebrationOverlay
        totalAnswered={answers.length}
        justUnlocked={getJustUnlocked(totalObservations + answers.length)}
        onDone={() => {
          const unlocked = getJustUnlocked(totalObservations + answers.length);
          if (unlocked) markUnlockNotified(unlocked.feature);
          setJustCompleted(true);
          setPhase("done");
        }}
      />
    );
  }

  // ── Mirror Moment ── (矛盾検出時のフルスクリーン演出)
  if (phase === "done" && mirrorContradiction) {
    return (
      <MirrorMomentOverlay
        contradiction={mirrorContradiction}
        onDone={() => setMirrorContradiction(null)}
      />
    );
  }

  if (phase === "done" && justCompleted && completionInsight && todayObservation) {
    const { streak: currentStreak } = computeObservationStreak();
    return (
      <CompletionPhase
        completionInsight={completionInsight}
        todayAnswers={todayObservation.answers}
        axisScores={axisScores}
        totalObservations={totalObservations}
        typeDef={typeDef}
        capturedState={todayObservation.capturedState}
        streak={currentStreak}
        renderDetailContent={() => (
          <PostObservationProgress
            todayAnswers={todayObservation.answers}
            axisScores={axisScores}
            totalObservations={totalObservations}
            typeDef={typeDef}
            capturedState={todayObservation.capturedState}
            completionInsight={completionInsight}
          />
        )}
      />
    );
  }

  // ── Done without completion insight (fallback with mini summary) ──
  if (phase === "done") {
    const { streak: fallbackStreak } = computeObservationStreak();
    // 観測済み軸のうちスコアが大きい上位3軸
    const topAxes = Object.entries(axisScores)
      .filter(([, v]) => typeof v === "number" && Math.abs(v) > 0.1)
      .sort(([, a], [, b]) => Math.abs(b as number) - Math.abs(a as number))
      .slice(0, 3);

    return (
      <div className="card-instrument flex flex-col items-center justify-center gap-4 py-5">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{
            background: "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(190,170,110,0.12))",
            border: "1px solid rgba(34,197,94,0.2)",
          }}
        >
          <span className="text-lg">✓</span>
        </div>
        <div className="text-center space-y-1">
          <p className="sg-text-subtitle" style={{ fontSize: 14 }}>今日の観測は完了しています</p>
          <p className="sg-text-caption" style={{ color: "rgba(140,120,60,0.7)" }}>
            累計 {totalObservations} 観測
          </p>
        </div>

        {/* ミニサマリ: 最も特徴的な軸 */}
        {topAxes.length > 0 && (
          <div
            style={{
              padding: "10px 14px", borderRadius: 12, width: "100%", maxWidth: 300,
              background: "rgba(255,255,255,0.6)", border: "1px solid rgba(0,0,0,0.06)",
            }}
          >
            <p style={{ fontSize: 10, color: "rgba(56,62,84,0.5)", marginBottom: 4, letterSpacing: 1 }}>
              あなたの特徴的な軸
            </p>
            {topAxes.map(([axisId, score]) => {
              const numScore = score as number;
              const barWidth = Math.abs(numScore) * 100;
              return (
                <div key={axisId} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: "rgba(56,62,84,0.7)", width: 110, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {axisLabel(axisId)}
                  </span>
                  <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(0,0,0,0.06)" }}>
                    <div
                      style={{
                        width: `${barWidth}%`, height: "100%", borderRadius: 2,
                        background: numScore > 0
                          ? "linear-gradient(90deg, rgba(140,120,60,0.3), rgba(140,120,60,0.6))"
                          : "linear-gradient(90deg, rgba(96,165,250,0.3), rgba(96,165,250,0.6))",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <StreakDisplay compact className="mt-1" />

        <p className="sg-text-caption" style={{ marginTop: 4 }}>
          明日も観測すると、変化のパターンが見えてきます
        </p>
      </div>
    );
  }

  // ── Paused / Intro: IntroPhase に統合 ──
  if (phase === "paused" && pausedSession) {
    return (
      <IntroPhase
        greeting={greeting}
        whisper={whisper}
        totalObservations={totalObservations}
        observedAxisCount={observedAxisCount}
        formattedDate={formattedObservationDate}
        onStart={() => {
          clearPauseState();
          setPausedSession(null);
          startObservation();
        }}
        onResume={handleResume}
        pausedSession={pausedSession}
      />
    );
  }

  if (phase === "intro") {
    return (
      <IntroPhase
        greeting={greeting}
        whisper={whisper}
        totalObservations={totalObservations}
        observedAxisCount={observedAxisCount}
        formattedDate={formattedObservationDate}
        onStart={startObservation}
      />
    );
  }

  if (phase === "loading_plan") {
    return (
      <div className="card-instrument flex flex-col items-center justify-center gap-4 py-16">
        <motion.div
          className="h-8 w-8 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(170,150,90,0.36), rgba(139,92,246,0.18))",
          }}
          animate={{ scale: [1, 1.16, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
        <p className="sg-text-subtitle text-center">
          今日の履歴に合わせて質問を組み立てています
        </p>
        <p className="sg-text-caption text-center">
          同じ人にも毎日同じ問いは出さず、未観測の軸と揺れやすい軸を優先します。
        </p>
      </div>
    );
  }

  if (phase === "state_capture") {
    const stepsMeta = [
      {
        label: "エネルギー",
        subtext: "今のエネルギーに最も近いものを選んでください",
        options: ENERGY_OPTIONS,
        selected: stateEnergy,
        onSelect: (value: string) => {
          setStateEnergy(value as EnergyLevel);
          setStateCaptureStep(1);
        },
      },
      {
        label: "気分",
        subtext: "今の気分を一番よく表すものはどれですか",
        options: EMOTION_OPTIONS,
        selected: stateEmotion,
        onSelect: (value: string) => {
          setStateEmotion(value as EmotionalTone);
          setStateCaptureStep(2);
        },
      },
      {
        label: "環境",
        subtext: "今の周囲の環境はどれに近いですか",
        options: SOCIAL_OPTIONS,
        selected: stateSocial,
        onSelect: (value: string) => {
          setStateSocial(value as SocialContext);
        },
      },
    ];

    const activeStep = stepsMeta[stateCaptureStep];

    return (
      <div className="space-y-5">
        <div>
          <span className="text-section-header">STATE CAPTURE</span>
          <p className="font-display mt-2 text-[1.1rem] sg-text-body">
            まず、今の状態を捉えてから質問を選びます
          </p>
          <p className="sg-text-caption mt-2 leading-7">
            ここで選んだ状態が、その日の質問の角度や相手文脈の優先順位に反映されます。
          </p>
        </div>

        <div className="flex items-center gap-2">
          {stepsMeta.map((step, index) => (
            <div
              key={step.label}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: index <= stateCaptureStep ? 34 : 16,
                background:
                  index < stateCaptureStep
                    ? "rgba(170,150,90,0.55)"
                    : index === stateCaptureStep
                      ? "rgba(139,92,246,0.55)"
                      : "rgba(160,170,200,0.16)",
              }}
            />
          ))}
          <span className="ml-auto font-mono-sg text-xs" style={{ color: "rgba(98,104,130,0.72)" }}>
            {stateCaptureStep + 1}/3
          </span>
        </div>

        <div className="card-instrument">
          <div className="mb-5 flex items-start gap-3">
            <span className="text-lg">🫧</span>
            <div className="space-y-1">
              <p className="font-display text-[1.08rem] sg-text-body">
                {activeStep.subtext}
              </p>
              <p className="sg-text-caption">{activeStep.label}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {activeStep.options.map((option, i) => {
              const isSelected = activeStep.selected === option.value;
              return (
                <motion.button
                  key={option.value}
                  onClick={() => activeStep.onSelect(option.value)}
                  className="rounded-xl px-4 py-3.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-400/50"
                  style={{
                    background: isSelected
                      ? "rgba(139,92,246,0.12)"
                      : "rgba(255,255,255,0.72)",
                    border: isSelected
                      ? "1.5px solid rgba(139,92,246,0.32)"
                      : "1px solid rgba(160,170,200,0.14)",
                    color: isSelected
                      ? "rgba(24,30,48,0.94)"
                      : "rgba(58,64,88,0.82)",
                    fontWeight: isSelected ? 600 : 450,
                    minHeight: "44px",
                  }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.25 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  aria-label={`${activeStep.label}を選択: ${option.label}`}
                >
                  <span className="mr-1.5">{option.icon}</span>
                  {option.label}
                </motion.button>
              );
            })}
          </div>
        </div>

        {stateEnergy && stateEmotion && stateSocial && (
          <motion.button
            onClick={() => void completeStateCapture()}
            className="btn-primary-sg w-full py-4 text-base"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            この状態で今日の質問を組み立てる
          </motion.button>
        )}
      </div>
    );
  }

  if (phase === "question" && currentStep) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-section-header">{currentStep.label}</span>
          <span className="font-mono-sg text-xs" style={{ color: "rgba(98,104,130,0.58)" }}>
            {currentIdx + 1}/{steps.length}
          </span>
        </div>

        <div
          className="h-1.5 overflow-hidden rounded-full"
          style={{ background: "rgba(160,170,200,0.12)" }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{
              background:
                "linear-gradient(90deg, rgba(139,92,246,0.6), rgba(190,170,110,0.52))",
            }}
            initial={{ width: "0%" }}
            animate={{ width: `${((currentIdx + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="card-hero-star" style={{ position: "relative", overflow: "hidden" }}>
          {/* 深度カラーライン */}
          {depthPhaseColor && (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 3,
                borderRadius: "0 2px 2px 0",
                background: depthPhaseColor,
              }}
            />
          )}
          <div className="space-y-3">
            {/* Shadow Play: シナリオ表示 */}
            {currentStep.kind === "shadow_play" && currentStep.scenario ? (
              <div
                className="rounded-lg p-3 mb-2"
                style={{
                  background: "rgba(139,92,246,0.04)",
                  border: "1px solid rgba(139,92,246,0.12)",
                }}
              >
                <span
                  className="text-[10px] font-mono tracking-wider uppercase block mb-1.5"
                  style={{ color: "rgba(139,92,246,0.6)" }}
                >
                  🎭 {currentStep.category}
                </span>
                <p className="sg-text-body leading-relaxed" style={{ color: "rgba(24,30,48,0.85)" }}>
                  {currentStep.scenario}
                </p>
              </div>
            ) : (
              <p className="sg-text-caption">{currentStep.note}</p>
            )}
            <p
              className="font-display text-[1.45rem] leading-[1.45]"
              style={{ color: "rgba(24,30,48,0.96)" }}
            >
              {currentStep.prompt}
            </p>
            {"uxHint" in currentStep && currentStep.uxHint ? (
              <div className="card-info">
                <span className="sg-text-micro">今日この問いの理由</span>
                <p className="mt-2 sg-text-body">{currentStep.uxHint}</p>
              </div>
            ) : null}
            {"previousDate" in currentStep && currentStep.previousDate ? (
              <p className="sg-text-caption">
                前回記録: {currentStep.previousDate}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          {currentStep.options.map((option) => {
            const isSelected = selectedOption?.id === option.id;
            return (
              <motion.button
                key={option.id}
                onClick={() => {
                  // Track option interaction for phantom choice + archaeology
                  setOptionClickLog((prev) => [
                    ...prev,
                    { optionId: option.id, timestamp: Date.now() },
                  ]);
                  if (selectedOption && selectedOption.id !== option.id) {
                    prevSelectedRef.current = selectedOption.id;
                    signalCollectorRef.current?.recordAnswerChange(
                      currentStep.key,
                      option.label,
                      selectedOption.label,
                    );
                  }
                  setSelectedOption(option);
                }}
                onMouseEnter={() => signalCollectorRef.current?.onOptionHover(option.label)}
                onMouseLeave={() => signalCollectorRef.current?.onOptionHoverEnd(option.label)}
                onTouchStart={() => signalCollectorRef.current?.onOptionHover(option.label)}
                onTouchEnd={() => signalCollectorRef.current?.onOptionHoverEnd(option.label)}
                className="w-full rounded-xl py-5 px-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-400/50"
                style={{
                  background: isSelected
                    ? "rgba(139,92,246,0.08)"
                    : "rgba(255,255,255,0.76)",
                  border: isSelected
                    ? "1.5px solid rgba(139,92,246,0.32)"
                    : "1px solid rgba(160,170,200,0.14)",
                  color: isSelected
                    ? "rgba(24,30,48,0.96)"
                    : "rgba(50,56,80,0.88)",
                  fontWeight: isSelected ? 600 : 450,
                  minHeight: "48px",
                }}
                whileTap={{ scale: 0.97 }}
                animate={isSelected ? { scale: 1.01 } : { scale: 1 }}
                transition={{ duration: 0.15 }}
              >
                {option.label}
              </motion.button>
            );
          })}
        </div>

        {selectedOption && (
          <motion.button
            onClick={() => void confirmSelection()}
            className="btn-primary-sg w-full py-4 text-base"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            この答えで進む
          </motion.button>
        )}

        {/* あとで答える: 2秒後に表示 */}
        {showPauseBtn && currentIdx > 0 && (
          <motion.button
            onClick={() => void handlePause()}
            className="w-full py-2.5 rounded-xl font-display text-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.22 }}
            style={{
              background: "rgba(0,0,0,0.02)",
              border: "1px solid rgba(140,150,180,0.14)",
              color: "rgba(80,85,105,0.55)",
            }}
          >
            あとで答える（{currentIdx}/{steps.length} 回答済み）
          </motion.button>
        )}

        {/* 行動インサイトポップアップ: 回答直後に迷い・ホバー・フォーカス情報を表示 */}
        <BehavioralInsightPopup
          insight={currentInsight}
          visible={showInsight}
        />
      </div>
    );
  }

  return null;
}
