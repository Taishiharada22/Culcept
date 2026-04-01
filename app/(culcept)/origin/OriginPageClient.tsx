"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { safeLSSet } from "@/lib/safeLocalStorage";
import AlterContextBanner from "@/components/home/AlterContextBanner";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  clearDraft,
  getChapters,
  loadCurrentPosition,
  loadOriginV7,
  saveCurrentPosition,
  saveOriginV7,
  startNewDraft,
  saveRootProfile as storeRootProfile,
  saveEraAffiliation,
  deleteEraAffiliation,
  saveActivity,
  deleteActivity as storeDeleteActivity,
  saveTurningPoint,
  deleteTurningPoint as storeDeleteTurningPoint,
  saveResidueItem,
  deleteResidueItem as storeDeleteResidueItem,
} from "@/lib/origin/v7/store";
import {
  isDraftStarted,
  mergeOriginSaves,
  resolveOriginLandingState,
  type OriginClientState,
} from "@/lib/origin/v7/persistence";
import { completeOriginChapter, persistOriginSessionState } from "@/lib/origin/v7/clientSync";
import type {
  CurrentPosition,
  DraftChapter,
  ExplorationAxis,
  ExplorationStep,
  ExplorationResult,
  MemoryChapter,
  OriginV7Save,
  CollapseGrowthInsight,
  ContradictionResolution,
  TargetedResponse,
  MemoryGem,
  MicroQuestionAnswer,
} from "@/lib/origin/v7/types";
import { STEP_ORDER } from "@/lib/origin/v7/types";
import type {
  ActivePanel,
  RightPanelView,
  RootProfile,
  EraAffiliation,
  ActivityEntry,
  TurningPoint,
  ResidueItem,
} from "@/lib/origin/v7/workspaceTypes";
import { updateChapter } from "@/lib/origin/v7/store";
import FeatureIntroduction from "@/components/ui/FeatureIntroduction";
import { ORIGIN_INTRO } from "@/lib/ui/featureIntroConfigs";
import {
  deriveOriginSnapshot,
  deriveFormationChains,
  deriveLifeBackbone,
  deriveResidueSummary,
  derivePressureRewardProfile,
} from "@/lib/origin/v7/formationReader";
import {
  suggestAnalyticalFrame,
  suggestResidueFromChapters,
  suggestWorkspaceEntries,
} from "@/lib/origin/v7/assistedFill";
import { deriveBehavioralLaws } from "@/lib/origin/v7/behavioralLaws";
import { deriveEchoTimeline } from "@/lib/origin/v7/echoTimeline";
import { deriveObservationGaps } from "@/lib/origin/v7/observationGaps";
import { deriveSecondSelfPreview } from "@/lib/origin/v7/secondSelfBridge";
import { deriveContextualProfiles } from "@/lib/origin/v7/contextualBehavior";
import { deriveVectorGaps } from "@/lib/origin/v7/vectorRefinement";
import { deriveLifeCalendar } from "@/lib/origin/v7/lifeCalendarEngine";
import { selectDailyQuestion, updateStreak } from "@/lib/origin/v7/microQuestionEngine";
import {
  saveContradictionResolution as storeContradictionResolution,
  saveCollapseGrowthInsight as storeCollapseGrowthInsight,
  saveTargetedResponse as storeTargetedResponse,
  saveMemoryGem as storeMemoryGem,
  saveMicroQuestionAnswer as storeMicroQuestionAnswer,
  saveMicroQuestionStreak as storeMicroQuestionStreak,
  saveBirthDate as storeBirthDate,
} from "@/lib/origin/v7/store";
import MemoryExplorationFlow from "./_components/MemoryExplorationFlow";
import DeepExplorationFlow from "./_components/DeepExplorationFlow";
import CurrentPositionStep from "./_components/CurrentPositionStep";
import CurrentPositionBridge from "./_components/CurrentPositionBridge";
import LeftPanel from "./_components/panels/LeftPanel";
import CenterPanel from "./_components/panels/CenterPanel";
import RightPanel from "./_components/panels/RightPanel";
import MobilePanelTabBar from "./_components/panels/MobilePanelTabBar";
import DailyOrbitSection from "./_components/DailyOrbitSection";
import LifeProfileSection from "./_components/LifeProfileSection";
import TodoSection from "./_components/TodoSection";
import JournalSection from "./_components/JournalSection";
import ProfileSection from "./_components/ProfileSection";
import WeeklyReviewCard from "./_components/WeeklyReviewCard";
import LifeCalendar from "./_components/LifeCalendar";
import CalendarCellDetail from "./_components/CalendarCellDetail";
import MemoryDiveFlow from "./_components/MemoryDiveFlow";
import DailyMicroQuestion from "./_components/DailyMicroQuestion";
import EntryGate, { getTodayEntry } from "./_components/EntryGate";
import { trackOriginEvent } from "@/lib/origin/tracking";
import EvidenceCards from "./_components/EvidenceCards";
import type { EntryRecord } from "@/lib/origin/entryContract";
import OriginWelcomeFlow from "./_components/OriginWelcomeFlow";
import SlideOutDrawer from "./_components/panels/SlideOutDrawer";
import BottomSheet from "./_components/panels/BottomSheet";
import FocusMode from "./_components/FocusMode";
import OriginFAB from "./_components/OriginFAB";
import MobileProgressBar from "./_components/MobileProgressBar";
import { isFirstTimeUser, getOnboardedFlag, markOnboarded } from "@/lib/origin/v7/onboarding";
import {
  getStreakMilestone,
  getDaysAbsent,
  getAbsenceMessage,
  getYesterdayEcho,
  recordVisit,
  getLastVisitDate,
  getExplorationStage,
  getNextChallenge,
  maybeGrantStreakFreeze,
} from "@/lib/origin/v7/retention";
import StreakCelebration from "./_components/StreakCelebration";
import ExplorationStageBadge from "./_components/ExplorationStageBadge";
import NextChallengeCard from "./_components/NextChallengeCard";
import YesterdayEcho from "./_components/YesterdayEcho";
import AbsenceRecovery from "./_components/AbsenceRecovery";
import InsightRevealMoment from "./_components/InsightRevealMoment";
import ChapterCompletionCeremony from "./_components/ChapterCompletionCeremony";
import { detectNewInsights, type DetectedInsight } from "@/lib/origin/v7/insightDetection";
import { generateObservation, generateDailyGreeting, generateMemoryReference, generateBehavioralInsight } from "@/lib/origin/v7/aiCompanion";
import { generateFormationDigest, type FormationDigest } from "@/lib/origin/v7/formationDigest";
import AICompanionCard from "./_components/AICompanionCard";
import FormationDigestView from "./_components/FormationDigestView";

type TabKey = "todo" | "journal" | "profile" | "memory" | "calendar" | "orbit";
type ViewMode =
  | "welcome"
  | "welcome_map"
  | "ceremony"
  | "workspace"
  | "current_position"
  | "position_bridge"
  | "exploration"
  | "deep_exploration"
  | "memory_dive"
  | "resume_prompt"
  | "generating";

type Props = {
  initialState: OriginClientState;
};

function viewModeFromState(state: OriginClientState): ViewMode {
  if (state.primaryView === "resume") return "resume_prompt";
  if (state.primaryView === "generating") return "generating";
  // 初回判定はuseEffectで行う（SSR/クライアント一致のため常にworkspaceを返す）
  return "workspace";
}

