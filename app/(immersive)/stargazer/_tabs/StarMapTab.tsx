// app/stargazer/_tabs/StarMapTab.tsx
// アーキタイプタブ v8 — 3サブビュー分割 (概要 / 特性マップ / プロフィール)
// 情報アーキテクチャ改善: 1画面1メッセージ原則 + モバイルナビ + 段階的空状態
"use client";

import { useState, useMemo, useCallback, useRef, lazy, Suspense, Component, type ReactNode, type ErrorInfo } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { hapticLight, hapticMedium } from "@/lib/rendezvous/haptics";
import type { TodayPrioritizerInput } from "@/lib/stargazer/todayPrioritizer";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { TypeDefLike } from "@/lib/stargazer/dailyInsightEngine";
import type { DerivedTraitCard, ContextDifference } from "@/lib/stargazer/traitCards";
import type { ContradictionInsight } from "@/lib/stargazer/dailyInsightEngine";
import {
  generateProfileContent,
} from "@/lib/stargazer/profileContentGenerator";
import { aggregateRadarDimensions } from "@/lib/stargazer/radarAggregation";
import type { ArchetypeResult, DualArchetypeResult } from "@/lib/stargazer/archetypeResolver";
import type { ContradictionMap as ContradictionMapType } from "@/lib/stargazer/contradictionMap";
import type { GenerativeCoreResult } from "@/lib/stargazer/generativeCore";
import type { PredictiveCloneResult } from "@/lib/stargazer/predictiveClone";
import type { WeeklyReport } from "@/lib/stargazer/weeklyReportGenerator";

import StarMapSubNav, { type StarMapSubView } from "./star-map/StarMapSubNav";
import StarParticles from "../_components/StarParticles";
import { StarMapSkeleton } from "../_components/SkeletonLoaders";
import { buildStoryData, type StoryData } from "../_components/story/storyDataBuilder";

// Lazy-load StoryOverlay (only when opened)
const StoryOverlay = lazy(() => import("../_components/story/StoryOverlay"));

// ── Lazy-loaded sub-views (only active view is loaded) ──
const OverviewSubView = lazy(() => import("./star-map/OverviewSubView"));
const TraitMapSubView = lazy(() => import("./star-map/TraitMapSubView"));
const ProfileSubView = lazy(() => import("./star-map/ProfileSubView"));

// ── Error Boundary ──
interface EBProps { children: ReactNode }
interface EBState { hasError: boolean; error?: Error }

class StarMapErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { hasError: false };

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[StarMap] Render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-12 px-4">
          <p className="text-sm" style={{ color: "rgba(100,105,130,0.7)" }}>
            アーキタイプの読み込みに問題が発生しました
          </p>
          <button
            className="mt-3 text-xs underline"
            style={{ color: "rgba(100,105,130,0.5)" }}
            onClick={() => this.setState({ hasError: false })}
          >
            再試行
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Props Interface (unchanged from v7 for backward compatibility) ──

export interface StarMapTabProps {
  hasData: boolean;
  typeDef: TypeDefLike | null;
  confidence: number;
  traitCards: DerivedTraitCard[];
  topMatches: { code: string; score: number }[];
  contradictions: ContradictionInsight[];
  axisScores: Partial<Record<TraitAxisKey, number>>;
  totalObservations: number;
  contextScores?: Record<string, Partial<Record<TraitAxisKey, number>>>;
  contextDiffs?: ContextDifference[];
  onNavigateToDeep?: () => void;
  onNavigateToObserve?: () => void;
  archetypeResult?: ArchetypeResult | null;
  dualArchetypeResult?: DualArchetypeResult | null;
  contradictionMap?: ContradictionMapType | null;
  generativeCoreResult?: GenerativeCoreResult | null;
  predictiveCloneResult?: PredictiveCloneResult | null;
  previousAxisScores?: Partial<Record<TraitAxisKey, number>>;
  todayPrioritizerInput?: TodayPrioritizerInput | null;
  weeklyReport?: WeeklyReport | null;
  onOpenWeeklyReport?: () => void;
  axisHistory?: Array<{
    date: string;
    scores: Record<string, number>;
    events?: Array<{ type: "contradiction" | "milestone" | "shift"; label: string }>;
  }>;
  understandingLevel?: number;
  aiLearningStats?: {
    categoryAccuracy?: Record<string, { accuracy: number; totalPredictions: number; trend: "improving" | "stable" | "declining" }>;
    overallAccuracy?: number;
    observationCount?: number;
  };
  todayObservationCount?: number;
}

