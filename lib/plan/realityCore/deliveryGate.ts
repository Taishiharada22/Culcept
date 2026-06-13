/**
 * DeliveryGate — RJ2f 配信「可否」境界（pure core 限定・v0 は配信しない）
 *
 * 正本: docs/reality-notification-boundary-impl-design-rj2f-0.md（RJ2f-0/RJ2f-0A）/ docs/reality-judgment-surface-boundary-rj2-0.md
 *   （G5 DELIVERY・INV-11 active_prompt 非配信）/ CEO RJ2f 実装 GO（2026-06-14・identifier source-scan / deliveredNow
 *   リテラル false / in_app_passive_eligible 全条件 AND / active_prompt 常に no_delivery の 4 ガード付き）
 *
 * 思想（最も外向き・最も解放してはいけない層）: InterventionDecision を受けて「配信してよいか」だけを判定する。
 *   **v0 は実配信しない**（kill-switch）。RJ2 surface chain の終端。「届けない」を一級の出力にし、沈黙を設計の中心に置く。
 *
 * 中核安全則（CEO 4 ガード + RJ2f-0A）:
 *   ① identifier 衛生: 実配信系の語を runtime/exported/returned object に残さない（walker は allowlist key 方式で
 *      未知 field を弾く・配列構築は spread で `push` 呼び出しを避ける）。
 *   ② deliveredNow は**入力非依存のリテラル false**（条件分岐で変わらない・kill-switch）。
 *   ③ in_app_passive_eligible は**全条件 AND** のときのみ（ask_clarification ∧ passive_surface ∧ optIn ∧ budget>0）。
 *      それ以外は no_delivery。
 *   ④ active_prompt は**常に no_delivery 側**（将来上限であって配信命令でない・INV-11）。unknown ceiling も conservative。
 *   pull surface: in_app_passive は user がアプリを開いた時に表示してよい候補であって、通知/外部接触/dispatch ではない。
 *
 * 規律（CEO）: RJ2a–2e 5 ファイル不接触・既存 6 判断器不接触・ern/cs/mv/snapshot/identity 不接触（型 import のみ）。
 *   実配信なし・自動送信なし・外部連絡なし・recipient/payload 等を持たせない。pure（I/O・時刻 API・乱数なし）。
 */

import type { RealityInstant } from "./realityInstant";
import { fnv1a64Hex, canonicalSerialize } from "./graphIdentity";
import type { FeasibilityReason } from "./feasibilityJudgment";
import type { InterventionDecisionV0, DecisionKind, DeliveryModeCeiling } from "./interventionDecision";

export const DELIVERY_GATE_VERSION = 0;

/** 配信 channel（v0 runtime type を閉じる・push/chat/external は型に持たせない・RJ2f-0A §11.1） */
export type DeliveryChannelV0 = "none" | "in_app_passive";

/**
 * 配信可否（v0 は常に no_delivery）。
 * in_app_passive_eligible は **pull surface**（user がアプリを開いた時に表示してよい候補）であって通知/外部接触/dispatch でない。
 * deliveredNow=false と常に両立。
 */
export type DeliveryEligibilityV0 = "no_delivery" | "in_app_passive_eligible";

export interface DeliveryGateTrace {
  readonly schemaVersion: 0;
  readonly deliveryDecisionId: string;
  readonly deliveryGateVersion: number;
  readonly interventionDecisionId: string;
  readonly snapshotId: string;
  readonly evaluatedAtInstant: RealityInstant;
}

export interface DeliveryDecisionV0 {
  readonly schemaVersion: 0;
  readonly eligibility: DeliveryEligibilityV0; // v0 既定 no_delivery
  readonly channelCeiling: DeliveryChannelV0; // 将来上限（v0 最大 in_app_passive）。命令でない
  readonly deliveredNow: false; // **入力非依存のリテラル false**（kill-switch・CEO #2）
  readonly carriedDecisionKind: DecisionKind; // carry（監査・walker 自己完結用）
  readonly carriedDeliveryModeCeiling: DeliveryModeCeiling; // carry
  readonly optInAtEval: boolean; // 評価時の in-app surface opt-in（監査）
  readonly budgetAvailableAtEval: boolean; // 評価時の fatigue budget 有無（監査）
  readonly suppressedReasons: ReadonlyArray<FeasibilityReason>; // なぜ届けないか
  readonly requiresInAppSurfaceOptIn: boolean; // in-app passive 表示に opt-in 必須（notification opt-in ではない）
  readonly nextEligibleAfter: number | null; // observe 由来の再評価主観分
  readonly sourceRefs: {
    readonly interventionDecisionId: string;
    readonly snapshotId: string;
  };
  readonly trace: DeliveryGateTrace;
}

