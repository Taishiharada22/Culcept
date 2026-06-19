/**
 * triggerCondition — RO-2 D5（2026-06-20）: 構造化トリガ条件（predicate/evalStatus/missingInputs/deferredByGate）（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro2-mobility-control-tower-design.md（RO-2 D5・v0.2）
 * 思想: string DSL を捨て **閉じた discriminated union の predicate** にし、**3 値 partial-evaluation lattice**
 *   （evaluable_now / deferred_by_gate / unknown）に射影する。位置/prep/push 未解禁でも gate 解禁で書き換えなく昇格。
 *   `window_state` を第一級 predicate にし「出発線が近い」を MomentState から**評価される状態**にする（センサー不要）。
 *
 * 不変条件:
 *   - **null は「発火」でなく「発火不能(cannot fire)」**: 参照線が null → unknown + missingInputs（fire-now に誤読させない）。
 *   - **v0 評価器は time_at_or_after / window_state / and|or / departure_unresolved のみ実評価**。
 *     state_unmet / location_* は型に存在するが **deferred_by_gate に積み eval しない**（捏造位置・捏造 prep で発火させない）。
 *   - IO / RNG / now / Date / DB / write を持たない。
 */
import type { MomentStateV0 } from "@/lib/plan/dayState/dayStateTypes";
import type { LeaveByLinesV0 } from "./leaveByLines";

export const TRIGGER_CONDITION_VERSION = 0;

export type TriggerEvalStatus = "evaluable_now" | "deferred_by_gate" | "unknown";
export type TriggerGate = "location" | "prep_state" | "receptivity_b2_r6";
/** missingInputs の閉じた語彙（自由文禁止・whyUnresolved と整合）。 */
export type TriggerMissingInput = "eta_source_missing" | "place_missing" | "route_missing" | "prep_state_unobserved" | "location_unavailable";

export type DepartureLineRef = "wakeAt" | "prepareAt" | "hard" | "recommended";
export type InterventionWindowState = "open" | "narrowing" | "closing" | "closed";

export type TriggerPredicate =
  | { readonly kind: "time_at_or_after"; readonly ref: DepartureLineRef }
  | { readonly kind: "window_state"; readonly window: ReadonlyArray<InterventionWindowState> } // 第一級・出発線が近い
  | { readonly kind: "and"; readonly operands: ReadonlyArray<TriggerPredicate> }
  | { readonly kind: "or"; readonly operands: ReadonlyArray<TriggerPredicate> }
  | { readonly kind: "state_unmet"; readonly state: "prep_not_ready" } // 未解禁・deferred のみ
  | { readonly kind: "location_off_route" } // 位置未解禁・deferred のみ
  | { readonly kind: "location_linger" } // 位置未解禁・deferred のみ
  | { readonly kind: "departure_unresolved" }; // clarification・evaluable_now（出発線が組めない）

export interface TriggerConditionV0 {
  readonly predicate: TriggerPredicate;
  readonly evalStatus: TriggerEvalStatus;
  readonly missingInputs: ReadonlyArray<TriggerMissingInput>;
  readonly deferredByGate: ReadonlyArray<TriggerGate>;
  readonly humanReadable: string;
}

export interface TriggerEvalContextV0 {
  readonly momentState: MomentStateV0;
  readonly leaveByLines: LeaveByLinesV0;
}

interface PartialEval {
  status: TriggerEvalStatus;
  missing: TriggerMissingInput[];
  gates: TriggerGate[];
}

function lineValue(ref: DepartureLineRef, lines: LeaveByLinesV0): string | null {
  return lines[ref].value;
}

