/**
 * Reality Control OS — Receptivity Gate（Slice 2D / DELIVER 層）
 *
 * 親設計:
 *   - docs/aneurasync-reality-control-os-phase0-design.md（DECIDE/DELIVER 分離）
 *   - docs/aneurasync-live-plan-controller-adaptive-trigger-matrix.md §7（配信ポリシー）
 *   - docs/aneurasync-live-plan-controller-golden-scenarios.md（INV-1/9/10/14）
 *
 * これは「通知送信」ではなく **「配信判断」**。決定済みの最適行動を *いつ・どう届けるか*
 * （push / urgent_push / on_open / silent / permission_prompt）を返す純粋判断関数。
 *
 * 原則:
 *   - **high stakes だけで push しない**。push は stakes×actionability×confidence×receptivity×
 *     budget×source-trace×1tap が揃った時のみ。欠ければ on_open / silent / permission_prompt へ降格。
 *   - **no-action 通知禁止**（INV-1）。push は必ず行動導線を持つ。
 *   - **urgent も hard block を越えない**（INV-1/4）。no action / weak trace なら urgent でも push 不可。
 *   - **朝 Daily Plan push を弱めない**。quality 通過＋trace＋1tap＋permission＋budget＋receptivity
 *     なら highStakes 不要で push（on-open 中心に戻さない）。
 *
 * 制約: 純関数のみ。実 push / DB / PRM 更新 / 通知 queue / 既存通知システム接続なし。
 */

import type { DegradationMode } from "./prm-event";

export type DeliveryMode = "silent" | "on_open" | "push" | "urgent_push" | "permission_prompt";

export type DeliveryAction =
  | "one_tap_confirm"
  | "open_plan"
  | "mark_arrived"
  | "choose_priority"
  | "request_permission"
  | "leave_now"
  | "view_alternative"
  | "adjust";

/**
 * 将来拡張: allowedActions を richer な descriptor にする想定（今は kind union を使用）。
 * 1tap action が「何に紐づくか」を持てるようにする（additive・未使用）。
 */
export interface DeliveryActionDescriptor {
  readonly actionId: string;
  readonly kind: DeliveryAction;
  readonly label: string;
  readonly requiresConfirmation: boolean;
  readonly targetChangeSetId?: string;
  readonly targetProposalId?: string;
  readonly permissionBoundary?: boolean;
}

export type DeliveryReason =
  | "low_actionability"
  | "high_stakes"
  | "low_confidence"
  | "weak_source_trace"
  | "budget_exhausted"
  | "repeated_ignored"
  | "no_push_permission"
  | "daily_plan_quality_passed"
  | "final_check_required"
  | "time_critical"
  | "opportunity_nudge"
  | "low_receptivity"
  | "manual_mode"
  | "degraded_delivery";

export type Stakes = "low" | "medium" | "high" | "critical";

export interface NotificationBudget {
  readonly remaining: number; // 残り送信予算（trip/日 単位）
  readonly recentDismissals: number; // 直近 dismiss 数（疲労）
  readonly trust: number; // 0..1 信頼残高
}

export interface ReceptivityInput {
  readonly stakes: Stakes;
  /** 1tap の「行動」があるか（no action → push 不可。INV-1） */
  readonly actionable: boolean;
  readonly allowedActions: readonly DeliveryAction[];
  readonly confidence: number; // 0..1（判断/LSAT 確度）
  readonly sourceTraceStrength: number; // 0..1（traceConfidence。弱→降格。INV-4/23）
  readonly receptivity: number; // 0..1（今の受容性予測）
  readonly timeCritical: boolean; // 不可逆 miss が目前か
  readonly pushPermission: boolean;
  readonly budget: NotificationBudget;
  readonly degradationMode?: DegradationMode;
  readonly isMorningDailyPlan?: boolean;
  readonly dailyPlanQualityPassed?: boolean;
  readonly isFinalCheck?: boolean;
}

export interface DeliveryDecision {
  readonly mode: DeliveryMode;
  /** fallback 順（最有力→silent）。degradation 時の graceful 降格を表す。 */
  readonly chain: readonly DeliveryMode[];
  readonly reasons: readonly DeliveryReason[];
  readonly allowedActions: readonly DeliveryAction[];
}

// --- 閾値（初期 policy。将来 PRM で調整可能） ---
export const PUSH_CONFIDENCE_MIN = 0.6;
export const URGENT_CONFIDENCE_MIN = 0.5; // 高 miss コストは低めの確度でも許容
export const PUSH_RECEPTIVITY_MIN = 0.5;
export const SOURCE_TRACE_MIN = 0.5;
export const DISMISS_SUPPRESS_AT = 3;
export const TRUST_MIN = 0.3;

