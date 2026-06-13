/**
 * MovementRealityV0 — 予定間の移動を「現実ノード」として compile（RC2a-2）
 *
 * 正本: docs/reality-graph-state-model-addendum.md / RG0.6 §6 / RG0.6a §8 /
 *       docs/reality-judgment-patch-rj02.md §8 / docs/reality-judgment-engine-rj0.md §0
 *
 * Department（RJ0.2 CEO 方針）: **Mobility 部署の最初の実体化**。
 *   owning=Mobility / consulted=Plan,Context,Permission / blocking=Permission /
 *   outputs=movementRequired/samePlacePossible/placeKnown/routeKnown/etaKnown/leaveByKnown/missingInputs/mobilityStatus。
 *   runtime Department object は作らない（docs 責務契約のみ — CEO 指示）。
 *
 * 規律（RC1 EventRealityNode と同型）:
 *  - pure（I/O・DB・localStorage・時刻 API・乱数なし）。新規 read / 保存 / UI 接続ゼロ
 *  - ETA / route / 場所解決の供給が無いため routeKnown/etaKnown/leaveByKnown は常に false・
 *    mobilityStatus は "unresolved"（fake ETA / fake leave-by 禁止 — RJ0.2 §8）
 *  - **位置（currentLocation）は使わない**（位置非解禁）
 *  - samePlacePossible は text 一致でなく**不一致**を inferred(≤0.4) で出す（emitted transition は
 *    場所テキストが異なる or 不明の時のみ存在する — movementTransitions.shouldEmitMovementTransition）
 *  - stable id = mv:<date>:<fromAnchorId>:<toAnchorId>（配列 index 不使用）。
 *    同一ペア重複は構造的に起きない（線形連続ペア生成）が、起きたら guard で検出（RC2a-1b §15）
 */

import type { DayGraph, EventNode, MovementTransition } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { MovementResolutionStatus } from "@/lib/plan/transport/transportTypes";
import {
  inferredAttribute,
  realityAttributeViolations,
  unknownAttribute,
  type RealityAttribute,
} from "./realityAttribute";
import type { LeaveByUnresolvedReason } from "./eventRealityNode";

/** derive version（RC2a-1b §4: 自分の version を export し manifest との一致を fixture で assert） */
export const MOVEMENT_REALITY_COMPILE_VERSION = 0;

/** 主観日境界 05:00（dayState/timeOfDay・RC1 と同一規約） */
const SUBJECTIVE_DAY_START_HOUR = 5;

