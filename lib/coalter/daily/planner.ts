/**
 * CoAlter Daily Dispatch — DailyPlanner (DD3 phase)
 *
 * 正本:
 *   - docs/coalter-daily-domain-dispatch-design.md (PR #125、Alt D Hybrid 推奨)
 *   - docs/coalter-master-design.md v1.2 §13.7 (Daily × Domain dispatch reflection)
 *   - lib/coalter/daily/types.ts (DD1、PR #131)
 *   - lib/coalter/daily/domainRouter.ts (DD2、PR #134)
 *   - lib/coalter/activity/candidates.ts (Activity AD3、PR #133)
 *
 * 役割:
 *   複数の `DomainRouter` output (DD2) を入力に、**Daily plan graph / chain** を
 *   組み立てる pure planner。runtime-capable library のみ追加、call-site wiring 0、
 *   production behavior 0 変化。
 *
 * **CEO 2026-05-15 補正反映** (PR #134 で確立した表現精度):
 *   - runtime-capable code 追加 ≠ runtime wiring
 *   - 本 file は import 元なしで main に追加、誰も import しない (production behavior 0)
 *
 * **3 軸混同回避** (Master Design v1.2 §13.6、PR #122 / DD2 継承):
 *   - Axis A: Action Mode — 本 planner の責務外
 *   - Axis B: Presence Mode — daily mode 内のみ
 *   - Axis C: Domain — 本 planner で chain として組み立て
 *
 * 構造的安全設計 (Gap 4 D2 + AD2/AD3 + DD2 継承):
 *   1. raw text leakage 構造的防止:
 *      - input は routedRequests[] (DD2 output 群) + DailyContext + DailyConstraintCarryOver のみ
 *      - output reasonCodes / skipReasonCodes / missingInputs は **enum only**
 *      - 全 string field は caller normalized (raw user text 不可)
 *   2. provisional threshold:
 *      - `PROVISIONAL_ACCEPTANCE_THRESHOLD = 0.5` (命名で provisional 明示)
 *      - input.acceptanceThreshold で override 可
 *      - 最終値は DD5/DD6 phase で実 data 観測後決定
 *   3. fail-closed default:
 *      - empty routedRequests → empty_routed_requests + needs_narrowing
 *      - 全 routerOutput が "needs_narrowing" → all_routed_to_narrowing fallback
 *   4. context-aware ordering:
 *      - timeSlot 別 natural ordering (food → movie 等)
 *      - transition cost minimization
 *   5. saturation cooldown (PR #125 Idea 16):
 *      - fairnessHints.cooldownDomains skip
 *   6. chain length limit (PR #125 Idea 5):
 *      - max chain length = 3 (cognitive load 制御)
 *   7. deterministic:
 *      - 純関数、Math.random 不使用、external state 0
 *
 * 後続 phase (本 PR scope 外):
 *   - DD4: Domain orchestrator integration (別 PR、CEO 承認)
 *   - DD5: UI presentation (別 PR、Product Unit 連携)
 *   - DD6: production observation + mode enum rollout (別 PR、CEO 戦略判断)
 *
 * 本 PR の不可触 (CEO 2026-05-15 制約):
 *   - runtime call-site wiring / orchestrator 接続
 *   - ChatClient / UpperLayerMount / route / API / env / flags / migration
 *   - lib/coalter/daily/types.ts 既存 type touch (新 type は本 file local 定義)
 *   - Travel T2 / Activity AD4 / Gap 4 D3 実装
 */

import type {
  DailyChainPosition,
  DailyConstraintCarryOver,
  DailyContext,
  DailyDomain,
  DailyDomainRequest,
  DailyTimeSlot,
} from "./types";
import type {
  DomainRouterOutput,
  RouterDispatchTarget,
} from "./domainRouter";
import type { ActivityCandidateGeneratorOutput } from "../activity/candidates";

// ─────────────────────────────────────────────
// planner version (calibration 用)
// ─────────────────────────────────────────────

/**
 * Planner version 文字列 (semver).
 */
export const PLANNER_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// provisional thresholds / limits (確定値ではない)
// ─────────────────────────────────────────────

