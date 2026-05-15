/**
 * CoAlter Daily Dispatch — DomainRouter (DD2 phase)
 *
 * 正本:
 *   - docs/coalter-daily-domain-dispatch-design.md (PR #125、Alt D Hybrid 推奨)
 *   - docs/coalter-master-design.md v1.2 §13.7 (Daily × Domain dispatch reflection)
 *   - lib/coalter/daily/types.ts (Batch-C PR #131、DD1 phase)
 *
 * 役割:
 *   `DailyDomainRequest` (PR #131) を実 dispatch target に解決する **pure router**。
 *   DailyDomain (4 値: food/movie/travel/activity) を超える dispatch target
 *   (schedule / relationship / needs_narrowing / unknown) も扱う。runtime 接続なし、
 *   production behavior 0 変化。
 *
 * **重要 — 3 軸混同回避** (Master Design v1.2 §13.6、PR #122):
 *   - Axis A: Action Mode (decision/negotiate/clarify/reflect) — 本 router の責務外
 *   - Axis B: Presence Mode (normal/daily/travel) — 本 router は daily mode 内のみ
 *   - Axis C: Domain — **本 router の責務**
 *   - relationship handoff = normal mode Action Mode (clarify/negotiate) への escalation 提案、
 *     ただし本 router は signal を返すのみ、実際の mode 切替は caller / Presence reducer の責務
 *
 * 構造的安全設計 (Gap 4 D2 + AD2 + AD3 継承):
 *   1. raw text leakage 構造的防止:
 *      - input は `DailyDomainRequest` (caller normalized) のみ、raw user text 不可
 *      - output reasonCodes / handoffNotes / missingInputs は **enum only**
 *      - signal prefix match は **inline literal** で実装、constants array 不使用
 *   2. provisional threshold (CEO 補正反映):
 *      - PROVISIONAL_CONFIDENCE_THRESHOLD = 0.5 (命名で provisional 明示)
 *      - input.confidenceThreshold で override 可
 *      - 最終値は後続 phase で実 data 観測後決定
 *   3. fail-closed default:
 *      - 全 field undefined / 不正値 → unknown + needs_narrowing
 *   4. deterministic: 純関数、Math.random 不使用、external state 0
 *   5. context-aware narrowing (人間超越):
 *      - timeSlot=deepnight + activity → narrowing (深夜 outdoor 推奨せず)
 *      - energyBudget=1 + 高 fatigue domain → narrowing (制約 conflict)
 *
 * 本 PR の不可触 (CEO 2026-05-15 制約):
 *   - Daily planner (DD3) 接続 / orchestrator 接続
 *   - ChatClient / UpperLayerMount / route / API / env / flags / migration
 *   - lib/coalter/daily/types.ts 既存 type touch (新 type は本 file local 定義)
 *   - Travel T2 / Activity AD4 実装
 */

import type {
  DailyChainPosition,
  DailyDomain,
  DailyDomainRequest,
} from "./types";

// ─────────────────────────────────────────────
// router version (calibration 用)
// ─────────────────────────────────────────────

/**
 * Router version 文字列 (semver).
 *
 * 後続 phase で routing logic 変更時 MINOR up、入出力 schema 変更時 MAJOR up。
 */
export const ROUTER_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// provisional threshold (固定値ではない)
// ─────────────────────────────────────────────

/**
 * Provisional default confidence threshold (CEO 2026-05-15 補正済).
 *
 * 最終値は DD5/DD6 phase で実 data 観測後決定。input.confidenceThreshold で
 * config arg override 可。
 */
export const PROVISIONAL_CONFIDENCE_THRESHOLD = 0.5;

// ─────────────────────────────────────────────
// RouterDispatchTarget (DailyDomain + 拡張 routing target)
// ─────────────────────────────────────────────

/**
 * Router の dispatch target.
 *
 * DailyDomain (4 値: food/movie/travel/activity、PR #131 DD1) に加え、
 * Daily mode 外への handoff (schedule / relationship) と decision fail-safe
 * (needs_narrowing / unknown) を含む。
 *
 *   - food / movie / travel / activity: Daily 内 domain (DD1 enum と一致)
 *   - schedule: 予定・時間調整 domain (Daily 外、別 orchestrator 想定、future scope)
 *   - relationship: 関係性 mediation / 調停 (normal mode Action Mode へ escalate 提案)
 *   - needs_narrowing: signal 不足 / context conflict、progressive narrowing 必要
 *   - unknown: 不明 fail-closed (input 異常 等)
 */
export type RouterDispatchTarget =
  | "food"
  | "movie"
  | "travel"
  | "activity"
  | "schedule"
  | "relationship"
  | "needs_narrowing"
  | "unknown";

