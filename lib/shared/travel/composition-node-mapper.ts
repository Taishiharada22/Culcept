/**
 * T11-B2 — Entity → PreSolverNode 純 mapper（**pure・未配線**）
 *
 * 設計: composition-types.ts + docs/t11-b-itinerary-composition-solver-boundary-preflight.md §6
 *
 * 役割: 1 `EntityRetrievalCandidate` を category 別に `PreSolverNode[]` へ写す。**fail-closed・決定論**。
 *
 * 厳守:
 *   - hard-blocked entity（fit.hardBlocks 非空）→ **node を作らない**（CompositionHardBlocker を返す）。
 *   - private hard block は server-side で適格を変えるが、reason を shared に漏らさない（visibility carry）。
 *   - `fatigueLoad` は **数値 1..5**。`budgetBand` は **optional**（price 不明は省略 + missing question・捏造しない）。
 *   - `nodeConfidence` は anchor/wander のみ。**startMin/endMin/dayIndex を持たない**。
 *   - 外部 lookup なし・runTravelPlanEngine/evaluateFit を呼ばない・source は confidence にのみ効く。
 */

import type { ActivityKind, FatigueLoad, NodeConfidence, PlaceRef } from "./core-types";
import type { EntityRetrievalCandidate } from "./entity-retrieval-types";
import type { FitResult, TravelObjectState } from "./fit-types";
import type {
  CompositionEntityBinding,
  CompositionHardBlocker,
  CompositionMissingQuestion,
  PreSolverNode,
} from "./composition-types";

export interface EntityNodeMapping {
  nodes: PreSolverNode[];
  hardBlocker?: CompositionHardBlocker;
  missingQuestions: CompositionMissingQuestion[];
}

/** 温泉 facet 有無（lodging/place/area が host・category 昇格しない） */
function hasOnsenFacet(entity: TravelObjectState): boolean {
  if (entity.category === "lodging") return Boolean(entity.rich?.onsenFacet);
  if (entity.category === "place") return Boolean(entity.rich?.onsenFacet);
  if (entity.category === "area") return Boolean(entity.rich?.onsenFacet);
  return false;
}

/** category（+ facet）→ activityKind 群（area/transport は node を作らない＝空） */
function nodeKindsFor(entity: TravelObjectState): ActivityKind[] {
  switch (entity.category) {
    case "lodging": {
      const kinds: ActivityKind[] = ["lodging_checkin", "lodging_checkout"];
      if (hasOnsenFacet(entity)) kinds.push("onsen");
      return kinds;
    }
    case "food":
      return ["meal"];
    case "place":
      return hasOnsenFacet(entity) ? ["onsen"] : ["sightseeing"];
    case "activity":
      return ["activity"];
    case "support":
      return [entity.rich?.reliefAxis === "rest" ? "rest" : "other"];
    case "area":
      return []; // context/anchor のみ（time-occupying でない限り node でない）
    case "transport":
      return []; // edge/transition（§7）。node でない
    default:
      return [];
  }
}

/** 数値 1..5 へ量子化（数値を返す・文字列でない） */
function toFatigueBand(x: number): FatigueLoad {
  const n = Math.min(5, Math.max(1, Math.round(x)));
  return n as FatigueLoad;
}

/** burden + recovery → fatigueLoad（数値 1..5）。観測なし→保守 mid 3（捏造でなく既定） */
function deriveFatigueLoad(entity: TravelObjectState): { load: FatigueLoad; observed: boolean } {
  const burdenValues: number[] = [];
  if (entity.burden) {
    for (const obs of Object.values(entity.burden)) {
      if (obs && obs.value !== null) burdenValues.push(obs.value);
    }
  }
  const recovery = entity.recovery;
  const energyRequired = recovery?.energyRequired && recovery.energyRequired.value !== null ? recovery.energyRequired.value : null;
  const restValue = recovery?.restValue && recovery.restValue.value !== null ? recovery.restValue.value : null;

  const observed = burdenValues.length > 0 || energyRequired !== null || restValue !== null;
  if (!observed) return { load: 3, observed: false };

  const burdenAvg = burdenValues.length ? burdenValues.reduce((a, b) => a + b, 0) / burdenValues.length : 0.5;
  // burden/energy は load を上げ、rest は下げる（全 0..1 正規化前提）
  const raw = 1 + (burdenAvg + (energyRequired ?? 0) - (restValue ?? 0)) * 4;
  return { load: toFatigueBand(raw), observed: true };
}

