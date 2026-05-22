"use client";

/**
 * DayGraphTimeline — Phase 3-K-3a (= K-1 / K-2 を視覚化する pure presentational component)。
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md K-3 設計提案
 *
 * 役割:
 *   1 日の構造 (= start → events → gaps → end + movement transitions) を
 *   timeline 形式で表示する read-only component。
 *
 * 不変原則 (= CEO 補正 + K-3a 設計確定):
 *   - pure presentational (= internal state なし、 props のみ)
 *   - result null → render null (= empty fragment、 SSR safe)
 *   - **No Action UI**: EventNode click のみ callback (= 既存 AnchorDetailModal 起動 hook)
 *   - **No predict / suggest / optimize 文言**
 *   - **No warning color** (= neutral slate のみ、 amber/orange なし)
 *   - **No aura / blur / 特別表現** for sensitive (= 漏洩源を作らない、 CEO 補正 3)
 *   - **Memory Chip 階調**: start/end は最も implicit、 gap / movement は中間、 event は solid
 *   - **Negative Capability**: MovementTransition は「→ 移動」 のみ、 duration / mode 出さない
 *   - **a11y**: role list / listitem、 aria-label、 keyboard support、 reduced motion
 *   - **K-3a では CalendarTab 統合しない** (= K-3b 預け)
 *
 * 範囲外 (= K-3+ 預け):
 *   - 重心 strip、 TimeBucket 背景、 Boundary Soft-fade
 *   - Overlap Notation 高度表示、 Bucket Sparseness Hint
 *   - Density observation line
 *   - CalendarTab / MapTab / FlowTab 統合
 */

import { Fragment, memo, type ReactElement } from "react";