/**
 * Provisional acceptance threshold (CEO 2026-05-15 補正済).
 *
 * candidate を plan に accept する router confidence の閾値。
 * AD4/DD5/DD6 phase で実 data 観測後決定。
 */
export const PROVISIONAL_ACCEPTANCE_THRESHOLD = 0.5;

/**
 * Max chain length (PR #125 Idea 5、cognitive load 制御).
 *
 * 1 Daily session 内で最大 chain 長 = 3。
 * input.maxChainLength で override 可。
 */
export const PROVISIONAL_MAX_CHAIN_LENGTH = 3;

// ─────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────

/**
 * Routed request (DD2 output + 元 request).
 *
 * Planner は複数 routedRequests を input に受け取り、chain として組み立てる。
 */
export interface DailyRoutedRequest {
  request: DailyDomainRequest;
  routerOutput: DomainRouterOutput;
}

/**
 * Planner input.
 */
export interface DailyPlannerInput {
  /** Routed request 群 (DD2 output) */
  routedRequests: DailyRoutedRequest[];
  /** Daily 全体の context */
  globalContext: DailyContext;
  /** Daily 全体の constraints */
  globalConstraints: DailyConstraintCarryOver;
  /**
   * Activity candidate result (optional、AD3 output).
   *
   * activity domain が routedRequests に含まれる場合、本 AD3 output から
   * candidate を取り出して plan に attach (DD4 で orchestrator が使う想定)。
   * 本 DD3 では reasonCode "activity_uses_ad3_candidates" を attach するのみ。
   */
  activityCandidates?: ActivityCandidateGeneratorOutput;
  /** Provisional acceptance threshold (default: 0.5) */
  acceptanceThreshold?: number;
  /** Max chain length (default: 3) */
  maxChainLength?: number;
}

// ─────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────

/**
 * Daily plan graph (DAG: nodes + edges).
 *
 * - `nodeIds`: 全 step (accepted) の id list
 * - `edgeIds`: 全 edge (chain transition) の id list
 * - `totalDomains`: unique domain count
 * - `topologicalOrder`: node ids in topological sort order (linear ordering)
 */
export interface DailyPlanGraph {
  nodeIds: string[];
  edgeIds: string[];
  totalDomains: number;
  topologicalOrder: string[];
}

/**
 * Daily plan step (accepted、ordered).
 */
export interface DailyPlanStep {
  stepId: string;
  domain: RouterDispatchTarget;
  /** 1-based position in plan */
  position: { index: number; total: number };
  /** estimated time slot (timeSlot-based ordering の結果) */
  estimatedTimeSlot: DailyTimeSlot;
  /** Router confidence (pass-through from DD2 output) */
  confidence: number;
  reasonCodes: DailyPlannerReasonCode[];
}

/**
 * Daily chain edge (transition between steps).
 */
export interface DailyChainEdge {
  edgeId: string;
  fromStepId: string;
  toStepId: string;
  fromDomain: RouterDispatchTarget;
  toDomain: RouterDispatchTarget;
  transitionCost: DailyTransitionCost;
}

/**
 * Transition cost level.
 */
export type DailyTransitionCost = "low" | "medium" | "high";

/**
 * Skipped domain (plan に含まれない、reason 明示).
 */
export interface DailySkippedDomain {
  domain: RouterDispatchTarget;
  reasonCode: DailyPlannerSkipReason;
}

/**
 * Skip reason codes.
 */
export type DailyPlannerSkipReason =
  | "router_unknown_target"
  | "router_narrowing_target"
  | "below_acceptance_threshold"
  | "duplicate_domain_lower_confidence"
  | "chain_length_exceeded"
  | "saturation_cooldown_active"
  | "context_conflict";

/**
 * Missing input codes.
 */
export type DailyPlannerMissingInput =
  | "empty_routed_requests"
  | "missing_global_context"
  | "all_routed_to_narrowing"
  | "no_eligible_domain"
  | "all_skipped";

/**
 * Planner reason codes.
 */