function subjectiveDateOf(date: string, startHHMM: string): string {
  const h = Number(startHHMM.slice(0, 2));
  if (Number.isNaN(h) || h >= SUBJECTIVE_DAY_START_HOUR) return date;
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface MovementRealityV0 {
  readonly schemaVersion: 0;
  readonly movementRealityId: string; // mv:<date>:<fromAnchorId>:<toAnchorId>
  readonly date: string;
  readonly subjectiveDate: string;
  readonly sourceRefs: {
    readonly fromAnchorId: string;
    readonly toAnchorId: string;
    readonly fromNodeId: string;
    readonly toNodeId: string;
    readonly dayGraphSnapshotId: string;
    /** transition の identity 基盤（将来 kernel が transition id を持ったら切替 — RC2a-1b §15） */
    readonly transitionBasis: string; // `${fromNodeId}->${toNodeId}`
  };
  // ── 8 属性（全て RealityAttribute・unknown 正直） ──
  readonly movementRequired: RealityAttribute<boolean>;
  readonly samePlacePossible: RealityAttribute<boolean>;
  readonly placeKnown: RealityAttribute<boolean>;
  readonly routeKnown: RealityAttribute<boolean>;
  readonly etaKnown: RealityAttribute<boolean>;
  readonly leaveByKnown: RealityAttribute<boolean>;
  readonly mobilityStatus: RealityAttribute<MovementResolutionStatus>;
  readonly missingInputs: ReadonlyArray<LeaveByUnresolvedReason>;
}

export interface CompileMovementRealityInput {
  date: string;
  graph: DayGraph;
}

function compileOne(
  t: MovementTransition,
  input: CompileMovementRealityInput,
  nodeById: ReadonlyMap<string, EventNode>,
): MovementRealityV0 {
  const fromNode = nodeById.get(t.fromNodeId);
  const toNode = nodeById.get(t.toNodeId);
  // EventNode.id は anchor.id 流用（dayGraphTypes 規約）。anchorId を正本にする
  const fromAnchorId = fromNode?.anchorId ?? t.fromNodeId;
  const toAnchorId = toNode?.anchorId ?? t.toNodeId;

  // 場所テキストの可視性: sensitiveProximity なら redact 済み（undefined）= viewer から見えない
  const fromLoc = t.fromLocationText;
  const toLoc = t.toLocationText;
  const bothPresent = fromLoc !== undefined && toLoc !== undefined;
  const eitherHidden = t.sensitiveProximity || !bothPresent;

  // movementRequired: 両端の場所が判る（= 異なる）なら移動は必要。不明なら断定しない（unknown）
  const movementRequired: RealityAttribute<boolean> = bothPresent
    ? inferredAttribute(true, 0.7, ["location_text_differs"], { source: "derived", displayPolicy: "visible" })
    : unknownAttribute<boolean>({ evidenceRefs: ["location_hidden_or_missing"], displayPolicy: "hidden" });

  // samePlacePossible: emitted transition は text 不一致 or 不明の時のみ存在。
  //  両端判る → 別場所らしい（text 不一致は弱証拠ゆえ ≤0.4）/ 不明 → unknown（同一文字列で confirmed にしない — RG0.6a §8）
  const samePlacePossible: RealityAttribute<boolean> = bothPresent
    ? inferredAttribute(false, 0.4, ["location_text_differs_weak"], { source: "derived", displayPolicy: "debugOnly" })
    : unknownAttribute<boolean>({ evidenceRefs: ["location_hidden_or_missing"], displayPolicy: "hidden" });

  // placeKnown: 両端の場所テキストが見える（= viewer-safe に判る）か。redact / 欠落は unknown
  const placeKnown: RealityAttribute<boolean> = bothPresent
    ? inferredAttribute(true, 0.6, ["both_location_text_present"], { source: "derived", displayPolicy: "debugOnly" })
    : unknownAttribute<boolean>({ evidenceRefs: eitherHidden ? ["location_hidden_or_missing"] : [], displayPolicy: "hidden" });

  // route/eta/leaveBy: 供給が無いことを「判っている」= inferred false（捏造でなく欠測の明示）
  const knownFalse = (evidence: string): RealityAttribute<boolean> =>
    inferredAttribute(false, 0.9, [evidence], { source: "derived", displayPolicy: "debugOnly" });
  const routeKnown = knownFalse("route_source_missing_v0");
  const etaKnown = knownFalse("eta_source_missing_v0");
  const leaveByKnown = knownFalse("eta_source_missing_v0");

  const mobilityStatus = inferredAttribute<"unresolved" | "resolved">(
    "unresolved",
    0.9,
    ["movement_timing_unresolved_3k"],
    { source: "derived", displayPolicy: "visible" },
  );

  // missingInputs: ern.whyUnresolved と同一語彙・規約（先頭=主理由・eta_source_missing を落とさない）
  const missingInputs: LeaveByUnresolvedReason[] = [];
  if (!bothPresent) missingInputs.push("place_missing");
  else missingInputs.push("route_missing");
  missingInputs.push("eta_source_missing");

  return {
    schemaVersion: 0,
    movementRealityId: `mv:${input.date}:${fromAnchorId}:${toAnchorId}`,
    date: input.date,
    subjectiveDate: subjectiveDateOf(input.date, fromNode?.startTime ?? "12:00"),
    sourceRefs: {
      fromAnchorId,
      toAnchorId,
      fromNodeId: t.fromNodeId,
      toNodeId: t.toNodeId,
      dayGraphSnapshotId: input.graph.snapshotId,
      transitionBasis: `${t.fromNodeId}->${t.toNodeId}`,
    },
    movementRequired,
    samePlacePossible,
    placeKnown,
    routeKnown,
    etaKnown,
    leaveByKnown,
    mobilityStatus,
    missingInputs,
  };
}

export function compileMovementReality(input: CompileMovementRealityInput): MovementRealityV0[] {
  const nodeById = new Map<string, EventNode>(
    input.graph.nodes.filter((n): n is EventNode => n.kind === "event").map((n) => [n.id, n]),
  );
  const out = input.graph.transitions.map((t) => compileOne(t, input, nodeById));

  // mv id 一意性 guard（RC2a-1b §15）: 線形連続ペア生成では重複は起きない構造だが、
  // 将来 kernel が同一ペア複数 transition を導入したら検出して throw（index fallback で握り潰さない）
  const seen = new Set<string>();
  for (const m of out) {
    if (seen.has(m.movementRealityId)) {
      throw new Error(
        `compileMovementReality: 同一 (from,to) ペアの transition が複数検出された（${m.movementRealityId}）。` +
          `transition identity の導入が必要（RC2a-1b §15）`,
      );
    }
    seen.add(m.movementRealityId);
  }
  return out;
}

/** 8 属性の INV-RC1 違反列挙（空 = 適合）。RC2a-2 fixture と将来の監査が使用 */
const MV_ATTRIBUTE_KEYS = [
  "movementRequired",
  "samePlacePossible",
  "placeKnown",
  "routeKnown",
  "etaKnown",
  "leaveByKnown",
  "mobilityStatus",
] as const;

export function movementRealityViolations(m: MovementRealityV0): string[] {
  const out: string[] = [];
  for (const key of MV_ATTRIBUTE_KEYS) {
    out.push(...realityAttributeViolations(`${m.movementRealityId}.${key}`, m[key]));
  }
  // 供給前の不変条件（RJ0.2 §8）: route/eta/leaveBy は false・mobilityStatus は unresolved・missingInputs に eta_source_missing
  if (m.routeKnown.value !== false) out.push(`${m.movementRealityId}.routeKnown: v0 は false のみ`);
  if (m.etaKnown.value !== false) out.push(`${m.movementRealityId}.etaKnown: v0 は false のみ`);
  if (m.leaveByKnown.value !== false) out.push(`${m.movementRealityId}.leaveByKnown: v0 は false のみ`);
  if (m.mobilityStatus.value !== "unresolved")
    out.push(`${m.movementRealityId}.mobilityStatus: 3-K では unresolved のみ`);
  if (!m.missingInputs.includes("eta_source_missing"))
    out.push(`${m.movementRealityId}.missingInputs: eta_source_missing を落とさない`);
  return out;
}
