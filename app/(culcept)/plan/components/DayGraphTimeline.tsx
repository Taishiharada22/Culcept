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

import { Fragment, memo, type KeyboardEvent, type ReactElement } from "react";

import {
  buildCompactSummaryView,
  buildTimelineView,
  type CompactSummaryView,
  type EventNodeView,
  type NodeView,
} from "@/lib/plan/dayGraph/dayGraphTimelinePresentation";
import type {
  BuildDayGraphResult,
  DayGraphView,
} from "@/lib/plan/dayGraph/dayGraphTypes";
import type { MovementDisplayView } from "@/lib/plan/transport/movementDisplayFormatter";
import type { FeasibilityDisplayView } from "@/lib/plan/feasibility/feasibilityDisplayFormatter";

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
  /**
   * K-3c-iii: compact mode (= FlowTab empty day 用、 default false)。
   *
   * **採用条件 (= internal で AND 判定)**:
   *   1. compact === true
   *   2. result.graph.attributes.anchorCount === 0
   *   3. result.warnings.length === 0
   *
   * いずれか満たさない場合は通常 timeline を render (= fallback)。
   * 「予定なし」 と誤表示しない (= Negative Capability、 CEO 補正 2)。
   *
   * CalendarTab / MapTab は **未指定** (= default false、 既存挙動維持)。
   * FlowTab のみ true を渡す。
   */
  readonly compact?: boolean;
  /**
   * L-4d MapTab-only UI 接続 (= 2026-05-22 CEO + GPT 承認):
   *   transitionIndex → MovementDisplayView の optional map。
   *
   * 渡された transition に対し、 K view の固定文言 (= 「→ 移動」) を **置換**する。
   *
   * - undefined / 該当 index なし → K view の「→ 移動」 維持 (= CalendarTab/FlowTab で本 prop 不要)
   * - variant "unresolved" の view → 「→ 移動」 と同じ表示
   * - variant "sensitive" の view → 「移動」
   * - variant "duration_only" の view → 「移動 約 N 分」
   *
   * 階調 / className / styling は **K-3c-iii のまま** (= slate-300、 amber/orange/red 不使用)。
   * label / ariaLabel のみ override。
   *
   * 注: caller (= MapTab) は transitionIndex を持つ MovementDisplayView を渡す。
   *      transitionIndex は K view の MovementTransitionView 出現順 (= buildMovementTransitions の配列順) と一致。
   */
  readonly movementDisplayByTransitionIndex?: ReadonlyMap<number, MovementDisplayView>;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // M-3c-ui: per-transition Feasibility Disclosure (= 2026-05-23 CEO + GPT 承認)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * M-3c-ui: transitionIndex → FeasibilityDisplayView (= optional)。
   *
   * M-3a `runFeasibilityDisplayPipeline` 出力を caller (= MapTab) が
   * `feasibilityDisplayByTransitionKey.values()` から
   * `transitionIndex → view` map に変換して渡す想定。
   *
   * **使用条件 (= 3 props セットで disclosure 有効化)**:
   *   - feasibilityDisplayByTransitionIndex !== undefined
   *   - expandedTransitionIndices !== undefined
   *   - onToggleFeasibilityDisclosure !== undefined
   *   - 1 つでも欠ければ disclosure UI 完全無効 (= 既存 K-3c-iii / L-4d 通り、 backward compat 100%)
   *
   * **表示しない条件**:
   *   - not_applicable / sensitive / unresolved / location_unknown → M-2a で map から除外済
   *   - map.has(transitionIndex) === false の場合は「詳細」 hint も補助行も DOM に出さない
   */
  readonly feasibilityDisplayByTransitionIndex?: ReadonlyMap<number, FeasibilityDisplayView>;

  /**
   * M-3c-ui: 現在 expanded な transitionIndex の Set (= optional)。
   *
   * default は空 Set (= 全 hidden、 永続規約)。
   * caller は M-3c-pure-harden `resetAllDisclosures()` で初期化する規約。
   *
   * **hidden 時の DOM 取扱**:
   *   - expanded set に含まれない transitionIndex の補助行は **DOM に出さない** (= conditional render)
   *   - aria-hidden / display:none ではなく、 React conditional で完全不在化
   *   - screen reader / a11y ツリーにも出さない (= 「不足 N 分」 を勝手に伝達しない)
   */
  readonly expandedTransitionIndices?: ReadonlySet<number>;

  /**
   * M-3c-ui: 「詳細 / 閉じる」 tap callback (= optional)。
   *
   * caller (= MapTab) は M-3c-pure-harden `applyDisclosureAction` 経由で
   * `expandedTransitionIndices` を更新する想定。
   *
   * - transition line の tap / Enter / Space で発火
   * - hover では発火しない (= CEO 規約)
   */
  readonly onToggleFeasibilityDisclosure?: (transitionIndex: number) => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 内部 component (= memo 適用前の実体)。
 * K-3c-ii で React.memo 適用 (= FlowTab 7 timeline 同時 render の性能担保)。
 * K-3c-iii で compact mode (= empty day 用 1 行 summary) 分岐追加。
 */
