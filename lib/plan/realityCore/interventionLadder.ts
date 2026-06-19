/**
 * interventionLadder — RO-2 D4（2026-06-20）: 段階介入計画の pure 生成（配信しない）
 *
 * 正本設計: docs/reality-os-ro2-mobility-control-tower-design.md（RO-2 D4・v0.2）/ RJ0.1 §5（rj01.md:71-80）
 * 思想（CEO v0.2 矛盾修正）: step を 2 系統に分ける。
 *   movement（wake/prepare/final_decision/fallback）= 出発線が要る（recommended≠null 必須）→ dormant 時**未生成**。
 *   clarification（ask）= 出発線が組めない時の確認導線 → dormant（recommended=null）の**例外として生成**。
 *   movement と ask は trigger 上**排他**（偽 deadline を作らない代わりに「分からないから聞く」を活かす）。
 *
 * 不変条件:
 *   - **配信しない**: ladderDeliveryCeiling は上限表現のみ（receptivity-gate を呼ばない・5 値 DeliveryMode）。
 *   - **no-action step 禁止**（INV-1）: 各 step は必ず行動導線 messageType を持つ。
 *   - **dormant 規律**: recommended=null の間 movement 4 系は未生成・ask のみ生成。
 *   - wake/prepare は wakeAt/prepareAt 解決時のみ（prepTime 不在では出さない＝偽生成しない）。
 *   - IO / RNG / now / Date / DB / write を持たない。
 */
import type { DeliveryMode } from "@/lib/plan/reality/receptivity-gate";
import type { MomentStateV0 } from "@/lib/plan/dayState/dayStateTypes";
import { GUARANTEE_LANGUAGE_FORBIDDEN, type LeaveByLinesV0 } from "./leaveByLines";
import type { RealityAttribute } from "./realityAttribute";
import {
  buildTriggerCondition,
  type TriggerConditionV0,
  type TriggerPredicate,
  type TriggerEvalContextV0,
} from "./triggerCondition";

export const INTERVENTION_LADDER_VERSION = 0;

export type StepClass = "movement" | "clarification";
export type InterventionKind = "wake" | "prepare" | "final_decision" | "fallback" | "ask" | "three_options";
/** 行動導線（no-action step 禁止・閉じた union）。 */
export type LadderMessageType = "wake_prompt" | "prepare_prompt" | "leave_now" | "fallback_options" | "clarify_departure";

export interface InterventionStepV0 {
  readonly at: string | null; // clarification は時刻非依存ゆえ null 可
  readonly stepClass: StepClass;
  readonly interventionKind: InterventionKind;
  readonly messageType: LadderMessageType;
  readonly ladderDeliveryCeiling: DeliveryMode; // 5 値（receptivity-gate.ts:25）・実配信しない
  readonly permissionRequired: boolean;
  readonly triggerCondition: TriggerConditionV0;
  readonly reasonCodes: ReadonlyArray<string>;
  readonly targetNodeId: string;
}

export interface PlanInterventionLadderInputV0 {
  readonly targetNodeId: string;
  readonly leaveByLines: LeaveByLinesV0;
  readonly prepTime: RealityAttribute<number>;
  readonly momentState: MomentStateV0;
}

const AND = (operands: ReadonlyArray<TriggerPredicate>): TriggerPredicate => ({ kind: "and", operands });

/**
 * planInterventionLadder — pure。recommended=null → ask のみ（clarification）。recommended≠null → movement のみ。
 */