import {
  buildTimelineView,
  type EventNodeView,
  type NodeView,
} from "@/lib/plan/dayGraph/dayGraphTimelinePresentation";
import type {
  BuildDayGraphResult,
  DayGraphView,
} from "@/lib/plan/dayGraph/dayGraphTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Props
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DayGraphTimelineProps {
  /**
   * BuildDayGraphResult。 null の場合は render null (= 空 fragment 返す)。
   * PlanClient.dayGraphByDate[selectedDate] を渡す想定 (= K-3b で接続)。
   */
  readonly result: BuildDayGraphResult | null;
  /**
   * view perspective (= K-1d、 default "user_self")。
   * "shared_view" で sensitive event は generic 「予定」 になる。
   */
  readonly view?: DayGraphView;
  /**
   * EventNode click callback (= anchorId が渡る)。
   * caller (= K-3b で CalendarTab) は既存 AnchorDetailModal 起動に bridge する。
   * undefined なら event は disabled style (= 但し K-3a では常に渡される想定)。
   */
  readonly onEventClick?: (anchorId: string) => void;
  /** 外側ラッパに追加適用する class (= 親 layout 調整用、 optional) */
  readonly className?: string;
  /** dev/debug 用 data-testid (= optional) */
  readonly dataTestId?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 内部 component (= memo 適用前の実体)。
 * K-3c-ii で React.memo 適用 (= FlowTab 7 timeline 同時 render の性能担保)。
 */
function DayGraphTimelineInner(props: DayGraphTimelineProps): ReactElement | null {
  // 1. null guard (= result 未取得 / state.kind !== "ok" 時)
  if (!props.result) return null;

  // 2. timeline view 構築 (= sensitive redaction + view 適用済)
  const tl = buildTimelineView(props.result.graph, props.view ?? "user_self");

  // 3. render
  //    - 外側: role="list" + 縦並び
  //    - 各 node: 時刻 + label + (event のみ click 可)
  //    - 各 event の直後に transition があれば inline 描画
  return (
    <ol
      role="list"
      aria-label="今日の構造"
      className={
        "flex flex-col gap-2 " +
        (props.className ?? "")
      }
      data-testid={props.dataTestId ?? "day-graph-timeline"}
    >
      {tl.nodes.map((node) => (
        <Fragment key={node.key}>
          {renderNode(node, props.onEventClick)}
          {/* event の直後に transition があれば inline 表示 */}
          {node.kind === "event" && tl.transitionsByFromNodeId[node.id] && (
            <TransitionItem
              key={tl.transitionsByFromNodeId[node.id]!.key}
              view={tl.transitionsByFromNodeId[node.id]!}
            />
          )}
        </Fragment>
      ))}
    </ol>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Node render — Memory Chip 階調を helper の className に委ねる
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderNode(
  node: NodeView,
  onEventClick: ((anchorId: string) => void) | undefined,
): ReactElement {
  switch (node.kind) {
    case "start":
      return <BoundaryItem node={node} variant="start" />;
    case "end":
      return <BoundaryItem node={node} variant="end" />;
    case "gap":
      return <GapItem node={node} />;
    case "event":
      return <EventItem node={node} onEventClick={onEventClick} />;
  }
}

// ── Boundary (= start / end) ───────────────────────────────────────────────

interface BoundaryItemProps {
  readonly node: Extract<NodeView, { kind: "start" | "end" }>;
  readonly variant: "start" | "end";
}

function BoundaryItem({ node }: BoundaryItemProps): ReactElement {
  return (
    <li
      role="listitem"
      aria-label={node.ariaLabel}
      className={node.className}
      data-testid={`day-graph-${node.kind}`}
    >
      <span className="text-xs text-slate-400 mr-2">{node.startTime}</span>
      <span>{node.label}</span>
    </li>
  );
}

// ── Gap ────────────────────────────────────────────────────────────────────

interface GapItemProps {
  readonly node: Extract<NodeView, { kind: "gap" }>;
}

function GapItem({ node }: GapItemProps): ReactElement {
  return (
    <li
      role="listitem"
      aria-label={node.ariaLabel}
      className={node.className}
      data-testid="day-graph-gap"
    >
      <span className="text-xs text-slate-400 mr-2">
        {node.startTime}-{node.endTime}
      </span>
      <span>{node.label}</span>
    </li>
  );
}

// ── Event (= 唯一の clickable node) ────────────────────────────────────────

interface EventItemProps {
  readonly node: EventNodeView;
  readonly onEventClick: ((anchorId: string) => void) | undefined;
}

function EventItem({ node, onEventClick }: EventItemProps): ReactElement {
  // 共通 inner content (= displayLabel + 時刻 hint)
  const inner = (
    <>
      <span className="text-xs text-slate-500 mr-2">
        {node.startTime}-{node.endTime}
        {node.endTimeHint && (
          <span
            className="text-slate-400 ml-0.5"
            data-testid="day-graph-event-end-hint"
            aria-hidden="true"
          >
            {node.endTimeHint}
          </span>
        )}
      </span>
      <span className="font-medium">{node.displayLabel}</span>
    </>
  );

  // onEventClick 未提供時は button にせず、 静的 li で render
  if (!onEventClick) {
    return (
      <li
        role="listitem"
        aria-label={node.ariaLabel}
        className={node.className}
        data-testid="day-graph-event"
        data-anchor-id={node.anchorId}
      >
        {inner}
      </li>
    );
  }

  // onEventClick 提供時は button として a11y (= Enter / Space で活性化)
  return (
    <li
      role="listitem"
      aria-label={node.ariaLabel}
      className={node.className}
      data-testid="day-graph-event"
      data-anchor-id={node.anchorId}
    >
      <button
        type="button"
        onClick={() => onEventClick(node.anchorId)}
        className="text-left w-full block focus:outline-none focus:ring-2 focus:ring-indigo-300 rounded-md"
        aria-label={node.ariaLabel}
      >
        {inner}
      </button>
    </li>
  );
}

// ── MovementTransition (= 「→ 移動」 のみ、 Negative Capability) ─────────

interface TransitionItemProps {
  readonly view: import("@/lib/plan/dayGraph/dayGraphTimelinePresentation").MovementTransitionView;
}

function TransitionItem({ view }: TransitionItemProps): ReactElement {
  return (
    <li
      role="listitem"
      aria-label={view.ariaLabel}
      className={view.className}
      data-testid="day-graph-transition"
    >
      {view.label}
    </li>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 公開 export — Phase 3-K-3c-ii で React.memo 適用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * memoized DayGraphTimeline。
 *
 * 性質:
 *   - props (= result / view / onEventClick / className / dataTestId) が
 *     referentially equal なら re-render skip
 *   - FlowTab で 7 timeline を render する場面で性能担保
 *   - PlanClient の useMemo で `dayGraphByDate` が stable なら、 各 [iso] lookup も stable
 *     (= memoization が効く)
 *   - default shallow compare で十分 (= 全 props が primitives or stable references)
 */
export const DayGraphTimeline = memo(DayGraphTimelineInner);
DayGraphTimeline.displayName = "DayGraphTimeline";
