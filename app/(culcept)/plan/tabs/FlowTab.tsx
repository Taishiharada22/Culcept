"use client";

/**
 * FlowTab — 今後 7 日リスト (Phase 2-B、CEO mock 整合)
 *
 * 設計書: docs/alter-plan-phase2-b-flow-list-mini-design.md
 *
 * 表示 (CEO mock 整合):
 *   - 今後 7 日の縦リスト (各日 sticky section header + anchor list)
 *   - 各 anchor 行: 時刻 + title + sub + 右端 thumbnail (locationCategory emoji)
 *   - 「予定なし ›」 inline button (CEO 補正 #1: tap → AddAnchorModal date prefill)
 *   - 静的 ALTER 提案 card placeholder (CEO 補正 #2: ボタン風 styling 禁止)
 *   - FAB (Phase 2-A CalendarTab と同 pattern、今日 prefill)
 *
 * Beyond 採用 (世界トップアプリ研究、mini design §11):
 *   - sticky section header (iOS Reminders / Apple Calendar / Things 3 / Linear pattern)
 *   - 曜日色 (日=rose / 土=blue、JP locale 標準)
 *   - "今日 ·" / "明日 ·" prefix (quick scan)
 *   - anchor count badge ("3 件" 小さく)
 *   - touch target 44pt 最小 (Apple HIG / WCAG 2.5.5)
 *   - sensitive category は 🔒 generic icon (privacy 配慮)
 *
 * 不変原則 (CEO 補正 #3 遵守):
 *   - 旧 W1-X3 gap add helpers (gapMinutes / formatGap / shouldShowGapAdd /
 *     suggestGapStartTime / FLOW_GAP_MIN_MINUTES) は **削除しない**
 *   - 本 file では import せず render しないだけ。helpers は code-level で残り、
 *     既存 test (calendarWeekStripHelpers.test.ts 等) も継続 PASS
 *
 * 範囲外 (CEO 制約):
 *   - ALTER 提案 flow 動作実装 (Phase 3 預け、本 wave は静的 placeholder のみ)
 *   - 実画像 / Supabase Storage 連携 (別 wave)
 *   - ExternalAnchor 型 imageUrl field 追加 (migration、別 wave)
 *   - long-press による quick action menu (Phase 2-B+)
 *   - MapTab / Google Maps integration (Phase 2-C)
 *   - selectedDate state を持つ設計 (本 wave は今日 prefill で完結)
 *   - AddAnchorModal / PlanClient / HomeSwipeContainer / Modal lock 不可触
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { GlassBadge } from "@/components/ui/glassmorphism-design";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { isPlaceUnconfirmed } from "@/lib/plan/locationConfirmationStatus";
import { detectTimedAnchorOverlaps } from "@/lib/plan/anchorOverlap";
import { formatLocationDisplayParts } from "@/lib/plan/anchor-detail-format";
import { pickCategoryIcon } from "@/lib/plan/categoryIconMap";
import { pickCategoryColorClass } from "@/lib/plan/categoryColorMap";
import { pickBrandIcon } from "@/lib/plan/brandIconMap";

import { DayGraphTimeline } from "../components/DayGraphTimeline";
import { useFlowWeekMovementDisplay } from "./_useFlowWeekMovementDisplay";
import { useFlowWeekFeasibilityDisplay } from "./_useFlowWeekFeasibilityDisplay";
import { usePlanGeocode } from "./_usePlanGeocode";

// ── Phase 3-N List impl sub-phase 8a-impl: 案 1b コード内 flag による新旧切替 ──
//
//   不変原則 (= CEO + GPT 合議 2026-05-24):
//     - flag OFF (= default) で **既存 FlowTab path 完全不変** (= user 影響 0)
//     - flag ON で新 TimelineSpine + EventCard + EmptyDayEntry に同責務範囲で差し替え
//     - 二重表示禁止 (= flag ON で 旧 anchor list / 旧 empty inline button / 旧 DayGraphTimeline を同時表示しない)
//     - truth なき source semantics は UI で強く主張しない:
//         - TransitionChip は 8a 範囲では skip (= adapter に transitions 含まず、 8b 以降で接続)
//         - SourceIndicator は EventCard 内蔵で、 adapter 産 user origin → 自動 null return (= 過剰表示なし)
//         - ImportedLockEscape trigger は FlowTab 本体に未配置 (= 8b 以降)
//
//   8c 完了後 closeout audit で flag + 旧 path 一括削除 (= 完全 migration)
//
//   設計書:
//     - decision-log (= sub-phase 8 8a/8b/8c 分割方針 + 案 1b 採用)
//     - lib/plan/list/featureFlags.ts
//     - lib/plan/list/adapters/externalAnchorAdapter.ts
import { LIST_NEW_TIMELINE_ENABLED } from "@/lib/plan/list/featureFlags";
import {
  convertExternalAnchorListWithDayBookends,
  convertEventsToTransitions,
} from "@/lib/plan/list/adapters/externalAnchorAdapter";
import { TimelineSpine } from "../components/list/TimelineSpine";
import { EmptyDayEntry } from "../components/list/EmptyDayEntry";
import type { MovementDisplayView } from "@/lib/plan/transport/movementDisplayFormatter";
import type { FeasibilityDisplayView } from "@/lib/plan/feasibility/feasibilityDisplayFormatter";
import {
  applyDisclosureAction,
  getDisclosureStateForIndex,
  resetAllDisclosures,
  type ExpandedTransitionIndices,
} from "@/lib/plan/feasibility/feasibilityDisclosureAdapter";
import type { AddRequest } from "../PlanClient";
import {
  CATEGORY_META,
  anchorsForDay,
  buildFlowDateRange,
  categoryOf,
  formatFlowSectionLabel,
  formatJpDate,
  formatTime,
  isoDate,
  utcMidnight,
  weekdayTone,
  type FlowWeekdayTone,
} from "./_helpers";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * weekdayTone → Tailwind class mapping (locale 標準: 日=rose, 土=blue、今日=indigo)
 * Phase 2-A CalendarTab WeekdayLabels と整合 (Sun-first / 日 = rose-500 / 土 = blue-500)
 */