// ─────────────────────────────────────────────
// Reason / Handoff / Missing enum (raw text 不可)
// ─────────────────────────────────────────────

/**
 * Router reason codes (raw text 不可、enum only).
 *
 * 将来 reason code 追加時は MINOR version up。
 */
export type DomainRouterReasonCode =
  // overall
  | "request_invalid"
  | "explicit_keyword_match"
  | "implicit_pattern_match"
  | "fallback_default_routing"
  | "multi_domain_chain_routing"
  | "cross_domain_handoff_routed"
  // domain routed
  | "routed_to_food"
  | "routed_to_movie"
  | "routed_to_travel"
  | "routed_to_activity"
  | "routed_to_schedule"
  | "routed_to_relationship"
  // confidence
  | "above_confidence_threshold"
  | "below_confidence_threshold"
  // narrowing
  | "multiple_alternates_present"
  | "context_conflict_narrowing"
  | "deepnight_blocked_narrowing"
  | "energy_fatigue_conflict_narrowing"
  // handoff detection
  | "schedule_signal_detected"
  | "relationship_signal_detected"
  // chain
  | "chain_continuation"
  | "chain_transition_cost_high"
  // fail-closed
  | "fail_closed"
  | "no_signal";

/**
 * Handoff note codes (DailyDomain から RouterDispatchTarget への handoff event).
 */
export type DomainRouterHandoffReason =
  | "schedule_keyword_in_signals"
  | "relationship_keyword_in_signals"
  | "context_unsuitable_for_domain"
  | "alternate_dominant_in_inference";

/**
 * Handoff note (どの domain から どの target への handoff か).
 */
export interface DomainRouterHandoffNote {
  fromDomain: DailyDomain;
  toTarget: RouterDispatchTarget;
  reasonCode: DomainRouterHandoffReason;
}

/**
 * Missing input codes (routing 不足).
 */
export type DomainRouterMissingInput =
  | "missing_context"
  | "missing_infer_rationale"
  | "missing_routing_reason"
  | "low_confidence"
  | "no_signals_provided"
  | "ambiguous_alternates";

// ─────────────────────────────────────────────
// Router output
// ─────────────────────────────────────────────

/**
 * Router output.
 *
 * - `selectedDomain`: 最終 dispatch target (RouterDispatchTarget)
 * - `confidence`: routing confidence (0-1、provisional)
 * - `reasonCodes`: 確定理由 enum list (raw text 不可)
 * - `needsNarrowing`: progressive narrowing 必要なら true
 * - `handoffNotes`: DailyDomain → 拡張 target への handoff event 一覧
 * - `missingInputs`: routing 不足 enum list
 * - `routerVersion`: 本 router version (calibration 用)
 */
export interface DomainRouterOutput {
  selectedDomain: RouterDispatchTarget;
  confidence: number;
  reasonCodes: DomainRouterReasonCode[];
  needsNarrowing: boolean;
  handoffNotes: DomainRouterHandoffNote[];
  missingInputs: DomainRouterMissingInput[];
  routerVersion: string;
}

// ─────────────────────────────────────────────
// Router input (config arg)
// ─────────────────────────────────────────────

/**
 * Router input.
 *
 * 主 input は `DailyDomainRequest` (PR #131 DD1)、加えて optional config arg。
 */
export interface DomainRouterInput {
  request: DailyDomainRequest;
  /** Provisional confidence threshold (default: PROVISIONAL_CONFIDENCE_THRESHOLD = 0.5) */
  confidenceThreshold?: number;
}

// ─────────────────────────────────────────────
// Helper: signal prefix detection (pure、inline literal、constants array 不使用)
// ─────────────────────────────────────────────

/**
 * signal が schedule handoff を示すか判定.
 *
 * **構造的安全**: inline literal で prefix match、constants array 不使用 (CEO 制約)。
 */
function isScheduleSignal(signal: string): boolean {
  return (
    signal.startsWith("schedule_") ||
    signal.startsWith("timing_") ||
    signal.startsWith("calendar_")
  );
}

/**
 * signal が relationship handoff を示すか判定.
 */
function isRelationshipSignal(signal: string): boolean {
  return (
    signal.startsWith("relationship_") ||
    signal.startsWith("mediation_") ||
    signal.startsWith("talk_about_")
  );
}

// ─────────────────────────────────────────────
// Helper: handoff detection (pure)
// ─────────────────────────────────────────────

/**
 * `DailyDomainInferRationale.signals` から handoff target 検出.
 *
 * 優先順 (single match assumed):
 *   1. schedule_* / timing_* / calendar_* → schedule
 *   2. relationship_* / mediation_* / talk_about_* → relationship
 *   3. 該当なし → undefined (no handoff、original domain 維持)
 */
