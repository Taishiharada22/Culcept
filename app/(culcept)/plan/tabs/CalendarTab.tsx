"use client";

/**
 * CalendarTab — Compact Week Strip + Selected Day Agenda + FAB
 *   (W1-5 → W1-X3 → Phase 2-A で full refactor)
 *
 * 設計書:
 *   - docs/alter-plan-phase2-a-calendar-month-view-mini-design.md (Phase 2-A、本 refactor)
 *   - docs/alter-plan-w15-ui-mini-design.md §2 (週ビュー初版)
 *   - docs/alter-plan-w1x3-cell-add-mini-design.md (旧 cell + 導線、Phase 2-A で削除)
 *
 * 表示 (mock 整合):
 *   - 月 header: ◀ "X月 YYYY" ▶ (tap で月送り、selectedDate 同日維持 + 月末 clamp)
 *   - Weekday labels: 日 月 火 水 木 金 土 (Sun-first、日本標準)
 *   - Week strip (1 行 7 cells): 当週の日付、選択日 = 紫円、今日 = 太字
 *   - Selected day section: 選択日 anchor list、空なら「+ この日に予定を追加」 link
 *   - FAB: 右下 固定、紫 gradient、選択日 prefill で AddAnchorModal 起動
 *
 * 不変原則:
 *   - props signature 不変 (anchors / now / onAddRequest / onAnchorClick)
 *   - anchorsForDay 既存 helper 再利用 (recurring / exception_dates / validity 全継承)
 *   - PlanClient / Modal / API は完全不変
 *
 * 範囲外 (Phase 2-A+ / 2-B / 2-C / Phase 3 預け):
 *   - Full month grid (6×7) ビュー
 *   - 月内 swipe gesture (HomeSwipeContainer 衝突回避)
 *   - keyboard ← → nav (同上)
 *   - 空き日 → ALTER 提案 flow
 *   - anchor density indicator
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";

import { GlassBadge } from "@/components/ui/glassmorphism-design";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { isPlaceUnconfirmed } from "@/lib/plan/locationConfirmationStatus";
import { detectTimedAnchorOverlaps } from "@/lib/plan/anchorOverlap";
import { formatLocationDisplayParts } from "@/lib/plan/anchor-detail-format";
import {
  buildVariablesForProposal,
  selectFirstProposalForDate,
  type CalendarProposalProps,
} from "@/lib/plan/proposal/calendarProposalSelector";
import { selectActiveUndoForDate } from "@/lib/plan/proposal/quietUndoWindow";

import { DayGraphTimeline } from "../components/DayGraphTimeline";
import { useMapTabMovementDisplay } from "./_useMapTabMovementDisplay";
import { useCalendarTabFeasibilityDisplay } from "./_useCalendarTabFeasibilityDisplay";
import {
  applyDisclosureAction,
  getDisclosureStateForIndex,
  resetAllDisclosures,
  type ExpandedTransitionIndices,
} from "@/lib/plan/feasibility/feasibilityDisclosureAdapter";
import { usePlanGeocode } from "./_usePlanGeocode";
import { ProposalChip } from "../components/ProposalChip";
import { CalendarOutfitDashboard } from "./_calendar-outfit/CalendarOutfitDashboard";
import type { AddRequest } from "../PlanClient";
import {
  addMonths,
  anchorsForDay,
  buildWeekStrip,
  clampDateToMonth,
  formatJpDate,
  formatJpYearMonth,
  formatTime,
  getMonthStart,
  isoDate,
  utcMidnight,
  type WeekStripCell,
} from "./_helpers";
import { DayIndicatorBadge } from "../components/DayIndicatorBadge";
import { DayOutlookBanner } from "../components/DayOutlookBanner";
import { rehearseDay, buildRehearsalInputFromDisplay, buildRehearsalInputFull, recoveryStepsFromFeasibilityRaw, DAY_REHEARSAL_FULL_PATH_ENABLED, DAY_REHEARSAL_ENERGY_ENABLED, normalizeInnerWeatherEnergy } from "@/lib/plan/dayRehearsal/dayRehearsal";
import { applyPersonalPaceToRehearsalInput, isPersonalPaceReflectionEnabled } from "@/lib/plan/dayRehearsal/personalPaceAdapter";
import { loadMovementEventStore } from "@/lib/plan/mobility/movementEventStore";
import { buildPersonalPaceRatiosFromStore, buildRehearsalPaceResolver } from "@/lib/plan/mobility/personalPaceResolver";
import { buildPaceActivationReadiness } from "@/lib/plan/mobility/paceActivationReadiness";
import { buildPersonalPaceDogfoodReadiness, summarizeCaptureQuality, type PersonalPaceDogfoodReadiness } from "@/lib/plan/mobility/personalPaceDogfoodReadiness";
import { loadPaceCaptureOptInState } from "@/lib/plan/mobility/paceCaptureOptIn";
import { runPaceShadowActivation, isPaceShadowActivationEnabled, type PaceShadowActivationReport } from "@/lib/plan/mobility/paceShadowActivation";
import { PaceShadowReportPanel } from "@/components/plan/PaceShadowReportPanel";
import { loadSelectedModesForDay } from "@/lib/plan/map/selectedModeStore";
import type { EventNode } from "@/lib/plan/dayGraph/dayGraphTypes";
import { useInnerWeather } from "@/hooks/useInnerWeather";
import { generateDayRepairCandidates, dedupeRepairCandidates, prioritizeRepairCandidates, type DayRepairKind } from "@/lib/plan/dayRehearsal/dayRepairCandidates";
import { previewRepairSimulation, repairSimulationShortLine } from "@/lib/plan/dayRehearsal/dayRepairSimulation";
import type { ConvergenceFactor } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";
import type { DayIndicatorViewModel } from "@/lib/plan/dayIndicatorView";
// Plan 月ビュー M3-a: week ⇄ month toggle（flag gating。月 grid 本体接続は M3-b）
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import {
  DEFAULT_CALENDAR_VIEW_MODE,
  shouldShowCalendarViewToggle,
  type CalendarViewMode,
} from "@/lib/plan/calendarViewMode";
import { CalendarViewToggle } from "../components/CalendarViewToggle";
// M3-b: month grid 本体接続（viewMode=month で MonthGridView を描画）
import { buildMonthGrid } from "./_monthGrid";
import { CalendarViewBody } from "../components/CalendarViewBody";
import type { MonthGridViewProps } from "../components/MonthGridView";
// M3-b polish: 勤務 anchor → 原稿コード chip の resolver（辞書はここ経由。MonthGridView 非依存）
import { resolveShiftAnchorChip } from "@/lib/plan/shift/shiftAnchorChip";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Weekday labels Sun-first (日本ロケール標準、CEO mock 整合) */
const WEEKDAY_LABELS_SUN_FIRST = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** month mode で dayIndicatorByIso 未指定時に渡す安定した空 Map（毎 render の再生成防止） */
const EMPTY_INDICATOR_MAP: ReadonlyMap<string, DayIndicatorViewModel> = new Map();