export interface DeliveryGateInput {
  readonly interventionDecision: InterventionDecisionV0;
  readonly userInAppSurfaceOptIn: boolean; // 明示 opt-in（既定 false）。**notification opt-in ではない**
  readonly recentSurfaceCount: number; // fatigue: 直近 in-app surface 数（外部入力・core は時刻を持たない）
  readonly surfaceBudgetRemaining: number; // fatigue: 残り surface 枠
}

function reason(code: string, targetNodeId: string | null, evidenceRefs: ReadonlyArray<string>): FeasibilityReason {
  return { code, targetNodeId, evidenceRefs };
}

/**
 * 配信可否のみを判定する（pure・**実配信しない**）。in_app_passive_eligible は全条件 AND のときのみ。
 */
export function evaluateDeliveryEligibility(input: DeliveryGateInput): DeliveryDecisionV0 {
  const dec = input.interventionDecision;
  const dk = dec.decisionKind;
  const ceiling = dec.deliveryModeCeiling;
  const optIn = input.userInAppSurfaceOptIn === true;
  const budgetOk = input.surfaceBudgetRemaining > 0;
  const targetNodeId = dec.targetNodeId;

  // ── in_app_passive_eligible は全条件 AND（CEO #3・狭く）。active_prompt/none/unknown ceiling は弾く（CEO #4）──
  const eligible = dk === "ask_clarification" && ceiling === "passive_surface" && optIn && budgetOk;

  const eligibility: DeliveryEligibilityV0 = eligible ? "in_app_passive_eligible" : "no_delivery";
  const channelCeiling: DeliveryChannelV0 = eligible ? "in_app_passive" : "none";

  // ── suppressedReasons（届けない理由・no_delivery 時は非空）──
  const suppressedReasons: ReadonlyArray<FeasibilityReason> = [
    ...(dk === "silent" || dk === "blocked" ? [reason("delivery_suppressed_silence", targetNodeId, [`decision:${dk}`])] : []),
    ...(dk === "observe" ? [reason("delivery_suppressed_observe", targetNodeId, ["decision:observe", "observation_not_delivered"])] : []),
    ...(dk === "internal_prepare" ? [reason("delivery_suppressed_internal_prepare", targetNodeId, ["decision:internal_prepare"])] : []),
    ...(dk === "ask_clarification" && !optIn ? [reason("delivery_suppressed_no_optin", targetNodeId, ["in_app_surface_opt_in_false"])] : []),
    ...(dk === "ask_clarification" && optIn && !budgetOk ? [reason("delivery_suppressed_fatigue", targetNodeId, ["surface_budget_exhausted"])] : []),
    ...(dk === "ask_clarification" && optIn && budgetOk && ceiling !== "passive_surface" ? [reason("delivery_suppressed_ceiling_conservative", targetNodeId, [`ceiling:${ceiling}`])] : []),
  ];

  const nextEligibleAfter = dk === "observe" ? dec.nextEvaluationAt : null;

  const deliveryDecisionId = `del:${fnv1a64Hex(canonicalSerialize({ d: dec.trace.decisionId, k: "delivery_gate", v: DELIVERY_GATE_VERSION }))}`;

  return {
    schemaVersion: 0,
    eligibility,
    channelCeiling,
    deliveredNow: false, // **常に false**（条件分岐なし・kill-switch）
    carriedDecisionKind: dk,
    carriedDeliveryModeCeiling: ceiling,
    optInAtEval: optIn,
    budgetAvailableAtEval: budgetOk,
    suppressedReasons,
    requiresInAppSurfaceOptIn: dk === "ask_clarification",
    nextEligibleAfter,
    sourceRefs: { interventionDecisionId: dec.trace.decisionId, snapshotId: dec.trace.snapshotId },
    trace: {
      schemaVersion: 0,
      deliveryDecisionId,
      deliveryGateVersion: DELIVERY_GATE_VERSION,
      interventionDecisionId: dec.trace.decisionId,
      snapshotId: dec.trace.snapshotId,
      evaluatedAtInstant: dec.trace.evaluatedAtInstant,
    },
  };
}