function detectHandoffFromSignals(signals: string[]): RouterDispatchTarget | undefined {
  for (const signal of signals) {
    if (isScheduleSignal(signal)) return "schedule";
    if (isRelationshipSignal(signal)) return "relationship";
  }
  return undefined;
}

// ─────────────────────────────────────────────
// Helper: context-aware narrowing detection (人間超越アイデア)
// ─────────────────────────────────────────────

/**
 * Context が dispatch target と conflict しているか判定.
 *
 * Context-aware narrowing 例:
 *   1. timeSlot=deepnight + activity (outdoor 系) → narrowing (深夜 outdoor 推奨せず)
 *   2. energyBudget=1 + 高 fatigue domain → narrowing
 *
 * 上記いずれかが立てば narrowing reason を返す、なければ undefined。
 */
function detectContextConflict(
  request: DailyDomainRequest,
  selectedDomain: RouterDispatchTarget,
): DomainRouterReasonCode | undefined {
  // 1. deepnight + activity → narrowing
  if (request.context.timeSlot === "deepnight" && selectedDomain === "activity") {
    return "deepnight_blocked_narrowing";
  }

  // 2. energyBudget=1 (very low) + 高 fatigue 想定 domain
  //    activity / travel は body 動作を伴う、energyBudget=1 では narrowing
  if (request.constraints.energyBudget === 1) {
    if (selectedDomain === "activity" || selectedDomain === "travel") {
      return "energy_fatigue_conflict_narrowing";
    }
  }

  return undefined;
}

// ─────────────────────────────────────────────
// Helper: chain transition cost (PR #125 Idea 13)
// ─────────────────────────────────────────────

/**
 * Chain 内 transition cost 判定 (PR #125 Idea 13).
 *
 * 一般的 transition (cost 低):
 *   - food → movie (時系列自然)
 *   - food → activity (散歩 + cafe 系)
 *   - activity → food (買物 + 食事)
 *
 * 高 cost transition:
 *   - food → travel (旅行への escalation、Daily 内では稀)
 *   - movie → travel
 *   - travel → travel (Daily mode 内では本来 escalate 推奨)
 */
function isHighTransitionCost(
  prevDomain: DailyDomain | undefined,
  current: RouterDispatchTarget,
): boolean {
  if (prevDomain === undefined) return false;
  if (current === "travel") {
    return prevDomain === "food" || prevDomain === "movie";
  }
  return false;
}

// ─────────────────────────────────────────────
// Helper: map DailyDomainRoutingReason → router reason code (pure)
// ─────────────────────────────────────────────

function mapRoutingReason(
  routingReason: DailyDomainRequest["routingReason"],
): DomainRouterReasonCode {
  switch (routingReason) {
    case "explicit_keyword":
      return "explicit_keyword_match";
    case "implicit_pattern":
      return "implicit_pattern_match";
    case "fallback_default":
      return "fallback_default_routing";
    case "multi_domain_chain":
      return "multi_domain_chain_routing";
    case "cross_domain_handoff":
      return "cross_domain_handoff_routed";
  }
}

// ─────────────────────────────────────────────
// Helper: map DailyDomain → routed_to_* reason code (pure)
// ─────────────────────────────────────────────

function mapDomainToReason(domain: DailyDomain): DomainRouterReasonCode {
  switch (domain) {
    case "food":
      return "routed_to_food";
    case "movie":
      return "routed_to_movie";
    case "travel":
      return "routed_to_travel";
    case "activity":
      return "routed_to_activity";
  }
}

// ─────────────────────────────────────────────
// Main router (pure function、deterministic)
// ─────────────────────────────────────────────

/**
 * Daily DomainRouter pure function.
 *
 * **本関数は純関数**: 同じ input → 同じ output、副作用なし、`Math.random` 不使用、
 * 現在時刻参照なし、external state 参照なし。
 *
 * **3 軸混同回避**:
 *   - Action Mode (Axis A) は本 router の責務外
 *   - relationship handoff = Action Mode escalation **提案** (signal を返すのみ)、
 *     実際の mode 切替は caller / Presence reducer の責務
 *
 * **routing logic**:
 *   1. Request validation (fail-closed)
 *   2. Signal 内 schedule / relationship handoff detection (優先)
 *   3. DailyDomain → RouterDispatchTarget mapping
 *   4. Context-aware narrowing detection (deepnight / energyBudget conflict)
 *   5. Confidence threshold check
 *   6. Multiple alternates → narrowing
 *
 * @param input Daily domain request + optional config
 * @returns Router output (selected target + confidence + reasons + handoff notes)
 */