/** SR #216 D3: 週セル indicator dot の色（H=rose / BD=slate / HREQ=violet。amber 不使用）。 */
function dayIndicatorDotClass(vm?: DayIndicatorViewModel): string {
  if (vm?.variant === "public_holiday") return "bg-rose-400";
  if (vm?.variant === "requested_off") return "bg-violet-300";
  return "bg-slate-300"; // off / 既定
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function CalendarTab({
  anchors,
  now,
  onAddRequest,
  onAnchorClick,
  // ── Phase 3-J-6c: Proposal chip 導線 (= presentational 寄り) ──
  // 全 optional。 未指定なら Phase 2 と完全同じ振る舞い (= backward compat)。
  // 実 proposal 生成 + state 接続は J-6e で PlanClient が担当。
  proposalsByDate,
  proposalTemplateVariables,
  onProposalAccept,
  onProposalModify,
  onProposalDismiss,
  // ── Phase 3-J-6e-3 ──
  acceptingProposalIds,
  recentUndoRecords,
  onProposalUndo,
  // ── Phase 3-K-3b: DayGraph UI 接続 (= selected day timeline で静かに表示) ──
  // K-2 から受領していた dayGraphByDate を、 ここで初めて active 利用。
  // 既存 anchor list は **置換しない**、 timeline を **静かに追加**するだけ。
  // proposal chip 位置不変、 onAnchorClick への bridge 経由で詳細を開く。
  dayGraphByDate,
  // SR #216 D3: 休み/希望休 day-level badge（iso → viewModel）。anchor と別レイヤー。
  dayIndicatorByIso,
}: {
  anchors: ExternalAnchor[];
  /** test 用 inject、現在時刻 (default: new Date()) */
  now?: Date;
  /** Modal 起動 callback (FAB / SelectedDay link で共通) */
  onAddRequest?: (req: AddRequest) => void;
  /** anchor row click で AnchorDetailModal 起動 (W1-X5 既存) */
  onAnchorClick?: (anchor: ExternalAnchor) => void;
  /**
   * K-2 接続層: PlanClient で計算した DayGraph (= date 別 BuildDayGraphResult)。
   * K-2 では tab 側は使用しない (= K-3 以降で UI 接続予定)。
   * optional のため未指定でも既存 UI は不変。
   */
  dayGraphByDate?: Readonly<Record<string, import("@/lib/plan/dayGraph/dayGraphTypes").BuildDayGraphResult>>;
  /** SR #216 D3: 休み/希望休 day-level badge。未指定なら badge なし。 */
  dayIndicatorByIso?: ReadonlyMap<string, DayIndicatorViewModel>;
} & CalendarProposalProps) {
  const baseNow = now ?? new Date();
  const todayDate = utcMidnight(baseNow);
  const todayIso = isoDate(todayDate);
  const todayMonthStart = getMonthStart(baseNow);

  // ── state ──
  const [currentMonth, setCurrentMonth] = useState<Date>(() => todayMonthStart);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  // M3-a: week ⇄ month view（既定 week）。本コミットでは body は week strip のみ
  // （viewMode が month でも month grid は描画しない）。MonthGridView 接続は M3-b。
  const [viewMode, setViewMode] = useState<CalendarViewMode>(
    DEFAULT_CALENDAR_VIEW_MODE
  );
  const showViewToggle = shouldShowCalendarViewToggle(
    PLAN_FLAGS.calendarMonthGridEnabled
  );
  /** 月送り animation の方向 (-1 = 前月、+1 = 翌月、0 = 初回) */
  const [slideDirection, setSlideDirection] = useState<-1 | 0 | 1>(0);

  // Slice 1: 既存の予定タイムライン (= 月送り / week strip / 予定 list / proposal / DayGraph /
  //   feasibility / FAB) を格納する disclosure。
  // 統合 (2026-06-04 CEO union 判断 A): 初期は「開」。 週間 = 既存週ビュー + LP 成果 (dashboard) +
  //   既存 day timeline の三者共存を既定にする (dashboard は最上部の主役位置を維持、 折りたたみは任意操作で可能)。
  //   これにより SH の week strip / day-indicator render contract も既定で満たす。
  const [timelineOpen, setTimelineOpen] = useState<boolean>(true);

  const reducedMotion = useReducedMotion();

  // ── derived ──
  // freeze 修正 (2026-05-31): selectedDateObj / selectedDayAnchors を useMemo で安定化する。
  //   直書きだと毎レンダー新しい ref になり、 これを effect 依存に取る
  //   useMapTabMovementDisplay / useCalendarTabFeasibilityDisplay の effect が毎レンダー再実行 →
  //   async pipeline 完了で setDisplayMap(new Map()) → 再レンダー → また新 ref … と
  //   **無限 async setState ループ**になり main thread を固める (= Chrome「ページが応答しません」)。
  //   MapTab は同じ hook に useMemo 済みの安定 ref を渡しているため固まらない (= 対照証拠)。
  //   selectedDate / anchors が変わらない限り同一 ref を返し、 hook の effect 依存を安定させる。
  const selectedDateObj = useMemo(
    () => new Date(`${selectedDate}T00:00:00.000Z`),
    [selectedDate],
  );
  const weekStrip = buildWeekStrip(selectedDateObj, currentMonth);
  // union(統合 2026-06-04): LP の memoized selectedDayAnchors（freeze 根治）を採用し、
  //   SH の直書き版は破棄（同一変数。 直書きは freeze 再発のため）。 SH の selectedDayIndicator は併存。
  const selectedDayAnchors = useMemo(
    () => anchorsForDay(anchors, selectedDateObj),
    [anchors, selectedDateObj],
  );
  // SR #216 D3: 選択日の休み/希望休 badge（anchor list と別レイヤー）
  const selectedDayIndicator = dayIndicatorByIso?.get(selectedDate);

  // ── L-4d-b1 (= 2026-05-22 CEO 承認): selected day timeline のみ移動時間表示 ──
  //    既存 usePlanGeocode を **selected day anchors の最小 subset に限定** して利用。
  //    PlanClient core への引き上げなし、 新規 endpoint なし、 月 grid 全件 geocode なし。
  //    pipeline 解決前 / 失敗時は空 Map → DayGraphTimeline は K view fallback で「→ 移動」 表示。
  const { resolutions: selectedDayResolutions } = usePlanGeocode(selectedDayAnchors);
  const calendarMovementDisplayByTransitionIndex = useMapTabMovementDisplay(
    selectedDayAnchors,
    selectedDate,
    selectedDayResolutions,
  );

  // ── M-3d MapTab pattern を CalendarTab selected day に展開 ──
  //    feasibility display + per-transition disclosure state。
  //    既存 selectedDayResolutions を読むだけ (= 新規 fetch なし、 localStorage なし)。
  //    pipeline 解決前 / エラー時は空 Map で disclosure UI 非活性化。
  //    not_applicable / sensitive / unresolved は M-2a で map から除外済。
  //    month / grid 全件展開は **絶対禁止** (= selected day detail のみ)。
  const {
    displayByTransitionIndex: calendarFeasibilityDisplayByTransitionIndex,
    rawByTransitionIndex: calendarFeasibilityRawByTransitionIndex,
    travelByTransitionIndex: calendarFeasibilityTravelByTransitionIndex,
  } = useCalendarTabFeasibilityDisplay(
    selectedDayAnchors,
    selectedDate,
    selectedDayResolutions,
  );

  // ★Batch 2 energy（状態次元・flag-gated）: InnerWeather の energy（-1〜1）を 0-1 正規化して baseEnergyLevel に供給。
  //   read-only（GET・client cache・DB write なし）。flag OFF or 未記録（null）は baseEnergyLevel=null＝budget 不変（挙動不変）。
  const innerWeather = useInnerWeather();
  const baseEnergyLevel = useMemo(
    () => (DAY_REHEARSAL_ENERGY_ENABLED ? normalizeInnerWeatherEnergy(innerWeather?.energyLevel) : null),
    [innerWeather],
  );

  // ★Wave 2 Day Rehearsal（選択日 day-level outlook・READ-only）。既存 dayGraph + feasibility を再利用。
  //   ★Batch 1 full-path（flag-gated）: DAY_REHEARSAL_FULL_PATH_ENABLED=ON なら raw feasibility(真の slack/shortfall)
  //   + 実 travel(overlay 由来) で buildRehearsalInputFull（friction が実移動で可変・convergence/recovery 正確・protect_buffer 到達）。
  //   OFF（既定）は従来 Option D status-only degrade（buildRehearsalInputFromDisplay）で挙動不変。
  //   ★Batch 2 energy: opts.baseEnergyLevel（正規化 0-1 or null）を供給＝energy 低で budget やや低（過悲観回避 weight=0.5）。
  //   いずれも表示のみ・予定変更/repair/optimize なし。viability unknown は banner 側で非表示。
  //   ★What-if v0: simulation 再実行のため input を独立 memo 化（dayRehearsal はこれを消費）。
  const rehearsalInput = useMemo(() => {
    const graph = dayGraphByDate?.[selectedDate]?.graph;
    if (!graph) return null;
    const opts = { baseEnergyLevel };
    return DAY_REHEARSAL_FULL_PATH_ENABLED
      ? buildRehearsalInputFull(graph, calendarFeasibilityRawByTransitionIndex, calendarFeasibilityTravelByTransitionIndex, opts)
      : buildRehearsalInputFromDisplay(graph, calendarFeasibilityDisplayByTransitionIndex, opts);
  }, [
    dayGraphByDate,
    selectedDate,
    calendarFeasibilityDisplayByTransitionIndex,
    calendarFeasibilityRawByTransitionIndex,
    calendarFeasibilityTravelByTransitionIndex,
    baseEnergyLevel,
  ]);

  // ★A1-5/A1-6a personal pace 反映（flag **default OFF**＝既存挙動完全不変）。
  //   OFF: rehearsalInput をそのまま rehearseDay（同一参照）。
  //   ON: A1-6a capture(MovementEvent) を集約した ratios を、各 transition の odKey×mode で引き、
  //       adapter が travelMin に soft 反映（ready のみ・buffer 観測は不変・clamp 済・無ければ fallback）。
  //   ★join: legKey=anchorId ペア（selectedModeStore と同源で mode 取得）/ odKey=正規化 location ペア（cross-day 蓄積単位）。
  //   ★activation/ON smoke は CEO 判断（現状 OFF・実データ無なら adapter が fallback で不変）。
  const dayRehearsal = useMemo(() => {
    if (!rehearsalInput) return null;
    if (!isPersonalPaceReflectionEnabled()) return rehearseDay(rehearsalInput); // ★A1-10: OFF/production: 完全不変
    const events = dayGraphByDate?.[selectedDate]?.graph?.nodes.filter((n): n is EventNode => n.kind === "event") ?? [];
    const resolver = buildRehearsalPaceResolver({
      events,
      anchorById: new Map(selectedDayAnchors.map((a) => [a.id, a] as const)),
      selectedModes: loadSelectedModesForDay(selectedDate),
      ratios: buildPersonalPaceRatiosFromStore(loadMovementEventStore()),
      activationReadyOnly: true, // ★A1-10: 実反映は ready_for_activation の od×mode だけ
    });
    return rehearseDay(applyPersonalPaceToRehearsalInput(rehearsalInput, resolver));
  }, [rehearsalInput, dayGraphByDate, selectedDate, selectedDayAnchors]);

  // ★A1-8/A1-9 dogfood shadow activation + report（dev/dogfood・flag DAY_REHEARSAL_PACE_SHADOW_ENABLED **default OFF**・production hard block）。
  //   ★実 reflection はしない（dayRehearsal は上の memo のまま）。OFF/非 dev では何もしない＝既存挙動完全不変。
  //   ready のとき shadow 比較（OFF/ON）を走らせ structured 差分を **A1-9 dogfood debug panel** に保持（flag ON のみ描画）。
  const [shadowReport, setShadowReport] = useState<PaceShadowActivationReport | null>(null);
  // ★A1-11: dogfood activation 前チェック集約（dev のみ・report に表示）。
  const [dogfoodReadiness, setDogfoodReadiness] = useState<PersonalPaceDogfoodReadiness | null>(null);
  useEffect(() => {
    if (!isPaceShadowActivationEnabled() || !rehearsalInput) {
      setShadowReport(null); // OFF/非 dev: パネルも出さない
      setDogfoodReadiness(null);
      return;
    }
    const store = loadMovementEventStore();
    const ratios = buildPersonalPaceRatiosFromStore(store);
    const events = dayGraphByDate?.[selectedDate]?.graph?.nodes.filter((n): n is EventNode => n.kind === "event") ?? [];
    const resolvePace = buildRehearsalPaceResolver({
      events,
      anchorById: new Map(selectedDayAnchors.map((a) => [a.id, a] as const)),
      selectedModes: loadSelectedModesForDay(selectedDate),
      ratios,
      activationReadyOnly: true, // ★A1-10: shadow も実 activation(ready_for_activation のみ)を正確に preview
    });
    const report = runPaceShadowActivation({ rehearsalInput, ratios, resolvePace });
    setShadowReport(report);
    setDogfoodReadiness(
      buildPersonalPaceDogfoodReadiness({
        readiness: buildPaceActivationReadiness(ratios),
        shadowReport: report,
        optInState: loadPaceCaptureOptInState(),
        captureQuality: summarizeCaptureQuality(store),
      }),
    );
  }, [rehearsalInput, dayGraphByDate, selectedDate, selectedDayAnchors]);

  // WPM-1: 「詰まりやすい」transition の stepIndex 集合（read-only marker 用・convergence のみ・回復は別 slice）。
  const convergenceSteps = useMemo(
    () => new Set<number>(dayRehearsal?.convergencePoints ?? []),
    [dayRehearsal],
  );

  // per-marker「なぜ?」: convergence marker の factors（transitionIndex→factors・additive・convergencePoints と同 key）。
  // DayGraphTimeline が expanded 時に explainConvergenceMarker で自然日本語化。recovery は uniform で対象外。
  const convergenceFactorsByTransitionIndex = useMemo(() => {
    const m = new Map<number, readonly ConvergenceFactor[]>();
    if (!dayRehearsal) return m;
    for (const idx of dayRehearsal.convergencePoints) {
      const factors = dayRehearsal.steps[idx]?.convergence?.factors;
      if (factors && factors.length > 0) m.set(idx, factors);
    }
    return m;
  }, [dayRehearsal]);

  // WPM-2b: 「一息つけそう」recovery の stepIndex（真の余白 slack≥閾値・raw feasibility 由来・strain と decouple）。
  const recoverySteps = useMemo(
    () => recoveryStepsFromFeasibilityRaw(calendarFeasibilityRawByTransitionIndex),
    [calendarFeasibilityRawByTransitionIndex],
  );

  // Repair Candidate: read-only 対処候補（dedup→優先度順→最大3件）。recoverySteps を一息判定に渡す。
  // ★表示のみ・予定変更/repair 実行なし。0 件なら banner 側で disclosure を出さない。
  // dedup（案A）: 同 kind の同一文重複を display 段で代表 1 件に集約（generation は full-fidelity）。
  const repairCandidates = useMemo(
    () =>
      dayRehearsal
        ? prioritizeRepairCandidates(dedupeRepairCandidates(generateDayRepairCandidates(dayRehearsal, { recoverySteps })), 3)
        : [],
    [dayRehearsal, recoverySteps],
  );

  // ★What-if v0 UI（最小・非冗長）: 表示中の候補のうち **leave_earlier で新情報がある時だけ**「試すと…」短文を出す。
  //   pure な previewRepairSimulation（予定変更なし counterfactual）→ repairSimulationShortLine（null=非表示）。
  //   protect/recovery（候補文と重複）・confirm/reduce（試算不可）は null ゆえ非表示。read-only・表示のみ。
  const repairSimulationLineByKind = useMemo(() => {
    const m = new Map<DayRepairKind, string>();
    if (!rehearsalInput) return m;
    for (const c of repairCandidates) {
      const line = repairSimulationShortLine(previewRepairSimulation(rehearsalInput, c));
      if (line) m.set(c.kind, line);
    }
    return m;
  }, [rehearsalInput, repairCandidates]);

  // M-3d disclosure state — default 全 hidden (= M-3c-pure-harden 規約)
  //   React lazy initial state pattern (= 関数 ref を渡す)。
  //   - 初期 state は必ず新規 empty Set (= mutation 攻撃面 0)
  const [expandedTransitionIndices, setExpandedTransitionIndices] = useState<
    ExpandedTransitionIndices
  >(resetAllDisclosures);

  // M-3d: selectedDate 変化で reset (= 「観測の幕間」、 革新 5 継承)
  //   localStorage 禁止と整合: persist なし、 日切替で fresh observation 再起動。
  useEffect(() => {
    setExpandedTransitionIndices(resetAllDisclosures());
  }, [selectedDate]);

  // M-3d: per-transition disclosure toggle handler
  //   transition line tap / Enter / Space で呼ばれる。
  //   M-3c-pure-harden adapter 経由で状態更新 (= idempotency 同参照保持)。
  const handleToggleFeasibilityDisclosure = useCallback(
    (transitionIndex: number) => {
      setExpandedTransitionIndices((current) => {
        const currentState = getDisclosureStateForIndex(current, transitionIndex);
        const action = currentState === "expanded" ? "request_collapse" : "request_expand";
        return applyDisclosureAction(current, transitionIndex, action);
      });
    },
    [],
  );

  // Phase 2-E: 時刻重なり気付き indicator 用、selected day の overlap Set を 1 回 useMemo
  // 判定は detectTimedAnchorOverlaps (Cross-tab 単一仕様) のみ使用、独自判定なし
  const selectedDayOverlapSet = useMemo(
    () => detectTimedAnchorOverlaps(selectedDayAnchors),
    [selectedDayAnchors],
  );

  // ── handlers ──

  /**
   * 月送り (GPT 補正 3 反映):
   *   - 同日付存在 → 維持 (例: 1/15 → 2/15)
   *   - 存在しなければ月末 clamp (例: 1/31 → 2/28 or 2/29 閏年)
   */
  const handleMonthChange = (delta: number) => {
    const newMonth = addMonths(currentMonth, delta);
    const dayOfMonth = selectedDateObj.getUTCDate();
    const clampedDate = clampDateToMonth(
      newMonth.getUTCFullYear(),
      newMonth.getUTCMonth(),
      dayOfMonth
    );
    setSlideDirection(delta > 0 ? 1 : -1);
    setCurrentMonth(newMonth);
    setSelectedDate(isoDate(clampedDate));
  };

  const handleSelectDate = (iso: string) => setSelectedDate(iso);

  const handleAddForSelected = () => {
    onAddRequest?.({
      initial: { kind: "one_off", date: selectedDate },
      subtitle: `カレンダー / ${formatJpDate(selectedDateObj)} から`,
    });
  };

  /**
   * 「今日へ」 button (C3、Beyond 採用):
   *   - selectedDate ≠ today OR currentMonth ≠ today's month の時のみ表示
   *   - tap で currentMonth = 今月、selectedDate = 今日 にジャンプ
   *   - iOS / Google Calendar 標準機能、世界トップアプリ整合
   */
  const isCurrentMonthThisMonth =
    currentMonth.getUTCFullYear() === todayMonthStart.getUTCFullYear() &&
    currentMonth.getUTCMonth() === todayMonthStart.getUTCMonth();
  const showTodayButton =
    selectedDate !== todayIso || !isCurrentMonthThisMonth;

  const handleGoToday = () => {
    // 月送り animation 抑制 (jump 動作のため slideDirection = 0)
    setSlideDirection(0);
    setCurrentMonth(todayMonthStart);
    setSelectedDate(todayIso);
  };

  // ── animation variants (framer-motion、月送り 200ms slide) ──
  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? "100%" : dir < 0 ? "-100%" : 0,
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({
      x: dir > 0 ? "-100%" : dir < 0 ? "100%" : 0,
      opacity: 0,
    }),
  };
  const slideTransition = reducedMotion
    ? { duration: 0 }
    : { type: "tween" as const, duration: 0.2, ease: "easeOut" as const };

  // M3-b: month grid（currentMonth 変化時のみ再構築。selectedDate 変化では再計算しない）。
  const monthGrid = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);
  // MonthGridView に渡す props（全て既存 state の再利用。新規データ調達なし）。
  const monthGridProps: MonthGridViewProps = {
    grid: monthGrid,
    anchors,
    dayIndicatorByIso: dayIndicatorByIso ?? EMPTY_INDICATOR_MAP,
    selectedIso: selectedDate,
    todayIso,
    onSelectDate: handleSelectDate,
    getAnchorChip: resolveShiftAnchorChip,
  };

  return (
    <div data-testid="plan-calendar-tab" className="relative pb-24">
      {/* ── Slice 1: スケジュール連動 コーデ提案 dashboard (= 新しい主役、 mock UI) ── */}
      {/* section ③ のみ実 anchors。 ②④⑤⑥ は mock。 engine / DB / weather 実取得は未配線。 */}
      <CalendarOutfitDashboard
        anchors={anchors}
        now={baseNow}
        onOpenTimeline={() => setTimelineOpen(true)}
      />

      {/* ── 既存の予定タイムラインは「タイムラインで確認」 disclosure に退避 (初期: 閉) ── */}
      {/* 開くと月送り / week strip / 予定 list / proposal chip / 構造 timeline / 予定追加 を確認できる。 */}
      <div className="mt-5 flex justify-center">
        <button
          type="button"
          onClick={() => setTimelineOpen((open) => !open)}
          aria-expanded={timelineOpen}
          aria-controls="plan-calendar-legacy-timeline"
          data-testid="plan-calendar-timeline-disclosure-toggle"
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 motion-reduce:transition-none"
        >
          {timelineOpen ? "タイムラインを閉じる" : "タイムラインで確認"}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className={"transition-transform " + (timelineOpen ? "rotate-180" : "")}
          >
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {timelineOpen && (
      <div id="plan-calendar-legacy-timeline">
      {/* ── Month header ── */}
      <header className="flex items-center justify-between px-2 mb-3">
        <button
          type="button"
          onClick={() => handleMonthChange(-1)}
          aria-label="前月"
          data-testid="plan-calendar-prev-month"
          className="w-10 h-10 flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 transition"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h2
          className="text-xl font-semibold text-slate-900"
          data-testid="plan-calendar-month-label"
        >
          {formatJpYearMonth(currentMonth)}
        </h2>
        <button
          type="button"
          onClick={() => handleMonthChange(1)}
          aria-label="翌月"
          data-testid="plan-calendar-next-month"
          className="w-10 h-10 flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 transition"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9 18l6-6-6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      {/* ── M3-a: week ⇄ month toggle（flag ON 時のみ。月 grid 本体は M3-b。
            flag OFF では非表示 = 既存 week strip と完全同一）── */}
      {showViewToggle && (
        <div className="flex justify-end px-2 mb-2">
          <CalendarViewToggle viewMode={viewMode} onChange={setViewMode} />
        </div>
      )}

      {/* ── Weekday labels (Sun-first、日 = 赤、土 = 青、日本標準) ── */}
      <div className="grid grid-cols-7 mb-2 px-2">
        {WEEKDAY_LABELS_SUN_FIRST.map((label, i) => (
          <div
            key={label}
            className={
              "text-center text-xs font-medium py-1 " +
              (i === 0
                ? "text-rose-500"
                : i === 6
                ? "text-blue-500"
                : "text-slate-500")
            }
          >
            {label}
          </div>
        ))}
      </div>

      {/* ── Week strip + Selected day (月送り animation で同時 slide、C3 polish) ── */}
      <div className="overflow-hidden relative">
        <AnimatePresence mode="wait" custom={slideDirection} initial={false}>
          <motion.div
            key={`${currentMonth.getUTCFullYear()}-${currentMonth.getUTCMonth()}`}
            custom={slideDirection}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={slideTransition}
          >
            {/* M3-b: viewMode で week strip ⇄ month grid を分岐（agenda は下で共通・不変）。
                month → MonthGridView / week → 既存 week strip（children、JSX 不変）。 */}
            <CalendarViewBody viewMode={viewMode} monthGridProps={monthGridProps}>
            {/* Week strip (1 行 × 7 col) */}
            <div
              role="grid"
              aria-label={`${formatJpYearMonth(currentMonth)} の週`}
              className="grid grid-cols-7 gap-1 px-2 mb-6"
              data-testid="plan-calendar-week-strip"
            >
              {weekStrip.map((cell) => {
                const isSelected = cell.iso === selectedDate;
                const isToday = cell.iso === todayIso;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    role="gridcell"
                    aria-selected={isSelected}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={`${formatJpDate(cell.date)} を選択`}
                    onClick={() => handleSelectDate(cell.iso)}
                    data-testid={`plan-calendar-day-${cell.iso}`}
                    className={cellClasses(cell, isToday, isSelected)}
                  >
                    <span className="flex flex-col items-center leading-none">
                      <span className="text-sm font-medium">{cell.dayOfMonth}</span>
                      {dayIndicatorByIso?.has(cell.iso) && (
                        <span
                          data-testid={`plan-calendar-day-indicator-${cell.iso}`}
                          className={`mt-0.5 h-1 w-1 rounded-full ${dayIndicatorDotClass(
                            dayIndicatorByIso.get(cell.iso)
                          )}`}
                          aria-hidden="true"
                        />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            </CalendarViewBody>

            {/* Selected day agenda section (slide animation 内、月送りで一緒に動く) */}
            <section data-testid="plan-calendar-selected-day" className="px-4">
              {selectedDayIndicator && (
                <div
                  className="mb-2"
                  data-testid="plan-calendar-selected-day-indicator"
                >
                  <DayIndicatorBadge indicator={selectedDayIndicator} />
                </div>
              )}
              <DayOutlookBanner rehearsal={dayRehearsal} recoveryStepCount={recoverySteps.size} repairCandidates={repairCandidates} simulationLineByKind={repairSimulationLineByKind} />
              {/* ★A1-9 dogfood/dev 限定 shadow report（isPaceShadowActivationEnabled=flag∧非 production のときだけ・一般ユーザー非表示・raw 数値なし）。 */}
              {isPaceShadowActivationEnabled() && shadowReport && (
                <PaceShadowReportPanel report={shadowReport} dogfoodReadiness={dogfoodReadiness} />
              )}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-slate-800">
                  {formatJpDate(selectedDateObj)}
                </h3>
                {showTodayButton && (
                  <button
                    type="button"
                    onClick={handleGoToday}
                    aria-label="今日へ戻る"
                    data-testid="plan-calendar-go-today"
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    今日
                  </button>
                )}
              </div>

              {/*
               * Phase 3-J-6c / J-6e-3: Proposal chip 導線 + Quiet Undo 「戻す」 link (= max 1 / day)
               *
               * 表示優先 (= mutually exclusive):
               *   1. active な undo record (= 5 分以内 accept 直後) → 「戻す」 link
               *   2. それ以外 + proposal 存在 → ProposalChip (= accept in-flight 中は subtle pending)
               *
               * - presentational のみ (= proposalsByDate prop で受領、 内部 state なし)
               * - sensitive proposal は computeProposals 上流で除外済
               * - 通知 metaphor 禁止 (= Memory Chip style、 警告色 / drop-shadow / pulse なし)
               * - 「戻す」 link は subtle (= text-slate-400 italic underline、 警告色なし)
               * - subtle pending: opacity-60 + pointer-events-none + aria-busy (= 二重 tap 防止視覚化)
               */}
              {(() => {
                // [1] active undo for selected date が最優先 (= accept 直後 5 分)
                const activeUndo = recentUndoRecords
                  ? selectActiveUndoForDate(
                      recentUndoRecords,
                      selectedDate,
                      new Date().toISOString(),
                    )
                  : null;
                if (activeUndo) {
                  return (
                    <div
                      className="mb-3"
                      data-testid={`plan-calendar-undo-${activeUndo.proposalId}`}
                    >
                      <button
                        type="button"
                        className="text-xs italic text-slate-400 underline transition hover:text-slate-500 motion-reduce:transition-none"
                        onClick={() => onProposalUndo?.(activeUndo.proposalId)}
                        aria-label="提案を戻す"
                      >
                        戻す
                      </button>
                    </div>
                  );
                }

                // [2] proposal chip (= 通常)
                const proposalForToday = selectFirstProposalForDate(
                  proposalsByDate,
                  selectedDate,
                );
                if (!proposalForToday) return null;
                const variables = buildVariablesForProposal(
                  proposalForToday,
                  proposalTemplateVariables,
                );
                const isAccepting =
                  acceptingProposalIds?.has(proposalForToday.id) ?? false;
                return (
                  <div
                    className={
                      "mb-3 " +
                      (isAccepting
                        ? "opacity-60 pointer-events-none motion-reduce:transition-none"
                        : "")
                    }
                    aria-busy={isAccepting || undefined}
                    data-testid={`plan-calendar-proposal-${selectedDate}`}
                  >
                    <ProposalChip
                      proposal={proposalForToday}
                      variables={variables}
                      onTap={isAccepting ? undefined : onProposalAccept}
                      onModify={onProposalModify}
                      onDismiss={onProposalDismiss}
                    />
                  </div>
                );
              })()}

        {selectedDayAnchors.length === 0 ? (
          <div
            className="rounded-2xl bg-slate-50 px-4 py-6 text-center"
            data-testid="plan-calendar-empty-day"
          >
            <p className="text-sm text-slate-500 mb-3">予定なし</p>
            {onAddRequest && (
              <button
                type="button"
                onClick={handleAddForSelected}
                className="text-sm text-indigo-600 hover:underline"
                data-testid="plan-calendar-add-for-selected"
              >
                + この日に予定を追加
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {selectedDayAnchors.map((anchor) => {
              const handleAnchorClick = (
                e:
                  | React.MouseEvent<HTMLLIElement>
                  | React.KeyboardEvent<HTMLLIElement>
              ) => {
                if (!onAnchorClick) return;
                e.stopPropagation();
                onAnchorClick(anchor);
              };
              const clickable = !!onAnchorClick;
              // Phase 2-F: Compact density (primary only)、title に fullLabel
              const { primary: locationPrimary, fullLabel: locationFullLabel } =
                formatLocationDisplayParts(anchor);
              return (
                <li
                  key={anchor.id}
                  {...(clickable
                    ? {
                        role: "button" as const,
                        tabIndex: 0,
                        "aria-label": `${anchor.title} の詳細を見る`,
                        onClick: handleAnchorClick,
                        onKeyDown: (e: React.KeyboardEvent<HTMLLIElement>) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleAnchorClick(e);
                          }
                        },
                      }
                    : {})}
                  data-testid={`plan-calendar-anchor-${anchor.id}`}
                  className={
                    "rounded-2xl border border-slate-200 bg-white p-3 " +
                    (clickable
                      ? "cursor-pointer transition hover:border-indigo-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      : "")
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-indigo-700">
                      {formatTime(anchor.startTime)}
                    </span>
                    {anchor.rigidity === "hard" && (
                      <GlassBadge variant="default" size="sm">
                        固定
                      </GlassBadge>
                    )}
                    {/*
                     * Phase 2-E: 時刻重なり気付き indicator
                     * - 警告ではなく「気付き」(muted slate のみ、警告色禁止)
                     * - sensitive anchor でも表示 (= 外部送信でも内容開示でもない、Cross-tab 一貫性)
                     * - 文言は banner 固定、他 anchor 名・件数は出さない
                     */}
                    {selectedDayOverlapSet.has(anchor.id) && (
                      <span
                        role="img"
                        aria-label="この時刻に他の予定があります"
                        title="この時刻に他の予定があります"
                        data-testid={`plan-calendar-anchor-${anchor.id}-overlap`}
                        className="inline-flex items-center gap-1 text-[10px] text-slate-500"
                      >
                        <span
                          aria-hidden="true"
                          className="inline-block h-2 w-2 rounded-full bg-slate-400 ring-1 ring-slate-500/30"
                        />
                        <span>重なり</span>
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {anchor.title}
                  </p>
                  {locationPrimary && (
                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                      {/*
                       * Phase 2-F: Compact density (primary only)
                       * title 属性に fullLabel (= mouse hover で full 情報)
                       * 非 interactive な <span> なので aria-label は付けない (W3C ARIA 1.2)
                       * 既存 anchor row 全体の aria-label は完全不変
                       */}
                      <span className="truncate" title={locationFullLabel}>
                        {locationPrimary}
                      </span>
                      {/*
                       * Phase 2-D C3: 場所未確定 indicator (subtle gray dot)
                       * 判定は Cross-tab 単一仕様の isPlaceUnconfirmed のみ使用、
                       * 引数は元 anchor.locationText で完全不変 (Phase 2-F の display 整形と判定は分離)
                       * dot 8px + ring-slate-500/30 (WCAG 1.4.11 Non-text Contrast 配慮)
                       */}
                      {isPlaceUnconfirmed(anchor.locationText) && (
                        <span
                          role="img"
                          aria-label="場所未確定"
                          title="場所未確定 (まだ Places で確定されていません)"
                          data-testid={`plan-calendar-anchor-${anchor.id}-unconfirmed-dot`}
                          className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-slate-400 ring-1 ring-slate-500/30"
                        />
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/*
         * Phase 3-K-3b: DayGraphTimeline を選択日の構造として **静かに**追加表示。
         *
         * 不変原則 (= CEO 補正):
         *   - 既存 anchor list を置換しない (= 完全並列、 上の anchor list は不変)
         *   - proposal chip 位置を壊さない (= chip は上のブロックに既存維持)
         *   - 視覚的に控えめ (= neutral slate、 small heading、 静かな margin)
         *   - warnings / duration / mode / risk 表示なし (= K-3b scope 外)
         *   - dayGraphByDate[selectedDate] が undefined / null なら何も render しない
         *   - onEventClick → 既存 onAnchorClick (= AnchorDetailModal 起動経路) に bridge
         */}
        {dayGraphByDate?.[selectedDate] && (
          <div
            className="mt-6 pt-4 border-t border-slate-100"
            data-testid="plan-calendar-day-graph-section"
          >
            <h4 className="text-xs font-medium text-slate-500 italic mb-2">
              1 日の構造
            </h4>
            <DayGraphTimeline
              result={dayGraphByDate[selectedDate] ?? null}
              view="user_self"
              onEventClick={(anchorId: string) => {
                if (!onAnchorClick) return;
                const anchor = selectedDayAnchors.find((a) => a.id === anchorId);
                if (anchor) onAnchorClick(anchor);
              }}
              dataTestId="plan-calendar-day-graph-timeline"
              movementDisplayByTransitionIndex={calendarMovementDisplayByTransitionIndex}
              feasibilityDisplayByTransitionIndex={calendarFeasibilityDisplayByTransitionIndex}
              expandedTransitionIndices={expandedTransitionIndices}
              onToggleFeasibilityDisclosure={handleToggleFeasibilityDisclosure}
              convergenceSteps={convergenceSteps}
              convergenceFactorsByTransitionIndex={convergenceFactorsByTransitionIndex}
              recoverySteps={recoverySteps}
            />
          </div>
        )}
            </section>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── FAB (右下 fixed、紫 gradient、選択日 prefill) ── */}
      {/* CEO mock 整合、PR #214 containing block で pane 内に閉じ込まる */}
      {/* HomePaneIndicator (z-30、bottom-0) と重ねないよう bottom-20 配置 */}
      {onAddRequest && (
        <button
          type="button"
          onClick={handleAddForSelected}
          aria-label={`${formatJpDate(selectedDateObj)} に予定を追加`}
          data-testid="plan-calendar-fab"
          className="
            fixed bottom-20 right-6 z-30
            w-14 h-14 rounded-full
            bg-gradient-to-br from-indigo-500 to-purple-500
            text-white text-3xl font-light leading-none
            shadow-lg hover:shadow-xl active:scale-95
            transition-all
            flex items-center justify-center
          "
          style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          +
        </button>
      )}
      </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Week strip cell の visual classes (mock 整合):
 *   - selected: 紫 gradient fill、円形 (mock 紫円)
 *   - today + not selected: indigo bold (selected と区別)
 *   - inCurrentMonth=false: 薄色 (text-slate-300)
 *   - 通常: text-slate-700
 *
 * a11y: hit area ≥ 44×44 (min-h-[44px])
 */
function cellClasses(
  cell: WeekStripCell,
  isToday: boolean,
  isSelected: boolean
): string {
  const base =
    "w-full aspect-square min-h-[44px] flex items-center justify-center rounded-full transition";
  if (isSelected) {
    return (
      base +
      " bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow-sm"
    );
  }
  if (isToday) {
    return base + " text-indigo-700 font-bold hover:bg-indigo-50";
  }
  if (!cell.inCurrentMonth) {
    return base + " text-slate-300 hover:bg-slate-50";
  }
  return base + " text-slate-700 hover:bg-slate-100";
}
