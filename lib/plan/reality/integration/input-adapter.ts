/**
 * Reality Control OS — Integration Input Adapter（Stage ①-A / 設計: connection-design §1）
 *
 * 既存 Plan/DayGraph 型 → Reality kernel input への **純粋変換**。
 * 設計書: docs/aneurasync-reality-control-os-connection-design.md §1.1
 *
 * 厳守（GPT 監査）:
 *   - 純関数・型のみ。route / UI / Server Action / PlanClient / runtime には接続しない。
 *   - 実 push / sendPushToUser import / plan_drift_events 保存 / DB / native / Routes なし。
 *   - **raw content を kernel input に持ち込まない**：EventNode は型レベルで sensitive→title
 *     undefined（privacy first）。本 adapter は id / 分類 / displayLabel のみ読む。
 *   - 既存型は *type-only* import（runtime 副作用なし）。
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { DayGraph, EventNode, GapNode } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { PlanSeed } from "@/lib/plan/plan-seed";
import type { DraftPlanItem } from "@/lib/plan/draft-plan";

import type { PlanItemGovernance, ProtectionReason } from "../authority";
import type { ImportanceTier } from "../lsat";
import type { DayNode, NodeImportance } from "../post-event-recompute";
import type { GapInput } from "../gap-meaning";
import type { SourceTrace } from "../source-trace";
import type { PlanItemSnapshot } from "../change-set";
import type { EngineMode } from "../invariant-check";

/** "HH:MM" → 0時からの分。ISO 8601 等は範囲外（null）。 */
export function parseHhmmToMin(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// ── ExternalAnchor 変換 ──

/** anchor の重要度ティア（sensitive medical/exam/legal は catastrophic） */
export function anchorImportance(a: ExternalAnchor): ImportanceTier {
  if (a.sensitiveCategory === "medical" || a.sensitiveCategory === "exam" || a.sensitiveCategory === "legal") {
    return "catastrophic";
  }
  return a.rigidity === "hard" ? "important" : "normal";
}

/** anchor → 権限モデル（origin=imported, hard→locked/soft→movable, sensitive→hard_external） */
export function anchorGovernance(a: ExternalAnchor): PlanItemGovernance {
  const hard = a.rigidity === "hard";
  const reasons: ProtectionReason[] = [];
  if (hard || a.sensitiveCategory) reasons.push("hard_external");
  if (reasons.length === 0) reasons.push("user_declared"); // soft 非 sensitive も「本人の確約」
  return {
    origin: "imported",
    authority: hard ? "import_locked" : "user_owned",
    flexibility: hard ? "locked" : "movable",
    protectionReasons: reasons,
  };
}

// ── DayGraph 変換 ──

function eventImportance(n: EventNode): NodeImportance {
  if (n.sensitive) return "critical";
  return n.rigidity === "hard" ? "high" : "normal";
}

/** EventNode → DayNode（post-event-recompute 用）。時刻不正なら null。 */
export function eventNodeToDayNode(n: EventNode): DayNode | null {
  const startMin = parseHhmmToMin(n.startTime);
  const endMin = parseHhmmToMin(n.endTime);
  if (startMin === null || endMin === null) return null;
  return { id: n.id, startMin, endMin, importance: eventImportance(n), hard: n.rigidity === "hard" };
}

/** GapNode → GapInput。移動/状態は context から（DayGraph 単体に無い情報）。 */
export function gapNodeToGapInput(
  g: GapNode,
  ctx: {
    readonly nextTravelMin: number;
    readonly isBeforeImportant: boolean;
    readonly inMealWindow: boolean;
    readonly recoveryNeed: number;
    readonly energy: number;
  }
): GapInput {
  return {
    gapLengthMin: g.durationMin,
    nextTravelMin: ctx.nextTravelMin,
    isBeforeImportant: ctx.isBeforeImportant,
    inMealWindow: ctx.inMealWindow,
    recoveryNeed: ctx.recoveryNeed,
    energy: ctx.energy,
  };
}

/** DayGraph 属性から engine mode を検出（empty→build, packed→optimize, sparse→complete, overlap→repair） */
export function detectMode(graph: DayGraph): EngineMode {
  const a = graph.attributes;
  if (a.anchorCount === 0) return "build";
  if (a.hasOverlap) return "repair";
  if (a.density === "packed") return "optimize";
  if (a.density === "sparse") return "complete";
  return "complete";
}

// ── PlanSeed / DraftPlan 変換 ──

/** PlanSeed → SourceTrace（kind=seed）。reason は構造化 desiredAction 優先（raw signal を避ける）。 */
export function seedToSourceTrace(s: PlanSeed): SourceTrace {
  return {
    kind: "seed",
    ref: s.id,
    reason: s.desiredAction ?? "ユーザーの意図",
    confidence: typeof s.confidence === "number" ? s.confidence : 0.5,
  };
}

/** DraftPlanItem → PlanItemSnapshot（draft は alter_generated∧proposed∧tentative）。 */
export function draftItemToSnapshot(item: DraftPlanItem): PlanItemSnapshot {
  const flexibility = item.rigidity === "hard" ? "locked" : item.rigidity === "soft" ? "movable" : "shortenable";
  const governance: PlanItemGovernance = {
    origin: item.origin === "anchor" ? "imported" : "alter_generated",
    authority: "proposed",
    flexibility,
    protectionReasons: ["tentative"],
  };
  return {
    itemId: item.id,
    startMin: parseHhmmToMin(item.startTime) ?? undefined,
    endMin: item.endTime ? parseHhmmToMin(item.endTime) ?? undefined : undefined,
    title: item.title,
    governance,
  };
}

// ── 集約 ──

export interface RealityInput {
  readonly mode: EngineMode;
  /** EventNode 由来（時刻 parse 可のもの） */
  readonly dayNodes: readonly DayNode[];
  /** anchorId → 権限モデル */
  readonly anchorGovernance: Readonly<Record<string, PlanItemGovernance>>;
  /** anchorId → 重要度 */
  readonly anchorImportance: Readonly<Record<string, ImportanceTier>>;
  /** active seed → 根拠 */
  readonly seedTraces: readonly SourceTrace[];
}

/** 既存 DayGraph + anchors + seeds から Reality kernel input を構築（純粋）。 */
export function buildRealityInput(
  graph: DayGraph,
  anchors: readonly ExternalAnchor[],
  seeds: readonly PlanSeed[]
): RealityInput {
  const dayNodes = graph.nodes
    .filter((n): n is EventNode => n.kind === "event")
    .map(eventNodeToDayNode)
    .filter((n): n is DayNode => n !== null);

  const govMap: Record<string, PlanItemGovernance> = {};
  const impMap: Record<string, ImportanceTier> = {};
  for (const a of anchors) {
    govMap[a.id] = anchorGovernance(a);
    impMap[a.id] = anchorImportance(a);
  }

  const seedTraces = seeds.filter((s) => s.status === "active").map(seedToSourceTrace);

  return { mode: detectMode(graph), dayNodes, anchorGovernance: govMap, anchorImportance: impMap, seedTraces };
}
