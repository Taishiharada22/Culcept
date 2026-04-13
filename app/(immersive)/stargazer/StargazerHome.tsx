// app/stargazer/StargazerHome.tsx
// Stargazer v4 — MBTI級の理解しやすさへ再構築
// シェル: 状態管理 + データロード + 5タブナビ
"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import AlterContextBanner from "@/components/home/AlterContextBanner";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import FeatureIntroduction from "@/components/ui/FeatureIntroduction";
import { STARGAZER_INTRO } from "@/lib/ui/featureIntroConfigs";
import { safeLSSet } from "@/lib/safeLocalStorage";
import { safeSetItem, purgeStaleKeys } from "@/lib/stargazer/localStorageHelper";
import CrossFeatureRecoCards from "./_components/CrossFeatureRecoCards";
import StargazerQuickAccess from "./_components/StargazerQuickAccess";
import Stage1Flow from "./_components/Stage1Flow";
import type { TypeDefLike } from "@/lib/stargazer/dailyInsightEngine";
import {
  deriveTraitCards,
  getUnobservedAreas,
  detectContextDifferences,
  type DerivedTraitCard,
  type ContextDifference,
} from "@/lib/stargazer/traitCards";
import {
  generateDailyGreeting,
  generateDailyWhisper,
  detectContradictions,
  generateContextNarratives,
  type DailyGreeting,
  type DailyWhisper,
  type ContradictionInsight,
  type ContextNarrative,
} from "@/lib/stargazer/dailyInsightEngine";
import {
  mockAxisScores,
  mockResolvedResult,
  mockObservationStats,
  mockPartners,
} from "./_utils/mockData";
import type { PartnerProfile, PartnerCategory } from "@/lib/stargazer/partnerTypes";

// getSystemConnectionSummary 廃止（CEO指示 #6 2026-04-11）

// v3 Archetype System
import {
  resolveArchetype,
  resolveArchetypeDual,
  type ArchetypeResult as BaseArchetypeResult,
  type DualArchetypeResult,
} from "@/lib/stargazer/archetypeResolver";

// API extends ArchetypeResult with display fields from getArchetypeByCode
type ArchetypeResult = BaseArchetypeResult & {
  name?: string;
  emoji?: string;
  tagline?: string;
};
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";
import {
  buildContradictionMap,
  type ContradictionMap as ContradictionMapType,
} from "@/lib/stargazer/contradictionMap";
import type { ThreeMirrorProfile, MirrorAxisScore } from "@/lib/stargazer/threeMirrors";
import { buildClientThreeMirrorProfile } from "@/lib/stargazer/threeMirrorAggregator";
import { buildDualAxisScores } from "@/lib/stargazer/threeMirrors";
import { buildGenerativeCore, type GenerativeCoreResult } from "@/lib/stargazer/generativeCore";
import {
  analyzeMetamorphosisLaw,
  type MetamorphosisLawResult,
  type AxisTimePoint,
} from "@/lib/stargazer/metamorphosisLaw";
import {
  computeEntropySignature,
  predictResonanceCascade,
  analyzePhantomChoices,
  analyzeTemporalDiff,
  interpretMetaObservation,
  type EntropySignature,
  type ResonancePrediction,
  type PhantomChoiceResult,
  type TemporalDiffResult,
  type MetaObservationInsight,
} from "@/lib/stargazer/innovativeMechanisms";
import {
  analyzeJudgmentArchaeology,
  type JudgmentArchaeologyResult,
} from "@/lib/stargazer/judgmentArchaeology";
import {
  buildPredictiveClone,
  type PredictiveCloneResult,
} from "@/lib/stargazer/predictiveClone";
import type { StressDecayCurveData } from "./_components/StressDecayCurveCard";
import {
  analyzeTraitEvolution,
  type TraitSnapshot,
  type TraitEvolutionResult,
} from "@/lib/stargazer/traitEvolution";
import {
  getStoredFootprints,
  aggregateFootprints,
  footprintPatternsToAxisScores,
} from "@/lib/stargazer/footprintCollector";
import { useFootprintTracker } from "@/hooks/useFootprintTracker";
import ArchetypeThemeProvider from "./_components/ArchetypeThemeProvider";
import ArchetypeFigure from "./_components/ArchetypeFigure";
import { buildWhyInsights } from "@/lib/stargazer/explanationEngine";
import {
  generateBehavioralInsights,
  type BehavioralInsight,
} from "@/lib/stargazer/behavioralInsightEngine";
import { computeDataQuality } from "@/lib/stargazer/validation/dataQuality";
import StargazerLoading from "./_shared/StargazerLoading";
import { useStargazerSounds } from "@/hooks/useStargazerSounds";
import { useHaptics } from "@/hooks/useHaptics";
import MilestoneCelebration from "./_components/MilestoneCelebration";
import { checkMilestone, markMilestoneShown, type MilestoneNumber } from "@/lib/stargazer/milestoneDetector";
import FeatureUnlockToast from "./_components/FeatureUnlockToast";
import { getJustUnlocked, markUnlockNotified, type FeatureGate } from "@/lib/stargazer/featureUnlock";
import PushPermissionBanner from "./_components/PushPermissionBanner";
import MicroEMAPrompt from "./_components/MicroEMAPrompt";
import PersistentStreakBar from "./_components/PersistentStreakBar";
import { getAccuracyTrend, type AccuracyTrend } from "@/lib/stargazer/engagementScore";
import {
  shouldPromptAndMark as microEMAShouldPromptAndMark,
  getNextQuestion as microEMAGetNextQuestion,
  type MicroEMAQuestion,
} from "@/lib/stargazer/microEMA";
import { applyEMAToAxisScores, autoCheckTransformationProgress } from "@/lib/stargazer/microEMABridge";

// Weekly Report
import {
  generateWeeklyReport,
  saveWeeklyReport,
  loadWeeklyReport,
  type WeeklyReport,
} from "@/lib/stargazer/weeklyReportGenerator";
// Dynamic imports for weekly report enrichment (avoid heavy module chain on initial load)
// dreamJournal, lifeEvents, actHexaflex loaded lazily inside weekly report generation
import WeeklyReportViewer from "./_components/WeeklyReportViewer";
// ShareableInsightCard available for insight sharing (import when needed in child components)
// import ShareableInsightCard from "./_components/ShareableInsightCard";

// Tab components — lazy loaded for code splitting
import ObserveTab from "./_tabs/ObserveTab";
import StarMapTab from "./_tabs/StarMapTab";
import DeepTab from "./_tabs/DeepTab";
import TraitsTab from "./_tabs/TraitsTab";
import TrajectoryTab from "./_tabs/TrajectoryTab";
import PartnerTab from "./_tabs/PartnerTab";
import StargazerErrorBoundary from "./_shared/StargazerErrorBoundary";

/** Lightweight inline skeleton shown while lazy tab chunks load */
import { TabSkeleton } from "./_components/StargazerSkeletons";

// Journey & Retention components
import FeatureJourneyMap from "./_components/FeatureJourneyMap";
import DailySummaryCard from "./_components/DailySummaryCard";
import DailyHookBanner from "./_components/DailyHookBanner";
import CrossFeatureNudges from "./_components/CrossFeatureNudges";
import QuickActions from "./_components/QuickActions";
import DepthTransition from "./_components/DepthTransition";
import {
  recordObservation,
  getEnhancedStreakData,
} from "@/lib/stargazer/retentionHooks";
import type { V4Feature } from "@/lib/stargazer/depthPhaseController";

// Today's Summary — consolidated observe tab top section
import TodaySummary from "./_components/TodaySummary";
import TodaySummaryCard from "./_components/TodaySummaryCard";
import TodaySummaryMini from "./_components/TodaySummaryMini";
import MorningQuestion from "./_components/MorningQuestion";
import DailyEngagementSection from "./_components/DailyEngagementSection";
import StargazerHero from "./_components/StargazerHero";
import Stage2Flow from "./_components/Stage2Flow";
import { PROBE_THEMES } from "@/lib/stargazer/stage2Probes";
import PredictionVerificationFlow from "./_components/PredictionVerificationFlow";
import PredictionHitCelebration from "./_components/PredictionHitCelebration";
import AlterLetterCard from "./_components/AlterLetterCard";
import type { TodayPrioritizerInput } from "@/lib/stargazer/todayPrioritizer";
import { getActiveVanishingInsight } from "@/lib/stargazer/vanishingInsightGenerator";

// Engine imports for state management (components delegated to TodaySummary)
import {
  calculateUnderstanding,
  loadUnderstandingLevel,
  saveUnderstandingLevel,
  type UnderstandingLevel,
} from "@/lib/stargazer/understandingMeter";
import {
  generateDailyPrediction,
  loadPredictions,
  savePrediction,
  hasTodayPrediction,
  updatePredictionVerification,
  getPendingVerifications,
  calculateAccuracy,
  type Prediction,
  type PredictionFeedback,
} from "@/lib/stargazer/predictionEngine";
import { updateLearningFromFeedback } from "@/lib/stargazer/predictionLearningLoop";
import {
  checkForRevision,
  loadRevisions,
  saveRevision,
  acknowledgeRevision,
  getUnacknowledgedRevisions,
  getLastRevisionTimestamp,
  type Revision,
} from "@/lib/stargazer/revisionEngine";
import {
  getScheduledAfterglow,
  dismissAfterglow,
  type AfterglowMessage,
} from "@/lib/stargazer/alterAfterglowEngine";
import { updateEngagementField } from "@/lib/stargazer/engagementScore";

// ── Types ──

type TabKey = "observe" | "starmap" | "deep" | "traits" | "trajectory" | "partner";

interface TabDef {
  key: TabKey;
  label: string;
  sublabel: string;
  icon: string;
}

const TABS: TabDef[] = [
  { key: "observe", label: "観測", sublabel: "毎日の問い", icon: "🔭" },
  { key: "starmap", label: "アーキタイプ", sublabel: "全体像", icon: "✦" },
  { key: "deep", label: "深層", sublabel: "深層分析", icon: "◎" },
  { key: "traits", label: "特性", sublabel: "特性", icon: "◆" },
  { key: "trajectory", label: "軌跡", sublabel: "変化の軌跡", icon: "〜" },
  { key: "partner", label: "相手", sublabel: "相性", icon: "♢" },
];

function getLocalDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeAccuracyPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const percentValue = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percentValue));
}

// ── Main Component ──

