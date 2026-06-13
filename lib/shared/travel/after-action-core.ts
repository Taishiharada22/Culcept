/**
 * T10-C — After-action learning 決定論 transformer + merge（**pure・未配線**）
 *
 * 設計: after-action-types.ts + CEO 補正 2026-06-12（過学習防止）
 *
 * - `deriveAfterActionLearning(input)`: feedback → 学習デルタ（既定 soft・相対・矛盾→clarification）。
 * - `applyAfterActionLearning(base, deltas)`: デルタを次回 `TravelPlanEngineInput` へマージ（slots / fairnessHistory）。
 * - `pruneExpiredDeltas(deltas, elapsedDays)`: decay（elapsed は **pure input**・clock なし）。
 *
 * 厳守（純・決定論）:
 *   - DB/persistence/memory write・fetch・Date.now/random・M2 runtime・runTravelPlanEngine 呼び出し（本体）なし。
 *   - ★ **1 回の感想を即 hard にしない**: hard は explicit/severe-strong/non-negotiable/反復(≥3)のみ。
 *   - ★ private feedback は authoritative 次回入力に効くが shared に漏らさない（visibility 厳守・coherent owner）。
 */

import type { BudgetBand, Pace, ViewerScopedRationale, Visibility } from "./core-types";
import type { DescriptorKey, ExtractedSlot } from "./slot-types";
import type { FairnessHistoryInput } from "./decision-types";
import type { TravelPlanEngineInput } from "./engine-types";
import type {
  AfterActionClarification,
  AfterActionFeedback,
  AfterActionFeedbackDimension,
  AfterActionFeedbackDirection,
  AfterActionFeedbackMagnitude,
  AfterActionFeedbackOwner,
  AfterActionInput,
  AfterActionLearningDelta,
  AfterActionPastConditions,
  DeltaHardness,
  RegretToConstraintTransformResult,
} from "./after-action-types";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round1 = (v: number): number => Math.round(v * 10) / 10;
const ownerKey = (o: AfterActionFeedbackOwner): string => (o.kind === "shared" ? "shared" : `p:${o.participantId}`);
const ownerId = (o: AfterActionFeedbackOwner): string | null => (o.kind === "participant" ? o.participantId : null);

const PACE_ORDER: Record<Pace, number> = { slow: 0, normal: 1, intense: 2 };
const PACE_BY_ORDER: Pace[] = ["slow", "normal", "intense"];

const HARD_REPEAT_THRESHOLD = 3;

const strengthOf = (m: AfterActionFeedbackMagnitude): number => (m === "slight" ? 0.33 : m === "moderate" ? 0.66 : 1.0);
const baseConf = (m: AfterActionFeedbackMagnitude): number => (m === "slight" ? 0.2 : m === "moderate" ? 0.4 : 0.6);
const factorOf = (m: AfterActionFeedbackMagnitude): number => (m === "slight" ? 0.15 : m === "moderate" ? 0.3 : 0.5);
const paceStepsOf = (m: AfterActionFeedbackMagnitude): number => (m === "strong" ? 2 : 1);
const timeDelayOf = (m: AfterActionFeedbackMagnitude): number => (m === "slight" ? 30 : m === "moderate" ? 60 : 120);

function confOf(fb: AfterActionFeedback): number {
  return clamp(baseConf(fb.magnitude) + (fb.repeatedEvidenceCount ?? 0) * 0.15 + (fb.severe ? 0.2 : 0), 0, 1);
}
function hardnessOf(fb: AfterActionFeedback): DeltaHardness {
  const repeated = (fb.repeatedEvidenceCount ?? 0) >= HARD_REPEAT_THRESHOLD;
  const severeStrong = fb.severe === true && fb.magnitude === "strong";
  return fb.explicitHardRule || fb.nonNegotiable || severeStrong || repeated ? "hard" : "soft";
}

const DIM_JA: Record<AfterActionFeedbackDimension, string> = {
  pace: "ペース", budget: "予算", mobility: "移動", fatigue: "体力", time: "時間帯",
  lodging: "宿", food: "食事", place: "場所", participant_balance: "配分", overall: "全体",
};
const DIR_JA: Record<AfterActionFeedbackDirection, string> = { reduce: "控えめ", increase: "増やす", reinforce: "踏襲", avoid: "回避" };

function buildRationale(fb: AfterActionFeedback, hardness: DeltaHardness): ViewerScopedRationale {
  const text = `次回は「${DIM_JA[fb.dimension]}」を${DIR_JA[fb.direction]}方向に調整（${hardness === "hard" ? "確定" : "ゆるめ"}）`;
  if (fb.visibility === "shared") return { shared: text + "。", forParticipant: {} };
  const fp: Record<string, string> = {};
  const pid = ownerId(fb.owner);
  if (pid) fp[pid] = text;
  return { shared: "次回の調整に反映します。", forParticipant: fp };
}