function DayGraphTimelineInner(props: DayGraphTimelineProps): ReactElement | null {
  // 1. null guard (= result 未取得 / state.kind !== "ok" 時)
  if (!props.result) return null;

  // 2. K-3c-iii: compact mode 判定 (= compact && empty && no warnings)
  //    採用条件は buildCompactSummaryView 内に集約 (= 「予定なし」 誤表示防止)
  if (props.compact) {
    const summary = buildCompactSummaryView(props.result);
    if (summary) {
      return (
        <CompactEmptyDayLine
          view={summary}
          dataTestId={props.dataTestId}
          className={props.className}
        />
      );
    }
    // summary === null → 通常 timeline に fallback (= warnings あり / anchor あり)
  }

  // 3. timeline view 構築 (= sensitive redaction + view 適用済)
  const tl = buildTimelineView(props.result.graph, props.view ?? "user_self");

  // L-4d: transition の出現順 index を fromNodeId 別に pre-compute (= MovementDisplayView lookup 用)。
  // K phase の buildMovementTransitions は nodes の出現順に transitions を生成するため、
  // 「event node 内で transition を持つもの」 を順に数えれば index が一致する。
  //
  // 注: EventNodeView は K-3a で `anchorId` field のみ持つ (= `id` field は型上欠落)。
  //      K phase 不変条件で `EventNode.id === EventNode.anchorId` (= 同値)、
  //      `transitionsByFromNodeId` は EventNode.id (= anchor.id) でキーづけられる。
  //      → ここでは `anchorId` を transition key の lookup に使用 (= type-safe)。
  const transitionIndexByFromNodeId = new Map<string, number>();
  {
    let nextIdx = 0;
    for (const node of tl.nodes) {
      if (node.kind === "event" && tl.transitionsByFromNodeId[node.anchorId]) {
        transitionIndexByFromNodeId.set(node.anchorId, nextIdx);
        nextIdx++;
      }
    }
  }

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
      {tl.nodes.map((node) => {
        // event 以外は単純 render
        if (node.kind !== "event" || !tl.transitionsByFromNodeId[node.anchorId]) {
          return (
            <Fragment key={node.key}>
              {renderNode(node, props.onEventClick)}
            </Fragment>
          );
        }
        // event + transition combination
        const transitionView = tl.transitionsByFromNodeId[node.anchorId]!;
        const transitionIndex = transitionIndexByFromNodeId.get(node.anchorId)!;
        const movementOverride = props.movementDisplayByTransitionIndex?.get(
          transitionIndex,
        );

        // M-3c-ui: disclosure 機能の有効化判定
        //   3 props 全て指定 + feasibility view が存在する場合のみ有効化
        const feasibilityView = props.feasibilityDisplayByTransitionIndex?.get(
          transitionIndex,
        );
        const canDisclose =
          props.feasibilityDisplayByTransitionIndex !== undefined &&
          props.expandedTransitionIndices !== undefined &&
          props.onToggleFeasibilityDisclosure !== undefined &&
          feasibilityView !== undefined;

        const isExpanded =
          canDisclose &&
          (props.expandedTransitionIndices?.has(transitionIndex) ?? false);

        const handleToggle = canDisclose
          ? () => props.onToggleFeasibilityDisclosure!(transitionIndex)
          : undefined;

        return (
          <Fragment key={node.key}>
            {renderNode(node, props.onEventClick)}
            <TransitionItem
              key={transitionView.key}
              view={transitionView}
              displayOverride={movementOverride}
              // M-3c-ui props (= 3 件揃った時のみ disclosure UI が活性化)
              feasibilityView={canDisclose ? feasibilityView : undefined}
              isExpanded={canDisclose ? isExpanded : undefined}
              onToggleDisclosure={handleToggle}
              transitionIndex={transitionIndex}
            />
            {/*
             * M-3c-ui: expanded 時のみ補助行を DOM に出す。
             * CEO 補正 (= 2026-05-23): hidden 時は DOM 不在 (= screen reader 不在)。
             * 視覚的に隠す (= aria-hidden / display:none) ではなく conditional render。
             */}
            {canDisclose && isExpanded && feasibilityView && (
              <FeasibilityDisclosureLine
                view={feasibilityView}
                transitionIndex={transitionIndex}
              />
            )}
          </Fragment>
        );
      })}
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

// ── MovementTransition (= K-3c-iii fallback「→ 移動」 + L-4d optional override + M-3c-ui disclosure) ─

interface TransitionItemProps {
  readonly view: import("@/lib/plan/dayGraph/dayGraphTimelinePresentation").MovementTransitionView;
  /**
   * L-4d: MovementDisplayView (= optional)。
   *   - undefined → K view の固定文言 (= 「→ 移動」) を維持
   *   - 指定あり → label / ariaLabel を override (= className は K-3c-iii のまま維持)
   */
  readonly displayOverride?: MovementDisplayView;

  /**
   * M-3c-ui: 該当 transition の FeasibilityDisplayView (= optional)。
   *
   * 指定された場合:
   *   - 「詳細 / 閉じる」 textual hint を line 末尾に追加
   *   - transition line が interactive (= tap / Enter / Space で toggle)
   *   - aria-expanded / aria-controls 付与
   *
   * 未指定の場合:
   *   - 既存 L-4d / K-3c-iii 通りの挙動 (= 文字列表示のみ、 interactive 無効)
   */
  readonly feasibilityView?: FeasibilityDisplayView;

  /**
   * M-3c-ui: 該当 transition が expanded か (= optional)。
   *
   * - true → 「閉じる」 hint、 aria-expanded="true"
   * - false → 「詳細」 hint、 aria-expanded="false"
   * - undefined → disclosure UI 無効
   */
  readonly isExpanded?: boolean;

  /**
   * M-3c-ui: toggle callback (= optional)。
   *
   * 既に transitionIndex に bind 済の関数を受け取る (= caller 責任)。
   * undefined なら disclosure UI 無効。
   */
  readonly onToggleDisclosure?: () => void;

  /**
   * M-3c-ui: 該当 transition の index (= aria-controls の id 生成用)。
   */
  readonly transitionIndex?: number;
}

/**
 * L-4d helper: MovementDisplayView から ariaLabel を組み立てる。
 *
 * 規約:
 *   - variant "duration_only" → "場所の移動、 約 N 分"
 *   - variant "sensitive" / "unresolved" → "場所の移動" (= K view と同形)
 *
 * 注: warning / recommendation / optimization 文言は含めない (= L-4b NG 文言リスト遵守)。
 */
function buildAriaLabelFromDisplay(display: MovementDisplayView): string {
  if (display.variant === "duration_only") {
    // displayText は L-4a で「移動 約 N 分」 形式に固定済
    // → 「場所の移動、 約 N 分」 に変換 (= a11y、 user の readout は冗長を避けつつ duration 伝達)
    const suffix = display.displayText.replace(/^移動 /, "");
    return `場所の移動、 ${suffix}`;
  }
  return "場所の移動";
}

function TransitionItem({
  view,
  displayOverride,
  feasibilityView,
  isExpanded,
  onToggleDisclosure,
  transitionIndex,
}: TransitionItemProps): ReactElement {
  // L-4d: label / ariaLabel を optional override (= className / data-testid は K のまま)
  const label = displayOverride?.displayText ?? view.label;
  const ariaLabel = displayOverride
    ? buildAriaLabelFromDisplay(displayOverride)
    : view.ariaLabel;

  // M-3c-ui: disclosure 機能の有効化判定
  //   - feasibilityView + onToggleDisclosure の両方が指定された時のみ
  //   - isExpanded は boolean / undefined のどちらでも、 active 時に必ず boolean を取る
  const isInteractive = feasibilityView !== undefined && onToggleDisclosure !== undefined;
  const expanded = isInteractive && (isExpanded ?? false);

  // M-3c-ui: aria-controls の id (= expanded 時のみ生成、 補助行 li の id と一致)
  const ariaControlsId =
    isInteractive && expanded && transitionIndex !== undefined
      ? `feasibility-disclosure-${transitionIndex}`
      : undefined;

  // M-3c-ui: keyboard handler (= Enter / Space で toggle、 hover-only 禁止)
  const handleKeyDown = isInteractive
    ? (e: KeyboardEvent<HTMLLIElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleDisclosure?.();
        }
      }
    : undefined;

  // M-3c-ui: hint テキスト (= collapsed: 「詳細」、 expanded: 「閉じる」)
  //   - amber/orange/red 色なし、 icon なし、 中立 textual hint
  //   - styling = K-3c-iii tier_2 と同階調 (= text-xs italic text-slate-400)
  //   - aria-hidden で screen reader への二重読み上げを回避 (= aria-expanded が代替伝達)
  const hintText = isInteractive ? (expanded ? "閉じる" : "詳細") : null;

  return (
    <li
      role="listitem"
      aria-label={ariaLabel}
      className={
        view.className +
        (isInteractive
          ? " cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 rounded"
          : "")
      }
      data-testid="day-graph-transition"
      data-variant={displayOverride?.variant ?? "k-fallback"}
      data-has-disclosure={isInteractive ? "true" : undefined}
      data-expanded={isInteractive ? (expanded ? "true" : "false") : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={isInteractive ? onToggleDisclosure : undefined}
      onKeyDown={handleKeyDown}
      aria-expanded={isInteractive ? expanded : undefined}
      aria-controls={ariaControlsId}
    >
      <span>{label}</span>
      {hintText !== null && (
        <span
          className="ml-2 text-xs italic text-slate-400"
          aria-hidden="true"
          data-testid="day-graph-transition-hint"
        >
          {hintText}
        </span>
      )}
    </li>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// M-3c-ui: Feasibility Disclosure Line (= expanded 時のみ DOM に出す補助行)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 「余白 N 分」 / 「不足 N 分」 を観測表示する補助行。
 *
 * 設計判断 (= 2026-05-23 CEO + GPT 承認):
 *   - **expanded 時のみ DOM に出す** (= conditional render、 視覚 hidden 禁止)
 *   - styling = K-3c-iii tier_2_movement_aux と同階調
 *     (= text-xs italic text-slate-400、 background なし、 border なし、 icon なし)
 *   - variant (= slack / shortfall) で class 違いなし (= data attribute のみ)
 *   - amber / orange / red 不使用 → alert 化 risk 0
 *   - aria-label は displayText 直接 (= 中立、 「危険」 「不足しています」 等の禁止文言 0)
 *
 * 危険境界遵守:
 *   - warning / recommendation / optimization 文言 0
 *   - icon / badge / warning box 0
 *   - amber / orange / red 0
 */
interface FeasibilityDisclosureLineProps {
  readonly view: FeasibilityDisplayView;
  readonly transitionIndex: number;
}

function FeasibilityDisclosureLine({
  view,
  transitionIndex,
}: FeasibilityDisclosureLineProps): ReactElement {
  return (
    <li
      role="listitem"
      id={`feasibility-disclosure-${transitionIndex}`}
      aria-label={view.displayText}
      className="text-xs italic text-slate-400 pl-8"
      data-testid="day-graph-feasibility-disclosure"
      data-variant={view.variant}
      data-tier={view.tier}
    >
      {view.displayText}
    </li>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// K-3c-iii: Compact empty-day line (= FlowTab empty day 用、 1 行 summary)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CompactEmptyDayLineProps {
  readonly view: CompactSummaryView;
  readonly dataTestId?: string;
  readonly className?: string;
}

/**
 * 「予定なし · 06:00–23:00」 形式の 1 行 summary。
 *
 * 思想:
 *   - 「観察対象」 維持 (= 境界時刻表示)
 *   - 「静かな日」 として 1 行に縮約 (= 通常 timeline ~150px → ~24px)
 *   - 「予定なし」 文言は既存 FlowTab 「予定なし ›」 と統一 (= i18n / locale 共通)
 *   - action UI なし (= 「No Action UI」 維持、 div として render)
 *
 * a11y:
 *   - role="note" (= 補助情報、 click 不可)
 *   - aria-label に「観測の境界 + 予定なし」 含む
 */
function CompactEmptyDayLine({
  view,
  dataTestId,
  className,
}: CompactEmptyDayLineProps): ReactElement {
  return (
    <div
      role="note"
      aria-label={view.ariaLabel}
      className={
        view.className +
        (className ? ` ${className}` : "")
      }
      data-testid={dataTestId ?? "day-graph-compact-empty"}
    >
      <span>{view.label}</span>
      <span className="text-slate-300" aria-hidden="true">·</span>
      <span>{view.startTime}–{view.endTime}</span>
    </div>
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