export default function StarMapTab({
  hasData,
  typeDef,
  confidence,
  traitCards,
  topMatches,
  contradictions,
  axisScores,
  totalObservations,
  contextScores,
  contextDiffs,
  onNavigateToDeep,
  onNavigateToObserve,
  archetypeResult,
  dualArchetypeResult,
  contradictionMap,
  generativeCoreResult,
  predictiveCloneResult,
  previousAxisScores,
  todayPrioritizerInput,
  weeklyReport,
  onOpenWeeklyReport,
  axisHistory,
  understandingLevel,
  aiLearningStats,
  todayObservationCount,
}: StarMapTabProps) {
  // ── Story state ──
  const [showStory, setShowStory] = useState(false);

  const storyData = useMemo<StoryData | null>(() => {
    if (!archetypeResult || totalObservations < 10) return null;

    // Build prediction accuracy from aiLearningStats (already available as prop)
    let predictionAccuracy = null;
    if (aiLearningStats?.overallAccuracy !== undefined && aiLearningStats?.categoryAccuracy) {
      const totalPredictions = Object.values(aiLearningStats.categoryAccuracy)
        .reduce((sum, c) => sum + c.totalPredictions, 0);
      predictionAccuracy = {
        overallAccuracy: aiLearningStats.overallAccuracy,
        totalPredictions,
        categoryAccuracy: Object.fromEntries(
          Object.entries(aiLearningStats.categoryAccuracy).map(([k, v]) => [k, {
            accuracy: v.accuracy,
            totalPredictions: v.totalPredictions,
          }]),
        ),
      };
    }

    return buildStoryData({
      archetypeResult: archetypeResult ?? null,
      axisScores,
      contradictionMap: contradictionMap ?? null,
      totalObservations,
      todayObservationCount: todayObservationCount ?? 0,
      contextFaces: contextScores ?? null,
      predictionAccuracy,
      // reobservationHistory is not currently passed as prop — unlock later
      reobservationHistory: null,
    });
  }, [archetypeResult, axisScores, contradictionMap, totalObservations, todayObservationCount, contextScores, aiLearningStats]);

  // ── Sub-view state ──
  const [activeView, setActiveView] = useState<StarMapSubView>("overview");
  const viewOrder: StarMapSubView[] = ["overview", "map", "profile"];
  const swipeRef = useRef<HTMLDivElement>(null);

  const handleSwipeEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const threshold = 80;
      const velocityThreshold = 0.5;
      const { offset, velocity } = info;

      if (Math.abs(offset.x) > threshold || Math.abs(velocity.x) > velocityThreshold) {
        const currentIdx = viewOrder.indexOf(activeView);
        if (offset.x < 0 && currentIdx < viewOrder.length - 1) {
          // Swipe left → next view
          setActiveView(viewOrder[currentIdx + 1]);
          hapticMedium();
        } else if (offset.x > 0 && currentIdx > 0) {
          // Swipe right → previous view
          setActiveView(viewOrder[currentIdx - 1]);
          hapticMedium();
        }
      }
    },
    [activeView],
  );

  const handleViewChange = useCallback((view: StarMapSubView) => {
    setActiveView(view);
    hapticLight();
  }, []);

  // ── Derived data (shared across sub-views) ──
  const profileContent = useMemo(() => {
    if (!typeDef) return null;
    try {
      return generateProfileContent(
        axisScores,
        traitCards,
        typeDef,
        contextDiffs || [],
        contextScores || {},
        totalObservations
      );
    } catch (err) {
      console.error("[StarMap] profileContent generation failed:", err);
      return null;
    }
  }, [axisScores, traitCards, typeDef, contextDiffs, contextScores, totalObservations]);

  const radarDimensions = useMemo(
    () => aggregateRadarDimensions(axisScores),
    [axisScores]
  );

  const ghostRadarDimensions = useMemo(
    () => (previousAxisScores ? aggregateRadarDimensions(previousAxisScores) : undefined),
    [previousAxisScores]
  );

  // Derive insight teaser from growthDirection
  const insightTeaser = useMemo(() => {
    if (!profileContent?.growthDirection) return undefined;
    const { actionSuggestions } = profileContent.growthDirection;
    return actionSuggestions?.[0] ?? undefined;
  }, [profileContent]);

  return (
    <div className="pb-4 relative">
      {/* ═══ Star Particles Background ═══ */}
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 overflow-hidden" aria-hidden="true">
        <StarParticles />
      </div>

      {/* ═══ Story Card — 観測結果を振り返る ═══ */}
      {storyData && (
        <button
          className="w-full mb-3 px-4 py-3 rounded-xl flex items-center gap-3 text-left transition-colors"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
          onClick={() => setShowStory(true)}
        >
          <span className="text-xl" aria-hidden="true">{storyData.archetype.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.85)" }}>
              あなたの輪郭
            </p>
            <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
              タップして観測結果を振り返る
            </p>
          </div>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>▶</span>
        </button>
      )}

      {/* ═══ Story Overlay ═══ */}
      <AnimatePresence>
        {showStory && storyData && (
          <Suspense fallback={null}>
            <StoryOverlay
              data={storyData}
              onClose={() => setShowStory(false)}
              onNavigateToObserve={onNavigateToObserve}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* ═══ Sub-Navigation — visible on all breakpoints ═══ */}
      <StarMapSubNav
        activeView={activeView}
        onChangeView={handleViewChange}
      />

      {/* ═══ Sub-View Content — swipeable ═══ */}
      <motion.div
        ref={swipeRef}
        className="mt-4 overflow-hidden touch-pan-y"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={handleSwipeEnd}
      >
        <StarMapErrorBoundary>
          <Suspense fallback={<StarMapSkeleton />}>
            <AnimatePresence mode="wait">
              {activeView === "overview" && (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                >
                  <OverviewSubView
                    hasData={hasData}
                    archetypeResult={archetypeResult ?? undefined}
                    totalObservations={totalObservations}
                    insightTeaser={insightTeaser}
                    weeklyReport={weeklyReport}
                    onNavigateToSubView={setActiveView}
                    onNavigateToObserve={onNavigateToObserve}
                    onOpenWeeklyReport={onOpenWeeklyReport}
                  />
                </motion.div>
              )}

              {activeView === "map" && (
                <motion.div
                  key="map"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                >
                  <TraitMapSubView
                    axisScores={axisScores}
                    previousAxisScores={previousAxisScores}
                    contradictionMap={contradictionMap ?? undefined}
                    archetypeResult={archetypeResult ?? undefined}
                    understandingLevel={understandingLevel}
                    radarDimensions={radarDimensions}
                    ghostRadarDimensions={ghostRadarDimensions}
                    summaryAxes={profileContent?.summaryAxes}
                    generativeCoreResult={generativeCoreResult ?? undefined}
                    predictiveCloneResult={predictiveCloneResult ?? undefined}
                    totalObservations={totalObservations}
                    typeDef={typeDef}
                  />
                </motion.div>
              )}

              {activeView === "profile" && (
                <motion.div
                  key="profile"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                >
                  <ProfileSubView
                    profileContent={profileContent}
                    axisHistory={axisHistory}
                    aiLearningStats={aiLearningStats}
                    totalObservations={totalObservations}
                    onNavigateToDeep={onNavigateToDeep}
                    archetypeResult={archetypeResult ?? undefined}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </Suspense>
        </StarMapErrorBoundary>
      </motion.div>
    </div>
  );
}