// ── 許可値 / 許可 key（allowlist 方式で未知 field を弾く・配信系語を spell しない）──
const ELIGIBILITY_VALUES: ReadonlySet<string> = new Set(["no_delivery", "in_app_passive_eligible"]);
const CHANNEL_VALUES: ReadonlySet<string> = new Set(["none", "in_app_passive"]);
const NO_DELIVERY_KINDS: ReadonlySet<string> = new Set(["silent", "observe", "internal_prepare", "blocked"]);
const DECISION_KEYS: ReadonlyArray<string> = [
  "schemaVersion",
  "eligibility",
  "channelCeiling",
  "deliveredNow",
  "carriedDecisionKind",
  "carriedDeliveryModeCeiling",
  "optInAtEval",
  "budgetAvailableAtEval",
  "suppressedReasons",
  "requiresInAppSurfaceOptIn",
  "nextEligibleAfter",
  "sourceRefs",
  "trace",
];
const SOURCE_KEYS: ReadonlyArray<string> = ["interventionDecisionId", "snapshotId"];

function keysExact(obj: Record<string, unknown>, allowed: ReadonlyArray<string>): boolean {
  const k = Object.keys(obj);
  if (k.length !== allowed.length) return false;
  const s = new Set(allowed);
  return k.every((x) => s.has(x));
}

/**
 * 配信可否の構造健全性検証（空=適合）。CEO 必須 12 項。allowlist key 方式で未知 field（配信経路）を弾く。
 * 配列は spread で構築（`push` 呼び出しを避け identifier 衛生を保つ）。
 */
export function deliveryGateViolations(d: DeliveryDecisionV0): string[] {
  const rec = d as unknown as Record<string, unknown>;
  const eligible = d.eligibility === "in_app_passive_eligible";
  const checks: ReadonlyArray<readonly [boolean, string]> = [
    // #1 kill-switch
    [d.deliveredNow !== false, "delivery: deliveredNow が false でない（v0 kill-switch 違反）"],
    // #2 eligibility 許可集合
    [!ELIGIBILITY_VALUES.has(d.eligibility), `delivery: eligibility 不正 "${d.eligibility}"`],
    // #3 channelCeiling 許可集合（push/chat/external は型に無いが構造 assert）
    [!CHANNEL_VALUES.has(d.channelCeiling), `delivery: channelCeiling 不正 "${d.channelCeiling}"`],
    // eligibility ↔ channelCeiling 整合
    [eligible && d.channelCeiling !== "in_app_passive", "delivery: eligible なのに channelCeiling が in_app_passive でない"],
    [!eligible && d.channelCeiling !== "none", "delivery: no_delivery なのに channelCeiling が none でない"],
    // #4 silent/observe/internal_prepare/blocked なのに no_delivery でない
    [NO_DELIVERY_KINDS.has(d.carriedDecisionKind) && eligible, `delivery: decisionKind "${d.carriedDecisionKind}" なのに eligible（no_delivery でない）`],
    // #5 ask_clarification + opt-in なし なのに no_delivery でない
    [d.carriedDecisionKind === "ask_clarification" && !d.optInAtEval && eligible, "delivery: ask_clarification + opt-in なし なのに eligible"],
    // #6 budget なし なのに eligible
    [!d.budgetAvailableAtEval && eligible, "delivery: budget exhausted なのに eligible（fatigue 違反）"],
    // #5' eligible なのに ask_clarification でない
    [eligible && d.carriedDecisionKind !== "ask_clarification", "delivery: eligible なのに ask_clarification でない"],
    // #7/#8 active_prompt / unsupported ceiling なのに eligible（passive_surface 以外で eligible は不可）
    [eligible && d.carriedDeliveryModeCeiling !== "passive_surface", `delivery: eligible なのに ceiling が "${d.carriedDeliveryModeCeiling}"（active_prompt/unsupported は no_delivery）`],
    // #9 未知 field（配信経路）が存在 — allowlist key 完全一致で弾く
    [!keysExact(rec, DECISION_KEYS), `delivery: top-level key が許可集合と不一致（${Object.keys(rec).join(",")}）`],
    [!keysExact(d.sourceRefs as unknown as Record<string, unknown>, SOURCE_KEYS), "delivery: sourceRefs key が許可集合と不一致"],
    // #11 sourceRefs に最低限の id
    [!d.sourceRefs.interventionDecisionId || !d.sourceRefs.snapshotId, "delivery: sourceRefs に interventionDecisionId / snapshotId が無い"],
    // #10 no_delivery なのに理由なし
    [!eligible && d.suppressedReasons.length === 0, "delivery: no_delivery なのに suppressedReasons が空"],
    // eligible なのに理由がある
    [eligible && d.suppressedReasons.length > 0, "delivery: eligible なのに suppressedReasons が非空"],
  ];

  const structural = checks.filter(([c]) => c).map(([, m]) => m);
  const evMissing = d.suppressedReasons.filter((r) => r.evidenceRefs.length === 0).map((r) => `delivery: suppressedReason "${r.code}" の evidenceRefs 欠落`);
  return [...structural, ...evMissing];
}
