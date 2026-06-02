/**
 * Reality Control OS — Integration Input Adapter（Stage ①-A / 設計: connection-design §1）
 *
 * 既存 Plan/DayGraph 型 → Reality kernel input への **純粋変換**。
 * 設計書: docs/aneurasync-reality-control-os-connection-design.md §1.1
 *
 * 意味軸の分離（GPT 監査）— これらは *別々に* 算出する。混同しない:
 *   - flexibility（可動性）   ← rigidity（hard→locked / soft→movable）
 *   - origin / authority（所有・確定度）← source（user_manual / external_import）
 *   - protectionReason（守る理由）← 外部由来 or 他人/予約 → hard_external、本人確約 → user_declared
 *   - importance（重要度）   ← rigidity ＋ importanceHint。**sensitive では決めない**
 *   - sensitive（秘匿性）    ← sensitiveCategory（privacy/redaction 専用。importance と無関係）
 *
 * 厳守: 純関数・型のみ。route / UI / Server Action / PlanClient / runtime 未接続。
 *   実 push / sendPushToUser import / plan_drift_events 保存 / DB / native / Routes なし。
 *   raw content を持ち込まない（EventNode は型レベルで sensitive→title undefined）。
 *   既存型は *type-only* import。
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

// ── ExternalAnchor 変換（軸を分離） ──

/**
 * adapter が必要とする外部文脈（ExternalAnchor 単体に無い情報。呼び出し側が渡す）。
 *   - sourceKind: external_anchor_sources.source_type 由来（user_manual=本人記入 / external_import=ics等）
 *   - involvesOthers / reservation: 他人/予約絡み → 確認必須（protectionReason hard_external）
 *   - importanceHint: 呼び出し側が「飛行機/試験/面接=catastrophic」等を明示できる
 */
export interface AnchorContext {
  readonly sourceKind?: "user_manual" | "external_import";
  readonly involvesOthers?: boolean;
  readonly reservation?: boolean;
  readonly importanceHint?: ImportanceTier;
}

/** anchor → 権限モデル（origin/authority は source、flexibility は rigidity、protectionReason は別）。 */
export function anchorGovernance(a: ExternalAnchor, ctx: AnchorContext = {}): PlanItemGovernance {
  const hard = a.rigidity === "hard";
  const userMade = (ctx.sourceKind ?? "external_import") === "user_manual";

  const origin = userMade ? "user" : "imported";
  const authority = userMade ? "user_owned" : "import_locked";
  const flexibility = hard ? "locked" : "movable";

  const reasons: ProtectionReason[] = [];
  if (!userMade) reasons.push("hard_external"); // 外部カレンダー由来 → 確認必須（desync 防止）
  if (ctx.involvesOthers || ctx.reservation) {
    if (!reasons.includes("hard_external")) reasons.push("hard_external");
  }
  if (reasons.length === 0) reasons.push("user_declared"); // 本人記入の確約
  return { origin, authority, flexibility, protectionReasons: reasons };
}

/**
 * anchor → 重要度。rigidity ＋ importanceHint から。**sensitive では決めない**。
 * catastrophic は呼び出し側の importanceHint（飛行機/試験/面接 等の不可逆性）でのみ。
 */
export function anchorImportance(a: ExternalAnchor, ctx: AnchorContext = {}): ImportanceTier {
  if (ctx.importanceHint) return ctx.importanceHint;
  return a.rigidity === "hard" ? "important" : "normal";
}

/** anchor の秘匿性（privacy/redaction 専用。importance と無関係）。 */
export function anchorSensitive(a: ExternalAnchor): { readonly sensitive: boolean; readonly category?: ExternalAnchor["sensitiveCategory"] } {
  return { sensitive: a.sensitiveCategory != null, category: a.sensitiveCategory };
}

// ── DayGraph 変換 ──

/** DayNode の重要度は rigidity から（sensitive で critical にしない）。 */
function eventImportance(n: EventNode): NodeImportance {
  return n.rigidity === "hard" ? "high" : "normal";
}

/** EventNode → DayNode（post-event-recompute 用）。時刻不正なら null。title/location は持ち込まない。 */
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

/** DayGraph 属性から engine mode を検出。 */
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

export interface AnchorInput {
  readonly governance: PlanItemGovernance;
  readonly importance: ImportanceTier;
  /** privacy/redaction 用（importance と無関係） */
  readonly sensitive: boolean;
}

export interface RealityInput {
  readonly mode: EngineMode;
  /** EventNode 由来（時刻 parse 可のもの） */
  readonly dayNodes: readonly DayNode[];
  /** anchorId → 分離済み各軸 */
  readonly anchors: Readonly<Record<string, AnchorInput>>;
  /** active seed → 根拠 */
  readonly seedTraces: readonly SourceTrace[];
}

/** 既存 DayGraph + anchors + seeds から Reality kernel input を構築（純粋）。 */
export function buildRealityInput(
  graph: DayGraph,
  anchors: readonly ExternalAnchor[],
  seeds: readonly PlanSeed[],
  opts?: { readonly contextOf?: (anchorId: string) => AnchorContext }
): RealityInput {
  const dayNodes = graph.nodes
    .filter((n): n is EventNode => n.kind === "event")
    .map(eventNodeToDayNode)
    .filter((n): n is DayNode => n !== null);

  const anchorMap: Record<string, AnchorInput> = {};
  for (const a of anchors) {
    const ctx = opts?.contextOf?.(a.id) ?? {};
    anchorMap[a.id] = {
      governance: anchorGovernance(a, ctx),
      importance: anchorImportance(a, ctx),
      sensitive: anchorSensitive(a).sensitive,
    };
  }

  const seedTraces = seeds.filter((s) => s.status === "active").map(seedToSourceTrace);

  return { mode: detectMode(graph), dayNodes, anchors: anchorMap, seedTraces };
}