export type DailyPlannerReasonCode =
  // overall
  | "single_domain_plan"
  | "multi_domain_chain_plan"
  | "ordered_by_time_slot"
  | "deduplicated_by_confidence"
  | "chain_length_limited"
  | "activity_uses_ad3_candidates"
  | "needs_narrowing"
  | "fail_closed"
  // per-step / per-edge
  | "step_accepted_above_threshold"
  | "step_at_natural_time_slot"
  | "low_cost_transition"
  | "medium_cost_transition"
  | "high_cost_transition_warning"
  | "first_step"
  | "last_step";

/**
 * Planner output.
 */
export interface DailyPlannerOutput {
  dailyPlanGraph: DailyPlanGraph;
  orderedSteps: DailyPlanStep[];
  chainEdges: DailyChainEdge[];
  skippedDomains: DailySkippedDomain[];
  needsNarrowing: boolean;
  missingInputs: DailyPlannerMissingInput[];
  reasonCodes: DailyPlannerReasonCode[];
  plannerVersion: string;
}

// ─────────────────────────────────────────────
// Helper: empty graph (pure factory)
// ─────────────────────────────────────────────

function emptyGraph(): DailyPlanGraph {
  return {
    nodeIds: [],
    edgeIds: [],
    totalDomains: 0,
    topologicalOrder: [],
  };
}

// ─────────────────────────────────────────────
// Helper: time slot natural ordering (pure)
// ─────────────────────────────────────────────

/**
 * Domain 別 natural time slot.
 *
 * Daily mode 内で各 domain の典型 timeSlot:
 *   - food: evening (dinner 中心)
 *   - movie: night
 *   - activity: afternoon (day-time outing)
 *   - travel: weekend morning (本 Daily 内は限定的)
 *   - schedule: morning (planning は朝)
 *   - relationship: anytime (timeSlot 不問)
 *   - unknown / needs_narrowing: unknown
 */
function naturalTimeSlot(domain: RouterDispatchTarget): DailyTimeSlot {
  switch (domain) {
    case "food":
      return "evening";
    case "movie":
      return "night";
    case "activity":
      return "afternoon";
    case "travel":
      return "morning";
    case "schedule":
      return "morning";
    case "relationship":
      return "evening";
    case "needs_narrowing":
    case "unknown":
      return "noon"; // arbitrary middle, will be filtered out
  }
}

/**
 * timeSlot 順 numeric value (sorting 用).
 */
function timeSlotOrder(slot: DailyTimeSlot): number {
  switch (slot) {
    case "morning":
      return 0;
    case "noon":
      return 1;
    case "afternoon":
      return 2;
    case "evening":
      return 3;
    case "night":
      return 4;
    case "deepnight":
      return 5;
  }
}

// ─────────────────────────────────────────────
// Helper: transition cost (pure)
// ─────────────────────────────────────────────

/**
 * Transition cost between domains.
 *
 *   - food → movie: low (時系列自然 dinner + entertainment)
 *   - food → activity: low (meal + walk)
 *   - activity → food: low (outing + meal)
 *   - activity → movie: low
 *   - movie → food: medium (post-movie meal、time 制約)
 *   - * → travel: high (Daily 内 travel は本来軽量、escalation 警告)
 *   - schedule / relationship 含む: medium
 */
function computeTransitionCost(
  from: RouterDispatchTarget,
  to: RouterDispatchTarget,
): DailyTransitionCost {
  if (to === "travel") return "high";
  if (from === "movie" && to === "food") return "medium";
  if (from === "schedule" || to === "schedule") return "medium";
  if (from === "relationship" || to === "relationship") return "medium";
  return "low";
}

// ─────────────────────────────────────────────
// Helper: cooldown check (pure)
// ─────────────────────────────────────────────

/**
 * Domain が cooldown 中か判定 (PR #125 Idea 16 Saturation cooldown).
 *
 * fairnessHints.cooldownDomains に含まれる domain は skip。
 */
function isInCooldown(
  domain: RouterDispatchTarget,
  routedRequest: DailyRoutedRequest,
): boolean {
  const cooldown = routedRequest.request.fairnessHints.cooldownDomains;
  // RouterDispatchTarget の食/movie/travel/activity は DailyDomain と一致、それ以外 cooldown 非適用
  if (
    domain === "food" ||
    domain === "movie" ||
    domain === "travel" ||
    domain === "activity"
  ) {
    return cooldown.includes(domain as DailyDomain);
  }
  return false;
}

