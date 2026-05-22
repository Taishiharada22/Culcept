/**
 * DayGraphTimeline Presentation Helpers — Phase 3-K-3a (= UI render の pure 計算層)。
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md K-3 設計提案 §3 / §4
 *
 * 役割:
 *   DayGraph node / transition を React render 用の view object に変換する pure 関数。
 *   React component (= DayGraphTimeline.tsx) は本 helper の出力をそのまま JSX で描く。
 *
 * 不変原則:
 *   - pure (= side effects なし、 mutation なし、 LLM 不使用)
 *   - graph mutation 不可
 *   - sensitive redaction を **必ず**反映 (= displayLabel 経由)
 *   - 色は **neutral slate のみ** (= K-3a CEO 補正、 amber/orange 警告色禁止)
 *   - No Action UI (= EventNode のみ clickable、 他は非対話)
 *   - Negative Capability (= MovementTransition は「→ 移動」 のみ、 duration 出さない)
 *
 * K-3a 採用 5 革新 (= CEO 確定):
 *   1. Memory Chip 階調 (= start/end は dashed slate-300、 gap は dashed slate-400)
 *   2. Negative Capability 表現 (= movement は label のみ)
 *   3. Sensitive redaction (= displayLabel のみ、 aura / blur なし)
 *   4. durationSource / boundaryClipped subtle hint (= "~" / "|")
 *   5. No Action UI (= 一切の predict / suggest 無し)
 *
 * K-3a 延期 (= K-3+ 預け、 本 file で実装しない):
 *   - 重心 strip / TimeBucket 背景 / Boundary Soft-fade
 *   - Overlap Notation 高度表示 / Bucket Sparseness Hint / Density observation line
 *   - Sensitive Aura (= 思想的に逆効果)
 *   - amber/orange 警告色
 */

import { applyDayGraphView } from "./dayGraphView";
import type {
  BuildDayGraphResult,
  DayGraph,
  DayGraphNode,
  DayGraphView,
  DurationSource,
  EventNode,
  MovementTransition,
} from "./dayGraphTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Subtle hints (= K-3a §22.10)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * endTime に付ける subtle hint suffix を返す。
 *
 *   - durationSource === "assumed_default" → "~" (= 「仮置きの 60 分」 暗示)
 *   - boundaryClipped === true → "|" (= 「観測境界で切れた」 暗示)
 *   - 両方 → "~|"
 *   - explicit + not clipped → "" (= 通常)
 *
 * 警告色ではない、 subtle text hint。 後 phase (3-L/M/N) で意味を持つが
 * K-3a から visual hint 自体は組み込む。
 */