function buildDelta(
  fb: AfterActionFeedback,
  target: AfterActionLearningDelta["target"],
  payload: AfterActionLearningDelta["payload"],
): AfterActionLearningDelta {
  const hardness = hardnessOf(fb);
  const persistence = (fb.repeatedEvidenceCount ?? 0) >= 2 || fb.explicitHardRule ? "repeatable" : "unknown";
  const decayTtlDays = hardness === "hard" ? null : persistence === "repeatable" ? 180 : 90;
  return {
    target,
    sourceDimension: fb.dimension,
    strength: strengthOf(fb.magnitude),
    confidence: confOf(fb),
    hardness,
    scope: "trip_type",
    persistence,
    decayTtlDays,
    owner: fb.owner,
    visibility: fb.visibility,
    provenance: "after_action",
    needsClarification: false,
    payload,
    rationale: buildRationale(fb, hardness),
  };
}

function paceShift(anchor: Pace, dir: AfterActionFeedbackDirection, m: AfterActionFeedbackMagnitude): Pace {
  const steps = paceStepsOf(m) * (dir === "reduce" ? -1 : 1);
  return PACE_BY_ORDER[clamp(PACE_ORDER[anchor] + steps, 0, 2)];
}

const DIM_DESCRIPTOR_DEFAULT: Partial<Record<AfterActionFeedbackDimension, string>> = {
  lodging: "lodging_style", food: "meal_style", place: "sightseeing", overall: "overall",
};