// ─────────────────────────────────────────────
// Main planner (pure function、deterministic)
// ─────────────────────────────────────────────

/**
 * Daily plan を組み立てる pure function.
 *
 * **本関数は純関数**: 同じ input → 同じ output、副作用なし、`Math.random` 不使用、
 * 現在時刻参照なし、external state 参照なし。
 *
 * **planning logic**:
 *   1. Input validation (fail-closed)
 *   2. routedRequests filter (unknown / needs_narrowing skip)
 *   3. Deduplication (同 domain 重複 → 最高 confidence 残す)
 *   4. Saturation cooldown skip (PR #125 Idea 16)
 *   5. Acceptance threshold check
 *   6. timeSlot ordering (natural time slot)
 *   7. Chain length limit (max 3 default)
 *   8. Graph construction (nodes + edges + topological order)
 *
 * @param input planner input (routedRequests + globalContext + globalConstraints + optional activityCandidates)
 * @returns plan graph + ordered steps + chain edges + skipped domains + reasons
 */
export function buildDailyPlan(input: DailyPlannerInput): DailyPlannerOutput {
  const threshold = input.acceptanceThreshold ?? PROVISIONAL_ACCEPTANCE_THRESHOLD;
  const maxChainLength = input.maxChainLength ?? PROVISIONAL_MAX_CHAIN_LENGTH;
  const reasonCodes: DailyPlannerReasonCode[] = [];
  const skippedDomains: DailySkippedDomain[] = [];
  const missingInputs: DailyPlannerMissingInput[] = [];

  // 1. Input validation (fail-closed)
  if (input.routedRequests.length === 0) {
    missingInputs.push("empty_routed_requests");
    reasonCodes.push("fail_closed");
    reasonCodes.push("needs_narrowing");
    return {
      dailyPlanGraph: emptyGraph(),
      orderedSteps: [],
      chainEdges: [],
      skippedDomains,
      needsNarrowing: true,
      missingInputs,
      reasonCodes,
      plannerVersion: PLANNER_VERSION,
    };
  }

  // 2. routedRequests filter
  type Eligible = {
    routed: DailyRoutedRequest;
    target: RouterDispatchTarget;
    confidence: number;
  };
  const eligible: Eligible[] = [];

  for (const r of input.routedRequests) {
    const target = r.routerOutput.selectedDomain;
    // skip unknown / needs_narrowing
    if (target === "unknown") {
      skippedDomains.push({ domain: target, reasonCode: "router_unknown_target" });
      continue;
    }
    if (target === "needs_narrowing") {
      skippedDomains.push({ domain: target, reasonCode: "router_narrowing_target" });
      continue;
    }
    // threshold check
    if (r.routerOutput.confidence < threshold) {
      skippedDomains.push({ domain: target, reasonCode: "below_acceptance_threshold" });
      continue;
    }
    // cooldown skip
    if (isInCooldown(target, r)) {
      skippedDomains.push({ domain: target, reasonCode: "saturation_cooldown_active" });
      continue;
    }
    eligible.push({ routed: r, target, confidence: r.routerOutput.confidence });
  }

  // 全 narrowing → fallback
  if (eligible.length === 0) {
    if (skippedDomains.every((s) => s.reasonCode === "router_narrowing_target")) {
      missingInputs.push("all_routed_to_narrowing");
    } else {
      missingInputs.push("no_eligible_domain");
      missingInputs.push("all_skipped");
    }
    reasonCodes.push("needs_narrowing");
    return {
      dailyPlanGraph: emptyGraph(),
      orderedSteps: [],
      chainEdges: [],
      skippedDomains,
      needsNarrowing: true,
      missingInputs,
      reasonCodes,
      plannerVersion: PLANNER_VERSION,
    };
  }

  // 3. Deduplication (同 domain → 最高 confidence 残す)
  const byDomain = new Map<RouterDispatchTarget, Eligible>();
  for (const e of eligible) {
    const existing = byDomain.get(e.target);
    if (existing === undefined) {
      byDomain.set(e.target, e);
    } else if (e.confidence > existing.confidence) {
      byDomain.set(e.target, e);
      skippedDomains.push({
        domain: e.target,
        reasonCode: "duplicate_domain_lower_confidence",
      });
    } else {
      skippedDomains.push({
        domain: e.target,
        reasonCode: "duplicate_domain_lower_confidence",
      });
    }
  }
  if (eligible.length !== byDomain.size) {
    reasonCodes.push("deduplicated_by_confidence");
  }
  const deduped = Array.from(byDomain.values());

  // 4. timeSlot ordering
  deduped.sort((a, b) => {
    const slotDiff = timeSlotOrder(naturalTimeSlot(a.target)) - timeSlotOrder(naturalTimeSlot(b.target));
    if (slotDiff !== 0) return slotDiff;
    // tie-break: target name lexicographic (deterministic)
    return a.target.localeCompare(b.target);
  });
  reasonCodes.push("ordered_by_time_slot");

  // 5. Chain length limit
  let limitedSteps = deduped;
  if (deduped.length > maxChainLength) {
    // 上位 maxChainLength (時間 slot 早い順) を残し、残りは skip
    const excluded = deduped.slice(maxChainLength);
    for (const e of excluded) {
      skippedDomains.push({
        domain: e.target,
        reasonCode: "chain_length_exceeded",
      });
    }
    limitedSteps = deduped.slice(0, maxChainLength);
    reasonCodes.push("chain_length_limited");
  }

  // 6. Step / edge 構築
  const orderedSteps: DailyPlanStep[] = limitedSteps.map((e, idx) => {
    const stepReasons: DailyPlannerReasonCode[] = ["step_accepted_above_threshold"];
    stepReasons.push("step_at_natural_time_slot");
    if (idx === 0) stepReasons.push("first_step");
    if (idx === limitedSteps.length - 1) stepReasons.push("last_step");

    return {
      stepId: `step_${idx + 1}_${e.target}`,
      domain: e.target,
      position: { index: idx + 1, total: limitedSteps.length },
      estimatedTimeSlot: naturalTimeSlot(e.target),
      confidence: e.confidence,
      reasonCodes: stepReasons,
    };
  });

  // 7. Chain edges
  const chainEdges: DailyChainEdge[] = [];
  for (let i = 0; i < orderedSteps.length - 1; i++) {
    const from = orderedSteps[i];
    const to = orderedSteps[i + 1];
    const cost = computeTransitionCost(from.domain, to.domain);
    chainEdges.push({
      edgeId: `edge_${i + 1}_${from.domain}_to_${to.domain}`,
      fromStepId: from.stepId,
      toStepId: to.stepId,
      fromDomain: from.domain,
      toDomain: to.domain,
      transitionCost: cost,
    });
    if (cost === "low") reasonCodes.push("low_cost_transition");
    if (cost === "medium") reasonCodes.push("medium_cost_transition");
    if (cost === "high") reasonCodes.push("high_cost_transition_warning");
  }

  // 8. Graph construction
  const dailyPlanGraph: DailyPlanGraph = {
    nodeIds: orderedSteps.map((s) => s.stepId),
    edgeIds: chainEdges.map((e) => e.edgeId),
    totalDomains: orderedSteps.length,
    topologicalOrder: orderedSteps.map((s) => s.stepId),
  };

  // 9. overall reasonCodes
  if (orderedSteps.length === 1) {
    reasonCodes.push("single_domain_plan");
  } else if (orderedSteps.length >= 2) {
    reasonCodes.push("multi_domain_chain_plan");
  }

  // 10. activity AD3 candidates note (本 DD3 で reason のみ attach)
  const hasActivityStep = orderedSteps.some((s) => s.domain === "activity");
  if (hasActivityStep && input.activityCandidates !== undefined) {
    reasonCodes.push("activity_uses_ad3_candidates");
  }

  return {
    dailyPlanGraph,
    orderedSteps,
    chainEdges,
    skippedDomains,
    needsNarrowing: false,
    missingInputs,
    reasonCodes,
    plannerVersion: PLANNER_VERSION,
  };
}

// ─────────────────────────────────────────────
// Used type alias (re-export for caller convenience)
// ─────────────────────────────────────────────

export type { DailyChainPosition };