export function buildEndTimeHint(
  durationSource: DurationSource,
  boundaryClipped: boolean,
): string {
  let s = "";
  if (durationSource === "assumed_default") s += "~";
  if (boundaryClipped) s += "|";
  return s;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Node view types (= K-3a 用、 React 非依存)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type NodeViewKind = "start" | "end" | "event" | "gap";

interface NodeViewBase {
  readonly key: string;
  readonly kind: NodeViewKind;
  readonly startTime: string;
  readonly endTime: string;
  /** Tailwind class string (= component 側でそのまま className に渡す) */
  readonly className: string;
  /** aria-label (= screen reader 向け、 sensitive redacted 済) */
  readonly ariaLabel: string;
  /** 「役割」 (= list item として固定) */
  readonly role: "listitem";
}

export interface StartNodeView extends NodeViewBase {
  readonly kind: "start";
  /** 表示 label (= 「起点」 等の generic、 boundary であることを示唆) */
  readonly label: string;
}

export interface EndNodeView extends NodeViewBase {
  readonly kind: "end";
  readonly label: string;
}

export interface EventNodeView extends NodeViewBase {
  readonly kind: "event";
  readonly anchorId: string;
  /** 常に safe な表示 label (= sensitive redaction 適用済) */
  readonly displayLabel: string;
  /** "~", "|", "~|", "" (= buildEndTimeHint 由来) */
  readonly endTimeHint: string;
  /** true = button として render、 onEventClick が active */
  readonly clickable: true;
  /** sensitive flag (= 内部参照用、 UI でアイコン等にしない = CEO 補正 No Aura) */
  readonly sensitive: boolean;
}

export interface GapNodeView extends NodeViewBase {
  readonly kind: "gap";
  /** "{N} 分" or "{H} 時間 {M} 分" 等の duration label */
  readonly label: string;
  /** gap が sensitive proximity (= 内部参照用、 K-3a UI で扱わない) */
  readonly sensitiveProximity: boolean;
}

export type NodeView =
  | StartNodeView
  | EndNodeView
  | EventNodeView
  | GapNodeView;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tailwind class fragments (= Memory Chip 階調、 K-3a §22.3)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Memory Chip 階調 (= K-3c-iii 強化、 3 階層):
 *
 *   階層 1 (= 最も静か、 implicit 「日の境界 / 空白」):
 *     - start / end:  dashed slate-200 + text-slate-400 + text-xs + py-1
 *     - gap:          dashed slate-200 + text-slate-400 + text-xs + py-1
 *
 *   階層 2 (= 中間 implicit、 「未確定移動」):
 *     - movement:     dashed slate-300 + text-slate-500 + text-xs + py-0.5
 *
 *   階層 3 (= explicit、 「user の意思の痕跡」、 維持):
 *     - event non-sensitive: solid slate-400 + text-slate-800 + py-2
 *     - event sensitive:     solid slate-400 + text-slate-700 + py-2
 *
 * 設計判断 (= CEO K-3c-iii 補正):
 *   - Start/End / Gap を同 shade (= slate-200) に統一 → 形 (点 vs 帯) で区別
 *   - Movement を 1 段薄く (= slate-300) して階調明確化
 *   - Event は維持 → 階調差: Event > Movement > {Boundary, Gap}
 *   - 色は neutral slate のみ (= amber/orange/red 永続禁止)
 *   - 「No Aura」 維持 (= sensitive 強調なし、 generic 見た目)
 */
const CLASS_BOUNDARY =
  "border border-dashed border-slate-200 text-slate-400 italic text-xs " +
  "bg-white/60 rounded-md px-3 py-1 motion-reduce:transition-none";
const CLASS_GAP =
  "border border-dashed border-slate-200 text-slate-400 italic text-xs " +
  "bg-white/40 rounded-md px-3 py-1 motion-reduce:transition-none";
const CLASS_EVENT_NON_SENSITIVE =
  "border border-solid border-slate-400 text-slate-800 " +
  "bg-white rounded-md px-3 py-2 motion-reduce:transition-none";
const CLASS_EVENT_SENSITIVE =
  // No aura / blur / 強調なし (= CEO 補正 3、 generic な見た目)
  "border border-solid border-slate-400 text-slate-700 " +
  "bg-white rounded-md px-3 py-2 motion-reduce:transition-none";
const CLASS_TRANSITION =
  // K-3c-iii: slate-300 + text-xs (= 中間階層、 階調明確化、 amber/orange 不使用)
  "border border-dashed border-slate-300 text-slate-500 italic " +
  "bg-transparent rounded-md px-2 py-0.5 text-xs motion-reduce:transition-none";

/**
 * K-3c-iii: Compact empty-day line class (= 1 行 single-line summary)。
 * 「予定なし · 06:00–23:00」 形式。 padding 控えめ、 text-xs。
 */
const CLASS_COMPACT_EMPTY =
  "flex items-center gap-2 text-xs text-slate-400 italic " +
  "px-3 py-1 motion-reduce:transition-none";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** "{startTime}-{endTime}" 形式の range label */
function rangeLabel(node: { startTime: string; endTime: string }): string {
  if (node.startTime === node.endTime) return node.startTime; // boundary 点
  return `${node.startTime}-${node.endTime}`;
}

/** gap duration を "1 時間 30 分" / "45 分" 形式に */
function formatGapDuration(durationMin: number): string {
  if (durationMin <= 0) return "0 分";
  const h = Math.floor(durationMin / 60);
  const m = durationMin % 60;
  if (h === 0) return `${m} 分`;
  if (m === 0) return `${h} 時間`;
  return `${h} 時間 ${m} 分`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Node → NodeView 変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function nodeToView(node: DayGraphNode): NodeView {
  switch (node.kind) {
    case "start":
      return {
        key: node.id,
        kind: "start",
        startTime: node.startTime,
        endTime: node.endTime,
        className: CLASS_BOUNDARY,
        role: "listitem",
        ariaLabel: `観測の起点 ${node.startTime}`,
        label: "起点",
      };
    case "end":
      return {
        key: node.id,
        kind: "end",
        startTime: node.startTime,
        endTime: node.endTime,
        className: CLASS_BOUNDARY,
        role: "listitem",
        ariaLabel: `観測の終点 ${node.startTime}`,
        label: "終点",
      };
    case "gap": {
      const dur = formatGapDuration(node.durationMin);
      return {
        key: node.id,
        kind: "gap",
        startTime: node.startTime,
        endTime: node.endTime,
        className: CLASS_GAP,
        role: "listitem",
        ariaLabel: `${rangeLabel(node)} 空白 ${dur}`,
        label: dur,
        sensitiveProximity: node.sensitiveProximity,
      };
    }
    case "event":
      return buildEventView(node);
  }
}

function buildEventView(node: EventNode): EventNodeView {
  const cls = node.sensitive ? CLASS_EVENT_SENSITIVE : CLASS_EVENT_NON_SENSITIVE;
  const hint = buildEndTimeHint(node.durationSource, node.boundaryClipped);
  // ariaLabel: displayLabel のみ参照 (= raw title 触らない、 redaction 必須)
  return {
    key: node.id,
    kind: "event",
    startTime: node.startTime,
    endTime: node.endTime,
    className: cls,
    role: "listitem",
    ariaLabel: `${rangeLabel(node)} ${node.displayLabel}`,
    anchorId: node.anchorId,
    displayLabel: node.displayLabel,
    endTimeHint: hint,
    clickable: true,
    sensitive: node.sensitive,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Transition view
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MovementTransitionView {
  readonly key: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  /** 「→ 移動」 固定 (= Negative Capability、 duration / mode 出さない) */
  readonly label: string;
  readonly ariaLabel: string;
  readonly className: string;
  readonly role: "listitem";
  /** 内部参照用 (= UI で blur / aura しない、 CEO 補正 3) */
  readonly sensitiveProximity: boolean;
}

function transitionToView(
  transition: MovementTransition,
  index: number,
): MovementTransitionView {
  return {
    key: `transition_${index}_${transition.fromNodeId}_${transition.toNodeId}`,
    fromNodeId: transition.fromNodeId,
    toNodeId: transition.toNodeId,
    label: "→ 移動",  // 固定文言、 詳細出さない
    ariaLabel: "場所の移動",
    className: CLASS_TRANSITION,
    role: "listitem",
    sensitiveProximity: transition.sensitiveProximity,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 公開: timeline 全体の view 構築
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TimelineView {
  /** 時系列順 node view 配列 */
  readonly nodes: ReadonlyArray<NodeView>;
  /** transition view 配列 (= 別配列、 component で inline render) */
  readonly transitions: ReadonlyArray<MovementTransitionView>;
  /** fromNodeId → MovementTransitionView の lookup (= component の便利) */
  readonly transitionsByFromNodeId: Readonly<Record<string, MovementTransitionView>>;
}

/**
 * DayGraph + view から timeline render 用 data を構築する pure 関数。
 *
 * - applyDayGraphView 経由で view を適用 (= shared_view なら sensitive event は generic 「予定」)
 * - 全 node を NodeView へ変換 (= sensitive redaction 適用済)
 * - 全 transition を MovementTransitionView へ変換
 * - transitionsByFromNodeId は component が「event の直後に → 移動 を挟む」 ための lookup
 *
 * 性質:
 *   - graph mutation なし
 *   - 同 input → 同 output (= deterministic)
 *   - 戻り値は immutable structure
 */
export function buildTimelineView(
  graph: DayGraph,
  view: DayGraphView = "user_self",
): TimelineView {
  const viewed = applyDayGraphView(graph, view);
  const nodes = viewed.nodes.map((n) => nodeToView(n));
  const transitions = viewed.transitions.map((t, i) => transitionToView(t, i));
  const transitionsByFromNodeId: Record<string, MovementTransitionView> = {};
  for (const t of transitions) {
    transitionsByFromNodeId[t.fromNodeId] = t;
  }
  return { nodes, transitions, transitionsByFromNodeId };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// K-3c-iii: Compact empty-day summary view (= FlowTab 空日 noise 抑制)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Compact empty-day summary (= 1 行 single-line 表現)。
 *
 * FlowTab で連続 empty day が縦に伸びる UX noise を抑える目的。
 * 思想保持: 「観察対象」 として日の境界 (= start / end 時刻) は表示維持。
 * 但し event 0 件かつ warning 0 件の **本当に空の日のみ** 採用。
 */
export interface CompactSummaryView {
  /** discriminated tag */
  readonly kind: "compact_empty";
  /** "HH:MM" 開始境界 (= StartNode.startTime) */
  readonly startTime: string;
  /** "HH:MM" 終了境界 (= EndNode.startTime) */
  readonly endTime: string;
  /** 表示 label (= "予定なし"、 既存 FlowTab 「予定なし ›」 と統一) */
  readonly label: string;
  /** a11y label (= screen reader 向け、 raw 文字列含まず) */
  readonly ariaLabel: string;
  /** Tailwind class (= single-line layout、 text-xs、 slate-400 italic) */
  readonly className: string;
}

/**
 * BuildDayGraphResult から compact summary を生成する pure 関数。
 *
 * 採用条件 (= K-3c-iii CEO 補正 2、 critical):
 *   1. result.graph.attributes.anchorCount === 0 (= event 0 件)
 *   2. result.warnings.length === 0           (= invalid anchor / 不完全データなし)
 *
 * 両方満たす場合のみ CompactSummaryView を返す。 それ以外は null。
 *
 * **null の場合の caller 動作**:
 *   - anchorCount > 0:   通常 timeline (= event 描画あり) を render
 *   - warnings あり:     通常 timeline (= 空でも「データはあるが展示不能」 状態を境界 + gap で表現)
 *   → 「予定なし」 と誤表示しない (= 思想 「分からないことは分からない」 整合、 Negative Capability)
 *
 * 不変原則:
 *   - pure (= side effects なし、 mutation なし)
 *   - graph mutation 不可
 *   - sensitive raw 文字列を ariaLabel / label に含めない (= 空日なので元々無関係だが防御)
 */
export function buildCompactSummaryView(
  result: BuildDayGraphResult,
): CompactSummaryView | null {
  // 1. anchorCount === 0 でなければ通常 timeline
  if (result.graph.attributes.anchorCount !== 0) return null;
  // 2. warnings あり → invalid anchor 等の可能性、 「予定なし」 と誤表示しない
  if (result.warnings.length > 0) return null;

  // 3. start / end node から境界時刻を取得 (= IntegrityContract で 1 個ずつ存在保証)
  const startNode = result.graph.nodes.find((n) => n.kind === "start");
  const endNode = result.graph.nodes.find((n) => n.kind === "end");
  if (!startNode || !endNode) return null; // 防御 (= 通常起きない)

  const startTime = startNode.startTime;
  const endTime = endNode.startTime;

  return {
    kind: "compact_empty",
    startTime,
    endTime,
    label: "予定なし",
    ariaLabel: `${startTime} から ${endTime} まで、 予定なし`,
    className: CLASS_COMPACT_EMPTY,
  };
}