/** lattice join: unknown が支配 → deferred → evaluable_now（AND/OR とも v0 は同 join＝「今 fire 可能か」の保守判定）。 */
function joinEval(parts: ReadonlyArray<PartialEval>): PartialEval {
  const missing = new Set<TriggerMissingInput>();
  const gates = new Set<TriggerGate>();
  let anyUnknown = false;
  let anyDeferred = false;
  for (const p of parts) {
    p.missing.forEach((m) => missing.add(m));
    p.gates.forEach((g) => gates.add(g));
    if (p.status === "unknown") anyUnknown = true;
    if (p.status === "deferred_by_gate") anyDeferred = true;
  }
  const status: TriggerEvalStatus = anyUnknown ? "unknown" : anyDeferred ? "deferred_by_gate" : "evaluable_now";
  return { status, missing: [...missing], gates: [...gates] };
}

function evalPredicate(p: TriggerPredicate, ctx: TriggerEvalContextV0): PartialEval {
  switch (p.kind) {
    case "time_at_or_after": {
      // 参照線が null → cannot fire（unknown）・missingInputs に理由
      if (lineValue(p.ref, ctx.leaveByLines) === null) {
        const reason: TriggerMissingInput = ctx.leaveByLines.whyUnresolved[0] === "place_missing" ? "place_missing" : ctx.leaveByLines.whyUnresolved[0] === "route_missing" ? "route_missing" : "eta_source_missing";
        return { status: "unknown", missing: [reason], gates: [] };
      }
      // 線が解決済 → MomentState.nowHHMM で今評価可能（位置非依存・1 分精度）
      return { status: "evaluable_now", missing: [], gates: [] };
    }
    case "window_state": {
      if (ctx.momentState.interventionWindow === "unknown") return { status: "unknown", missing: [], gates: [] };
      return { status: "evaluable_now", missing: [], gates: [] };
    }
    case "and":
    case "or":
      return joinEval(p.operands.map((o) => evalPredicate(o, ctx)));
    case "state_unmet":
      // v0: prep 観測未解禁 → 評価せず deferred
      return { status: "deferred_by_gate", missing: ["prep_state_unobserved"], gates: ["prep_state"] };
    case "location_off_route":
    case "location_linger":
      // v0: 位置未解禁 → 評価せず deferred
      return { status: "deferred_by_gate", missing: ["location_unavailable"], gates: ["location"] };
    case "departure_unresolved": {
      // clarification: 「出発線が組めない」は今 evaluable（leaveByLines.recommended===null を今チェック可能）
      const reasons = ctx.leaveByLines.whyUnresolved.map((r): TriggerMissingInput => r);
      return { status: "evaluable_now", missing: reasons.length > 0 ? reasons : ["eta_source_missing"], gates: [] };
    }
  }
}

function humanReadable(p: TriggerPredicate): string {
  switch (p.kind) {
    case "time_at_or_after":
      return `now≥${p.ref}`;
    case "window_state":
      return `window∈{${p.window.join(",")}}`;
    case "and":
      return p.operands.map(humanReadable).join(" ∧ ");
    case "or":
      return p.operands.map(humanReadable).join(" ∨ ");
    case "state_unmet":
      return `state_unmet(${p.state})[deferred]`;
    case "location_off_route":
      return "location_off_route[deferred]";
    case "location_linger":
      return "location_linger[deferred]";
    case "departure_unresolved":
      return "departure_unresolved(ETA/place 欠落)";
  }
}

/** buildTriggerCondition — predicate を ctx で評価し TriggerConditionV0 を組む（pure）。 */
export function buildTriggerCondition(predicate: TriggerPredicate, ctx: TriggerEvalContextV0): TriggerConditionV0 {
  const e = evalPredicate(predicate, ctx);
  return {
    predicate,
    evalStatus: e.status,
    missingInputs: e.missing,
    deferredByGate: e.gates,
    humanReadable: humanReadable(predicate),
  };
}

/** v0 評価器が実評価する predicate kind か（state_unmet/location_* は deferred で実評価しない）。監査用。 */
export function isV0EvaluatedKind(kind: TriggerPredicate["kind"]): boolean {
  return kind === "time_at_or_after" || kind === "window_state" || kind === "and" || kind === "or" || kind === "departure_unresolved";
}