export default function StargazerHome() {
  // Reduced motion preference for accessibility
  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  // Detect ?rv=start for RV-only flow from daily observation mode
  const searchParams = useSearchParams();
  const rvStartParam = searchParams.get("rv") === "start";
  const [rvStartMode, setRvStartMode] = useState(rvStartParam);

  // Support query param based tab navigation (e.g., ?tab=observe)
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === "undefined") return "observe";
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab && TABS.some((t) => t.key === tab)) return tab as TabKey;
    return "observe";
  });
  const [isLoading, setIsLoading] = useState(true);

  // Sound effects & haptics
  const {
    playDepthDive,
    playInsightReveal,
    playVanishWarning,
    playPredictionVerified,
    playContradictionFound,
    playStreakMilestone,
  } = useStargazerSounds();
  const haptics = useHaptics();

  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    haptics.light(); // tactile feedback on tab change
    // Play depth dive sound when navigating to deeper tabs
    if (tab === "deep" || tab === "trajectory") {
      playDepthDive();
    }
  }, [playDepthDive, haptics]);

  // Proactively free stale localStorage keys on mount to prevent QuotaExceededError
  useEffect(() => { purgeStaleKeys(); }, []);

  // Passive footprint tracking per tab
  useFootprintTracker({ feature: `stargazer:${activeTab}` });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  // Data state
  const [axisScores, setAxisScores] = useState<
    Partial<Record<TraitAxisKey, number>>
  >({});
  const [resolvedType, setResolvedType] = useState<string>("");
  const [topMatches, setTopMatches] = useState<
    { code: string; score: number }[]
  >([]);
  const [confidence, setConfidence] = useState(0);
  const [totalObservations, setTotalObservations] = useState(0);
  const [todayObservationCount, setTodayObservationCount] = useState(0);
  const [hasCompletedInitialObservation, setHasCompletedInitialObservation] = useState(false);
  const [isBetaTester, setIsBetaTester] = useState(false);
  const [cognitiveFit, setCognitiveFit] = useState<Partial<Record<string, number>> | null>(null);
  // P4: 拡張軸データ
  const [expansionAxes, setExpansionAxes] = useState<Array<{
    id: string; labelLeft: string; labelRight: string; score: number | null;
    confidence: number; precision: number; source: "inferred" | "observed";
    displayTier: "hidden" | "emerging" | "forming" | "visible";
    displayPrefix: string; visible: boolean; originLabel: string;
  }> | null>(null);

  // Milestone celebration state
  const [activeMilestone, setActiveMilestone] = useState<MilestoneNumber | null>(null);

  // Check milestones when totalObservations changes (wait for tour hydrate)
  useEffect(() => {
    if (totalObservations <= 0) return;
    let cancelled = false;
    import("@/lib/tour/tourState").then(({ hydrateTourStates }) =>
      hydrateTourStates()
    ).then(() => {
      if (cancelled) return;
      const hit = checkMilestone(totalObservations);
      if (hit) {
        setActiveMilestone(hit);
        haptics.heavy();
      }
    });
    return () => { cancelled = true; };
  }, [totalObservations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Feature unlock toast state
  const [activeUnlock, setActiveUnlock] = useState<FeatureGate | null>(null);

  // Check feature unlocks when totalObservations changes — queued via overlay system
  useEffect(() => {
    if (totalObservations <= 0) return;
    const justUnlocked = getJustUnlocked(totalObservations);
    if (justUnlocked) {
      // Delay slightly so milestone celebration gets priority
      const delay = activeMilestone ? 3000 : 500;
      const timer = setTimeout(() => {
        pendingUnlockRef.current = justUnlocked;
        // If no overlay is active, show immediately
        if (!activeOverlay && overlayQueue.length === 0) {
          setActiveOverlay("featureUnlock");
          setActiveUnlock(justUnlocked);
        } else {
          // Queue it after current overlays
          setOverlayQueue((prev) => [...prev, "featureUnlock"]);
        }
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [totalObservations, activeMilestone]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Story auto-trigger at 70 questions ──
  const STORY_TOAST_LS_KEY = "stargazer_story_70q_shown";
  const [showStoryToast, setShowStoryToast] = useState(false);

  useEffect(() => {
    if (totalObservations < 70) return;
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(STORY_TOAST_LS_KEY)) return;
      // Delay after celebrations/overlays
      const timer = setTimeout(() => {
        setShowStoryToast(true);
        safeSetItem(STORY_TOAST_LS_KEY, "1");
      }, 4000);
      return () => clearTimeout(timer);
    } catch { /* silent */ }
  }, [totalObservations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Feature Introduction — tab bar ref
  const tabBarRef = useRef<HTMLDivElement>(null);

  // Cross-feature recommendation cards (after first observation saved)
  const [crossRecoReady, setCrossRecoReady] = useState(false);
  const [crossRecoShown, setCrossRecoShown] = useState(false);
  const [contextScores, setContextScores] = useState<
    Record<string, Partial<Record<TraitAxisKey, number>>>
  >({});

  // Previous axis scores (for ghost overlay in trait map)
  const [previousAxisScores, setPreviousAxisScores] = useState<
    Partial<Record<TraitAxisKey, number>>
  >({});
  // Axis history for Evolution Timeline
  const [axisHistory, setAxisHistory] = useState<
    Array<{
      date: string;
      scores: Record<string, number>;
      events?: Array<{ type: "contradiction" | "milestone" | "shift"; label: string }>;
    }>
  >([]);
  // AI Learning stats for indicator
  const [aiLearningStats, setAiLearningStats] = useState<{
    categoryAccuracy?: Record<string, { accuracy: number; totalPredictions: number; trend: "improving" | "stable" | "declining" }>;
    overallAccuracy?: number;
    observationCount?: number;
  } | undefined>(undefined);

  // Derived
  const [traitCards, setTraitCards] = useState<DerivedTraitCard[]>([]);
  const [unobservedAreas, setUnobservedAreas] = useState<
    { axis: TraitAxisKey; label: string; category: string; suggestion: string }[]
  >([]);
  const [contextDiffs, setContextDiffs] = useState<ContextDifference[]>([]);

  // Insight engine outputs
  const [dailyGreeting, setDailyGreeting] = useState<DailyGreeting | null>(null);
  const [dailyWhisper, setDailyWhisper] = useState<DailyWhisper | null>(null);
  const [contradictions, setContradictions] = useState<ContradictionInsight[]>([]);
  const [contextNarratives, setContextNarratives] = useState<ContextNarrative[]>([]);
  const [partners, setPartners] = useState<PartnerProfile[]>([]);

  // ── 相手タブ: contextProfiles → state 反映（共通ロジック） ──
  const CONTEXT_TO_CATEGORY: Record<string, PartnerCategory> = {
    friends: "friend",
    romantic_partner: "romantic",
    spouse: "spouse",
    family: "family",
    coworkers: "colleague",
  };
  const CONTEXT_NICKNAMES: Record<string, string> = {
    friends: "友達",
    romantic_partner: "恋人",
    spouse: "配偶者",
    family: "家族",
    coworkers: "仕事仲間",
  };

  const applyContextProfiles = useCallback(
    (profiles: Record<string, { axisScores: Record<string, number>; observationCount: number }>) => {
      // contextScores にマージ（axisScoresだけ抽出）
      const scoresOnly: Record<string, Partial<Record<TraitAxisKey, number>>> = {};
      for (const [ctx, data] of Object.entries(profiles)) {
        scoresOnly[ctx] = data.axisScores as Partial<Record<TraitAxisKey, number>>;
      }
      setContextScores((prev) => ({ ...prev, ...scoresOnly }));

      // partners 一覧を生成
      const ctxPartners: PartnerProfile[] = Object.entries(profiles)
        .filter(([ctx]) => ctx !== "self" && CONTEXT_TO_CATEGORY[ctx])
        .map(([ctx, ctxData]) => ({
          id: ctx,
          category: CONTEXT_TO_CATEGORY[ctx] ?? "friend",
          nickname: CONTEXT_NICKNAMES[ctx] ?? ctx,
          observationCount: ctxData.observationCount ?? 0,
          contextAxisScores: ctxData.axisScores as Partial<Record<TraitAxisKey, number>>,
        }));
      setPartners(ctxPartners.length > 0 ? ctxPartners : []);
    },
    [],
  );

  // ── 相手タブ: データ再取得関数 ──
  const refreshPartnerData = useCallback(async () => {
    try {
      const res = await fetch("/api/stargazer/profile", { credentials: "include" });
      const data = res.ok ? await res.json() : null;
      if (data?.contextProfiles) {
        applyContextProfiles(data.contextProfiles);
      }
    } catch {
      // silently fail
    }
  }, [applyContextProfiles]);

  // Fluctuation engine data
  const [fluctuationData, setFluctuationData] = useState<{
    distributions: import("@/lib/stargazer/fluctuationEngine").AxisDistribution[];
    patterns: import("@/lib/stargazer/fluctuationEngine").FluctuationPattern[];
    insights: import("@/lib/stargazer/fluctuationEngine").CompanionInsight[];
    snapshotCount: number;
  } | null>(null);

  // v3 Archetype data
  const [archetypeResult, setArchetypeResult] = useState<ArchetypeResult | null>(null);

  // Three Mirror System data
  const [dualArchetypeResult, setDualArchetypeResult] = useState<DualArchetypeResult | null>(null);
  const [contradictionMapData, setContradictionMapData] = useState<ContradictionMapType | null>(null);
  const [generativeCoreResult, setGenerativeCoreResult] = useState<GenerativeCoreResult | null>(null);
  const [metamorphosisResult, setMetamorphosisResult] = useState<MetamorphosisLawResult | null>(null);
  const [entropySignature, setEntropySignature] = useState<EntropySignature | null>(null);
  const [resonancePredictions, setResonancePredictions] = useState<ResonancePrediction[]>([]);
  const [phantomChoices, setPhantomChoices] = useState<PhantomChoiceResult[]>([]);
  const [temporalDiffs, setTemporalDiffs] = useState<TemporalDiffResult[]>([]);
  const [metaInsights, setMetaInsights] = useState<MetaObservationInsight[]>([]);
  const [judgmentArchaeology, setJudgmentArchaeology] = useState<JudgmentArchaeologyResult | null>(null);
  const [predictiveCloneResult, setPredictiveCloneResult] = useState<PredictiveCloneResult | null>(null);
  const [stressDecayCurve, setStressDecayCurve] = useState<StressDecayCurveData | null>(null);
  const [traitEvolutionData, setTraitEvolutionData] = useState<TraitEvolutionResult | null>(null);

  // Orphaned component states
  const [understandingLevel, setUnderstandingLevel] = useState<UnderstandingLevel | null>(null);
  const [todayPrediction, setTodayPrediction] = useState<Prediction | null>(null);
  const [pendingVerifications, setPendingVerifications] = useState<Prediction[]>([]);
  const [predictionAccuracy, setPredictionAccuracy] = useState<number>(0);
  const [predictionAccuracyTrend, setPredictionAccuracyTrend] = useState<AccuracyTrend>("stable");
  const [unacknowledgedRevisions, setUnacknowledgedRevisions] = useState<Revision[]>([]);
  const [afterglowMessage, setAfterglowMessage] = useState<AfterglowMessage | null>(null);

  // Weekly Report state
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [showWeeklyReport, setShowWeeklyReport] = useState(false);

  // Prediction Hit Celebration state
  const [predictionHitData, setPredictionHitData] = useState<{
    prediction: string;
    newAccuracy: number;
    category: string;
    consecutiveHits: number;
  } | null>(null);

  // Micro-EMA state
  const [showMicroEMA, setShowMicroEMA] = useState(false);
  const [microEMAQuestion, setMicroEMAQuestion] = useState<MicroEMAQuestion | null>(null);

  // Overlay queue: ensure only one overlay shows at a time
  // Order: microEMA → tabTour → featureUnlock
  const [overlayQueue, setOverlayQueue] = useState<Array<"microEMA" | "tabTour" | "featureUnlock">>([]);
  const [activeOverlay, setActiveOverlay] = useState<"microEMA" | "tabTour" | "featureUnlock" | null>(null);
  const pendingUnlockRef = useRef<FeatureGate | null>(null);
  // microEMAPendingRef / tabTourPendingRef removed — checks moved into overlay queue timer

  // Advance to next overlay in queue
  const advanceOverlay = useCallback(() => {
    setOverlayQueue((prev) => {
      const next = prev.slice(1);
      if (next.length > 0) {
        setTimeout(() => {
          const nextOverlay = next[0];
          setActiveOverlay(nextOverlay);
          // If advancing to featureUnlock, set the pending unlock
          if (nextOverlay === "featureUnlock" && pendingUnlockRef.current) {
            setActiveUnlock(pendingUnlockRef.current);
          }
        }, 400);
      } else {
        setActiveOverlay(null);
      }
      return next;
    });
  }, []);

  function loadPreviewData() {
    const scores = mockAxisScores;
    const total = mockObservationStats.totalAnswered;
    setAxisScores(scores);
    setResolvedType(mockResolvedResult.reactionType);
    setTopMatches([]);
    setConfidence(mockResolvedResult.confidence);
    setTotalObservations(total);
    setTodayObservationCount(total); // preview: 全件を今日分として扱う

    const mockCtx: Record<string, Partial<Record<TraitAxisKey, number>>> = {
      friends: {
        ...scores,
        introvert_vs_extrovert: (scores.introvert_vs_extrovert ?? 0) + 0.3,
        direct_vs_diplomatic: (scores.direct_vs_diplomatic ?? 0) - 0.3,
      },
      romance: {
        ...scores,
        reassurance_need: (scores.reassurance_need ?? 0) + 0.4,
        emotional_variability: (scores.emotional_variability ?? 0) + 0.3,
      },
      work: {
        ...scores,
        social_initiative: (scores.social_initiative ?? 0) + 0.3,
        analytical_vs_intuitive: (scores.analytical_vs_intuitive ?? 0) - 0.3,
      },
    };
    setContextScores(mockCtx);

    const cards = deriveTraitCards(scores, {}, total);
    setTraitCards(cards);
    const unobs = getUnobservedAreas(scores, {});
    setUnobservedAreas(unobs);
    const diffs = detectContextDifferences(mockCtx);
    setContextDiffs(diffs);

    // Insight engine
    const today = getLocalDateString();
    setDailyGreeting(generateDailyGreeting(scores, null, total, today));
    setDailyWhisper(generateDailyWhisper(scores, cards, diffs, today));
    setContradictions(detectContradictions(cards));
    setContextNarratives(generateContextNarratives(diffs));
    setPartners(mockPartners);

    // v3 Archetype resolution from axis scores
    if (Object.keys(scores).length >= 5) {
      setArchetypeResult(resolveArchetype(scores));

      // Three Mirror: Compute dual archetype with simulated objective scores
      // In real mode, objective scores come from three-mirror integration
      // For preview, simulate meaningful behavioral divergence
      const objectiveScores: Partial<Record<TraitAxisKey, number>> = {};
      for (const [key, val] of Object.entries(scores) as [TraitAxisKey, number][]) {
        // Simulate behavioral/projection data differing from self-report
        // Use deterministic hash to create realistic divergence patterns
        const hash = Array.from(key).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
        const noise = Math.sin(hash * 0.73) * 0.4; // larger divergence for demo
        objectiveScores[key] = Math.max(-1, Math.min(1, val + noise));
      }

      const dualResult = resolveArchetypeDual(scores, objectiveScores);
      setDualArchetypeResult(dualResult);

      // Build contradiction map from mock three-mirror profile
      const mockProfile: Partial<ThreeMirrorProfile> = {};
      for (const [key, val] of Object.entries(scores) as [TraitAxisKey, number][]) {
        const objVal = objectiveScores[key] ?? val;
        const hash2 = Array.from(key).reduce((h, c) => ((h << 3) + h + c.charCodeAt(0)) | 0, 0);
        const shadowVal = val + Math.sin(hash2 * 1.17) * 0.45;
        mockProfile[key] = {
          axisId: key,
          selfPortrait: val,
          footprint: objVal,
          shadowPlay: Math.max(-1, Math.min(1, shadowVal)),
          counts: { selfPortrait: 5, footprint: 3, shadowPlay: 2 },
        } as MirrorAxisScore;
      }
      setContradictionMapData(buildContradictionMap(mockProfile));

      // Layer 4: Generative Core
      try {
        const coreResult = buildGenerativeCore(mockProfile, archetypeResult ?? undefined);
        setGenerativeCoreResult(coreResult);
      } catch (err) {
        console.warn("[Stargazer] GenerativeCore computation failed:", err);
      }

      // Layer 5: Metamorphosis Law (mock time series)
      try {
        const mockTimePoints: AxisTimePoint[] = [];
        const axisKeys = Object.keys(scores) as TraitAxisKey[];
        const times = ["morning", "afternoon", "night"];
        const contexts = ["friends", "work", "alone"];
        const energies = ["high_energy", "low_energy", "stressed", "relaxed"];

        for (let day = 0; day < 30; day++) {
          const date = new Date();
          date.setDate(date.getDate() - day);
          const dateStr = date.toISOString().split("T")[0];
          for (const axisId of axisKeys.slice(0, 8)) {
            const baseScore = scores[axisId] ?? 0;
            const noise = Math.sin(day * 0.7 + axisId.charCodeAt(0) * 0.13) * 0.2;
            mockTimePoints.push({
              axisId,
              score: Math.max(-1, Math.min(1, baseScore + noise)),
              date: dateStr,
              timeOfDay: times[day % 3],
              context: contexts[day % 3],
              energy: energies[day % 4],
            });
          }
        }
        setMetamorphosisResult(analyzeMetamorphosisLaw(mockTimePoints));
      } catch (err) {
        console.warn("[Stargazer] MetamorphosisLaw failed:", err);
      }

      // Innovative Mechanisms: Entropy Signature + Resonance
      try {
        const scoreHistory: Record<TraitAxisKey, number[]> = {} as Record<TraitAxisKey, number[]>;
        for (const [key, val] of Object.entries(scores) as [TraitAxisKey, number][]) {
          scoreHistory[key] = Array.from({ length: 5 }, (_, i) =>
            Math.max(-1, Math.min(1, val + Math.sin(i * 1.3 + key.charCodeAt(0) * 0.1) * 0.25)),
          );
        }
        setEntropySignature(computeEntropySignature(scoreHistory));

        const observedAxes = new Set(Object.keys(scores) as TraitAxisKey[]);
        setResonancePredictions(predictResonanceCascade(scores, observedAxes));
      } catch (err) {
        console.warn("[Stargazer] InnovativeMechanisms failed:", err);
      }

      // Innovative Mechanisms: Phantom Choice (mock hesitation data)
      try {
        const mockAnswerHistory = [
          { questionId: "q_introvert_1", chosenOptionId: "一人の時間が好き", responseTimeMs: 8200, optionChanges: ["みんなと一緒がいい", "一人の時間が好き"] },
          { questionId: "q_cautious_1", chosenOptionId: "慎重に進む", responseTimeMs: 12000, optionChanges: ["即決する", "少し考える", "慎重に進む"] },
          { questionId: "q_analytical_1", chosenOptionId: "直感で判断", responseTimeMs: 6500 },
          { questionId: "q_change_1", chosenOptionId: "変化を楽しむ", responseTimeMs: 9100, optionChanges: ["現状維持", "変化を楽しむ"] },
        ];
        setPhantomChoices(analyzePhantomChoices(mockAnswerHistory));
      } catch (err) {
        console.warn("[Stargazer] PhantomChoice failed:", err);
      }

      // Innovative Mechanisms: Temporal Diff (mock re-observation data)
      try {
        const axisKeys = Object.keys(scores) as TraitAxisKey[];
        const mockReobservations = axisKeys.slice(0, 4).map((axisId, i) => {
          const baseScore = scores[axisId] ?? 0;
          const scoreDelta = [0.15, -0.25, 0.05, 0.35][i];
          return {
            questionId: `reobs_${axisId}`,
            axisId,
            currentScore: Math.max(-1, Math.min(1, baseScore)),
            previousScore: Math.max(-1, Math.min(1, baseScore - scoreDelta)),
            currentDate: new Date().toISOString().split("T")[0],
            previousDate: new Date(Date.now() - (14 + i * 7) * 86400000).toISOString().split("T")[0],
          };
        });
        setTemporalDiffs(analyzeTemporalDiff(mockReobservations));
      } catch (err) {
        console.warn("[Stargazer] TemporalDiff failed:", err);
      }

      // Innovative Mechanisms: Meta-Observation (mock self-reflection data)
      try {
        const axisKeys = Object.keys(scores) as TraitAxisKey[];
        const mockReactions: MetaObservationInsight["reactionType"][] = [
          "validated", "surprised", "curious", "denied",
        ];
        const mockMetaInsights = axisKeys
          .sort((a, b) => Math.abs(scores[b] ?? 0) - Math.abs(scores[a] ?? 0))
          .slice(0, 3)
          .map((axisId, i) =>
            interpretMetaObservation(mockReactions[i], axisId, scores[axisId] ?? 0),
          );
        setMetaInsights(mockMetaInsights);
      } catch (err) {
        console.warn("[Stargazer] MetaObservation failed:", err);
      }

      // Innovative Mechanisms: Judgment Archaeology (mock elimination data)
      try {
        const axisKeys = Object.keys(scores) as TraitAxisKey[];
        const mockEliminationEvents = axisKeys.slice(0, 6).map((axisId, i) => ({
          questionId: `q_${axisId}_1`,
          eliminationOrder: [
            `option_${(i * 3) % 4 + 1}`,
            `option_${(i * 2 + 1) % 4 + 1}`,
            `option_${(i + 2) % 4 + 1}`,
          ],
          chosenOptionId: `option_${(i * 7) % 4 + 1}`,
          eliminationTimings: [
            600 + i * 200,            // 最初の排除は速い
            1800 + i * 400,           // 2番目はやや遅い
            4200 + (i % 3) * 1500,    // 最後の排除は最も遅い
          ],
          axisId,
        }));
        setJudgmentArchaeology(analyzeJudgmentArchaeology(mockEliminationEvents));
      } catch (err) {
        console.warn("[Stargazer] JudgmentArchaeology failed:", err);
      }

      // Predictive Clone (mock prediction from axis scores)
      try {
        setPredictiveCloneResult(buildPredictiveClone(scores));
      } catch (err) {
        console.warn("[Stargazer] PredictiveClone failed:", err);
      }

      // Stress Decay Curve (mock time-series recovery data)
      try {
        const days = 14;
        const dataPoints: StressDecayCurveData["dataPoints"] = [];
        // Simulate a stress event and recovery
        for (let d = 0; d < days; d++) {
          // Stress peaks at day 2, then gradually recovers
          const stressPeak = d < 2
            ? 0.3 + d * 0.35
            : Math.max(0.1, 1.0 * Math.exp(-(d - 2) * 0.25));
          const noise = Math.sin(d * 2.7) * 0.05;
          const stressLevel = Math.max(0, Math.min(1, stressPeak + noise));

          const energy: StressDecayCurveData["dataPoints"][0]["energy"] =
            stressLevel > 0.7 ? "stressed"
              : stressLevel > 0.5 ? "low_energy"
                : stressLevel > 0.3 ? "moderate"
                  : stressLevel > 0.15 ? "high_energy"
                    : "relaxed";

          const date = new Date(Date.now() - (days - d) * 86400000);
          dataPoints.push({
            dayLabel: `${date.getMonth() + 1}/${date.getDate()}`,
            stressLevel,
            energy,
            annotation: d === 2 ? "ストレスピーク" : d === days - 1 ? "回復" : undefined,
          });
        }
        setStressDecayCurve({
          dataPoints,
          recoveryPattern: "gradual",
          avgRecoveryDays: 5.2,
          resilience: 0.68,
          recoveryAccelerators: ["一人の時間", "睡眠の質", "自然との接触"],
          recoveryInhibitors: ["対人ストレスの継続", "睡眠不足"],
          interpretation:
            "漸近型の回復パターン。ストレスからの回復は着実だが緩やか。一人の時間と十分な休息が回復を加速させる傾向がある。",
        });
      } catch (err) {
        console.warn("[Stargazer] StressDecayCurve failed:", err);
      }
    }

    setIsLoading(false);
  }

  async function loadRealData() {
    applyEMAToAxisScores();
    autoCheckTransformationProgress();
    try {
      let res = await fetch("/api/stargazer/profile", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status === 401) {
          // 未ログイン → 匿名セッション作成を試行
          try {
            const { ensureAnonymousSession } = await import("@/lib/auth/anonymousAuth");
            const anonResult = await ensureAnonymousSession();
            if (anonResult.ok) {
              // 匿名セッション確立 → profile APIをリトライ
              const retryRes = await fetch("/api/stargazer/profile", { credentials: "include" });
              if (retryRes.ok) {
                // リトライ成功 → 通常のデータ処理パスに合流
                res = retryRes;
              } else {
                // リトライ失敗 → オンボーディング画面へ（匿名セッションは確立済み）
                setHasCompletedInitialObservation(false);
                setTotalObservations(0);
                setIsLoading(false);
                return;
              }
            } else if (anonResult.reason === "anonymous_disabled") {
              // Feature flag OFF → 先ログイン型
              setLoadError("unauthorized");
              setIsLoading(false);
              return;
            } else {
              // 匿名セッション作成失敗 → オンボーディング画面へ
              setHasCompletedInitialObservation(false);
              setTotalObservations(0);
              setIsLoading(false);
              return;
            }
          } catch (anonErr) {
            // ensureAnonymousSession 失敗 → オンボーディング画面へ
            setHasCompletedInitialObservation(false);
            setTotalObservations(0);
            setIsLoading(false);
            return;
          }
        } else {
          setLoadError("server");
          setIsLoading(false);
          return;
        }
      }
      const data = await res.json();
      // Prefer live computed axis scores over stale resolvedType data
      const scores = data.liveAxisScores || data.resolvedType?.axisScores || {};
      // Prefer actual observation count over potentially-reset total_sessions
      const total = data.actualObservationCount || data.observationStats?.totalAnswered || data.totalSessions || 0;

      // 前回のスコアを保存してから更新
      setAxisScores((prev) => {
        if (Object.keys(prev).length > 0) {
          setPreviousAxisScores(prev);
        }
        return scores;
      });
      setResolvedType(data.resolvedType?.archetypeCode || "");
      setTopMatches(data.resolvedType?.topMatches || []);
      setConfidence(data.resolvedType?.confidence || 0);
      setTotalObservations(total);
      setTodayObservationCount(data.todayObservationCount ?? 0);
      setHasCompletedInitialObservation(!!data.hasCompletedInitialObservation);
      if (data.isBetaTester) setIsBetaTester(true);
      if (data.cognitiveFit?.scores) setCognitiveFit(data.cognitiveFit.scores);
      // P4: 拡張軸データ
      if (data.expansionAxes) setExpansionAxes(data.expansionAxes);

      // 軸スコア履歴を localStorage に蓄積 + サーバーデータで補完 + state に反映
      try {
        const HISTORY_KEY = "stargazer_axis_history_v1";
        type HistEntry = { date: string; scores: Record<string, number>; events?: Array<{ type: "contradiction" | "milestone" | "shift"; label: string }> };
        let stored: HistEntry[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");

        // サーバーの timePoints から日別の平均スコアを構築し、ローカル履歴に補完
        if (data.timePoints && Array.isArray(data.timePoints) && data.timePoints.length > 0) {
          const byDate = new Map<string, Map<string, number[]>>();
          for (const tp of data.timePoints as Array<{ axisId: string; score: number; date: string }>) {
            const d = typeof tp.date === "string" ? tp.date.slice(0, 10) : "";
            if (!d) continue;
            if (!byDate.has(d)) byDate.set(d, new Map());
            const axisMap = byDate.get(d)!;
            if (!axisMap.has(tp.axisId)) axisMap.set(tp.axisId, []);
            axisMap.get(tp.axisId)!.push(tp.score);
          }
          for (const [date, axisMap] of byDate) {
            if (stored.some(e => e.date === date)) continue; // 既にあればスキップ
            const dayScores: Record<string, number> = {};
            for (const [axis, vals] of axisMap) {
              dayScores[axis] = vals.reduce((a, b) => a + b, 0) / vals.length;
            }
            if (Object.keys(dayScores).length > 0) {
              stored.push({ date, scores: dayScores });
            }
          }
          // 日付順にソート
          stored.sort((a, b) => a.date.localeCompare(b.date));
        }

        // 今日のエントリを追加/更新
        const today = getLocalDateString();
        if (Object.keys(scores).length > 0) {
          const existingIdx = stored.findIndex((e) => e.date === today);
          if (existingIdx >= 0) {
            stored[existingIdx].scores = { ...scores };
          } else {
            stored.push({ date: today, scores: { ...scores } });
          }
        }
        // 最大90日分保持
        while (stored.length > 90) stored.shift();
        safeSetItem(HISTORY_KEY, JSON.stringify(stored));
        setAxisHistory(stored);
      } catch { /* silent */ }

      // AI学習統計をDB予測精度データから構築（サーバー正規データを使用）
      try {
        if (data.predictionAccuracy) {
          const pa = data.predictionAccuracy as {
            overallAccuracy: number;
            totalPredictions: number;
            categoryAccuracy: Record<string, { accuracy: number; totalPredictions: number }>;
          };
          const categoryAccuracy: Record<string, { accuracy: number; totalPredictions: number; trend: "improving" | "stable" | "declining" }> = {};
          for (const [cat, stats] of Object.entries(pa.categoryAccuracy)) {
            categoryAccuracy[cat] = {
              ...stats,
              accuracy: normalizeAccuracyPercent(stats.accuracy),
              trend: "stable",
            };
          }
          setAiLearningStats({
            categoryAccuracy,
            overallAccuracy: normalizeAccuracyPercent(pa.overallAccuracy),
            observationCount: total,
          });
        } else {
          // DB にまだデータがない場合、ローカル予測をフォールバック
          const predictions = loadPredictions(50);
          const verified = predictions.filter(p => p.verified);
          if (verified.length > 0) {
            const catMap: Record<string, { correct: number; total: number }> = {};
            for (const p of verified) {
              if (!catMap[p.category]) catMap[p.category] = { correct: 0, total: 0 };
              catMap[p.category].total++;
              if (p.accurate === true) catMap[p.category].correct++;
            }
            const categoryAccuracy: Record<string, { accuracy: number; totalPredictions: number; trend: "improving" | "stable" | "declining" }> = {};
            for (const [cat, stats] of Object.entries(catMap)) {
              categoryAccuracy[cat] = {
                accuracy: normalizeAccuracyPercent(stats.total > 0 ? stats.correct / stats.total : 0),
                totalPredictions: stats.total,
                trend: "stable",
              };
            }
            setAiLearningStats({
              categoryAccuracy,
              overallAccuracy: normalizeAccuracyPercent(
                verified.filter(p => p.accurate === true).length / verified.length,
              ),
              observationCount: total,
            });
          }
        }
      } catch { /* silent */ }
      if (data.resolvedType?.contextFaces)
        setContextScores(data.resolvedType.contextFaces);

      // stateFaces: エネルギー状態別の軸スコアをcontextScoresにマージ
      if (data.stateFaces && typeof data.stateFaces === "object") {
        setContextScores((prev) => {
          const merged = { ...prev };
          for (const [stateKey, stateScores] of Object.entries(data.stateFaces)) {
            merged[`state:${stateKey}` as string] = stateScores as Partial<Record<TraitAxisKey, number>>;
          }
          return merged;
        });
      }

      const cards = deriveTraitCards(scores, {}, total);
      setTraitCards(cards);
      setUnobservedAreas(getUnobservedAreas(scores));
      const diffs = data.resolvedType?.contextFaces
        ? detectContextDifferences(data.resolvedType.contextFaces)
        : [];
      setContextDiffs(diffs);

      const today = getLocalDateString();
      const archetypeLabel = data.archetypeResult?.name ?? null;
      setDailyGreeting(generateDailyGreeting(scores, null, total, today, archetypeLabel));
      const whisper = generateDailyWhisper(scores, cards, diffs, today);
      setDailyWhisper(whisper);
      // 新しいインサイト生成時にサウンド
      if (whisper) {
        playInsightReveal();
      }
      const newContradictions = detectContradictions(cards);
      setContradictions(newContradictions);
      // 矛盾検出時にサウンド + 触覚
      if (newContradictions.length > 0 && contradictions.length === 0) {
        playContradictionFound();
        haptics.playPattern("contradiction_found");
      }
      setContextNarratives(generateContextNarratives(diffs));
      // 相手タブ: data.contextProfiles から実データ取得（二重fetchを排除）
      if (data.contextProfiles) {
        applyContextProfiles(data.contextProfiles);
      } else {
        setPartners([]);
      }

      // Fluctuation engine data
      if (data.fluctuation) {
        setFluctuationData(data.fluctuation);
      }

      // v3 Archetype resolution (use server result if available, else compute client-side)
      // ローカル変数に保持して後続処理で参照（setState は非同期のため）
      let localArchetypeResult: ArchetypeResult | null = null;
      if (data.archetypeResult) {
        localArchetypeResult = data.archetypeResult;
        setArchetypeResult(data.archetypeResult);
      } else if (Object.keys(scores).length >= 5) {
        localArchetypeResult = resolveArchetype(scores);
        setArchetypeResult(localArchetypeResult);
      }

      // ── Three Mirror: 実データから三面鏡プロファイルを構築 ──
      if (Object.keys(scores).length >= 5) {
        try {
          // Client-side: 既存の自画像スコア + localStorage Footprint + Shadow Play snapshots
          const mirrorProfile = buildClientThreeMirrorProfile(scores);
          const { subjective, objective } = buildDualAxisScores(mirrorProfile);
          const dualResult = resolveArchetypeDual(subjective, objective);
          setDualArchetypeResult(dualResult);
          setContradictionMapData(buildContradictionMap(mirrorProfile));

          // Layer 4: Generative Core
          try {
            const coreResult = buildGenerativeCore(mirrorProfile, localArchetypeResult ?? undefined);
            setGenerativeCoreResult(coreResult);
          } catch (coreErr) {
            console.warn("[Stargazer] GenerativeCore computation failed:", coreErr);
          }
        } catch (mirrorErr) {
          console.warn("[Stargazer] Three-mirror computation failed:", mirrorErr);
        }
      }

      // Layer 5: Metamorphosis Law (from real snapshots if available)
      if (data.timePoints && data.timePoints.length >= 10) {
        try {
          setMetamorphosisResult(analyzeMetamorphosisLaw(data.timePoints));
        } catch (err) {
          console.warn("[Stargazer] MetamorphosisLaw failed:", err);
        }
      }

      // Innovative Mechanisms
      if (Object.keys(scores).length >= 3) {
        try {
          // Entropy Signature from score history (if available)
          if (data.axisScoreHistory) {
            setEntropySignature(computeEntropySignature(data.axisScoreHistory));
          }
          // Resonance predictions
          const observedAxes = new Set(Object.keys(scores) as TraitAxisKey[]);
          setResonancePredictions(predictResonanceCascade(scores, observedAxes));
        } catch (err) {
          console.warn("[Stargazer] InnovativeMechanisms failed:", err);
        }
      }

      // ── Temporal Diff: API の再観測履歴から算出 ──
      if (data.reobservationHistory && data.reobservationHistory.length > 0) {
        try {
          const reobs = data.reobservationHistory.map(
            (r: { axisId: string; currentScore: number; previousScore: number; currentDate: string; previousDate: string }) => ({
              questionId: `reobs_${r.axisId}`,
              axisId: r.axisId as TraitAxisKey,
              currentScore: r.currentScore,
              previousScore: r.previousScore,
              currentDate: r.currentDate,
              previousDate: r.previousDate,
            }),
          );
          setTemporalDiffs(analyzeTemporalDiff(reobs));
        } catch (err) {
          console.warn("[Stargazer] TemporalDiff failed:", err);
        }
      }

      // ── Client-side localStorage データ読み出し ──
      if (typeof window !== "undefined") {
        // 1. Predictive Clone（軸スコアから常時算出可能）
        if (Object.keys(scores).length >= 5) {
          try {
            setPredictiveCloneResult(buildPredictiveClone(scores));
          } catch (err) {
            console.warn("[Stargazer] PredictiveClone failed:", err);
          }
        }

        // 2. Meta-Observation（localStorageから読み出し）
        try {
          const metaKey = "culcept_sg_meta_observations_v1";
          const rawMeta = localStorage.getItem(metaKey);
          if (rawMeta) {
            const storedInsights: MetaObservationInsight[] = JSON.parse(rawMeta);
            if (storedInsights.length > 0) {
              setMetaInsights(storedInsights);
            }
          }
        } catch { /* silent */ }

        // 3. Phantom Choice（選択肢変更履歴から分析）
        try {
          const interactionKey = "culcept_sg_answer_interactions_v1";
          const rawInteractions = localStorage.getItem(interactionKey);
          if (rawInteractions) {
            const interactions = JSON.parse(rawInteractions);
            if (interactions.length > 0) {
              setPhantomChoices(analyzePhantomChoices(interactions));
            }
          }
        } catch { /* silent */ }

        // 4. Judgment Archaeology（排除イベントから分析）
        try {
          const elimKey = "culcept_sg_elimination_events_v1";
          const rawElim = localStorage.getItem(elimKey);
          if (rawElim) {
            const events = JSON.parse(rawElim);
            if (events.length >= 3) {
              setJudgmentArchaeology(analyzeJudgmentArchaeology(events));
            }
          }
        } catch { /* silent */ }

        // 5. Stress Decay Curve（日次エネルギー履歴から構築）
        try {
          const energyKey = "culcept_sg_daily_energy_v1";
          const rawEnergy = localStorage.getItem(energyKey);
          if (rawEnergy) {
            const energyHistory: { date: string; energy: string; emotion: string }[] =
              JSON.parse(rawEnergy);
            if (energyHistory.length >= 5) {
              const stressMap: Record<string, number> = {
                stressed: 0.95,
                low_energy: 0.7,
                moderate: 0.45,
                high_energy: 0.2,
                relaxed: 0.1,
              };
              const dataPoints: StressDecayCurveData["dataPoints"] = energyHistory
                .slice(-30)
                .map((entry) => {
                  const d = new Date(entry.date);
                  const stressLevel = stressMap[entry.energy] ?? 0.5;
                  const energy: StressDecayCurveData["dataPoints"][0]["energy"] =
                    stressLevel > 0.7 ? "stressed"
                      : stressLevel > 0.5 ? "low_energy"
                        : stressLevel > 0.3 ? "moderate"
                          : stressLevel > 0.15 ? "high_energy"
                            : "relaxed";
                  return {
                    dayLabel: `${d.getMonth() + 1}/${d.getDate()}`,
                    stressLevel,
                    energy,
                  };
                });

              // 回復パターンを推定
              const stressLevels = dataPoints.map((d) => d.stressLevel);
              const maxIdx = stressLevels.indexOf(Math.max(...stressLevels));
              const afterPeak = stressLevels.slice(maxIdx);
              let recoveryPattern: StressDecayCurveData["recoveryPattern"] = "gradual";
              if (afterPeak.length >= 3) {
                const diffs = afterPeak.slice(1).map((v, i) => afterPeak[i] - v);
                const posCount = diffs.filter((d) => d > 0.05).length;
                const negCount = diffs.filter((d) => d < -0.05).length;
                if (posCount > 0 && negCount > posCount * 0.5) {
                  recoveryPattern = "oscillating";
                } else if (diffs.some((d) => d > 0.25)) {
                  recoveryPattern = "elastic";
                } else {
                  // Check for stepwise: large jumps
                  const largeDrops = diffs.filter((d) => d > 0.15).length;
                  recoveryPattern = largeDrops >= 2 ? "stepwise" : "gradual";
                }
              }

              const avgRecovery = afterPeak.length > 1
                ? afterPeak.reduce((s, v) => s + v, 0) / afterPeak.length
                : 0.5;
              const resilience = Math.max(0, Math.min(1, 1 - avgRecovery));

              const patternLabels: Record<string, string> = {
                elastic: "弾性型 — ストレスから速やかに回復する",
                gradual: "漸近型 — ゆっくりと着実に回復する",
                stepwise: "階段型 — 段階的に回復する",
                oscillating: "振動型 — 上下を繰り返しながら回復する",
              };

              setStressDecayCurve({
                dataPoints,
                recoveryPattern,
                avgRecoveryDays: afterPeak.length > 1 ? afterPeak.length * 0.7 : 0,
                resilience,
                recoveryAccelerators: [],
                recoveryInhibitors: [],
                interpretation: patternLabels[recoveryPattern] ?? "",
              });
            }
          }
        } catch { /* silent */ }

        // 6. Footprint分析パイプライン
        try {
          const footprints = getStoredFootprints();
          if (footprints.length >= 5) {
            const patterns = aggregateFootprints(footprints);
            const footprintScores = footprintPatternsToAxisScores(patterns);
            if (footprintScores.length > 0) {
              console.log(
                `[Stargazer] Footprint: ${footprintScores.length} axis contributions from ${footprints.length} signals`,
              );
              // 足跡スコアは三面鏡プロファイルの "footprint" 鏡に自動反映される
              // （buildClientThreeMirrorProfile が localStorage から読むため）
            }
          }
        } catch { /* silent */ }
      }
    } catch (err) {
      console.error("[Stargazer] loadRealData failed:", err);
      setLoadError("network");
    }
    setIsLoading(false);
  }

  // Load data
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preview = params.get("preview") === "1";
    setPreviewMode(preview);

    queueMicrotask(() => {
      if (preview) {
        loadPreviewData();
      } else {
        void loadRealData();
      }
    });
  }, []);

  // v4 アーキタイプからTypeDefLikeを構築（旧タイプシステムは廃止）
  const typeDef: TypeDefLike | null = archetypeResult
    ? (() => {
        const ad = getArchetypeByCode(archetypeResult.code);
        if (!ad) return null;
        return {
          code: ad.code,
          label: ad.name,
          emoji: ad.emoji,
          description: ad.description,
          keywords: ad.strengths,
          visual: {
            role: ad.englishName,
            impression: [ad.tagline],
            palette: [],
            oneLine: ad.tagline,
          },
        };
      })()
    : null;
  // hasData: 初期観測（オンボーディング）が完了しているかどうか。
  // daily_observation や home_bridge 経由の観測だけでは true にならない。
  // オンボーディング10問のみの場合は初回観測未完了として扱う
  const hasData = hasCompletedInitialObservation && totalObservations > 10;
  const archetypeDef = archetypeResult
    ? getArchetypeByCode(archetypeResult.code)
    : null;

  // Retention: record observation only when user actually observed today
  useEffect(() => {
    if (todayObservationCount > 0) {
      recordObservation();
    }
  }, [todayObservationCount]);

  // Cross-feature recommendation: triggered by onFirstObservationSaved callback
  const handleFirstObservationSaved = useCallback(() => {
    if (crossRecoShown) return;
    if (typeof window !== "undefined" && localStorage.getItem("aneurasync_sg_cross_reco_shown") === "1") return;
    // Delay to let user see their results first
    setTimeout(() => {
      setCrossRecoReady(true);
    }, 3000);
  }, [crossRecoShown]);

  // Streak intelligence: update level progress when observations change
  useEffect(() => {
    if (!hasData) return;
    import("@/lib/stargazer/streakIntelligence").then(({ recordDailyObservation }) => {
      recordDailyObservation({
        questionCount: totalObservations,
        newContradictions: contradictions.length,
        axisCoverage: Object.keys(axisScores).length,
        averageResponseTimeMs: 5000, // デフォルト基準値
        hadAnswerChanges: totalObservations > 1,
      });
    }).catch(() => { /* non-critical */ });
  }, [hasData, totalObservations, contradictions.length, axisScores]);

  // Compute available V4 features from depthPhaseController state
  const [availableV4Features, setAvailableV4Features] = useState<Set<V4Feature>>(new Set());
  useEffect(() => {
    // Dynamically import to avoid circular deps — resolvePhaseState is lightweight
    import("@/lib/stargazer/depthPhaseController").then(({ resolvePhaseState }) => {
      let firstDate: string | Date | undefined;
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("sg_first_observation");
        firstDate = stored || new Date().toISOString();
      }
      const state = resolvePhaseState({
        firstObservationDate: firstDate || new Date().toISOString(),
        totalObservations,
      });
      const available = new Set<V4Feature>(
        state.features
          .filter((f) => f.access !== "locked")
          .map((f) => f.feature),
      );
      setAvailableV4Features(available);
    }).catch(() => {});
  }, [totalObservations]);

  // TraitEvolution: fetch trajectory snapshots and compute change stage (lazy, trajectory tab only)
  useEffect(() => {
    if (!hasData || activeTab !== "trajectory") return;
    if (traitEvolutionData) return; // already loaded
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stargazer/trajectory?days=90");
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (cancelled || !json.ok) return;

        const dateMap = new Map<string, { scores: Partial<Record<TraitAxisKey, number>>; count: number }>();
        for (const traj of json.trajectories || []) {
          for (const pt of traj.dataPoints || []) {
            const entry = dateMap.get(pt.date) ?? { scores: {}, count: 0 };
            entry.scores[traj.axisId as TraitAxisKey] = pt.score;
            entry.count++;
            dateMap.set(pt.date, entry);
          }
        }

        const snapshots: TraitSnapshot[] = Array.from(dateMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, { scores, count }]) => ({
            date,
            axisScores: scores,
            totalObservations: count,
          }));

        if (!cancelled && snapshots.length >= 2) {
          setTraitEvolutionData(analyzeTraitEvolution(snapshots));
        }
      } catch {
        // Silently fail — evolution is optional enrichment
      }
    })();
    return () => { cancelled = true; };
  }, [hasData, activeTab, traitEvolutionData]);

  // Understanding Meter: calculate and persist
  useEffect(() => {
    if (!hasData) return;
    try {
      const existing = loadUnderstandingLevel();
      const level = calculateUnderstanding({
        totalObservations,
        axisScores: axisScores as Record<string, number>,
        contradictionCount: contradictions.length,
        lastObservationTimestamp: existing?.lastObservationAt as number ?? Date.now(),
        sessionCount: Math.max(1, Math.floor(totalObservations / 5)),
        daysActive: existing ? Math.max(1, Math.floor((Date.now() - existing.lastObservationAt) / 86400000) + 1) : 1,
      });
      setUnderstandingLevel(level);
      saveUnderstandingLevel(level);
    } catch {
      // silent — understanding meter is non-critical
    }
  }, [hasData, totalObservations, axisScores, contradictions.length]);

  // Prediction Engine: generate today's prediction + load pending verifications
  useEffect(() => {
    if (!hasData || Object.keys(axisScores).length < 1) return;
    try {
      const previous = loadPredictions(10);
      const accuracy = calculateAccuracy(previous);
      setPredictionAccuracy(accuracy.accuracyRate);

      // Compute accuracy trend from recent verified predictions
      try {
        const recentAccValues = previous
          .filter(p => p.verified)
          .slice(-5)
          .map(p => p.accurate ? 100 : 0);
        setPredictionAccuracyTrend(getAccuracyTrend(recentAccValues));
      } catch { /* silent */ }

      // Generate today's prediction if not exists
      if (!hasTodayPrediction()) {
        const prediction = generateDailyPrediction({
          axisScores: axisScores as Record<string, number>,
          observationCount: totalObservations,
          dayOfWeek: new Date().getDay(),
          previousPredictions: previous,
        });
        savePrediction(prediction);
        setTodayPrediction(prediction);
      } else {
        // Load today's existing prediction by deterministic ID
        const dateStr = new Date().toISOString().split("T")[0];
        const todayPred = previous.find(
          (p) => p.id === `pred_daily_${dateStr}`,
        );
        if (todayPred) {
          setTodayPrediction(todayPred);
        } else {
          // previous was limited to 10; reload all to find today's
          const all = loadPredictions();
          const found = all.find((p) => p.id === `pred_daily_${dateStr}`);
          if (found) setTodayPrediction(found);
        }
      }

      // Load pending verifications from previous days (exclude already verified)
      setPendingVerifications(getPendingVerifications());
    } catch {
      // silent — prediction engine is non-critical
    }
  }, [hasData, axisScores, totalObservations]);

  // Revision Engine: check for unacknowledged revisions
  useEffect(() => {
    if (!hasData) return;
    try {
      const revisions = getUnacknowledgedRevisions();
      setUnacknowledgedRevisions(revisions);
    } catch {
      // silent
    }
  }, [hasData]);

  // Alter Afterglow: check for scheduled messages
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const msg = getScheduledAfterglow();
      if (msg && msg.showAt <= Date.now()) {
        setAfterglowMessage(msg);
      }
    } catch {
      // silent
    }
  }, []);

  // Weekly Report: generate/load on data ready
  useEffect(() => {
    if (!hasData || Object.keys(axisScores).length < 1) return;
    try {
      // Check for existing report first
      const existing = loadWeeklyReport();
      if (existing) {
        setWeeklyReport(existing);
      }
      // Generate fresh report (always update with latest data)
      const streakKey = "culcept_sg_streak_days_v1";
      let streakDays = 0;
      try {
        streakDays = Number(localStorage.getItem(streakKey) || "0");
      } catch { /* silent */ }
      // ストリークマイルストーン到達時にサウンド (7, 14, 30, 60, 100日)
      const STREAK_MILESTONES = [7, 14, 30, 60, 100];
      if (STREAK_MILESTONES.includes(streakDays)) {
        const milestoneShownKey = `sg_streak_milestone_shown_${streakDays}`;
        if (!localStorage.getItem(milestoneShownKey)) {
          playStreakMilestone();
          haptics.success();
          safeLSSet(milestoneShownKey, "1");
        }
      }

      // Gather dream/events/hexaflex data from localStorage directly (avoid heavy imports)
      let dreamHighlight: { archetype: string; frequency: number } | undefined;
      let lifeEventCount: number | undefined;
      let hexaflexWeakest: string | undefined;
      try {
        const dreamsRaw = localStorage.getItem("stargazer_dreams_v1");
        if (dreamsRaw) {
          const dreams: Array<{ detectedSymbols?: Array<{ archetype: string }> }> = JSON.parse(dreamsRaw);
          if (dreams.length > 0) {
            const counts: Record<string, number> = {};
            for (const d of dreams) { for (const s of d.detectedSymbols ?? []) { counts[s.archetype] = (counts[s.archetype] || 0) + 1; } }
            const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
            if (top) dreamHighlight = { archetype: top[0], frequency: top[1] };
          }
        }
      } catch { /* silent */ }
      try {
        const eventsRaw = localStorage.getItem("stargazer_life_events_v1");
        if (eventsRaw) { lifeEventCount = JSON.parse(eventsRaw).length || undefined; }
      } catch { /* silent */ }
      try {
        const ACT_PROCESS_NAMES: Record<string, string> = {
          acceptance: "アクセプタンス", defusion: "脱フュージョン",
          present_moment: "今この瞬間", self_as_context: "文脈としての自己",
          values: "価値", committed_action: "コミットされた行為",
        };
        // Read hexaflex from cached result if available
        const hexRaw = localStorage.getItem("stargazer_hexaflex_v1");
        if (hexRaw) {
          const hex: { scores: Array<{ process: string; score: number }> } = JSON.parse(hexRaw);
          const sorted = [...hex.scores].sort((a, b) => a.score - b.score);
          if (sorted[0]) hexaflexWeakest = ACT_PROCESS_NAMES[sorted[0].process] ?? sorted[0].process;
        }
      } catch { /* silent */ }

      const report = generateWeeklyReport({
        axisScores: axisScores as Record<string, number>,
        observationCount: totalObservations,
        weeklyObservationCount: Math.min(totalObservations, 12),
        contradictionCount: contradictions.length,
        predictionAccuracy,
        streakDays,
        dreamHighlight,
        lifeEventCount,
        hexaflexWeakest,
      });
      setWeeklyReport(report);
      saveWeeklyReport(report);
    } catch {
      // silent — weekly report is non-critical
    }
  }, [hasData, axisScores, totalObservations, contradictions.length, predictionAccuracy]);

  // Build overlay queue after mount (delay for page settle)
  // All overlay eligibility checks happen HERE, atomically inside the timer.
  // This avoids React Strict Mode double-mount issues with refs going stale.
  useEffect(() => {
    const timer = setTimeout(() => {
      const queue: Array<"microEMA" | "tabTour" | "featureUnlock"> = [];

      // Micro-EMA: check + mark atomically (max 2/day, 4h apart)
      try {
        const shouldShow = microEMAShouldPromptAndMark();
        if (shouldShow) {
          setMicroEMAQuestion(microEMAGetNextQuestion());
          queue.push("microEMA");
        }
      } catch { /* non-critical */ }

      // ③ Stargazer tab tour は廃止（CEO指示 2026-04-04）
      // FeatureIntroduction は他の機能ページでのみ使用する
      // try {
      //   const introSeen = localStorage.getItem("aneurasync_guide_stargazer_seen") === "1";
      //   const tourDone = localStorage.getItem("aneurasync_tabtour_stargazer_done") === "1";
      //   if (!introSeen || !tourDone) {
      //     queue.push("tabTour");
      //   }
      // } catch { /* silent */ }

      // featureUnlock is added dynamically when triggered
      if (queue.length > 0) {
        setOverlayQueue(queue);
        setActiveOverlay(queue[0]);
      }
    }, 1800);
    return () => clearTimeout(timer);
  }, []);

  // Auto-scroll: ページロード時にタブナビ+コンテンツが画面最上部に来るようスクロール
  useEffect(() => {
    // ③ Stargazer tab tour 廃止済み — auto-scroll は常に実行
    const timer = setTimeout(() => {
      if (tabBarRef.current) {
        tabBarRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [hasData]); // hasData が確定したらスクロール

  // System connection summary
  // connectionSummary 廃止（CEO指示 #6 2026-04-11 — システム接続バッジ削除）
  const activeTabDef = TABS.find((tab) => tab.key === activeTab) ?? TABS[0];

  // Build TodayPrioritizerInput for TodaySummaryCard
  const todayPrioritizerInput = useMemo<TodayPrioritizerInput | null>(() => {
    if (!hasData) return null;
    let streakDays = 0;
    let daysSinceLastObs = 0;
    let hasVanishing = false;
    let vanishingExpiresAt: number | undefined;
    try {
      const sd = getEnhancedStreakData();
      streakDays = sd.currentStreak;
    } catch { /* silent */ }
    try {
      const lastKey = "sg_last_observation_date";
      const last = typeof window !== "undefined" ? localStorage.getItem(lastKey) : null;
      if (last) {
        const diff = Date.now() - new Date(last).getTime();
        daysSinceLastObs = Math.floor(diff / (1000 * 60 * 60 * 24));
      } else {
        daysSinceLastObs = 999;
      }
    } catch { /* silent */ }
    try {
      const vi = getActiveVanishingInsight();
      if (vi) {
        hasVanishing = true;
        vanishingExpiresAt = vi.expiresAt;
      }
    } catch { /* silent */ }

    return {
      understandingLevel,
      todayPrediction,
      pendingVerifications,
      revisions: unacknowledgedRevisions,
      afterglowMessage,
      totalObservations,
      axisScores: axisScores as Record<string, number>,
      contradictionCount: contradictions.length,
      streakDays,
      daysSinceLastObservation: daysSinceLastObs,
      hasVanishingInsight: hasVanishing,
      vanishingInsightExpiresAt: vanishingExpiresAt,
      predictionAccuracy,
    };
  }, [
    hasData, understandingLevel, todayPrediction, pendingVerifications,
    unacknowledgedRevisions, afterglowMessage, totalObservations,
    axisScores, contradictions.length, predictionAccuracy,
  ]);

  if (isLoading) {
    return <StargazerLoading variant="observe" />;
  }

  // ── 初回ユーザー: シェルを表示せず ObserveTab（→ OnboardingOrchestrator）から直接開始 ──
  if (!hasData && !loadError) {
    return (
      <ObserveTab
        hasData={false}
        axisScores={axisScores}
        totalObservations={totalObservations}
        typeDef={typeDef}
        greeting={dailyGreeting}
        whisper={dailyWhisper}
        onDataRefresh={() => loadRealData()}
        onFirstObservationSaved={handleFirstObservationSaved}
        previewMode={previewMode}
      />
    );
  }

  if (loadError) {
    const messages: Record<string, { title: string; body: string; action?: string }> = {
      unauthorized: {
        title: "観測にはログインが必要です",
        body: "観測を始めるには、まずサインインしてください。",
        action: "/login",
      },
      server: {
        title: "しばらくしてからもう一度試してね",
        body: "しばらく時間をおいて、もう一度お試しください。",
      },
      network: {
        title: "通信が途切れました",
        body: "ネットワーク接続を確認して、もう一度お試しください。",
      },
    };
    const msg = messages[loadError] ?? messages.network;
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <motion.div
          className="text-center space-y-5 max-w-sm"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
        >
          <div className="relative w-20 h-20 mx-auto">
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(160,150,200,0.08), transparent)",
                border: "1px dashed rgba(160,150,200,0.15)",
              }}
              animate={prefersReducedMotion ? {} : { scale: [1, 1.05, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.span
                style={{ fontSize: "1.6rem" }}
                animate={prefersReducedMotion ? {} : { opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              >
                {loadError === "unauthorized" ? "\uD83D\uDD2D" : "\u2728"}
              </motion.span>
            </div>
          </div>
          <div>
            <h2
              className="font-display text-base font-medium mb-2"
              style={{ color: "var(--sg-text-primary, rgba(22,28,48,0.85))" }}
            >
              {msg.title}
            </h2>
            <p
              className="text-sm leading-7"
              style={{ color: "var(--sg-text-muted, rgba(100,105,130,0.6))" }}
            >
              {msg.body}
            </p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            {msg.action ? (
              <motion.a
                href={msg.action}
                className="inline-block px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: "rgba(22,28,48,0.9)",
                  color: "rgba(255,255,255,0.95)",
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                ログイン
              </motion.a>
            ) : (
              <motion.button
                onClick={() => {
                  setLoadError(null);
                  setIsLoading(true);
                  void loadRealData();
                }}
                className="inline-block px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: "rgba(22,28,48,0.06)",
                  color: "rgba(22,28,48,0.8)",
                  border: "1px solid rgba(22,28,48,0.08)",
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                もう一度試す
              </motion.button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <ArchetypeThemeProvider archetypeCode={archetypeResult?.code ?? null}>
    <div className="min-h-screen pb-24 sg-scroll-container overflow-y-auto">
      <Suspense fallback={null}><AlterContextBanner page="stargazer" /></Suspense>
      {/* Persistent Streak & Engagement Bar */}
      {hasData && (
        <PersistentStreakBar
          predictionAccuracy={predictionAccuracy}
          accuracyTrend={predictionAccuracyTrend}
        />
      )}

      {/* Micro-EMA Overlay — only when it's the active overlay */}
      {activeOverlay === "microEMA" && microEMAQuestion && (
        <MicroEMAPrompt
          question={microEMAQuestion}
          onComplete={() => advanceOverlay()}
          onDismiss={() => advanceOverlay()}
        />
      )}

      {/* Milestone Celebration Overlay */}
      {activeMilestone !== null && (
        <MilestoneCelebration
          milestone={activeMilestone}
          onDismiss={() => {
            markMilestoneShown(activeMilestone).catch(() => {});
            setActiveMilestone(null);
          }}
        />
      )}

      {/* Feature Unlock Toast */}
      {activeOverlay === "featureUnlock" && activeUnlock && activeMilestone === null && (
        <FeatureUnlockToast
          feature={activeUnlock}
          onDismiss={() => {
            markUnlockNotified(activeUnlock.feature);
            setActiveUnlock(null);
            advanceOverlay();
          }}
          onNavigate={(featureName) => {
            markUnlockNotified(activeUnlock.feature);
            setActiveUnlock(null);
            advanceOverlay();
            const routeMap: Record<string, string> = {
              morning_question: "/stargazer",
              blind_spot: "/stargazer/blind-spot",
              ghost_resonance: "/stargazer/ghost",
              vanishing_insight: "/stargazer",
              alter_dialogue: "/stargazer/alter",
              prophecy: "/stargazer/prophecy",
              inner_weather: "/stargazer/weather",
              unseen_map: "/stargazer/unseen-map",
              psyche_signature: "/stargazer/signature",
            };
            const route = routeMap[featureName] || "/stargazer";
            window.location.href = route;
          }}
        />
      )}

      {/* Story Auto-trigger Toast — 70問到達時に1回だけ表示 */}
      <AnimatePresence>
        {showStoryToast && (
          <motion.div
            className="fixed bottom-24 left-4 right-4 z-40 flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: "rgba(10,10,26,0.92)", border: "1px solid rgba(255,255,255,0.1)" }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4 }}
          >
            <span className="text-lg">{archetypeResult?.emoji || "◆"}</span>
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.9)" }}>
                観測結果をまとめました
              </p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                タップして振り返る
              </p>
            </div>
            <button
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}
              onClick={() => {
                setShowStoryToast(false);
                handleTabChange("starmap");
              }}
            >
              見る
            </button>
            <button
              className="p-1"
              style={{ color: "rgba(255,255,255,0.3)" }}
              onClick={() => setShowStoryToast(false)}
              aria-label="閉じる"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Section — 廃止（CEO指示 2026-04-11） */}

      {/* Header — 縮小版（CEO指示 #6 2026-04-11） */}
      <header className="px-4 pt-2 pb-1">
        <div className="mx-auto max-w-6xl">
          <div
            className="card-hero"
            style={{ animation: "sg-fade-up 0.5s ease-out both", padding: "0.75rem 1rem" }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="sg-badge sg-badge-silver">
                <span className="sg-text-micro" style={{ fontSize: "0.62rem" }}>
                  現在
                </span>
                {activeTabDef.icon} {activeTabDef.label}
              </span>
              <span className="sg-badge sg-badge-silver">
                <span className="sg-text-micro" style={{ fontSize: "0.62rem" }}>
                  累計
                </span>
                {totalObservations} 観測
              </span>
              {archetypeDef && (
                <Link href={`/type/${archetypeDef.code}`} className="sg-badge sg-badge-gold hover:ring-2 hover:ring-amber-400/30 transition-all active:scale-95">
                  <span className="sg-text-micro" style={{ fontSize: "0.62rem" }}>
                    原型
                  </span>
                  <ArchetypeFigure
                    englishName={archetypeDef.englishName}
                    emoji={archetypeDef.emoji}
                    alt={archetypeDef.name}
                    containerClassName="h-4 w-4"
                    fallbackClassName="text-sm"
                    sizes="16px"
                  />
                  {archetypeDef.name}
                  <svg className="w-3 h-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ═══ Priority: MorningQuestion + Today's prediction — ヘッダー直下 ═══ */}
      <div className="px-4 pb-1">
        <div className="mx-auto max-w-6xl space-y-2">
          <MorningQuestion
            onAnswer={(questionId, answer, responseTimeMs) => {
              updateEngagementField("morningQuestionAnswered", true);
              fetch("/api/stargazer/observations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "morning_question",
                  answers: [{
                    variantId: questionId,
                    score: 0,
                    responseTimeMs,
                    optionId: answer,
                  }],
                }),
              }).catch((e) => console.warn("[MorningQuestion] DB save failed (non-fatal):", e));
            }}
            totalObservations={totalObservations}
          />

          {/* RV（関係性観測）導線 — 累計30回以上 & 未完了 */}
          {hasData && totalObservations >= 30 && (() => {
            const rvDone = typeof window !== "undefined" && localStorage.getItem("culcept_sg_rv_completed_v1") === "true";
            if (rvDone) return null;
            return (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-3"
                style={{
                  background: "rgba(160,150,210,0.06)",
                  border: "1px solid rgba(160,150,210,0.15)",
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">🔭</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold" style={{ color: "rgba(30,35,55,0.85)" }}>
                        関係性の深層観測
                      </p>
                      <p className="text-[10px] truncate" style={{ color: "rgba(60,65,85,0.5)" }}>
                        恋愛・友情・共創 — もう一人の自分を観測
                      </p>
                    </div>
                  </div>
                  <motion.button
                    onClick={() => { window.location.href = "/stargazer?rv=start"; }}
                    className="flex-shrink-0 px-3 py-1.5 text-[11px] font-semibold rounded-lg"
                    style={{
                      background: "rgba(160,150,210,0.12)",
                      border: "1px solid rgba(160,150,210,0.2)",
                      color: "rgba(80,75,110,0.9)",
                    }}
                    whileTap={{ scale: 0.95 }}
                  >
                    始める
                  </motion.button>
                </div>
              </motion.div>
            );
          })()}
        </div>
      </div>

      {/* Push Notification Permission Banner */}
      {totalObservations > 0 && (
        <PushPermissionBanner
          onGranted={() => {
            // 通知許可完了 — UIフィードバックは不要（バナーが自動的に消える）
          }}
          onDismissed={() => {
            // ユーザーが「あとで」を選択 — 7日後に再表示
          }}
        />
      )}

      {/* Tab Navigation */}
      <nav className="sticky top-0 z-30 px-4 pb-2">
        <div className="mx-auto max-w-6xl">
          <div
            ref={tabBarRef}
            role="tablist"
            aria-label="Stargazer ナビゲーションタブ"
            className="flex rounded-2xl p-1"
            style={{
              background: "#ffffff",
              border: "1px solid rgba(140,150,180,0.20)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`${tab.label}タブ: ${tab.sublabel}`}
                  onClick={() => handleTabChange(tab.key)}
                  className="relative flex-1 rounded-xl py-2 text-center transition-all duration-200"
                  style={{ minHeight: 44 }}
                >
                  {/* Active background */}
                  <div
                    className="absolute inset-0 rounded-xl transition-all duration-200"
                    style={{
                      background: isActive
                        ? "linear-gradient(135deg, #f8f5ee, #faf8f2)"
                        : "transparent",
                      border: isActive
                        ? "1px solid rgba(154,123,58,0.30)"
                        : "1px solid transparent",
                      boxShadow: isActive
                        ? "0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(154,123,58,0.12)"
                        : "none",
                    }}
                  />
                  {/* Gold underline for active */}
                  {isActive && (
                    <div
                      className="absolute bottom-1 left-1/2 -translate-x-1/2 h-[2.5px] w-10 rounded-full"
                      style={{
                        background: "linear-gradient(90deg, rgba(154,123,58,0.5), rgba(154,123,58,0.85), rgba(154,123,58,0.5))",
                      }}
                    />
                  )}
                  {/* Icon */}
                  <span
                    className="relative z-10 block text-base mb-0.5"
                    style={{
                      opacity: isActive ? 1 : 0.55,
                      filter: isActive ? "none" : "grayscale(0.4)",
                    }}
                  >
                    {tab.icon}
                  </span>
                  {/* Label */}
                  <span
                    className="relative z-10 font-display text-[0.9rem] font-medium block leading-none"
                    style={{
                      color: isActive
                        ? "rgba(16,22,42,0.98)"
                        : "rgba(60,66,90,0.72)",
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    {tab.label}
                  </span>
                  <span
                    className="relative z-10 font-mono-sg block mt-0.5"
                    style={{
                      fontSize: "0.64rem",
                      letterSpacing: "0.12em",
                      color: isActive
                        ? "rgba(100,80,38,0.92)"
                        : "rgba(80,86,110,0.52)",
                    }}
                  >
                    {tab.sublabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Tab Content */}
      <main className="px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mx-auto max-w-6xl"
          key={activeTab}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
        >
          {activeTab === "observe" && (
            <ObserveTabShell
              hasData={hasData}
              todayPrioritizerInput={todayPrioritizerInput}
              todayPrediction={todayPrediction}
              pendingVerifications={pendingVerifications}
              understandingLevel={understandingLevel}
              totalObservations={totalObservations}
              afterglowMessage={afterglowMessage}
              unacknowledgedRevisions={unacknowledgedRevisions}
              predictionAccuracy={predictionAccuracy}
              axisScores={axisScores}
              typeDef={typeDef}
              dailyGreeting={dailyGreeting}
              dailyWhisper={dailyWhisper}
              previewMode={previewMode}
              weeklyReport={weeklyReport}
              availableV4Features={availableV4Features}
              todayObservationCount={todayObservationCount}
              onDataRefresh={() => loadRealData()}
              onUpdatePredictionVerification={(id, feedback) => {
                try {
                  // XP: 予測検証 +20pt
                  updateEngagementField("predictionVerified", true);
                  updatePredictionVerification(id, feedback);
                  // 学習ループを更新: フィードバックから信頼度調整係数を再計算
                  updateLearningFromFeedback(id, feedback);
                  setTodayPrediction((prev) =>
                    prev
                      ? { ...prev, verified: true, userFeedback: feedback, accurate: feedback === "correct" }
                      : null,
                  );
                  setPendingVerifications((prev) =>
                    prev.filter((p) => p.id !== id),
                  );
                  const updated = loadPredictions(10);
                  const newAccRate = calculateAccuracy(updated).accuracyRate;
                  setPredictionAccuracy(newAccRate);
                  // 🎉 的中時の演出 + サウンド + 触覚フィードバック
                  if (feedback === "correct" && todayPrediction) {
                    const consecutiveHits = updated.filter(p => p.accurate).length;
                    setPredictionHitData({
                      prediction: todayPrediction.prediction,
                      newAccuracy: newAccRate,
                      category: todayPrediction.category,
                      consecutiveHits,
                    });
                    playPredictionVerified();
                    haptics.playPattern("prediction_verified");
                  }
                  // サーバー側の学習ループも非同期で更新
                  // （prophecy IDがUUID形式の場合のみ = サーバー生成の予測）
                  if (/^[0-9a-f-]{36}$/i.test(id)) {
                    fetch("/api/stargazer/prophecy-feedback", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ prophecyId: id, feedback }),
                    }).catch(() => {});
                  }
                } catch { /* silent */ }
              }}
              onAcknowledgeRevision={(revId) => {
                acknowledgeRevision(revId);
                setUnacknowledgedRevisions((prev) =>
                  prev.filter((r) => r.id !== revId),
                );
              }}
              onDismissAfterglow={() => {
                if (afterglowMessage) {
                  dismissAfterglow(afterglowMessage.id);
                  setAfterglowMessage(null);
                }
              }}
              onShowWeeklyReport={() => setShowWeeklyReport(true)}
              onNavigateTab={handleTabChange as (tabKey: string) => void}
              onFirstObservationSaved={handleFirstObservationSaved}
              rvStartMode={rvStartMode}
              existingProfile={hasData ? { resolvedType, axisScores: axisScores as Record<TraitAxisKey, number>, confidence, topMatches } : undefined}
              onRvFlowDone={() => {
                setRvStartMode(false);
                // Remove ?rv=start from URL without reload
                const url = new URL(window.location.href);
                url.searchParams.delete("rv");
                window.history.replaceState({}, "", url.pathname + url.search);
                loadRealData();
              }}
            />
          )}
          {activeTab === "starmap" && (

            <StargazerErrorBoundary tabName="アーキタイプ">
            <StarMapTab
              hasData={hasData}
              typeDef={typeDef}
              confidence={confidence}
              traitCards={traitCards}
              topMatches={topMatches}
              contradictions={contradictions}
              axisScores={axisScores}
              totalObservations={totalObservations}
              contextScores={contextScores}
              contextDiffs={contextDiffs}
              onNavigateToDeep={() => handleTabChange("deep")}
              onNavigateToObserve={() => handleTabChange("observe")}
              archetypeResult={archetypeResult}
              dualArchetypeResult={dualArchetypeResult}
              contradictionMap={contradictionMapData}
              generativeCoreResult={generativeCoreResult}
              predictiveCloneResult={predictiveCloneResult}
              todayPrioritizerInput={todayPrioritizerInput}
              weeklyReport={weeklyReport}
              onOpenWeeklyReport={() => setShowWeeklyReport(true)}
              previousAxisScores={previousAxisScores}
              axisHistory={axisHistory}
              aiLearningStats={aiLearningStats}
              todayObservationCount={todayObservationCount}
            />
            </StargazerErrorBoundary>

          )}
          {activeTab === "deep" && (() => {
            const whyInsights = buildWhyInsights({
              contradictionMap: contradictionMapData,
              generativeCore: generativeCoreResult,
              contextNarratives,
              contradictions,
              temporalDiffs,
              metamorphosis: metamorphosisResult,
              axisScores,
              totalObservations,
            });

            // Behavioral insights from stored signals
            let behavioralInsights: BehavioralInsight[] = [];
            try {
              const storedSignals = typeof window !== "undefined"
                ? JSON.parse(localStorage.getItem("stargazer_behavioral_sessions_v1") || "[]")
                : [];
              const flatSignals = Array.isArray(storedSignals)
                ? storedSignals.flatMap((s: { signals?: BehavioralInsight[] }) => s.signals || [])
                : [];
              if (flatSignals.length >= 5) {
                behavioralInsights = generateBehavioralInsights({
                  signals: flatSignals as never[],
                  axisScores: axisScores as Record<string, number>,
                  archetypeCode: archetypeResult?.code || "",
                });
              }
            } catch { /* graceful degradation */ }

            // Data quality score
            const observedAxesCount = Object.keys(axisScores).filter(
              (k) => axisScores[k as TraitAxisKey] !== undefined && axisScores[k as TraitAxisKey] !== 0
            ).length;
            const dataQuality = computeDataQuality({
              totalObservations,
              axisScores,
              observedAxesCount,
              daysSinceFirstObservation: totalObservations, // approximate
            });

            return (

            <StargazerErrorBoundary tabName="深層">
            <DeepTab
              hasData={hasData}
              contextNarratives={contextNarratives}
              contextDiffs={contextDiffs}
              contradictions={contradictions}
              unobservedAreas={unobservedAreas}
              axisScores={axisScores}
              totalObservations={totalObservations}
              entropySignature={entropySignature}
              resonancePredictions={resonancePredictions}
              phantomChoices={phantomChoices}
              metaInsights={metaInsights}
              judgmentArchaeology={judgmentArchaeology}
              whyInsights={whyInsights}
              archetypeResult={archetypeResult}
              dualArchetypeResult={dualArchetypeResult}
              behavioralInsights={behavioralInsights}
              dataQuality={dataQuality}
              isBetaTester={isBetaTester}
              expansionAxes={expansionAxes ?? undefined}
            />
            </StargazerErrorBoundary>

            );
          })()}
          {activeTab === "traits" && (

            <StargazerErrorBoundary tabName="特性">
            <TraitsTab
              hasData={hasData}
              axisScores={axisScores}
              cognitiveFit={cognitiveFit}
              traitCards={traitCards}
              typeDef={typeDef}
              contextDiffs={contextDiffs}
              contextScores={contextScores}
              totalObservations={totalObservations}
              archetypeResult={archetypeResult}
              dualArchetypeResult={dualArchetypeResult}
            />
            </StargazerErrorBoundary>

          )}
          {activeTab === "trajectory" && (

            <StargazerErrorBoundary tabName="軌跡">
            <TrajectoryTab
              hasData={hasData}
              totalObservations={totalObservations}
              axisScores={axisScores}
              confidence={confidence}
              typeDef={typeDef}
              fluctuation={fluctuationData}
              metamorphosis={metamorphosisResult}
              temporalDiffs={temporalDiffs}
              stressDecayCurve={stressDecayCurve}
              archetypeResult={archetypeResult}
              traitEvolution={traitEvolutionData}
              timePoints={axisHistory.flatMap(function(h) {
                return Object.entries(h.scores).map(function(entry) {
                  return { axisId: entry[0], score: entry[1], date: h.date };
                });
              })}
              previousAxisScores={previousAxisScores}
            />
            </StargazerErrorBoundary>

          )}
          {activeTab === "partner" && (

            <StargazerErrorBoundary tabName="相手">
            <PartnerTab
              hasData={hasData}
              axisScores={axisScores}
              partners={partners}
              contextScores={contextScores}
              onRefresh={refreshPartnerData}
            />
            </StargazerErrorBoundary>

          )}
        </motion.div>
      </main>

      {/* Weekly Report Overlay */}
      <AnimatePresence>
        {showWeeklyReport && weeklyReport && (
          <WeeklyReportViewer
            report={weeklyReport}
            onClose={() => setShowWeeklyReport(false)}
          />
        )}
      </AnimatePresence>

      {/* Prediction Hit Celebration Overlay */}
      <AnimatePresence>
        {predictionHitData && (
          <PredictionHitCelebration
            prediction={predictionHitData.prediction}
            newAccuracy={predictionHitData.newAccuracy}
            category={predictionHitData.category}
            consecutiveHits={predictionHitData.consecutiveHits}
            onDismiss={() => setPredictionHitData(null)}
          />
        )}
      </AnimatePresence>

      {/* Alter Letter Card — auto-fetches unread letters */}
      <AlterLetterCard autoFetch />

      {/* ③ Stargazer tab tour は廃止（CEO指示 2026-04-04）
      {(activeOverlay === "tabTour" || activeOverlay === null) && activeMilestone === null && (
        <FeatureIntroduction
          {...STARGAZER_INTRO}
          tabBarRef={tabBarRef}
          onComplete={(tab) => {
            if (activeOverlay === "tabTour") advanceOverlay();
            if (tab) handleTabChange(tab as TabKey);
          }}
        />
      )}
      */}

      {/* Cross-feature recommendation cards (after initial observation + 5min) */}
      <CrossFeatureRecoCards
        visible={crossRecoReady && !crossRecoShown}
        onNavigated={() => {
          safeLSSet("aneurasync_sg_cross_reco_shown", "1");
          setCrossRecoShown(true);
        }}
      />

    </div>
    {/* ── クイックアクセス（sg-scroll-container の外に配置 — contain:paint回避） ── */}
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <StargazerQuickAccess />
    </div>
    </ArchetypeThemeProvider>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ObserveTabShell — 情報密度を制御する観測タブのシェル
// TodaySummaryCard (1カード) + 観測本体 + 折りたたみ式追加情報
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ObserveTabShell({
  hasData,
  todayPrioritizerInput,
  todayPrediction,
  pendingVerifications,
  understandingLevel,
  totalObservations,
  afterglowMessage,
  unacknowledgedRevisions,
  predictionAccuracy,
  axisScores,
  typeDef,
  dailyGreeting,
  dailyWhisper,
  previewMode,
  weeklyReport,
  availableV4Features,
  onDataRefresh,
  onUpdatePredictionVerification,
  onAcknowledgeRevision,
  onDismissAfterglow,
  onShowWeeklyReport,
  onNavigateTab,
  todayObservationCount,
  onFirstObservationSaved,
  rvStartMode,
  existingProfile,
  onRvFlowDone,
}: {
  hasData: boolean;
  todayPrioritizerInput: TodayPrioritizerInput | null;
  todayPrediction: Prediction | null;
  pendingVerifications: Prediction[];
  understandingLevel: UnderstandingLevel | null;
  totalObservations: number;
  afterglowMessage: AfterglowMessage | null;
  unacknowledgedRevisions: Revision[];
  predictionAccuracy: number;
  axisScores: Partial<Record<TraitAxisKey, number>>;
  typeDef: TypeDefLike | null;
  dailyGreeting: DailyGreeting | null;
  dailyWhisper: DailyWhisper | null;
  previewMode: boolean;
  weeklyReport: WeeklyReport | null;
  availableV4Features: Set<V4Feature>;
  onDataRefresh: () => void;
  onUpdatePredictionVerification: (id: string, feedback: PredictionFeedback) => void;
  onAcknowledgeRevision: (revId: string) => void;
  onDismissAfterglow: () => void;
  onShowWeeklyReport: () => void;
  todayObservationCount: number;
  onNavigateTab?: (tabKey: string) => void;
  onFirstObservationSaved?: () => void;
  rvStartMode?: boolean;
  existingProfile?: { resolvedType: string; axisScores: Record<TraitAxisKey, number>; confidence: number; topMatches: { code: string; score: number }[] };
  onRvFlowDone?: () => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const [showStage2, setShowStage2] = useState(false);
  const [depthTransitioning, setDepthTransitioning] = useState(false);

  const observationDoneToday = todayObservationCount > 0;

  // Stage 2 Deep Probe — available when user has sufficient observations
  if (depthTransitioning) {
    return (
      <DepthTransition
        fromDepth="surface"
        toDepth="deep"
        onComplete={() => { setDepthTransitioning(false); setShowStage2(true); }}
      />
    );
  }

  if (showStage2 && totalObservations >= 10) {
    return (
      <Stage2Flow
        availableThemes={PROBE_THEMES}
        onThemeComplete={(result) => {
          console.log("[Stage2] Theme completed:", result.themeId);
        }}
        onAllComplete={(results) => {
          console.log("[Stage2] All themes completed:", results.length);
          setShowStage2(false);
          onDataRefresh();
        }}
        lightMode
      />
    );
  }

  return (
    <div className="space-y-5">

      {/* ═══ Priority 1: Completion badge (観測未完了時のHero CTAは廃止 — 重複排除) ═══ */}
      {observationDoneToday && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl px-4 py-3"
          style={{
            background: "linear-gradient(135deg, rgba(34,197,94,0.06), rgba(255,255,255,0.7))",
            border: "1px solid rgba(34,197,94,0.15)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "rgba(34,197,94,0.12)" }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.8)" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "rgba(20,25,45,0.85)" }}>
                今日の観測 完了
              </p>
            </div>
            <span
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
              style={{
                background: "rgba(34,197,94,0.1)",
                color: "rgba(34,150,76,0.9)",
                border: "1px solid rgba(34,197,94,0.15)",
              }}
            >
              {todayObservationCount}問回答
            </span>
          </div>
        </motion.div>
      )}

      {/* TodaySummaryMini — ヘッダーから移動（CEO指示 #6 2026-04-11） */}
      {hasData && todayPrioritizerInput && (
        <TodaySummaryMini
          input={todayPrioritizerInput}
          onNavigateTab={onNavigateTab as (tabKey: string) => void}
        />
      )}

      {/* ═══ Priority 3: Main observation interface + scrollable content ═══ */}
      <div id="sg-observe-interface">
        <ObserveTab
          hasData={hasData}
          axisScores={axisScores}
          totalObservations={totalObservations}
          typeDef={typeDef}
          greeting={dailyGreeting}
          whisper={dailyWhisper}
          onDataRefresh={onDataRefresh}
          onStartStage2={() => setDepthTransitioning(true)}
          onFirstObservationSaved={onFirstObservationSaved}
          previewMode={previewMode}
          rvStartMode={rvStartMode}
          existingProfile={existingProfile}
          onRvFlowDone={onRvFlowDone}
        />
      </div>

      {/* TodaySummary — secondary content always visible */}
      {hasData && (
        <TodaySummary
          todayPrediction={todayPrediction}
          pendingVerifications={pendingVerifications}
          understandingLevel={understandingLevel}
          totalObservations={totalObservations}
          afterglowMessage={afterglowMessage}
          revisions={unacknowledgedRevisions}
          predictionAccuracy={predictionAccuracy}
          axisScores={axisScores as Record<string, number>}
          onMorningAnswer={() => {}}
          onVerifyPrediction={onUpdatePredictionVerification}
          onAcknowledgeRevision={onAcknowledgeRevision}
          onDismissAfterglow={onDismissAfterglow}
          onReplyAfterglow={onDismissAfterglow}
        />
      )}

      {/* DailySummaryCard */}
      {hasData && <DailySummaryCard totalObservationsToday={todayObservationCount} />}

      {/* Expandable "もっと見る" — tertiary items */}
      {hasData && (
        <>
          {!showMore && (
            <motion.button
              onClick={() => setShowMore(true)}
              className="w-full py-4 rounded-2xl text-center text-sm font-medium transition-all"
              style={{
                background: "rgba(255,255,255,0.45)",
                border: "1px solid rgba(148,163,184,0.10)",
                color: "rgba(100,116,139,0.5)",
                minHeight: "48px",
              }}
              whileHover={{ scale: 1.01, background: "rgba(255,255,255,0.6)" }}
              whileTap={{ scale: 0.99 }}
            >
              もっと見る
              <svg
                className="inline-block ml-1.5 w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </motion.button>
          )}

          <AnimatePresence>
            {showMore && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden space-y-5"
              >
                {/* Pending prediction verifications */}
                {pendingVerifications.length > 0 && (
                  <PredictionVerificationFlow
                    predictions={pendingVerifications}
                    onVerify={onUpdatePredictionVerification}
                    accuracyRate={predictionAccuracy}
                  />
                )}

                {/* Alter link */}
                <motion.a
                  href="/stargazer/alter"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="block card-info transition-all active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">◎</span>
                        <span className="text-xs font-semibold" style={{ color: "rgba(99,75,150,0.9)" }}>Alter — もうひとりの自分</span>
                      </div>
                      <p className="text-[11px]" style={{ color: "rgba(100,116,139,0.7)" }}>
                        自分では気づけない本音を、もうひとりの自分が教えてくれる
                      </p>
                    </div>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="rgba(99,75,150,0.5)" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </motion.a>

                {/* Daily Hook Banner */}
                <DailyHookBanner totalObservations={totalObservations} />

                {/* Cross-Feature Nudges */}
                <CrossFeatureNudges
                  trigger="post_observation"
                  maxCount={2}
                  delayMs={300}
                />

                {/* Quick Actions — removed: 未実装のため非表示 */}

                {/* Weekly Report Button */}
                {weeklyReport && (
                  <motion.button
                    onClick={onShowWeeklyReport}
                    className="w-full rounded-2xl p-4 text-left transition-all"
                    style={{
                      background: "linear-gradient(135deg, rgba(15,11,30,0.95), rgba(30,18,64,0.92))",
                      border: "1px solid rgba(139,92,246,0.2)",
                      boxShadow: "0 4px 20px rgba(139,92,246,0.1)",
                    }}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{"\u{1F4CA}"}</span>
                        <div>
                          <p className="text-sm font-bold text-white/90">
                            Week {weeklyReport.weekNumber} レポート
                          </p>
                          <p className="text-xs text-white/50 mt-0.5">
                            週次レポートを見る
                          </p>
                        </div>
                      </div>
                      <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </motion.button>
                )}

                {/* Collapse button */}
                <button
                  onClick={() => setShowMore(false)}
                  className="w-full py-2 text-center text-xs font-medium transition-colors"
                  style={{ color: "rgba(100,116,139,0.5)" }}
                >
                  閉じる
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

    </div>
  );
}