/** entity に firm(非relaxable) lock があるか（anchor 寄せの根拠） */
function hasFirmLock(candidate: EntityRetrievalCandidate): boolean {
  return candidate.timeLocks.some((tl) => tl.ordering.relaxable === false);
}

function deriveNodeConfidence(
  binding: CompositionEntityBinding | undefined,
  firmLock: boolean,
  burdenObserved: boolean,
  fit: FitResult | undefined,
): NodeConfidence {
  if (binding?.nodeConfidenceHint) return binding.nodeConfidenceHint;
  if (firmLock) return "anchor";
  if (fit && fit.confidence >= 0.6 && fit.labelStability === "stable") return "anchor";
  // 観測薄 or fit なし → wander（substitutable）
  return burdenObserved && fit ? "wander" : "wander";
}

/** price が node の budget に意味を持つ category（support/area/transport は対象外） */
function priceRelevant(category: TravelObjectState["category"]): boolean {
  return category === "lodging" || category === "food" || category === "place" || category === "activity";
}

/**
 * 1 entity → PreSolverNode[]（fail-closed）。
 *   - fit.hardBlocks 非空 → node 0 + CompositionHardBlocker。
 *   - budgetBand は priceBand.value!==null の時のみ。欠落→ missing question（捏造しない）。
 */
export function mapEntityToNodes(
  candidate: EntityRetrievalCandidate,
  opts?: { binding?: CompositionEntityBinding; fit?: FitResult },
): EntityNodeMapping {
  const entity = candidate.entity;
  const placeRefId = candidate.placeRefId;
  const fit = opts?.fit;
  const binding = opts?.binding;
  const missingQuestions: CompositionMissingQuestion[] = [];

  // ── hard-block gate（fail-closed・advisory grade の前）──
  if (fit && fit.hardBlocks.length > 0) {
    const block = fit.hardBlocks[0];
    return {
      nodes: [],
      hardBlocker: {
        placeRefId,
        reasonCode: block.reason,
        visibility: block.visibility,
        ownerParticipantId: block.ownerParticipantId,
      },
      missingQuestions,
    };
  }

  const kinds = binding?.intendedActivityKind ? [binding.intendedActivityKind] : nodeKindsFor(entity);
  if (kinds.length === 0) {
    // area/transport: node を作らない（anchor/edge）。失敗ではない
    return { nodes: [], missingQuestions };
  }

  // ── budgetBand（optional・捏造しない）──
  let budgetBand = undefined as PreSolverNode["budgetBand"];
  if (entity.priceBand && entity.priceBand.value !== null) {
    budgetBand = entity.priceBand.value;
  } else if (priceRelevant(entity.category)) {
    missingQuestions.push({ field: `price:${placeRefId}`, reason: "price_unknown" });
  }

  const { load, observed } = deriveFatigueLoad(entity);
  const firmLock = hasFirmLock(candidate);
  const nodeConfidence = deriveNodeConfidence(binding, firmLock, observed, fit);
  const place: PlaceRef = { placeRefId };

  const nodes: PreSolverNode[] = kinds.map((activityKind) => ({
    nodeId: `node:${placeRefId}:${activityKind}`,
    placeRefId,
    place,
    activityKind,
    fatigueLoad: load,
    nodeConfidence,
    ...(budgetBand ? { budgetBand } : {}),
  }));

  return { nodes, missingQuestions };
}