/** 1 feedback → delta（不可・要確認は null を返し、呼び元が clarification を積む） */
function deriveOne(fb: AfterActionFeedback, past: AfterActionPastConditions | undefined): AfterActionLearningDelta | null {
  // private は coherent owner（participant）必須（slot 不整合・leak 防止）
  if (fb.visibility === "private" && fb.owner.kind !== "participant") return null;

  switch (fb.dimension) {
    case "pace": {
      const pace = paceShift(past?.pace ?? "normal", fb.direction === "increase" ? "increase" : "reduce", fb.magnitude);
      return buildDelta(fb, "pace", { kind: "pace", pace });
    }
    case "fatigue": {
      // 疲労 → ペースを緩める（slower）
      const pace = paceShift(past?.pace ?? "normal", "reduce", fb.magnitude);
      return buildDelta(fb, "pace", { kind: "pace", pace });
    }
    case "budget": {
      const anchor = past?.budgetHi ?? 30000;
      const f = factorOf(fb.magnitude);
      const hi = Math.round(anchor * (fb.direction === "increase" ? 1 + f : 1 - f));
      const band: BudgetBand = { lo: 0, hi: Math.max(0, hi), confidence: confOf(fb), currency: "JPY" };
      return buildDelta(fb, "budget", { kind: "budget", band });
    }
    case "mobility": {
      const anchor = past?.maxWalkKm ?? 6;
      const f = factorOf(fb.magnitude);
      const maxWalkKm = round1(Math.max(0, anchor * (fb.direction === "increase" ? 1 + f : 1 - f)));
      return buildDelta(fb, "mobility", { kind: "mobility", maxWalkKm });
    }
    case "time": {
      const anchor = past?.departAfterMin ?? 480; // 08:00
      const delay = timeDelayOf(fb.magnitude) * (fb.direction === "increase" ? -1 : 1); // reduce(早すぎ)→ later(+)
      const departAfterMin = clamp(anchor + delay, 0, 1439);
      return buildDelta(fb, "time", { kind: "time", departAfterMin });
    }
    case "lodging":
    case "food":
    case "place":
    case "overall": {
      const hardness = hardnessOf(fb);
      const descriptorValue = fb.descriptor ?? DIM_DESCRIPTOR_DEFAULT[fb.dimension] ?? fb.dimension;
      const descriptorKey: DescriptorKey = fb.direction === "avoid" ? "avoid" : hardness === "hard" ? "require" : "prefer";
      return buildDelta(fb, "preference", { kind: "preference", descriptorKey, descriptorValue });
    }
    case "participant_balance": {
      // 偏り報告は「過剰優遇された participant」を owner に指定（participant 必須）
      const over = ownerId(fb.owner);
      if (!over) return null; // shared owner → 誰が過剰優遇か不明 → clarification
      return buildDelta(fb, "fairness_bias", { kind: "fairness_bias", overFavoredParticipantId: over, biasMagnitude: strengthOf(fb.magnitude) });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// public: deriveAfterActionLearning
// ─────────────────────────────────────────────────────────────────────────────

export function deriveAfterActionLearning(input: AfterActionInput): RegretToConstraintTransformResult {
  const deltas: AfterActionLearningDelta[] = [];
  const clarifications: AfterActionClarification[] = [];

  // (owner, dimension) で grouping
  const groups = new Map<string, AfterActionFeedback[]>();
  for (const fb of input.feedback) {
    const k = `${ownerKey(fb.owner)}|${fb.dimension}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(fb);
  }

  for (const items of groups.values()) {
    const dirs = new Set(items.map((i) => i.direction));
    const conflict = (dirs.has("reduce") && dirs.has("increase")) || (dirs.has("reinforce") && dirs.has("avoid"));
    if (conflict) {
      clarifications.push({ dimension: items[0].dimension, owner: items[0].owner, reason: "conflicting_directions" });
      continue;
    }
    for (const fb of items) {
      const d = deriveOne(fb, input.pastConditions);
      if (d) deltas.push(d);
      else clarifications.push({ dimension: fb.dimension, owner: fb.owner, reason: fb.dimension === "participant_balance" ? "balance_owner_unknown" : "private_requires_participant_owner" });
    }
  }

  // 結果 rationale（shared 要約 + private 注記マージ）
  const forParticipant: Record<string, string> = {};
  for (const d of deltas) {
    for (const [pid, t] of Object.entries(d.rationale.forParticipant)) {
      forParticipant[pid] = forParticipant[pid] ? `${forParticipant[pid]}・${t}` : t;
    }
  }
  const rationale: ViewerScopedRationale = {
    shared: `${deltas.length}件の学びを次回に反映します${clarifications.length > 0 ? `（${clarifications.length}件は要確認）` : ""}。`,
    forParticipant,
  };

  return { deltas, clarifications, rationale };
}

// ─────────────────────────────────────────────────────────────────────────────
// public: pruneExpiredDeltas（decay・elapsed は pure input）
// ─────────────────────────────────────────────────────────────────────────────

export function pruneExpiredDeltas(deltas: readonly AfterActionLearningDelta[], elapsedDays: number): AfterActionLearningDelta[] {
  return deltas.filter((d) => d.decayTtlDays === null || elapsedDays <= d.decayTtlDays);
}

// ─────────────────────────────────────────────────────────────────────────────
// public: applyAfterActionLearning（次回 engine input へマージ・何も実行しない）
// ─────────────────────────────────────────────────────────────────────────────

function learnedSlot(key: ExtractedSlot["key"], value: ExtractedSlot["value"], d: AfterActionLearningDelta): ExtractedSlot {
  return {
    key,
    value,
    status: "normalized", // 上書き可能な default（user confirmed が勝つ）
    fillState: "filled",
    confidence: d.confidence,
    owner: d.owner,
    visibility: d.visibility,
    evidence: [{ surface: "after_action", refId: `aa:${d.sourceDimension}` }],
  } as ExtractedSlot;
}

function applyFairnessBias(
  fairness: FairnessHistoryInput | undefined,
  participantIds: string[],
  payload: { overFavoredParticipantId: string; biasMagnitude: number },
  visibility: Visibility,
): FairnessHistoryInput {
  const A = fairness?.participantA ?? participantIds[0];
  const B = fairness?.participantB ?? participantIds[1];
  let bias = fairness?.priorBias ?? 0;
  const shift = payload.biasMagnitude * 0.5;
  // 過剰優遇された側へ priorBias を寄せる（記録）→ 次回 T5 は逆へ tilt
  if (payload.overFavoredParticipantId === A) bias = clamp(bias - shift, -1, 1);
  else if (payload.overFavoredParticipantId === B) bias = clamp(bias + shift, -1, 1);
  return { participantA: A, participantB: B, priorBias: bias, visibility: fairness?.visibility ?? visibility };
}

export function applyAfterActionLearning(base: TravelPlanEngineInput, deltas: readonly AfterActionLearningDelta[]): TravelPlanEngineInput {
  const slots: ExtractedSlot[] = [...base.slots];
  let fairnessHistory = base.fairnessHistory;

  for (const d of deltas) {
    if (d.needsClarification) continue;
    const p = d.payload;
    switch (p.kind) {
      case "pace":
        slots.push(learnedSlot("pace", p.pace, d));
        break;
      case "budget":
        slots.push(learnedSlot("budget_band", p.band, d));
        break;
      case "mobility":
        slots.push(learnedSlot("mobility_tolerance", { maxWalkKm: p.maxWalkKm }, d));
        break;
      case "time":
        slots.push(learnedSlot("time_window", { departAfterMin: p.departAfterMin, returnByMin: p.returnByMin }, d));
        break;
      case "preference": {
        const key = d.hardness === "hard" ? "red_line" : "soft_preference";
        slots.push(learnedSlot(key, { descriptorKey: p.descriptorKey, descriptorValue: p.descriptorValue }, d));
        break;
      }
      case "fairness_bias":
        fairnessHistory = applyFairnessBias(fairnessHistory, base.participantIds, p, d.visibility);
        break;
    }
  }

  return { ...base, slots, fairnessHistory };
}