const TONE_CLASS: Record<FlowWeekdayTone, string> = {
  today: "text-indigo-700 font-semibold",
  sunday: "text-rose-500",
  saturday: "text-blue-500",
  weekday: "text-slate-900",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function FlowTab({
  anchors,
  now,
  onAddRequest,
  onAnchorClick,
  // ── Phase 3-K-3c-ii: DayGraph UI 接続 (= 各 day card に静かに追加) ──
  // K-2 から受領していた dayGraphByDate を、 ここで active 利用。
  // 各 FlowDaySection に dayGraphResult prop として渡す (= section 側で render)。
  dayGraphByDate,
}: {
  anchors: ExternalAnchor[];
  /** test 用 inject、現在時刻 (default: new Date()) */
  now?: Date;
  /** Modal 起動 callback (FAB / 予定なし ›  inline で共通) */
  onAddRequest?: (req: AddRequest) => void;
  /** anchor row click で AnchorDetailModal 起動 (W1-X5 既存) */
  onAnchorClick?: (anchor: ExternalAnchor) => void;
  /**
   * K-3c-ii: PlanClient で計算した DayGraph (= K-3c-0 で visible window 拡張済)。
   * 各 FlowDaySection で dayGraphByDate[iso] を lookup して timeline 表示。
   */
  dayGraphByDate?: Readonly<Record<string, import("@/lib/plan/dayGraph/dayGraphTypes").BuildDayGraphResult>>;
}) {
  const baseNow = now ?? new Date();
  const today = useMemo(
    () => utcMidnight(baseNow),
    // baseNow は new Date() の場合 mount 毎に変わるが、UTC midnight 化されると
    // 1 日内では同じ value に丸まる。useMemo の deps として渡しても render 起因の
    // 余計な再生成は起きない (今日が変わった瞬間 = page reload 想定)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isoDate(baseNow)]
  );

  // 今日含む 7 日分
  const days = useMemo(() => buildFlowDateRange(today), [today]);

  // 各日の anchor を pre-compute (Map<iso, ExternalAnchor[]>)
  // anchorsForDay は recurring 展開 + exception_dates + validity 全継承
  const dayAnchorsMap = useMemo(() => {
    const m = new Map<string, ExternalAnchor[]>();
    for (const d of days) {
      m.set(isoDate(d), anchorsForDay(anchors, d));
    }
    return m;
  }, [anchors, days]);

  // 最初の「予定なし」日 (ALTER 提案 card の文脈表示用)
  const firstEmptyDayLabel = useMemo(() => {
    for (const d of days) {
      const list = dayAnchorsMap.get(isoDate(d)) ?? [];
      if (list.length === 0) return formatJpDate(d);
    }
    return null; // 全日に anchor あり → card 非表示
  }, [days, dayAnchorsMap]);

  /**
   * Phase 2-E: 時刻重なり気付き indicator 用、各日の overlap Set を pre-compute。
   * 判定は detectTimedAnchorOverlaps (Cross-tab 単一仕様) のみ使用、独自判定なし。
   * Map<isoDate, Set<anchorId>> で各 FlowDaySection → AnchorRow に prop drilling。
   */
  const dayOverlapsMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const d of days) {
      const iso = isoDate(d);
      const anchorsOfDay = dayAnchorsMap.get(iso) ?? [];
      m.set(iso, detectTimedAnchorOverlaps(anchorsOfDay));
    }
    return m;
  }, [days, dayAnchorsMap]);

  // ── L-4d-b2 (= 2026-05-22 CEO 承認): FlowTab 7 day 全件への移動時間展開 ──
  //    L-4d-b1 today only path から発展、 visible week 全 anchors を **dedupe して
  //    1 系統の usePlanGeocode** で resolve。 各 day timeline に movement display を配る。
  //
  //    過剰 resolve / PlanClient core 引き上げ / 新規 endpoint は行わない:
  //      - week 全 anchors を dedupe して 1 batch resolve (= per-user rate limit 範囲内)
  //      - 7 day 全件 並列 pipeline (= Promise.all、 per-day isolation)
  //      - PlanClient core 改変 0
  //      - 新規 endpoint なし
  //
  //    fail-safe: pipeline 失敗時は per-day で EMPTY → K view fallback で「→ 移動」 表示。
  const visibleWeekAnchors = useMemo(() => {
    // 同 anchor id (= recurring 等) が複数 day に登場する可能性があるため dedupe
    const seen = new Set<string>();
    const out: ExternalAnchor[] = [];
    for (const dayAnchors of dayAnchorsMap.values()) {
      for (const a of dayAnchors) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        out.push(a);
      }
    }
    return out;
  }, [dayAnchorsMap]);

  const { resolutions: weekResolutions } = usePlanGeocode(visibleWeekAnchors);
  const movementDisplayByDay = useFlowWeekMovementDisplay(
    dayAnchorsMap,
    weekResolutions,
  );

  // ── M-3d MapTab pattern を FlowTab 7 day に lift ──
  //    feasibility display + per-day disclosure state。
  //    既存 weekResolutions を読むだけ (= 新規 fetch なし)。
  //    not_applicable / sensitive / unresolved は M-2a で map から除外済。
  //    visible 7 days のみ (= 月全件 / 別 week は構造的に不可能)。
  const feasibilityDisplayByDay = useFlowWeekFeasibilityDisplay(
    dayAnchorsMap,
    weekResolutions,
  );

  // M-3d per-day disclosure state (= 革新 M-3d-1)
  //   Record<isoDate, ExpandedTransitionIndices> で各日独立 disclosure context。
  //   PII 0: key = isoDate (= 非 PII)、 value = ReadonlySet<number> (= transitionIndex のみ)。
  //   初期 state は空 Record (= 全 day 全 hidden)。
  const [expandedByDay, setExpandedByDay] = useState<
    Record<string, ExpandedTransitionIndices>
  >({});

  // M-3d-bugfix (= 2026-05-23 CEO smoke FAIL 訂正):
  //   per-day 初期状態 (= expandedByDay[iso] === undefined) のとき
  //   DayGraphTimeline の canDisclose 判定で「expandedTransitionIndices === undefined」 となり
  //   disclosure UI 全体が非活性化 → 「詳細」 hint 不表示。
  //
  //   対策: stable empty set (= useMemo) を fallback として用意し、
  //         user が初めて tap する前から「空 Set」 を渡す。
  //         これにより 3 props セット AND 条件を満たし、 「詳細」 が表示される。
  //
  //   PII 0 / mutation harden 整合:
  //     - useMemo 内部スコープのみ、 外部公開なし
  //     - resetAllDisclosures() は M-3c-pure-harden の公開 API
  //     - 同 instance を全 day で共有しても問題なし (= user 操作で setExpandedByDay 経由で
  //       per-day 新 Set に置き換わるため、 共有 instance が mutate される path なし)
  const stableEmptyExpanded = useMemo(() => resetAllDisclosures(), []);

  // M-3d: today (= visible week の anchor) 変化で全 day reset (= 「観測の幕間」 を week-level に lift、 革新 M-3d-2)
  //   localStorage 禁止と整合: persist なし、 week 切替で fresh observation 再起動。
  const weekKey = isoDate(today);
  useEffect(() => {
    setExpandedByDay({});
  }, [weekKey]);

  // M-3d: per-day toggle handler (= 革新 M-3d-3、 curry pattern)
  //   各日に bound handler を返す (= DayGraphTimeline は (transitionIndex) => void を受ける)。
  const handleToggleFeasibilityDisclosureForDay = useCallback(
    (iso: string) => (transitionIndex: number) => {
      setExpandedByDay((current) => {
        const dayExpanded = current[iso] ?? resetAllDisclosures();
        const currentState = getDisclosureStateForIndex(dayExpanded, transitionIndex);
        const action = currentState === "expanded" ? "request_collapse" : "request_expand";
        const next = applyDisclosureAction(dayExpanded, transitionIndex, action);
        return { ...current, [iso]: next };
      });
    },
    [],
  );

  const handleEmptyDayClick = (day: Date) => {
    onAddRequest?.({
      initial: { kind: "one_off", date: isoDate(day) },
      subtitle: `リスト / ${formatJpDate(day)} から`,
    });
  };

  const handleFabClick = () => {
    onAddRequest?.({
      initial: { kind: "one_off", date: isoDate(today) },
      subtitle: `リスト / ${formatJpDate(today)} から`,
    });
  };

  // 8b-7-B: 1 日表示用 selectedIso state (= flag ON で 1 日のみ表示 + 左右 nav)
  //   default: today。 flag OFF では完全に使われない (= 既存 7 日縦並び維持)
  const [selectedIso, setSelectedIso] = useState<string>(isoDate(today));
  const selectedIndex = days.findIndex((d) => isoDate(d) === selectedIso);
  const safeSelectedIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const canGoPrev = safeSelectedIndex > 0;
  const canGoNext = safeSelectedIndex < days.length - 1;
  const handleGoPrev = () => {
    if (canGoPrev) setSelectedIso(isoDate(days[safeSelectedIndex - 1]));
  };
  const handleGoNext = () => {
    if (canGoNext) setSelectedIso(isoDate(days[safeSelectedIndex + 1]));
  };
  // 8b-7-B: flag ON 時は selectedDay 1 件のみ render、 OFF 時は 7 day 全件
  const daysToRender = LIST_NEW_TIMELINE_ENABLED
    ? days.slice(safeSelectedIndex, safeSelectedIndex + 1)
    : days;
  const selectedDay = days[safeSelectedIndex];

  return (
    <div data-testid="plan-flow-tab" className="relative pb-24">
      {/* 8b-7-B + 8b-9: 1 日表示時の date picker (= flag ON のみ、 SVG calendar icon + 中央日付 + 左右 nav) */}
      {LIST_NEW_TIMELINE_ENABLED && selectedDay && (
        <div
          className="mx-auto mb-4 max-w-3xl flex items-center justify-center gap-4 px-4 py-3 rounded-2xl border border-slate-100 bg-white shadow-sm"
          data-testid="plan-flow-date-picker"
        >
          <button
            type="button"
            onClick={handleGoPrev}
            disabled={!canGoPrev}
            aria-label="前日"
            className="px-3 py-1 rounded-md text-slate-500 hover:bg-slate-50 disabled:opacity-30 focus:outline-none focus-visible:border-slate-300 border border-transparent transition-colors"
          >
            ‹
          </button>
          <span className="text-sm font-medium text-slate-700 tabular-nums inline-flex items-center gap-1.5">
            {/* 8b-9: 📅 emoji → SVG outline calendar icon (= CEO 「Calendar icon 新規作成」) */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="text-slate-500"
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 9 H21" />
              <path d="M8 3 V7" />
              <path d="M16 3 V7" />
              <circle cx="8" cy="14" r="1" />
              <circle cx="12" cy="14" r="1" />
              <circle cx="16" cy="14" r="1" />
            </svg>
            {formatJpDate(selectedDay)}
          </span>
          <button
            type="button"
            onClick={handleGoNext}
            disabled={!canGoNext}
            aria-label="翌日"
            className="px-3 py-1 rounded-md text-slate-500 hover:bg-slate-50 disabled:opacity-30 focus:outline-none focus-visible:border-slate-300 border border-transparent transition-colors"
          >
            ›
          </button>
        </div>
      )}
      {/* 8b-7-B: flag ON で 1 日のみ、 OFF で 7 day 全件 (= 既存) */}
      {daysToRender.map((day) => {
        const iso = isoDate(day);
        const dayAnchors = dayAnchorsMap.get(iso) ?? [];
        const dayOverlaps = dayOverlapsMap.get(iso) ?? new Set<string>();
        // K-3c-ii: dayGraphByDate[iso] が存在すれば section 内で timeline 表示
        const dayGraphResult = dayGraphByDate?.[iso] ?? null;
        // L-4d-b2: 7 day 全件で movement display を配る (= L-4d-b1 today only から発展)
        const dayMovementDisplay = movementDisplayByDay.get(iso);
        // M-3d: per-day feasibility display + expansion state (= 革新 M-3d-1)
        const dayFeasibilityDisplay = feasibilityDisplayByDay.get(iso);
        // M-3d-bugfix: per-day 未操作時の undefined fallback (= stable empty set 経由)
        //   これにより DayGraphTimeline canDisclose 判定が initial state でも true、
        //   「詳細」 hint が tap 前から表示される。
        const dayExpanded = expandedByDay[iso] ?? stableEmptyExpanded;
        // disclosure 機能は 3 props 全件揃った時のみ活性化 (= M-3c-ui 規約)
        const dayOnToggleDisclosure = dayFeasibilityDisplay
          ? handleToggleFeasibilityDisclosureForDay(iso)
          : undefined;
        return (
          <FlowDaySection
            key={iso}
            day={day}
            today={today}
            anchors={dayAnchors}
            dayOverlaps={dayOverlaps}
            onEmptyClick={
              onAddRequest ? () => handleEmptyDayClick(day) : undefined
            }
            onAnchorClick={onAnchorClick}
            dayGraphResult={dayGraphResult}
            movementDisplayByTransitionIndex={dayMovementDisplay}
            feasibilityDisplayByTransitionIndex={dayFeasibilityDisplay}
            expandedTransitionIndices={dayExpanded}
            onToggleFeasibilityDisclosure={dayOnToggleDisclosure}
          />
        );
      })}

      {/* 静的 ALTER 提案 card placeholder (CEO 補正 #2、ボタン風 styling 禁止) */}
      {firstEmptyDayLabel !== null && (
        <StaticAlterSuggestionCard firstEmptyDayLabel={firstEmptyDayLabel} />
      )}

      {/* FAB (Phase 2-A 同 pattern、今日 prefill、HomePaneIndicator z-30 と重ねない bottom-20) */}
      {onAddRequest && (
        <button
          type="button"
          onClick={handleFabClick}
          aria-label={`今日 (${formatJpDate(today)}) に予定を追加`}
          data-testid="plan-flow-fab"
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
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FlowDaySection (single day = section with sticky header + anchor list / empty inline)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function FlowDaySection({
  day,
  today,
  anchors,
  dayOverlaps,
  onEmptyClick,
  onAnchorClick,
  dayGraphResult,
  movementDisplayByTransitionIndex,
  feasibilityDisplayByTransitionIndex,
  expandedTransitionIndices,
  onToggleFeasibilityDisclosure,
}: {
  day: Date;
  today: Date;
  anchors: ExternalAnchor[];
  /** Phase 2-E: 同日の overlap anchor id Set (= 親から detectTimedAnchorOverlaps の結果) */
  dayOverlaps: ReadonlySet<string>;
  /** 予定なし日の inline button onClick (onAddRequest あり時のみ undefined でない) */
  onEmptyClick?: () => void;
  onAnchorClick?: (anchor: ExternalAnchor) => void;
  /**
   * K-3c-ii: 当日の DayGraph (= 親 FlowTab で dayGraphByDate[iso] lookup 済)。
   * null なら timeline section render しない (= 既存 UI のみ)。
   */
  dayGraphResult?: import(
    "@/lib/plan/dayGraph/dayGraphTypes"
  ).BuildDayGraphResult | null;
  /**
   * L-4d-b2: visible 7 day 全件で親が渡す MovementDisplayView map (= 「移動 約 N 分」 表示)。
   * 未指定なら DayGraphTimeline は K view fallback で「→ 移動」 維持。
   */
  movementDisplayByTransitionIndex?: ReadonlyMap<number, MovementDisplayView>;
  /**
   * M-3d: 当日の FeasibilityDisplayView map (= 「余白 N 分」 / 「不足 N 分」 表示候補)。
   * 未指定なら disclosure UI 無効 (= 既存挙動)。
   */
  feasibilityDisplayByTransitionIndex?: ReadonlyMap<number, FeasibilityDisplayView>;
  /**
   * M-3d: 当日の expanded transitionIndices (= disclosure state)。
   * 未指定なら disclosure UI 無効。
   */
  expandedTransitionIndices?: ExpandedTransitionIndices;
  /**
   * M-3d: 当日の disclosure toggle callback (= 親で iso に bound 済)。
   * 未指定なら disclosure UI 無効。
   */
  onToggleFeasibilityDisclosure?: (transitionIndex: number) => void;
}) {
  const iso = isoDate(day);
  const label = formatFlowSectionLabel(day, today);
  const tone = weekdayTone(day, today);
  const hasAnchors = anchors.length > 0;
  const ariaLabel = hasAnchors
    ? `${label} · ${anchors.length} 件`
    : `${label} · 予定なし`;

  // ─────────────────────────────────────────────────────────────────────
  // sub-phase 8a-impl: 新 List 表示 path (= LIST_NEW_TIMELINE_ENABLED 時のみ)
  //
  //   構造のみ置換 (= GPT 重要条件遵守、 truth なき source semantics 主張禁止):
  //     - 旧 anchor list (= ul + AnchorRow + AnchorThumbnail) → TimelineSpine + EventCard
  //     - 旧 empty inline button (= 予定なし ›) → EmptyDayEntry (= 「ALTER で見る ›」、 N-3a label)
  //     - 旧 DayGraphTimeline (= transition + warnings) → 8a 範囲では skip (= 8b 以降で接続)
  //
  //   不触:
  //     - sticky header (= 日付 + 件数 + 曜日色) → 完全不変、 新 path でも render
  //     - movement / feasibility / disclosure 系 props → 新 path では参照しない (= 8b 以降で活用)
  //     - 「予定なし」 static label (= onEmptyClick 未提供時の non-interactive 表示) → 旧 path 同様 sticky header 内 render
  //
  //   flag OFF (= default) では本 block を完全に通過 (= 既存 return 文に到達、 user 影響 0)
  // ─────────────────────────────────────────────────────────────────────
  if (LIST_NEW_TIMELINE_ENABLED) {
    // 8b-7: 「出発」 / 「帰宅」 virtual events を含む timeline (= CEO 明示)
    const newTimelineEvents = hasAnchors
      ? convertExternalAnchorListWithDayBookends(anchors)
      : [];
    // 8b-8: bookends 込み events から transitions 生成 (= 出発↔最初、 最後↔帰宅 にも移動 chip)
    //   - convertEventsToTransitions は events 配列から直接、 bookends 込みで通せる
    const newTimelineTransitions = convertEventsToTransitions(newTimelineEvents);
    return (
      <section
        data-testid={`plan-flow-section-${iso}`}
        aria-label={ariaLabel}
      >
        {/* 8b-9 corrective: sticky header (= 「今日 · 5月24日(日) 2 件」 等) は date picker と重複するため非表示
            ただし onEmptyClick === undefined の場合 (= read-only) のみ minimal static 「予定なし」 を表示 */}
        {!hasAnchors && onEmptyClick === undefined && (
          <div className="px-4 py-2 text-xs text-slate-400" data-testid={`plan-flow-empty-${iso}-static`}>
            予定なし
          </div>
        )}

        {/* body: 新 timeline / empty entry */}
        <div className="px-4 py-3">
          {hasAnchors && (
            <TimelineSpine
              events={newTimelineEvents}
              transitions={newTimelineTransitions}
              onEventTap={
                onAnchorClick
                  ? (id: string) => {
                      const a = anchors.find((x) => x.id === id);
                      if (a) onAnchorClick(a);
                    }
                  : undefined
              }
            />
          )}
          {!hasAnchors && onEmptyClick !== undefined && (
            <EmptyDayEntry
              context={{ tab: "flow", iso }}
              onTap={onEmptyClick}
            />
          )}
        </div>
      </section>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // 既存 path (= LIST_NEW_TIMELINE_ENABLED false、 default、 完全不変)
  // ─────────────────────────────────────────────────────────────────────
  return (
    <section
      data-testid={`plan-flow-section-${iso}`}
      aria-label={ariaLabel}
    >
      {/* Sticky header: scroll しても日付見出しが top に残る (Beyond §11.11) */}
      <header
        className="
          sticky top-0 z-10
          bg-white/95 backdrop-blur-sm
          px-4 py-2
          flex items-baseline justify-between gap-2
          border-b border-slate-100
        "
      >
        <h3 className="text-sm">
          <span className={TONE_CLASS[tone]}>{label}</span>
          {hasAnchors && (
            <span
              className="ml-2 text-xs font-normal text-slate-400"
              data-testid={`plan-flow-count-${iso}`}
            >
              {anchors.length} 件
            </span>
          )}
        </h3>

        {/* 予定なし日: header 右に inline button (CEO 補正 #1: AddAnchorModal date prefill) */}
        {!hasAnchors && onEmptyClick !== undefined && (
          <button
            type="button"
            onClick={onEmptyClick}
            aria-label={`${formatJpDate(day)} に予定を追加`}
            data-testid={`plan-flow-empty-${iso}`}
            className="
              text-xs text-slate-400 hover:text-slate-600
              px-3 py-2 -my-2 -mr-2
              rounded-md hover:bg-slate-50
              transition-colors
              min-h-[44px]
              inline-flex items-center
            "
          >
            予定なし ›
          </button>
        )}
        {!hasAnchors && onEmptyClick === undefined && (
          <span
            className="text-xs text-slate-400"
            data-testid={`plan-flow-empty-${iso}-static`}
          >
            予定なし
          </span>
        )}
      </header>

      {/* Anchor list (予定あり日のみ) */}
      {hasAnchors && (
        <ul className="flex flex-col gap-2 px-4 py-3">
          {anchors.map((a) => (
            <AnchorRow
              key={a.id}
              anchor={a}
              hasOverlap={dayOverlaps.has(a.id)}
              onClick={onAnchorClick}
            />
          ))}
        </ul>
      )}

      {/*
       * Phase 3-K-3c-ii: DayGraphTimeline を当日の構造として **静かに**追加表示。
       *
       * 不変原則:
       *   - 既存 anchor list / empty state header は不変
       *   - dayGraphResult が null なら何も render しない (= K-3c-0 で計算済 day のみ表示)
       *   - 空 day (= anchor 0) でも entry あれば timeline 表示 (= start + gap + end、
       *     Aneurasync 「観察文化」、 「何もない日も構造として表現」)
       *   - 控えめ separator (= mx-4 mt-3 mb-1 / border-t border-slate-100 / pt-3)
       *   - heading は省略 (= FlowTab は 7 day 連続表示のため、 各 section の heading が
       *     冗長になる)。 timeline 自体が「1 日の構造」 を表す
       *   - warnings / duration / mode / risk 表示なし
       *   - onEventClick → anchors.find → onAnchorClick(anchor) bridge
       *   - React.memo 適用済 (= K-3c-ii、 FlowTab 7 timeline 性能担保)
       */}
      {dayGraphResult && (
        <div
          className="mx-4 mt-3 mb-1 pt-3 border-t border-slate-100"
          data-testid={`plan-flow-day-graph-section-${iso}`}
        >
          {/*
           * K-3c-iii: compact={true} を渡すことで、 anchor 0 件かつ warnings 0 件
           * の **本当に空の日**は 1 行 summary 表示になる (= 縦 density 抑制)。
           * anchor あり日 / warnings あり日は通常 timeline (= fallback、
           * 「予定なし」 と誤表示しない、 Negative Capability)。
           * CalendarTab / MapTab は compact 未指定 = false default。
           */}
          <DayGraphTimeline
            result={dayGraphResult}
            view="user_self"
            compact={true}
            onEventClick={(anchorId: string) => {
              if (!onAnchorClick) return;
              const anchor = anchors.find((a) => a.id === anchorId);
              if (anchor) onAnchorClick(anchor);
            }}
            dataTestId={`plan-flow-day-graph-timeline-${iso}`}
            movementDisplayByTransitionIndex={movementDisplayByTransitionIndex}
            feasibilityDisplayByTransitionIndex={feasibilityDisplayByTransitionIndex}
            expandedTransitionIndices={expandedTransitionIndices}
            onToggleFeasibilityDisclosure={onToggleFeasibilityDisclosure}
          />
        </div>
      )}
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AnchorRow (time + title + sub + right thumbnail)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AnchorRow({
  anchor,
  hasOverlap,
  onClick,
}: {
  anchor: ExternalAnchor;
  /** Phase 2-E: 同日内で時刻が他 anchor と重なるか */
  hasOverlap: boolean;
  onClick?: (anchor: ExternalAnchor) => void;
}) {
  const clickable = !!onClick;
  // Phase 2-F: Compact density (primary only)、title に fullLabel
  const { primary: locationPrimary, fullLabel: locationFullLabel } =
    formatLocationDisplayParts(anchor);
  const handleClick = (
    e:
      | React.MouseEvent<HTMLLIElement>
      | React.KeyboardEvent<HTMLLIElement>
  ) => {
    if (!onClick) return;
    e.stopPropagation();
    onClick(anchor);
  };

  return (
    <li
      {...(clickable
        ? {
            role: "button" as const,
            tabIndex: 0,
            "aria-label": `${anchor.title} の詳細を見る`,
            onClick: handleClick,
            onKeyDown: (e: React.KeyboardEvent<HTMLLIElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                handleClick(e);
              }
            },
          }
        : {})}
      data-testid={`plan-flow-anchor-${anchor.id}`}
      className={
        "flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 " +
        (clickable
          ? "cursor-pointer transition hover:border-indigo-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          : "")
      }
    >
      {/* Time + title + sub (flex-1、truncate で overflow 防止) */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-mono text-indigo-700">
            {formatTime(anchor.startTime)}
            {anchor.endTime ? ` – ${formatTime(anchor.endTime)}` : ""}
          </span>
          {anchor.rigidity === "hard" && (
            <GlassBadge variant="default" size="sm">
              固定
            </GlassBadge>
          )}
          {/*
           * Phase 2-E: 時刻重なり気付き indicator (時刻 row 内)
           * - 警告ではなく「気付き」(muted slate のみ、警告色禁止)
           * - sensitive anchor でも表示 (Cross-tab 一貫性、GPT 補正 1 反映)
           * - 文言は固定、他 anchor 名・件数は出さない
           */}
          {hasOverlap && (
            <span
              role="img"
              aria-label="この時刻に他の予定があります"
              title="この時刻に他の予定があります"
              data-testid={`plan-flow-anchor-${anchor.id}-overlap`}
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
        <p className="mt-1 text-base font-medium text-slate-900 truncate">
          {anchor.title}
        </p>
        {locationPrimary && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {/*
             * Phase 2-F: Compact density (primary only)
             * title 属性に fullLabel (= mouse hover で full 情報)
             * 非 interactive な <p> なので aria-label は付けない (W3C ARIA 1.2)
             * 既存 AnchorRow 全体の aria-label "${anchor.title} の詳細を見る" は完全不変
             */}
            <p
              className="text-xs text-slate-500 truncate flex-1 min-w-0"
              title={locationFullLabel}
            >
              {locationPrimary}
            </p>
            {/*
             * Phase 2-D C3: 場所未確定 indicator (dot + text-xs label)
             * 判定は Cross-tab 単一仕様の isPlaceUnconfirmed のみ使用、
             * 引数は元 anchor.locationText で完全不変 (Phase 2-F の display 整形と判定は分離)
             * リストは情報密度許容、CalendarTab より説明文を 1 段足す
             */}
            {isPlaceUnconfirmed(anchor.locationText) && (
              <span
                data-testid={`plan-flow-anchor-${anchor.id}-unconfirmed`}
                aria-label="場所未確定"
                title="場所未確定 (まだ Places で確定されていません)"
                className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] text-slate-500"
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full bg-slate-400 ring-1 ring-slate-500/30"
                />
                <span>場所未確定</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right-end thumbnail (locationCategory emoji、sensitive は 🔒) */}
      <AnchorThumbnail anchor={anchor} />
    </li>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AnchorThumbnail (locationCategory emoji fallback、sensitive privacy 配慮)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * locationCategory ベース fallback thumbnail。
 *
 * 設計原則 (mini design §4):
 *   - 実画像なし (本 wave は migration なし、imageUrl field なし)
 *   - locationCategory → CATEGORY_META[cat].emoji を中央配置
 *   - sensitiveCategory 設定済 anchor は内容を晒さない → 🔒 generic icon
 *   - 将来 imageUrl field 追加時は、本 component で imageUrl > emoji の優先順位で
 *     1 行 switch すれば easy migration
 */
function AnchorThumbnail({ anchor }: { anchor: ExternalAnchor }) {
  // Phase 2-I 拡張: brand-specific icon を最優先 (= ぱっと見でスタバとわかる)
  // 優先順位: sensitive > brand > category fallback
  // 1. sensitive anchor → CategorySensitiveIcon (= privacy 最優先、 brand 露出させない)
  if (anchor.sensitiveCategory) {
    const Icon = pickCategoryIcon({ sensitive: true });
    return (
      <div
        role="img"
        aria-label="敏感カテゴリ"
        className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0"
        data-testid="plan-flow-thumb-sensitive"
      >
        <Icon className="w-7 h-7 text-slate-400" />
      </div>
    );
  }

  // 2. brand-specific icon (= filled style、 brand color)
  const brandHit = pickBrandIcon(anchor.locationText);
  if (brandHit) {
    const BrandIcon = brandHit.icon;
    return (
      <div
        role="img"
        aria-label={brandHit.displayName}
        title={brandHit.displayName}
        className="w-14 h-14 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden"
        data-testid={`plan-flow-thumb-brand-${brandHit.brand}`}
      >
        <BrandIcon className="w-12 h-12" />
      </div>
    );
  }

  // 3. category fallback (= outlined SVG、 category color)
  const cat = categoryOf(anchor);
  const meta = CATEGORY_META[cat];
  const Icon = pickCategoryIcon({ category: cat });
  const colorClass = pickCategoryColorClass({ category: cat });
  return (
    <div
      role="img"
      aria-label={`カテゴリ: ${meta.label}`}
      title={meta.hint}
      className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0"
      data-testid={`plan-flow-thumb-${cat}`}
    >
      <Icon className={`w-7 h-7 ${colorClass}`} />
      {/* emoji legacy fallback (= hidden visually、 SVG が render される限り表示されない) */}
      <span className="sr-only" aria-hidden="true">
        {meta.emoji}
      </span>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// StaticAlterSuggestionCard (CEO 補正 #2: ボタン風 styling 禁止)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 静的 ALTER 提案 card placeholder
 *
 * CEO 補正 #2 遵守 (mini design §3.4):
 *   - tap 動作なし (cursor:default、tabIndex なし、onClick なし、role="region")
 *   - ボタン風 styling 禁止 (shadow-md 以上の elevation なし、hover effect なし)
 *   - 文言は CTA 想起を作らない:
 *     "予定のない日には、ALTER が提案を置きにくる予定です"
 *     "(Phase 3 で動作予定 — 今は説明だけ)"
 *   - role="region" で screen reader にも非対話を伝える
 *   - select-none で text 選択を防止 (誤 tap 時の visual feedback も最小化)
 *
 * Phase 3 で動作実装時に button-like styling に切り替える (本 wave では絶対不可)。
 */
function StaticAlterSuggestionCard({
  firstEmptyDayLabel,
}: {
  firstEmptyDayLabel: string;
}) {
  return (
    <section
      role="region"
      aria-label="ALTER 提案 (今後の機能、Phase 3 で実装予定)"
      data-testid="plan-flow-static-alter-card"
      className="
        mx-4 my-6
        rounded-2xl
        bg-gradient-to-br from-indigo-50/60 to-purple-50/60
        p-4
        select-none
      "
      style={{ cursor: "default" }}
    >
      <p className="text-xs text-slate-500 mb-3 italic">
        予定のない日には、ALTER が提案を置きにくる予定です
      </p>
      <div className="rounded-xl bg-white/70 px-4 py-3 border border-slate-100">
        <p className="text-sm text-slate-700">
          {firstEmptyDayLabel} は何する？
        </p>
        <p className="text-xs text-slate-400 mt-1">
          (Phase 3 で動作予定 — 今は説明だけ)
        </p>
      </div>
    </section>
  );
}