export function routeDailyDomain(input: DomainRouterInput): DomainRouterOutput {
  const request = input.request;
  const threshold = input.confidenceThreshold ?? PROVISIONAL_CONFIDENCE_THRESHOLD;
  const reasonCodes: DomainRouterReasonCode[] = [];
  const handoffNotes: DomainRouterHandoffNote[] = [];
  const missingInputs: DomainRouterMissingInput[] = [];

  // 1. Request validation (fail-closed)
  if (request.inferRationale === undefined) {
    missingInputs.push("missing_infer_rationale");
    reasonCodes.push("request_invalid");
    reasonCodes.push("fail_closed");
    return {
      selectedDomain: "unknown",
      confidence: 0,
      reasonCodes,
      needsNarrowing: true,
      handoffNotes,
      missingInputs,
      routerVersion: ROUTER_VERSION,
    };
  }

  const inferRationale = request.inferRationale;
  const baseConfidence = inferRationale.confidence;

  // 2. Signal 内 schedule / relationship handoff detection (優先)
  const handoffTarget = detectHandoffFromSignals(inferRationale.signals);
  if (handoffTarget !== undefined) {
    let handoffReason: DomainRouterHandoffReason;
    let routedReason: DomainRouterReasonCode;
    let signalReason: DomainRouterReasonCode;

    if (handoffTarget === "schedule") {
      handoffReason = "schedule_keyword_in_signals";
      routedReason = "routed_to_schedule";
      signalReason = "schedule_signal_detected";
    } else {
      // handoffTarget === "relationship"
      handoffReason = "relationship_keyword_in_signals";
      routedReason = "routed_to_relationship";
      signalReason = "relationship_signal_detected";
    }

    handoffNotes.push({
      fromDomain: request.domain,
      toTarget: handoffTarget,
      reasonCode: handoffReason,
    });
    reasonCodes.push(signalReason);
    reasonCodes.push(routedReason);
    reasonCodes.push(mapRoutingReason(request.routingReason));

    return {
      selectedDomain: handoffTarget,
      confidence: baseConfidence,
      reasonCodes,
      needsNarrowing: false,
      handoffNotes,
      missingInputs,
      routerVersion: ROUTER_VERSION,
    };
  }

  // 3. DailyDomain → RouterDispatchTarget mapping (default: domain そのまま)
  const initialTarget: RouterDispatchTarget = request.domain;
  reasonCodes.push(mapDomainToReason(request.domain));
  reasonCodes.push(mapRoutingReason(request.routingReason));

  // 4. Context-aware narrowing detection
  const contextConflict = detectContextConflict(request, initialTarget);
  if (contextConflict !== undefined) {
    reasonCodes.push(contextConflict);
    reasonCodes.push("context_conflict_narrowing");
    return {
      selectedDomain: "needs_narrowing",
      confidence: baseConfidence * 0.5, // 半減 (provisional)
      reasonCodes,
      needsNarrowing: true,
      handoffNotes,
      missingInputs,
      routerVersion: ROUTER_VERSION,
    };
  }

  // 5. Confidence threshold check
  if (baseConfidence < threshold) {
    reasonCodes.push("below_confidence_threshold");
    missingInputs.push("low_confidence");
    return {
      selectedDomain: "needs_narrowing",
      confidence: baseConfidence,
      reasonCodes,
      needsNarrowing: true,
      handoffNotes,
      missingInputs,
      routerVersion: ROUTER_VERSION,
    };
  }

  reasonCodes.push("above_confidence_threshold");

  // 6. Multiple alternates present (ambiguous narrowing 候補)
  //    alternates.length >= 2 で confidence もそれほど高くない場合 narrowing
  //    (CEO 制約: 単純 logic、複雑な metric は AD4+ phase で)
  if (inferRationale.alternates.length >= 2 && baseConfidence < threshold + 0.3) {
    reasonCodes.push("multiple_alternates_present");
    missingInputs.push("ambiguous_alternates");
    return {
      selectedDomain: "needs_narrowing",
      confidence: baseConfidence,
      reasonCodes,
      needsNarrowing: true,
      handoffNotes,
      missingInputs,
      routerVersion: ROUTER_VERSION,
    };
  }

  // 7. Chain transition cost check
  if (request.chainPosition !== undefined) {
    const chain: DailyChainPosition = request.chainPosition;
    if (isHighTransitionCost(chain.prevDomain, initialTarget)) {
      reasonCodes.push("chain_transition_cost_high");
      // 高 cost transition だが必ず narrowing にはしない、reason のみ attach
    } else if (chain.prevDomain !== undefined) {
      reasonCodes.push("chain_continuation");
    }
  }

  return {
    selectedDomain: initialTarget,
    confidence: baseConfidence,
    reasonCodes,
    needsNarrowing: false,
    handoffNotes,
    missingInputs,
    routerVersion: ROUTER_VERSION,
  };
}