function isHighStakes(s: Stakes): boolean {
  return s === "high" || s === "critical";
}

interface Decision {
  readonly chain: DeliveryMode[];
  readonly reasons: DeliveryReason[];
}

function decide(a: ReceptivityInput): Decision {
  const reasons: DeliveryReason[] = [];
  const hasActions = a.allowedActions.length > 0;
  const highStakes = isHighStakes(a.stakes);

  // --- hard blocks（push を不可能にする条件。urgent もこれを越えない） ---
  const noAction = !a.actionable || !hasActions;
  if (noAction) reasons.push("low_actionability");

  const weakTrace = !(Number.isFinite(a.sourceTraceStrength) && a.sourceTraceStrength >= SOURCE_TRACE_MIN);
  if (weakTrace) reasons.push("weak_source_trace");

  const manual = a.degradationMode === "manual";
  if (manual) reasons.push("manual_mode");

  const channelDown = a.degradationMode === "no_push" || a.degradationMode === "no_network";
  const noPushPerm = !a.pushPermission || channelDown;
  if (noPushPerm) reasons.push("no_push_permission");

  const dismissed = a.budget.recentDismissals >= DISMISS_SUPPRESS_AT;
  if (dismissed) reasons.push("repeated_ignored");
  const budgetOut = a.budget.remaining <= 0 || a.budget.trust < TRUST_MIN;
  if (budgetOut && !dismissed) reasons.push("budget_exhausted");

  const pushBlocked = noAction || weakTrace || manual || noPushPerm || dismissed || budgetOut;

  const chain: DeliveryMode[] = [];

  if (!pushBlocked) {
    // low_battery: 高/重大 stakes のみ push 許可（低 stakes は抑制）
    const lowBattery = a.degradationMode === "low_battery";
    const batteryOk = !lowBattery || highStakes;
    if (lowBattery) reasons.push("degraded_delivery");

    const confOk = a.confidence >= PUSH_CONFIDENCE_MIN;
    const recepOk = a.receptivity >= PUSH_RECEPTIVITY_MIN;
    if (!recepOk) reasons.push("low_receptivity");
    if (!confOk) reasons.push("low_confidence");

    const urgent = a.timeCritical && highStakes && a.confidence >= URGENT_CONFIDENCE_MIN && a.actionable;
    const finalCheckUrgent = !!a.isFinalCheck && a.actionable && a.timeCritical;
    const morningPush = !!a.isMorningDailyPlan && !!a.dailyPlanQualityPassed && recepOk;
    const finalCheckPush = !!a.isFinalCheck && a.actionable;
    const standardPush = highStakes && confOk && recepOk;

    if (batteryOk) {
      if (urgent || finalCheckUrgent) {
        chain.push("urgent_push");
        if (highStakes) reasons.push("high_stakes");
        reasons.push(a.isFinalCheck ? "final_check_required" : "time_critical");
      } else if (morningPush || standardPush || finalCheckPush) {
        chain.push("push");
        if (morningPush) reasons.push("daily_plan_quality_passed");
        if (standardPush) reasons.push("high_stakes");
        if (finalCheckPush) reasons.push("final_check_required");
      }
    }
  } else if (
    // permission_prompt 乱発禁止（GPT 監査）: 権限が *唯一の* block で、かつ予算・受容性・
    // 価値説明(request_permission action)が揃う時のみ。budget/dismiss/noAction/weakTrace が
    // 原因の時は prompt しない（on_open で説明）。
    noPushPerm &&
    !manual &&
    !noAction &&
    !weakTrace &&
    !dismissed &&
    !budgetOut &&
    highStakes &&
    a.actionable &&
    a.allowedActions.includes("request_permission") &&
    a.receptivity >= PUSH_RECEPTIVITY_MIN
  ) {
    chain.push("permission_prompt");
  }

  // --- fallback（提案を失わない・必ず silent で締める） ---
  if (chain.length === 0 && hasActions) reasons.push("opportunity_nudge");
  if (hasActions && !chain.includes("on_open")) chain.push("on_open");
  if (!chain.includes("silent")) chain.push("silent");

  return { chain, reasons };
}

/** 配信モードの優先順（最有力→silent）。fallback chain。 */
export function rankDeliveryMode(input: ReceptivityInput): DeliveryMode[] {
  return decide(input).chain;
}

/**
 * Receptivity Gate 本体。決定済みの最適行動を *いつ・どう届けるか* を返す。
 * push/urgent_push は必ず allowedActions を伴う（no-action 通知禁止＝構造保証）。
 */
export function evaluateReceptivityGate(input: ReceptivityInput): DeliveryDecision {
  const { chain, reasons } = decide(input);
  return {
    mode: chain[0],
    chain,
    reasons,
    allowedActions: input.allowedActions,
  };
}