export function planInterventionLadder(input: PlanInterventionLadderInputV0): InterventionStepV0[] {
  const { targetNodeId, leaveByLines, momentState } = input;
  const ctx: TriggerEvalContextV0 = { momentState, leaveByLines };

  // ── dormant の例外: 出発線が組めない（recommended=null）→ clarification ask を生成 ──
  if (leaveByLines.recommended.value === null) {
    const ask: InterventionStepV0 = {
      at: null,
      stepClass: "clarification",
      interventionKind: "ask",
      messageType: "clarify_departure",
      ladderDeliveryCeiling: "on_open",
      permissionRequired: false,
      triggerCondition: buildTriggerCondition({ kind: "departure_unresolved" }, ctx),
      reasonCodes: leaveByLines.whyUnresolved.length > 0 ? [...leaveByLines.whyUnresolved] : ["eta_source_missing"],
      targetNodeId,
    };
    return [ask];
  }

  // ── recommended 解決 → movement 系のみ（ask は不生成・trigger 排他）──
  const steps: InterventionStepV0[] = [];

  // wake（wakeAt 解決時のみ＝prepTime あり）
  if (leaveByLines.wakeAt.value !== null) {
    steps.push({
      at: leaveByLines.wakeAt.value,
      stepClass: "movement",
      interventionKind: "wake",
      messageType: "wake_prompt",
      ladderDeliveryCeiling: "on_open",
      permissionRequired: false,
      triggerCondition: buildTriggerCondition(AND([{ kind: "time_at_or_after", ref: "wakeAt" }, { kind: "window_state", window: ["open"] }]), ctx),
      reasonCodes: [],
      targetNodeId,
    });
  }

  // prepare（prepareAt 解決時のみ）
  if (leaveByLines.prepareAt.value !== null) {
    steps.push({
      at: leaveByLines.prepareAt.value,
      stepClass: "movement",
      interventionKind: "prepare",
      messageType: "prepare_prompt",
      ladderDeliveryCeiling: "on_open",
      permissionRequired: false,
      triggerCondition: buildTriggerCondition(AND([{ kind: "time_at_or_after", ref: "prepareAt" }, { kind: "window_state", window: ["open", "narrowing"] }]), ctx),
      reasonCodes: [],
      targetNodeId,
    });
  }

  // final_decision（hard・recommended 解決時は hard も解決）。hard は保証でない → guarantee_language_forbidden
  steps.push({
    at: leaveByLines.hard.value,
    stepClass: "movement",
    interventionKind: "final_decision",
    messageType: "leave_now",
    ladderDeliveryCeiling: "push", // 上限のみ・実配信しない
    permissionRequired: false,
    triggerCondition: buildTriggerCondition(AND([{ kind: "time_at_or_after", ref: "hard" }, { kind: "window_state", window: ["closing"] }]), ctx),
    reasonCodes: [GUARANTEE_LANGUAGE_FORBIDDEN],
    targetNodeId,
  });

  // fallback（hard 超過・window closed）
  steps.push({
    at: leaveByLines.hard.value,
    stepClass: "movement",
    interventionKind: "fallback",
    messageType: "fallback_options",
    ladderDeliveryCeiling: "on_open",
    permissionRequired: false,
    triggerCondition: buildTriggerCondition(AND([{ kind: "time_at_or_after", ref: "hard" }, { kind: "window_state", window: ["closed"] }]), ctx),
    reasonCodes: [],
    targetNodeId,
  });

  return steps;
}

/** INV: ladder の不変条件（空=適合）。 */
export function interventionLadderViolations(steps: ReadonlyArray<InterventionStepV0>, recommendedResolved: boolean): string[] {
  const out: string[] = [];
  const push = (m: string) => out.push(`interventionLadder: ${m}`);
  const hasAsk = steps.some((s) => s.stepClass === "clarification");
  const hasMovement = steps.some((s) => s.stepClass === "movement");

  // movement と ask は排他
  if (hasAsk && hasMovement) push("movement と clarification(ask) が同時に出ている（trigger 排他のはず）");
  if (!recommendedResolved && hasMovement) push("recommended 未解決なのに movement step が生成された（dormant 規律違反）");
  if (recommendedResolved && hasAsk) push("recommended 解決済なのに ask が生成された（trigger 排他違反）");
  if (!recommendedResolved && !hasAsk) push("recommended 未解決なら ask(clarification) を生成すべき（『分からないから聞く』を殺さない）");

  for (const s of steps) {
    // no-action step 禁止（messageType は必ず行動導線）
    if (s.messageType === undefined) push(`${s.interventionKind} に messageType がない（no-action step 禁止）`);
    // final_decision は保証文言禁止 reasonCode を持つ
    if (s.interventionKind === "final_decision" && !s.reasonCodes.includes(GUARANTEE_LANGUAGE_FORBIDDEN)) {
      push("final_decision は reasonCodes に guarantee_language_forbidden 必須");
    }
  }
  return out;
}