export default function OriginPageClient({ initialState }: Props) {
  const [tab, setTab] = useState<TabKey>(() => {
    // Default tab based on time of day
    const hour = new Date().getHours();
    return hour >= 18 ? "journal" : "todo";
  });
  const [weeklyReviewDismissed, setWeeklyReviewDismissed] = useState(false);
  const [jumpDate, setJumpDate] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<OriginV7Save>(initialState.save);
  const [viewMode, setViewMode] = useState<ViewMode>(() => viewModeFromState(initialState));
  const [sessionMeta, setSessionMeta] = useState(initialState.meta);
  const persistSignatureRef = useRef<string>("");
  const fromWelcomeRef = useRef(false);
  const tabBarRef = useRef<HTMLDivElement>(null);

  // Workspace mode: false=progressive(Center only + drawers), true=3-panel
  const [workspaceMode, setWorkspaceMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("origin_workspace_mode") === "true";
  });
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  const toggleWorkspaceMode = useCallback(() => {
    setWorkspaceMode((prev) => {
      const next = !prev;
      safeLSSet("origin_workspace_mode", String(next));
      return next;
    });
  }, []);

  // Emotional staging state
  const [pendingInsight, setPendingInsight] = useState<DetectedInsight | null>(null);
  const [ceremonyChapter, setCeremonyChapter] = useState<{ count: number; title: string } | null>(null);
  const prevSaveRef = useRef<OriginV7Save>(saveState);

  // AI Companion state
  const [aiObservation, setAiObservation] = useState<{ emoji: string; text: string; depth?: 1 | 2 | 3 } | null>(null);
  // Formation Digest state
  const [showDigest, setShowDigest] = useState(false);
  const formationDigest = useMemo(() => generateFormationDigest(saveState), [saveState]);
  const prevChapterCountRef = useRef(saveState.chapters.length);

  // Mobile bottom sheet state
  const [bottomSheetPanel, setBottomSheetPanel] = useState<"left" | "right" | null>(null);
  // Exploration progress tracking (for mobile progress bar)
  const [explorationProgress, setExplorationProgress] = useState<{ step: ExplorationStep; index: number } | null>(null);

  // Entry Gate state
  const [todayEntry, setTodayEntry] = useState<EntryRecord | null>(() => getTodayEntry());
  const [suggestedLayers, setSuggestedLayers] = useState<string[]>([]);
  const handleEntryComplete = useCallback((entry: EntryRecord, layers: string[]) => {
    setTodayEntry(entry);
    setSuggestedLayers(layers);
  }, []);

  // Retention state
  const [streakMilestone, setStreakMilestone] = useState<number | null>(null);
  const [absenceMsg, setAbsenceMsg] = useState<ReturnType<typeof getAbsenceMessage>>(null);
  const [yesterdayEcho, setYesterdayEcho] = useState<ReturnType<typeof getYesterdayEcho>>(null);
  const [showYesterdayEcho, setShowYesterdayEcho] = useState(true);

  // 初回マウント時: 不在チェック + 昨日エコー + 訪問記録
  useEffect(() => {
    const lastVisit = getLastVisitDate();
    const absent = getDaysAbsent(lastVisit);
    const msg = getAbsenceMessage(absent);
    if (msg) setAbsenceMsg(msg);

    const echo = getYesterdayEcho(saveState);
    if (echo) setYesterdayEcho(echo);

    recordVisit();
    trackOriginEvent("origin_page_view");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Workspace panel state
  const [mobilePanel, setMobilePanel] = useState<ActivePanel>("center");
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>("empty");
  const [selectedChapter, setSelectedChapter] = useState<MemoryChapter | null>(null);
  const [selectedEra, setSelectedEra] = useState<EraAffiliation | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityEntry | null>(null);
  const [selectedTurningPoint, setSelectedTurningPoint] = useState<TurningPoint | null>(null);

  useEffect(() => {
    const localSave = loadOriginV7();
    const mergedSave = mergeOriginSaves(initialState.save, localSave);
    const resolved = resolveOriginLandingState({
      save: mergedSave,
      meta: initialState.meta,
    });

    // オンボーディング判定: フラグ + セーブデータ内フラグの二重チェック
    const onboarded = getOnboardedFlag() || mergedSave.onboarded === true;
    const newViewMode =
      resolved.primaryView === "resume"
        ? "resume_prompt"
        : resolved.primaryView === "generating"
          ? "generating"
          : isFirstTimeUser(mergedSave) && !onboarded
            ? "welcome"
            : "workspace";

    setSaveState(mergedSave);
    setSessionMeta(initialState.meta);
    setViewMode(newViewMode);
    saveOriginV7(mergedSave);
  }, [initialState]);

  useEffect(() => {
    saveOriginV7(saveState);
  }, [saveState]);

  // AI Companion: チャプター数変化時にオブザベーション生成（優先度順にフォールバック）
  useEffect(() => {
    if (saveState.chapters.length > prevChapterCountRef.current) {
      const obs = generateObservation(saveState)
        ?? generateMemoryReference(saveState)
        ?? generateBehavioralInsight(saveState);
      if (obs) setAiObservation(obs);
    }
    prevChapterCountRef.current = saveState.chapters.length;
  }, [saveState.chapters.length, saveState]);

  const chapters = saveState.chapters;
  const currentDraft = saveState.draft;
  const currentPosition = saveState.currentPosition;
  const showResumeBanner =
    viewMode === "workspace" && chapters.length > 0 && isDraftStarted(currentDraft);

  const updateSaveState = useCallback((updater: (prev: OriginV7Save) => OriginV7Save) => {
    setSaveState((prev) => {
      const next = updater(prev);
      return {
        ...next,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  /* ━━━ Reader Layer — useMemo 導出 ━━━ */
  const snapshot = useMemo(() => deriveOriginSnapshot(saveState), [saveState]);
  const formationChains = useMemo(() => deriveFormationChains(saveState), [saveState]);
  const backbone = useMemo(() => deriveLifeBackbone(saveState), [saveState]);
  const residueSummary = useMemo(() => deriveResidueSummary(saveState), [saveState]);
  const pressureReward = useMemo(() => derivePressureRewardProfile(saveState), [saveState]);

  /* ━━━ v5: Behavioral Laws / Echo / Gaps / Second Self ━━━ */
  const behavioralLaws = useMemo(() => deriveBehavioralLaws(saveState), [saveState]);
  const echoTimeline = useMemo(() => deriveEchoTimeline(saveState), [saveState]);
  const observationGaps = useMemo(
    () => deriveObservationGaps(saveState, behavioralLaws, echoTimeline),
    [saveState, behavioralLaws, echoTimeline],
  );
  /* ━━━ v6: Contextual Profiles / Second Self / Vector Gaps ━━━ */
  const contextualProfiles = useMemo(
    () => deriveContextualProfiles(saveState, behavioralLaws),
    [saveState, behavioralLaws],
  );
  const secondSelfPreview = useMemo(
    () => deriveSecondSelfPreview(
      saveState,
      behavioralLaws,
      contextualProfiles.profiles,
      saveState.targetedResponses,
    ),
    [saveState, behavioralLaws, contextualProfiles.profiles],
  );
  const vectorGaps = useMemo(
    () => deriveVectorGaps(secondSelfPreview.rendezvousPreview, saveState.targetedResponses),
    [secondSelfPreview.rendezvousPreview, saveState.targetedResponses],
  );

  /* ━━━ v8: Life Calendar / Memory Dive / Micro Question ━━━ */
  const lifeCalendar = useMemo(() => deriveLifeCalendar(saveState), [saveState]);
  const dailyQuestion = useMemo(
    () => selectDailyQuestion(
      (saveState.microQuestionAnswers ?? []).map((a) => a.questionId),
    ),
    [saveState.microQuestionAnswers],
  );
  const microStreak = saveState.microQuestionStreak ?? {
    currentStreak: 0,
    longestStreak: 0,
    lastAnsweredDate: "",
    totalAnswered: 0,
  };
  const aiGreeting = useMemo(() => generateDailyGreeting(saveState), [saveState]);
  const explorationStage = useMemo(() => getExplorationStage(saveState.chapters.length), [saveState.chapters.length]);
  const nextChallenge = useMemo(() => getNextChallenge(saveState), [saveState]);
  const [calendarCellDetail, setCalendarCellDetail] = useState<{
    year: number;
    month: number;
  } | null>(null);
  const [diveInitialYear, setDiveInitialYear] = useState<number | undefined>();
  const [diveInitialMonth, setDiveInitialMonth] = useState<number | undefined>();

  /* ━━━ Assisted Fill — useMemo サジェスト ━━━ */
  const activityFrameSuggestions = useMemo(() => {
    if (!selectedActivity) return undefined;
    return suggestAnalyticalFrame(selectedActivity, saveState);
  }, [selectedActivity, saveState]);

  const turningPointFrameSuggestions = useMemo(() => {
    if (!selectedTurningPoint) return undefined;
    return suggestAnalyticalFrame(selectedTurningPoint, saveState);
  }, [selectedTurningPoint, saveState]);

  const residueSuggestions = useMemo(
    () => suggestResidueFromChapters(chapters, saveState.residueBoard ?? []),
    [chapters, saveState.residueBoard],
  );

  const entrySuggestions = useMemo(
    () => suggestWorkspaceEntries(chapters, saveState),
    [chapters, saveState],
  );

  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set());
  const filteredEntrySuggestions = useMemo(
    () => entrySuggestions.filter((_, i) => !dismissedSuggestions.has(i)),
    [entrySuggestions, dismissedSuggestions],
  );
  const handleDismissSuggestion = useCallback((index: number) => {
    setDismissedSuggestions((prev) => new Set(prev).add(index));
  }, []);

  /** Suggestion: Accept suggested activity */
  const handleAcceptSuggestedActivity = useCallback(
    (data: Partial<ActivityEntry>) => {
      const activity: ActivityEntry = {
        id: crypto.randomUUID(),
        name: data.name ?? "",
        category: data.category ?? "other",
        period: data.period ?? "elementary",
        leadershipRole: false,
        caretakerRole: false,
        timeAllocation: "secondary",
        analyticalFrame: null,
        ...data,
      };
      setSelectedActivity(activity);
      setRightPanelView("activity_edit");
      setMobilePanel("right");
    },
    [],
  );

  /** Suggestion: Accept suggested turning point */
  const handleAcceptSuggestedTurningPoint = useCallback(
    (data: Partial<TurningPoint>) => {
      const tp: TurningPoint = {
        id: crypto.randomUUID(),
        period: data.period ?? "elementary",
        category: data.category ?? "decision",
        title: data.title ?? "",
        impact: "significant",
        analyticalFrame: null,
        ...data,
      };
      setSelectedTurningPoint(tp);
      setRightPanelView("turning_point_edit");
      setMobilePanel("right");
    },
    [],
  );

  /** Suggestion: Accept suggested era */
  const handleAcceptSuggestedEra = useCallback(
    (data: Partial<EraAffiliation>) => {
      const era: EraAffiliation = {
        id: crypto.randomUUID(),
        period: data.period ?? "elementary",
        school: data.school ?? null,
        affiliation: data.affiliation ?? null,
        mainActivity: data.mainActivity ?? null,
        mainRole: data.mainRole ?? null,
        atmosphere: data.atmosphere ?? null,
        relationships: data.relationships ?? null,
        lifeCenter: data.lifeCenter ?? null,
      };
      setSelectedEra(era);
      setRightPanelView("era_edit");
      setMobilePanel("right");
    },
    [],
  );

  // Deep exploration state
  const [deepDiveTarget, setDeepDiveTarget] = useState<MemoryChapter | null>(null);
  const [deepDiveAxis, setDeepDiveAxis] = useState<ExplorationAxis | undefined>();

  /** 探索開始 — chapters.length で分岐 */
  const handleStartNew = useCallback((axis?: ExplorationAxis) => {
    if (isDraftStarted(currentDraft)) {
      setViewMode("resume_prompt");
      return;
    }

    const position = loadCurrentPosition() ?? currentPosition;
    if (!position) {
      setViewMode("current_position");
      return;
    }

    // 分岐: chapters === 0 → 初回フロー, chapters >= 1 → 深掘りフロー
    if (chapters.length === 0) {
      const draft = startNewDraft();
      updateSaveState((prev) => ({ ...prev, draft }));
      setViewMode("exploration");
    } else {
      setDeepDiveTarget(null);
      setDeepDiveAxis(axis);
      setViewMode("deep_exploration");
    }
  }, [currentDraft, currentPosition, chapters.length, updateSaveState]);

  /** 既存断片の深掘り */
  const handleDeepDiveChapter = useCallback(
    (chapter: MemoryChapter, axis: ExplorationAxis) => {
      setDeepDiveTarget(chapter);
      setDeepDiveAxis(axis);
      setViewMode("deep_exploration");
    },
    [],
  );

  /** タイムラインノード選択 → Right panelにdetail表示 */
  const handleSelectChapterForDetail = useCallback(
    (chapter: MemoryChapter) => {
      setSelectedChapter(chapter);
      setRightPanelView("detail");
      // モバイルでは右パネルに切替
      setMobilePanel("right");
    },
    [],
  );

  /** Right panel detail閉じる */
  const handleCloseDetail = useCallback(() => {
    setSelectedChapter(null);
    setRightPanelView("empty");
  }, []);

  /** Right panelからDeep Dive開始 */
  const handleDeepDiveFromDetail = useCallback(
    (chapter: MemoryChapter, axis: ExplorationAxis) => {
      setDeepDiveTarget(chapter);
      setDeepDiveAxis(axis);
      setViewMode("deep_exploration");
    },
    [],
  );

  /** Left panel: Root編集 */
  const handleEditRoot = useCallback(() => {
    setRightPanelView("root_edit");
    setMobilePanel("right");
  }, []);

  /** Left panel: Era編集 */
  const handleEditEra = useCallback((era: EraAffiliation) => {
    setSelectedEra(era);
    setRightPanelView("era_edit");
    setMobilePanel("right");
  }, []);

  /** Left panel: Residue編集 */
  const handleEditResidue = useCallback(() => {
    setRightPanelView("residue_edit");
    setMobilePanel("right");
  }, []);

  /** Center panel: Activity選択 */
  const handleSelectActivity = useCallback((activity: ActivityEntry) => {
    setSelectedActivity(activity);
    setRightPanelView("activity_edit");
    setMobilePanel("right");
  }, []);

  /** Center panel: TurningPoint選択 */
  const handleSelectTurningPoint = useCallback((tp: TurningPoint) => {
    setSelectedTurningPoint(tp);
    setRightPanelView("turning_point_edit");
    setMobilePanel("right");
  }, []);

  /** Right panel: エディター閉じる（共通） */
  const handleCloseEditor = useCallback(() => {
    setRightPanelView("empty");
    setSelectedEra(null);
    setSelectedActivity(null);
    setSelectedTurningPoint(null);
  }, []);

  /** Right panel: Root Profile保存 */
  const handleSaveRootProfile = useCallback(
    (profile: RootProfile) => {
      storeRootProfile(profile);
      updateSaveState((prev) => ({ ...prev, rootProfile: profile }));
      setRightPanelView("empty");
    },
    [updateSaveState],
  );

  /** Right panel: Era保存 */
  const handleSaveEra = useCallback(
    (era: EraAffiliation) => {
      saveEraAffiliation(era);
      updateSaveState((prev) => {
        const list = [...(prev.eraAffiliations ?? [])];
        const idx = list.findIndex((e) => e.id === era.id);
        if (idx === -1) list.push(era);
        else list[idx] = era;
        return { ...prev, eraAffiliations: list };
      });
      setSelectedEra(null);
      setRightPanelView("empty");
    },
    [updateSaveState],
  );

  /** Right panel: Era削除 */
  const handleDeleteEra = useCallback(
    (id: string) => {
      deleteEraAffiliation(id);
      updateSaveState((prev) => ({
        ...prev,
        eraAffiliations: (prev.eraAffiliations ?? []).filter((e) => e.id !== id),
      }));
      setSelectedEra(null);
      setRightPanelView("empty");
    },
    [updateSaveState],
  );

  /** Right panel: Activity保存 */
  const handleSaveActivity = useCallback(
    (activity: ActivityEntry) => {
      saveActivity(activity);
      updateSaveState((prev) => {
        const list = [...(prev.activities ?? [])];
        const idx = list.findIndex((a) => a.id === activity.id);
        if (idx === -1) list.push(activity);
        else list[idx] = activity;
        return { ...prev, activities: list };
      });
      setSelectedActivity(null);
      setRightPanelView("empty");
    },
    [updateSaveState],
  );

  /** Right panel: Activity削除 */
  const handleDeleteActivity = useCallback(
    (id: string) => {
      storeDeleteActivity(id);
      updateSaveState((prev) => ({
        ...prev,
        activities: (prev.activities ?? []).filter((a) => a.id !== id),
      }));
      setSelectedActivity(null);
      setRightPanelView("empty");
    },
    [updateSaveState],
  );

  /** Right panel: TurningPoint保存 */
  const handleSaveTurningPoint = useCallback(
    (tp: TurningPoint) => {
      saveTurningPoint(tp);
      updateSaveState((prev) => {
        const list = [...(prev.turningPoints ?? [])];
        const idx = list.findIndex((t) => t.id === tp.id);
        if (idx === -1) list.push(tp);
        else list[idx] = tp;
        return { ...prev, turningPoints: list };
      });
      setSelectedTurningPoint(null);
      setRightPanelView("empty");
    },
    [updateSaveState],
  );

  /** Right panel: TurningPoint削除 */
  const handleDeleteTurningPoint = useCallback(
    (id: string) => {
      storeDeleteTurningPoint(id);
      updateSaveState((prev) => ({
        ...prev,
        turningPoints: (prev.turningPoints ?? []).filter((t) => t.id !== id),
      }));
      setSelectedTurningPoint(null);
      setRightPanelView("empty");
    },
    [updateSaveState],
  );

  /** Right panel: ResidueItem保存 */
  const handleSaveResidueItem = useCallback(
    (item: ResidueItem) => {
      saveResidueItem(item);
      updateSaveState((prev) => {
        const list = [...(prev.residueBoard ?? [])];
        const idx = list.findIndex((r) => r.id === item.id);
        if (idx === -1) list.push(item);
        else list[idx] = item;
        return { ...prev, residueBoard: list };
      });
    },
    [updateSaveState],
  );

  /** Right panel: ResidueItem削除 */
  const handleDeleteResidueItem = useCallback(
    (id: string) => {
      storeDeleteResidueItem(id);
      updateSaveState((prev) => ({
        ...prev,
        residueBoard: (prev.residueBoard ?? []).filter((r) => r.id !== id),
      }));
    },
    [updateSaveState],
  );

  /* ━━━ v6: Collapse/Growth + Contradiction + Targeted Responses ━━━ */

  const handleSaveCollapseGrowthInsight = useCallback(
    (insight: CollapseGrowthInsight) => {
      storeCollapseGrowthInsight(insight);
      updateSaveState((prev) => {
        const list = [...(prev.collapseGrowthInsights ?? [])];
        const idx = list.findIndex(
          (i) => i.sourceId === insight.sourceId && i.type === insight.type,
        );
        if (idx === -1) list.push(insight);
        else list[idx] = insight;
        return { ...prev, collapseGrowthInsights: list };
      });
    },
    [updateSaveState],
  );

  const handleSaveContradictionResolution = useCallback(
    (resolution: ContradictionResolution) => {
      storeContradictionResolution(resolution);
      updateSaveState((prev) => {
        const list = [...(prev.contradictionResolutions ?? [])];
        const idx = list.findIndex(
          (r) => r.contradictionId === resolution.contradictionId,
        );
        if (idx === -1) list.push(resolution);
        else list[idx] = resolution;
        return { ...prev, contradictionResolutions: list };
      });
    },
    [updateSaveState],
  );

  const handleSaveTargetedResponse = useCallback(
    (response: TargetedResponse) => {
      storeTargetedResponse(response);
      updateSaveState((prev) => {
        const list = [...(prev.targetedResponses ?? [])];
        const idx = list.findIndex((r) => r.promptId === response.promptId);
        if (idx === -1) list.push(response);
        else list[idx] = response;
        return { ...prev, targetedResponses: list };
      });
    },
    [updateSaveState],
  );

  const handleOpenVectorRefinement = useCallback(() => {
    setRightPanelView("vector_refinement");
    setMobilePanel("right");
  }, []);

  /* ━━━ v8: Memory Dive / Micro Question / Calendar handlers ━━━ */

  const handleCalendarDateJump = useCallback(
    (date: string, target: "todo" | "journal") => {
      setJumpDate(date);
      setTab(target);
    },
    [],
  );

  const handleStartMemoryDive = useCallback(
    (year?: number, month?: number) => {
      setDiveInitialYear(year);
      setDiveInitialMonth(month);
      setCalendarCellDetail(null);
      setViewMode("memory_dive");
    },
    [],
  );

  const handleMemoryDiveComplete = useCallback(
    (gem: MemoryGem) => {
      storeMemoryGem(gem);
      updateSaveState((prev) => ({
        ...prev,
        memoryGems: [...(prev.memoryGems ?? []), gem],
      }));
      setViewMode("workspace");
      setDiveInitialYear(undefined);
      setDiveInitialMonth(undefined);
    },
    [updateSaveState],
  );

  const handleMemoryDiveCancel = useCallback(() => {
    setViewMode("workspace");
    setDiveInitialYear(undefined);
    setDiveInitialMonth(undefined);
  }, []);

  const handleMicroQuestionAnswer = useCallback(
    (answer: MicroQuestionAnswer) => {
      storeMicroQuestionAnswer(answer);
      const updatedStreak = updateStreak(microStreak, answer.answeredAt.slice(0, 10));
      storeMicroQuestionStreak(updatedStreak);
      updateSaveState((prev) => ({
        ...prev,
        microQuestionAnswers: [...(prev.microQuestionAnswers ?? []), answer],
        microQuestionStreak: updatedStreak,
      }));
      // ストリークマイルストーンチェック
      const milestone = getStreakMilestone(updatedStreak.currentStreak);
      if (milestone) setStreakMilestone(milestone);
      // ストリークフリーズ付与チェック
      maybeGrantStreakFreeze(updatedStreak.currentStreak);
    },
    [microStreak, updateSaveState],
  );

  const handleSaveBirthDate = useCallback(
    (year: number, month: number) => {
      storeBirthDate(year, month);
      updateSaveState((prev) => ({ ...prev, birthYear: year, birthMonth: month }));
    },
    [updateSaveState],
  );

  const handleCalendarCellClick = useCallback(
    (year: number, month: number) => {
      setCalendarCellDetail({ year, month });
    },
    [],
  );

  /** DeepExplorationFlow 完了 */
  const handleDeepExplorationComplete = useCallback(
    (result: ExplorationResult) => {
      if (deepDiveTarget) {
        updateChapter(
          deepDiveTarget.id,
          result.updatedLayers,
          result.newEchoes,
          result.newTitle,
          result.hypothesis,
        );
      }
      const nextChapters = getChapters();
      updateSaveState((prev) => ({ ...prev, chapters: nextChapters }));
      setDeepDiveTarget(null);
      setDeepDiveAxis(undefined);
      setViewMode("workspace");
    },
    [deepDiveTarget, updateSaveState],
  );

  const handleDeepExplorationCancel = useCallback(() => {
    setDeepDiveTarget(null);
    setDeepDiveAxis(undefined);
    setViewMode("workspace");
  }, []);

  const handleCurrentPositionComplete = useCallback(
    (pos: CurrentPosition) => {
      saveCurrentPosition(pos);
      updateSaveState((prev) => ({ ...prev, currentPosition: pos }));
      void persistOriginSessionState({
        sessionId: sessionMeta.activeSessionId,
        currentPosition: pos,
      })
        .then((result) => {
          if (!result.sessionId) return;
          setSessionMeta((prev) => ({
            ...prev,
            activeSessionId: result.sessionId,
            activeSessionStatus: result.status ?? prev.activeSessionStatus,
            latestSessionId: result.sessionId,
          }));
        })
        .catch((error) => {
          console.error("[origin] current position sync failed:", error);
        });
      setViewMode("position_bridge");
    },
    [sessionMeta.activeSessionId, updateSaveState],
  );

  const handleBridgeProceed = useCallback(() => {
    const draft = startNewDraft();
    updateSaveState((prev) => ({ ...prev, draft }));
    setViewMode("exploration");
  }, [updateSaveState]);

  const handleResumeDraft = useCallback(() => {
    if (!isDraftStarted(currentDraft)) {
      setViewMode("workspace");
      return;
    }
    setViewMode("exploration");
  }, [currentDraft]);

  const handleDiscardDraft = useCallback(() => {
    clearDraft();
    persistSignatureRef.current = "";
    updateSaveState((prev) => ({ ...prev, draft: null }));
    void persistOriginSessionState({
      sessionId: sessionMeta.activeSessionId,
      status: "cancelled",
      draft: null,
      currentStep: null,
    })
      .then((result) => {
        setSessionMeta((prev) => ({
          ...prev,
          activeSessionId: result.sessionId,
          activeSessionStatus: result.status,
        }));
      })
      .catch((error) => {
        console.error("[origin] discard sync failed:", error);
      });
    setViewMode("workspace");
  }, [sessionMeta.activeSessionId, updateSaveState]);

  const handleExplorationComplete = useCallback(
    (chapter: MemoryChapter) => {
      const nextChapters = getChapters();
      persistSignatureRef.current = "";
      updateSaveState((prev) => ({
        ...prev,
        chapters: nextChapters,
        draft: null,
      }));
      // インサイト検出
      const prevSave = prevSaveRef.current;
      const nextSave = { ...prevSave, chapters: nextChapters, draft: null };
      const newInsights = detectNewInsights(prevSave, nextSave);
      if (newInsights.length > 0) setPendingInsight(newInsights[0]);
      prevSaveRef.current = nextSave;

      // Welcome flowからの探索完了時はマップ画面へ
      if (fromWelcomeRef.current) {
        fromWelcomeRef.current = false;
        setViewMode("welcome_map");
      } else {
        // セレモニー表示
        setCeremonyChapter({ count: nextChapters.length, title: chapter.title ?? "記憶の断片" });
        setViewMode("ceremony");
      }
      setSessionMeta((prev) => ({
        ...prev,
        activeSessionStatus: null,
        latestRecordId: chapter.id,
        latestSessionCompleted: true,
        latestSessionResultGenerated: true,
      }));

      void completeOriginChapter({
        sessionId: sessionMeta.activeSessionId,
        chapter,
        currentPosition,
      })
        .then((result) => {
          setSessionMeta((prev) => ({
            ...prev,
            activeSessionId: null,
            activeSessionStatus: null,
            latestSessionId: result.sessionId,
            latestSessionCompleted: true,
            latestSessionResultGenerated: true,
            latestRecordId: result.recordId,
          }));
        })
        .catch((error) => {
          console.error("[origin] completion sync failed:", error);
        });
    },
    [currentPosition, sessionMeta.activeSessionId, updateSaveState],
  );

  const handleExplorationCancel = useCallback(() => {
    setViewMode(chapters.length === 0 && isDraftStarted(currentDraft) ? "resume_prompt" : "workspace");
  }, [chapters.length, currentDraft]);

  const handleFlowStateChange = useCallback(
    (snapshot: {
      draft: DraftChapter;
      step: ExplorationStep;
      status: "in_progress" | "generating";
    }) => {
      updateSaveState((prev) => ({ ...prev, draft: snapshot.draft }));

      // 探索プログレス更新（モバイルプログレスバー用）
      const stepIndex = STEP_ORDER.indexOf(snapshot.step);
      setExplorationProgress({ step: snapshot.step, index: stepIndex });

      const signature = JSON.stringify({
        sessionId: sessionMeta.activeSessionId ?? "",
        status: snapshot.status,
        step: snapshot.step,
        draft: snapshot.draft,
        currentPosition: currentPosition ?? null,
      });

      if (persistSignatureRef.current === signature) return;
      persistSignatureRef.current = signature;

      void persistOriginSessionState({
        sessionId: sessionMeta.activeSessionId,
        status: snapshot.status,
        currentStep: snapshot.step,
        draft: snapshot.draft,
        currentPosition,
      })
        .then((result) => {
          if (!result.sessionId) return;
          setSessionMeta((prev) => ({
            ...prev,
            activeSessionId: result.sessionId,
            activeSessionStatus: result.status ?? snapshot.status,
            latestSessionId: result.sessionId,
          }));
        })
        .catch((error) => {
          console.error("[origin] session sync failed:", error);
        });
    },
    [currentPosition, sessionMeta.activeSessionId, updateSaveState],
  );

  /** フルスクリーンオーバーレイ判定 */
  const isOverlayMode = viewMode !== "workspace" && viewMode !== "welcome" && viewMode !== "welcome_map" && viewMode !== "ceremony";

  const generatingCard = useMemo(
    () => (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-4 py-16 text-center"
      >
        <div className="h-3 w-3 animate-pulse rounded-full bg-amber-400/80" />
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">
            結果を準備しています
          </h2>
          <p className="max-w-xs text-sm leading-relaxed text-gray-500">
            記録は完了しています。結果がまだ揃っていないため、未開始には戻さず生成中として扱います。
          </p>
        </div>
        <div className="flex gap-3">
          {isDraftStarted(currentDraft) && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleResumeDraft}
              className="rounded-2xl bg-amber-400/90 px-6 py-2.5 text-sm font-semibold text-white shadow-md"
            >
              生成を再開
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setViewMode("workspace")}
            className="rounded-2xl bg-white/70 px-6 py-2.5 text-sm font-medium text-gray-600"
          >
            保存済みを確認
          </motion.button>
        </div>
      </motion.div>
    ),
    [currentDraft, handleResumeDraft],
  );

  // ── Welcome Flow Handlers ──
  const handleWelcomeStartExploration = useCallback(() => {
    fromWelcomeRef.current = true;
    const position = loadCurrentPosition() ?? currentPosition;
    if (!position) {
      setViewMode("current_position");
      return;
    }
    const draft = startNewDraft();
    updateSaveState((prev) => ({ ...prev, draft }));
    setViewMode("exploration");
  }, [currentPosition, updateSaveState]);

  const handleWelcomeComplete = useCallback((selectedTab: TabKey) => {
    markOnboarded();
    // セーブデータにもフラグを埋め込む（localStorage単独キーが消えても復元可能）
    setSaveState((prev) => ({ ...prev, onboarded: true }));
    setTab(selectedTab);
    setViewMode("workspace");
  }, []);

  const handleWelcomeSkip = useCallback(() => {
    markOnboarded();
    setSaveState((prev) => ({ ...prev, onboarded: true }));
    setViewMode("workspace");
  }, []);

  // ── Welcome画面 / Welcome Map ──
  if (viewMode === "welcome" || viewMode === "welcome_map") {
    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#f5f0e8]">
        <OriginWelcomeFlow
          onComplete={handleWelcomeComplete}
          onSkip={handleWelcomeSkip}
          initialPhase={viewMode === "welcome_map" ? "map" : "intro"}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#f5f0e8]">
      <Suspense fallback={null}><AlterContextBanner page="origin" /></Suspense>
      {/* ── Navbar ── */}
      <nav
        className="relative z-30 flex shrink-0 items-center justify-between px-4"
        style={{
          height: 56,
          borderBottom: "1px solid #e0d6c4",
          background: "rgba(248,242,230,0.92)",
          backdropFilter: "blur(12px)",
        }}
      >
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm font-bold tracking-wide"
          style={{ color: "#3a2a1a", textDecoration: "none" }}
        >
          <span style={{ fontSize: 18, opacity: 0.6 }}>←</span>
          Origin
        </Link>

        <div ref={tabBarRef} className="flex gap-0.5 rounded-full bg-white/40 p-0.5">
          {(
            [
              { key: "todo" as TabKey, label: "今日やること", icon: "✅" },
              { key: "journal" as TabKey, label: "ジャーナル", icon: "📝" },
              { key: "profile" as TabKey, label: "プロフィール", icon: "👤" },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`
                relative rounded-full px-3 py-2 text-xs font-medium transition-all
                min-h-[44px] min-w-[44px]
                ${
                  tab === item.key
                    ? "bg-white/90 text-gray-800 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }
              `}
            >
              <span className="hidden lg:inline">{item.label}</span>
              <span className="lg:hidden">{item.icon}</span>
              {tab === item.key && (
                <motion.div
                  layoutId="tab-active-pill"
                  className="absolute inset-0 rounded-full bg-white/90 shadow-sm"
                  style={{ zIndex: -1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ワークスペースモード切替 + ダイジェスト */}
        <div className="flex items-center gap-1.5">
          {tab === "memory" && formationDigest.isReady && (
            <button
              onClick={() => setShowDigest(true)}
              className="rounded-full bg-indigo-50/60 px-3 py-1 text-[10px] font-medium text-indigo-500 transition-all hover:bg-indigo-100/80"
              title="形成史ダイジェスト"
            >
              ✨ ダイジェスト
            </button>
          )}
          {tab === "memory" && (
            <button
              onClick={toggleWorkspaceMode}
              className={`rounded-full px-3 py-1 text-[10px] font-medium transition-all ${
                workspaceMode
                  ? "bg-amber-100/80 text-amber-700"
                  : "bg-white/40 text-gray-500 hover:text-gray-700"
              }`}
              title={workspaceMode ? "シンプルモードに切替" : "ワークスペースモードに切替"}
            >
              {workspaceMode ? "📐 WS" : "📐"}
            </button>
          )}
        </div>
        {tab !== "memory" && <div style={{ width: 48 }} />}
      </nav>

      {/* ── Main Content ── */}
      <motion.div
        className="relative flex-1 overflow-hidden"
        drag={viewMode === "workspace" ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.1}
        onDragEnd={(_e, info) => {
          const TAB_ORDER: TabKey[] = ["todo", "journal", "profile"];
          const idx = TAB_ORDER.indexOf(tab);
          if (info.offset.x < -50 || info.velocity.x < -300) {
            if (idx < TAB_ORDER.length - 1) setTab(TAB_ORDER[idx + 1]);
          } else if (info.offset.x > 50 || info.velocity.x > 300) {
            if (idx > 0) setTab(TAB_ORDER[idx - 1]);
          }
        }}
        style={{ touchAction: "pan-y" }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={tab === "memory" ? "h-full" : "h-full overflow-y-auto"}
          >
          {tab === "memory" && (
            <div
              className="h-full"
            >
              {/* ── Workspace ── */}
              {!isOverlayMode && (
                <>
                  {/* Desktop: Progressive (center only) or 3-panel workspace */}
                  <div className={`hidden h-full lg:flex ${!workspaceMode ? "justify-center" : ""}`}>
                    {/* Progressive mode: drawer trigger buttons */}
                    {!workspaceMode && (
                      <div className="fixed left-3 top-1/2 z-30 -translate-y-1/2">
                        <button
                          onClick={() => setLeftDrawerOpen(true)}
                          className="rounded-full bg-white/70 p-2 text-xs text-gray-500 shadow-sm backdrop-blur-sm transition-colors hover:bg-white/90"
                          title="履歴・プロフィール"
                        >
                          📋
                        </button>
                      </div>
                    )}
                    {!workspaceMode && (
                      <div className="fixed right-3 top-1/2 z-30 -translate-y-1/2">
                        <button
                          onClick={() => setRightDrawerOpen(true)}
                          className="rounded-full bg-white/70 p-2 text-xs text-gray-500 shadow-sm backdrop-blur-sm transition-colors hover:bg-white/90"
                          title="詳細"
                        >
                          📄
                        </button>
                      </div>
                    )}
                    {/* Slide-out Drawers (progressive mode) */}
                    {!workspaceMode && (
                      <>
                        <SlideOutDrawer
                          open={leftDrawerOpen}
                          onClose={() => setLeftDrawerOpen(false)}
                          side="left"
                          title="履歴"
                        >
                          <LeftPanel
                            rootProfile={saveState.rootProfile}
                            eraAffiliations={saveState.eraAffiliations ?? []}
                            residueBoard={saveState.residueBoard ?? []}
                            currentPosition={currentPosition}
                            chapters={chapters}
                            selectedChapter={selectedChapter}
                            onEditRoot={handleEditRoot}
                            onEditEra={handleEditEra}
                            onEditResidue={handleEditResidue}
                            onStartExploration={handleStartNew}
                            backbone={backbone}
                            entrySuggestions={filteredEntrySuggestions}
                            onAcceptSuggestedActivity={handleAcceptSuggestedActivity}
                            onAcceptSuggestedTurningPoint={handleAcceptSuggestedTurningPoint}
                            onAcceptSuggestedEra={handleAcceptSuggestedEra}
                            onDismissSuggestion={handleDismissSuggestion}
                            secondSelfPreview={secondSelfPreview}
                            onOpenVectorRefinement={handleOpenVectorRefinement}
                          />
                        </SlideOutDrawer>
                        <SlideOutDrawer
                          open={rightDrawerOpen}
                          onClose={() => setRightDrawerOpen(false)}
                          side="right"
                          title="詳細"
                        >
                          <RightPanel
                            view={rightPanelView}
                            selectedChapter={selectedChapter}
                            onDeepDive={handleDeepDiveFromDetail}
                            onCloseDetail={handleCloseDetail}
                            onCloseEditor={handleCloseEditor}
                            rootProfile={saveState.rootProfile}
                            onSaveRootProfile={handleSaveRootProfile}
                            selectedEra={selectedEra}
                            onSaveEra={handleSaveEra}
                            onDeleteEra={handleDeleteEra}
                            selectedActivity={selectedActivity}
                            onSaveActivity={handleSaveActivity}
                            onDeleteActivity={handleDeleteActivity}
                            selectedTurningPoint={selectedTurningPoint}
                            onSaveTurningPoint={handleSaveTurningPoint}
                            onDeleteTurningPoint={handleDeleteTurningPoint}
                            residueItems={saveState.residueBoard ?? []}
                            onSaveResidueItem={handleSaveResidueItem}
                            onDeleteResidueItem={handleDeleteResidueItem}
                            activityFrameSuggestions={activityFrameSuggestions}
                            turningPointFrameSuggestions={turningPointFrameSuggestions}
                            residueSuggestions={residueSuggestions}
                            vectorRefinementResult={vectorGaps}
                            currentVector={secondSelfPreview.rendezvousPreview}
                            onSaveTargetedResponse={handleSaveTargetedResponse}
                          />
                        </SlideOutDrawer>
                      </>
                    )}

                    {/* Left Panel (workspace mode only) */}
                    {workspaceMode && (
                      <div className="w-80 shrink-0 border-r border-amber-200/30 overflow-y-auto">
                        <LeftPanel
                          rootProfile={saveState.rootProfile}
                          eraAffiliations={saveState.eraAffiliations ?? []}
                          residueBoard={saveState.residueBoard ?? []}
                          currentPosition={currentPosition}
                          chapters={chapters}
                          selectedChapter={selectedChapter}
                          onEditRoot={handleEditRoot}
                          onEditEra={handleEditEra}
                          onEditResidue={handleEditResidue}
                          onStartExploration={handleStartNew}
                          backbone={backbone}
                          entrySuggestions={filteredEntrySuggestions}
                          onAcceptSuggestedActivity={handleAcceptSuggestedActivity}
                          onAcceptSuggestedTurningPoint={handleAcceptSuggestedTurningPoint}
                          onAcceptSuggestedEra={handleAcceptSuggestedEra}
                          onDismissSuggestion={handleDismissSuggestion}
                          secondSelfPreview={secondSelfPreview}
                          onOpenVectorRefinement={handleOpenVectorRefinement}
                        />
                      </div>
                    )}

                    {/* Center Panel (always visible) */}
                    <div className="flex-1 min-w-0 overflow-y-auto">
                      {showResumeBanner && <ResumeBanner onResume={handleResumeDraft} onDiscard={handleDiscardDraft} />}
                      <div className="px-4 pt-4">
                        {aiObservation && (
                          <AICompanionCard
                            emoji={aiObservation.emoji}
                            text={aiObservation.text}
                            depth={aiObservation.depth}
                            onDismiss={() => setAiObservation(null)}
                          />
                        )}
                        {showYesterdayEcho && yesterdayEcho && (
                          <YesterdayEcho
                            date={yesterdayEcho.date}
                            answer={yesterdayEcho.answer}
                            onDismiss={() => setShowYesterdayEcho(false)}
                          />
                        )}
                        <DailyMicroQuestion
                          question={dailyQuestion}
                          streak={microStreak}
                          onAnswer={handleMicroQuestionAnswer}
                          birthYear={saveState.birthYear}
                          greeting={aiGreeting}
                        />
                        {/* 探索段階 + 次のチャレンジ（desktop center） */}
                        <div className="mt-3 space-y-2">
                          <ExplorationStageBadge stage={explorationStage} chapterCount={chapters.length} />
                          <NextChallengeCard
                            challenge={nextChallenge}
                            onAccept={() => {
                              if (nextChallenge.type === "daily_streak") {
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              } else {
                                handleStartNew();
                              }
                            }}
                          />
                        </div>
                      </div>
                      <CenterPanel
                        chapters={chapters}
                        currentPosition={currentPosition}
                        activities={saveState.activities ?? []}
                        turningPoints={saveState.turningPoints ?? []}
                        eraAffiliations={saveState.eraAffiliations ?? []}
                        selectedChapterId={selectedChapter?.id ?? null}
                        onStartExploration={handleStartNew}
                        onDeepDiveChapter={handleDeepDiveChapter}
                        onSelectChapter={handleSelectChapterForDetail}
                        onSelectActivity={handleSelectActivity}
                        onSelectTurningPoint={handleSelectTurningPoint}
                        snapshot={snapshot}
                        chains={formationChains}
                        residueSummary={residueSummary}
                        pressureReward={pressureReward}
                        behavioralLaws={behavioralLaws}
                        echoTimeline={echoTimeline}
                        observationGaps={observationGaps}
                        collapseGrowthInsights={saveState.collapseGrowthInsights}
                        contradictionResolutions={saveState.contradictionResolutions}
                        onSaveCollapseGrowthInsight={handleSaveCollapseGrowthInsight}
                        onSaveContradictionResolution={handleSaveContradictionResolution}
                        compact={!workspaceMode}
                      />
                    </div>

                    {/* Right Panel (workspace mode only) */}
                    {workspaceMode && (
                      <div className="w-96 shrink-0 border-l border-amber-200/30 overflow-y-auto">
                        <RightPanel
                          view={rightPanelView}
                          selectedChapter={selectedChapter}
                          onDeepDive={handleDeepDiveFromDetail}
                          onCloseDetail={handleCloseDetail}
                          onCloseEditor={handleCloseEditor}
                          rootProfile={saveState.rootProfile}
                          onSaveRootProfile={handleSaveRootProfile}
                          selectedEra={selectedEra}
                          onSaveEra={handleSaveEra}
                          onDeleteEra={handleDeleteEra}
                          selectedActivity={selectedActivity}
                          onSaveActivity={handleSaveActivity}
                          onDeleteActivity={handleDeleteActivity}
                          selectedTurningPoint={selectedTurningPoint}
                          onSaveTurningPoint={handleSaveTurningPoint}
                          onDeleteTurningPoint={handleDeleteTurningPoint}
                          residueItems={saveState.residueBoard ?? []}
                          onSaveResidueItem={handleSaveResidueItem}
                          onDeleteResidueItem={handleDeleteResidueItem}
                          activityFrameSuggestions={activityFrameSuggestions}
                          turningPointFrameSuggestions={turningPointFrameSuggestions}
                          residueSuggestions={residueSuggestions}
                          vectorRefinementResult={vectorGaps}
                          currentVector={secondSelfPreview.rendezvousPreview}
                          onSaveTargetedResponse={handleSaveTargetedResponse}
                        />
                      </div>
                    )}
                  </div>

                  {/* Mobile: Center-only layout + BottomSheets */}
                  <div className="flex h-full flex-col lg:hidden">
                    <div className="flex-1 overflow-y-auto" style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
                      {showResumeBanner && <div className="px-4 pt-4"><ResumeBanner onResume={handleResumeDraft} onDiscard={handleDiscardDraft} /></div>}
                      {aiObservation && (
                        <div className="px-5 pt-5">
                          <AICompanionCard
                            emoji={aiObservation.emoji}
                            text={aiObservation.text}
                            depth={aiObservation.depth}
                            onDismiss={() => setAiObservation(null)}
                          />
                        </div>
                      )}
                      {yesterdayEcho && showYesterdayEcho && (
                        <div className="p-5">
                          <YesterdayEcho
                            date={yesterdayEcho.date}
                            answer={yesterdayEcho.answer}
                            onDismiss={() => setShowYesterdayEcho(false)}
                          />
                        </div>
                      )}
                      <div className="p-5">
                        <DailyMicroQuestion
                          question={dailyQuestion}
                          streak={microStreak}
                          onAnswer={handleMicroQuestionAnswer}
                          birthYear={saveState.birthYear}
                          greeting={aiGreeting}
                        />
                        {/* 探索段階 + チャレンジ（mobile） */}
                        <div className="mt-3 space-y-2">
                          <ExplorationStageBadge stage={explorationStage} chapterCount={chapters.length} />
                          <NextChallengeCard
                            challenge={nextChallenge}
                            onAccept={() => {
                              if (nextChallenge.type === "daily_streak") {
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              } else {
                                handleStartNew();
                              }
                            }}
                          />
                        </div>
                      </div>
                      <CenterPanel
                        chapters={chapters}
                        currentPosition={currentPosition}
                        activities={saveState.activities ?? []}
                        turningPoints={saveState.turningPoints ?? []}
                        eraAffiliations={saveState.eraAffiliations ?? []}
                        selectedChapterId={selectedChapter?.id ?? null}
                        onStartExploration={handleStartNew}
                        onDeepDiveChapter={handleDeepDiveChapter}
                        onSelectChapter={handleSelectChapterForDetail}
                        onSelectActivity={handleSelectActivity}
                        onSelectTurningPoint={handleSelectTurningPoint}
                        snapshot={snapshot}
                        chains={formationChains}
                        residueSummary={residueSummary}
                        pressureReward={pressureReward}
                        behavioralLaws={behavioralLaws}
                        echoTimeline={echoTimeline}
                        observationGaps={observationGaps}
                        collapseGrowthInsights={saveState.collapseGrowthInsights}
                        contradictionResolutions={saveState.contradictionResolutions}
                        onSaveCollapseGrowthInsight={handleSaveCollapseGrowthInsight}
                        onSaveContradictionResolution={handleSaveContradictionResolution}
                        compact
                      />
                    </div>

                    {/* BottomSheet: Left (履歴) */}
                    <BottomSheet
                      open={bottomSheetPanel === "left"}
                      onClose={() => setBottomSheetPanel(null)}
                      title="履歴・プロフィール"
                    >
                      <LeftPanel
                        rootProfile={saveState.rootProfile}
                        eraAffiliations={saveState.eraAffiliations ?? []}
                        residueBoard={saveState.residueBoard ?? []}
                        currentPosition={currentPosition}
                        chapters={chapters}
                        selectedChapter={selectedChapter}
                        onEditRoot={handleEditRoot}
                        onEditEra={handleEditEra}
                        onEditResidue={handleEditResidue}
                        onStartExploration={handleStartNew}
                        backbone={backbone}
                        entrySuggestions={filteredEntrySuggestions}
                        onAcceptSuggestedActivity={handleAcceptSuggestedActivity}
                        onAcceptSuggestedTurningPoint={handleAcceptSuggestedTurningPoint}
                        onAcceptSuggestedEra={handleAcceptSuggestedEra}
                        onDismissSuggestion={handleDismissSuggestion}
                        secondSelfPreview={secondSelfPreview}
                        onOpenVectorRefinement={handleOpenVectorRefinement}
                      />
                    </BottomSheet>

                    {/* BottomSheet: Right (詳細) */}
                    <BottomSheet
                      open={bottomSheetPanel === "right"}
                      onClose={() => setBottomSheetPanel(null)}
                      title="詳細"
                    >
                      <RightPanel
                        view={rightPanelView}
                        selectedChapter={selectedChapter}
                        onDeepDive={handleDeepDiveFromDetail}
                        onCloseDetail={handleCloseDetail}
                        onCloseEditor={handleCloseEditor}
                        rootProfile={saveState.rootProfile}
                        onSaveRootProfile={handleSaveRootProfile}
                        selectedEra={selectedEra}
                        onSaveEra={handleSaveEra}
                        onDeleteEra={handleDeleteEra}
                        selectedActivity={selectedActivity}
                        onSaveActivity={handleSaveActivity}
                        onDeleteActivity={handleDeleteActivity}
                        selectedTurningPoint={selectedTurningPoint}
                        onSaveTurningPoint={handleSaveTurningPoint}
                        onDeleteTurningPoint={handleDeleteTurningPoint}
                        residueItems={saveState.residueBoard ?? []}
                        onSaveResidueItem={handleSaveResidueItem}
                        onDeleteResidueItem={handleDeleteResidueItem}
                        activityFrameSuggestions={activityFrameSuggestions}
                        turningPointFrameSuggestions={turningPointFrameSuggestions}
                        residueSuggestions={residueSuggestions}
                        vectorRefinementResult={vectorGaps}
                        currentVector={secondSelfPreview.rendezvousPreview}
                        onSaveTargetedResponse={handleSaveTargetedResponse}
                      />
                    </BottomSheet>
                  </div>
                </>
              )}

              {/* ── Full-screen overlay modes ── */}
              {isOverlayMode && (
                <div className="h-full overflow-y-auto">
                  <div className="mx-auto max-w-lg px-4 py-6">
                    {viewMode === "resume_prompt" && (
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center gap-4 py-12"
                      >
                        <span className="text-3xl">📝</span>
                        <p className="text-sm text-gray-600">
                          途中の探索があります。続きから再開しますか？
                        </p>
                        <div className="flex gap-3">
                          <motion.button
                            whileTap={{ scale: 0.97 }}
                            onClick={handleResumeDraft}
                            className="rounded-2xl bg-amber-400/90 px-6 py-2.5 text-sm font-semibold text-white shadow-md"
                          >
                            続きから
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.97 }}
                            onClick={handleDiscardDraft}
                            className="rounded-2xl bg-white/70 px-6 py-2.5 text-sm font-medium text-gray-600"
                          >
                            最初から
                          </motion.button>
                        </div>
                      </motion.div>
                    )}

                    {viewMode === "current_position" && (
                      <CurrentPositionStep onComplete={handleCurrentPositionComplete} />
                    )}

                    {viewMode === "position_bridge" && currentPosition && (
                      <CurrentPositionBridge
                        position={currentPosition}
                        onProceed={handleBridgeProceed}
                      />
                    )}

                    {viewMode === "exploration" && (
                      <>
                        {explorationProgress && (
                          <MobileProgressBar
                            progress={(explorationProgress.index + 1) / STEP_ORDER.length}
                            label={`${explorationProgress.index + 1} / ${STEP_ORDER.length}`}
                          />
                        )}
                        <MemoryExplorationFlow
                          initialDraft={currentDraft}
                          onComplete={handleExplorationComplete}
                          onCancel={handleExplorationCancel}
                          onStateChange={handleFlowStateChange}
                        />
                      </>
                    )}

                    {viewMode === "deep_exploration" && (
                      <DeepExplorationFlow
                        targetChapter={deepDiveTarget ?? undefined}
                        initialPeriod={deepDiveTarget?.fact.period}
                        explorationAxis={deepDiveAxis}
                        onComplete={handleDeepExplorationComplete}
                        onCancel={handleDeepExplorationCancel}
                      />
                    )}

                    {viewMode === "generating" && generatingCard}
                  </div>
                </div>
              )}

            </div>
          )}

          {tab === "calendar" && (
            <div
              className="h-full overflow-y-auto"
            >
              <div className="mx-auto max-w-4xl px-4 py-6">
                {/* デイリー・マイクロ質問 */}
                <DailyMicroQuestion
                  question={dailyQuestion}
                  streak={microStreak}
                  onAnswer={handleMicroQuestionAnswer}
                  birthYear={saveState.birthYear}
                  greeting={aiGreeting}
                />

                {/* 人生カレンダー */}
                <div className="mt-6">
                  <LifeCalendar
                    grid={lifeCalendar}
                    onCellClick={handleCalendarCellClick}
                    onSaveBirthDate={handleSaveBirthDate}
                  />
                </div>

                {/* セル詳細パネル */}
                {calendarCellDetail && (
                  <CalendarCellDetail
                    year={calendarCellDetail.year}
                    month={calendarCellDetail.month}
                    gems={(saveState.memoryGems ?? []).filter(
                      (g) => g.calendarYear === calendarCellDetail.year && g.calendarMonth === calendarCellDetail.month,
                    )}
                    answers={(saveState.microQuestionAnswers ?? []).filter(
                      (a) => a.calendarYear === calendarCellDetail.year && a.calendarMonth === calendarCellDetail.month,
                    )}
                    chapters={chapters.filter((c) => {
                      const gems = (saveState.memoryGems ?? []).filter(
                        (g) => g.calendarYear === calendarCellDetail.year && g.calendarMonth === calendarCellDetail.month,
                      );
                      return gems.some((g) => c.fact.period === g.lifePeriod);
                    })}
                    onClose={() => setCalendarCellDetail(null)}
                    onStartDive={() => handleStartMemoryDive(calendarCellDetail.year, calendarCellDetail.month)}
                  />
                )}
              </div>
            </div>
          )}

          {tab === "todo" && (
            <div>
              <TodoSection
                onDateJump={handleCalendarDateJump}
                jumpDate={tab === "todo" ? jumpDate : null}
                onJumpHandled={() => setJumpDate(null)}
              />
              {/* Entry Gate — タスク一覧の下にコンパクト配置 */}
              <div className="mx-auto max-w-lg px-4 pb-4">
                <EntryGate
                  onComplete={handleEntryComplete}
                  todayEntry={todayEntry}
                  compact
                />
              </div>
            </div>
          )}

          {tab === "journal" && (
            <div>
              {!weeklyReviewDismissed && (
                <div className="mx-auto max-w-lg px-4 pt-4">
                  <WeeklyReviewCard onDismiss={() => setWeeklyReviewDismissed(true)} />
                </div>
              )}
              <JournalSection
                onStartMemoryDive={() => handleStartMemoryDive()}
                jumpToDate={jumpDate}
                onJumpHandled={() => setJumpDate(null)}
              />
            </div>
          )}

          {tab === "profile" && (
            <div>
              <ProfileSection
                onStartMemoryExploration={() => {
                  setTab("memory");
                  setViewMode("workspace");
                }}
                onStartMemoryDive={() => handleStartMemoryDive()}
              />
              {/* 証拠カード — 1枚のみ表示（成長サマリーの下） */}
              <div className="mx-auto max-w-lg px-4 pb-4 space-y-4">
                <EvidenceCards maxCards={1} />
              </div>
            </div>
          )}

          {/* Legacy tabs (accessible from Profile archive links) */}
          {tab === "orbit" && (
            <div className="h-full">
              <DailyOrbitSection />
            </div>
          )}
          </motion.div>
        </AnimatePresence>

        {/* ── Memory Dive overlay (tab-independent) ── */}
        <AnimatePresence>
          {viewMode === "memory_dive" && (
            <motion.div
              key="memory-dive-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20"
            >
              <div className="h-full overflow-y-auto">
                <MemoryDiveFlow
                  initialYear={diveInitialYear}
                  initialMonth={diveInitialMonth}
                  birthYear={saveState.birthYear}
                  onComplete={handleMemoryDiveComplete}
                  onCancel={handleMemoryDiveCancel}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Mobile FAB (workspace mode only) ── */}
      {viewMode === "workspace" && tab === "memory" && (
        <OriginFAB
          onNewMemory={handleStartNew}
          onDailyQuestion={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          onProfileAdd={() => setBottomSheetPanel("left")}
        />
      )}

      {/* ── Formation Digest Overlay ── */}
      <AnimatePresence>
        {showDigest && formationDigest.isReady && (
          <FormationDigestView
            digest={formationDigest}
            onClose={() => setShowDigest(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Retention Overlays ── */}
      {absenceMsg && (
        <AbsenceRecovery
          emoji={absenceMsg.emoji}
          title={absenceMsg.title}
          body={absenceMsg.body}
          onDismiss={() => setAbsenceMsg(null)}
        />
      )}

      {streakMilestone && (
        <StreakCelebration
          milestone={streakMilestone}
          onDismiss={() => setStreakMilestone(null)}
        />
      )}

      {/* ── Emotional Staging Overlays ── */}
      <AnimatePresence>
        {viewMode === "ceremony" && ceremonyChapter && (
          <motion.div
            key="ceremony-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60]"
          >
            <ChapterCompletionCeremony
              chapterCount={ceremonyChapter.count}
              chapterTitle={ceremonyChapter.title}
              onDismiss={() => {
                setCeremonyChapter(null);
                setViewMode("workspace");
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingInsight && (
          <InsightRevealMoment
            key="insight-reveal"
            insight={pendingInsight}
            onDismiss={() => setPendingInsight(null)}
          />
        )}
      </AnimatePresence>

      <FeatureIntroduction
        {...ORIGIN_INTRO}
        tabBarRef={tabBarRef}
        onComplete={(tab) => {
          if (tab) setTab(tab as TabKey);
        }}
      />
    </div>
  );
}

/* ── Resume Banner (shared between desktop/mobile) ── */
function ResumeBanner({ onResume, onDiscard }: { onResume: () => void; onDiscard: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mt-4 rounded-3xl border border-amber-200/70 bg-white/75 p-4 shadow-sm backdrop-blur-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-800">
            途中の探索があります
          </p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            保存済みの結果はこのまま残しつつ、前回の続きから再開できます。
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={onResume}
            className="rounded-full bg-amber-400/90 px-4 py-2 text-xs font-semibold text-white"
          >
            再開
          </button>
          <button
            onClick={onDiscard}
            className="rounded-full bg-white px-4 py-2 text-xs font-medium text-gray-600"
          >
            破棄
          </button>
        </div>
      </div>
    </motion.div>
  );
}
