/**
 * CommitmentSignalV0 — 予定を「どれだけ守るべきか / 崩すと痛いか」で評価（RC2a-3）
 *
 * 正本: docs/reality-graph-contract-hardening-rg06.md §7 / docs/reality-judgment-engine-rj0.md §7 /
 *       docs/reality-department-matrix.md（Context 部署）
 *
 * Department: **Context 部署の最初の実体化**（MovementReality=Mobility と同型の独立 compile）。
 *   owning=Context / consulted=Plan,Memory / blocking=Permission / targetNodeId=ern:<date>:<anchorId>。
 *   runtime Department object は作らない（docs 責務契約のみ）。
 *
 * commitment ≠ permission（GPT 不変条件・最重要）:
 *  - 本型は permissionLevel / actionBoundary を**持たない**。それは ern.permissionLevel / Action 境界の責務
 *  - high commitment ≠ 自動変更してよい / high commitment ≠ 提案禁止 /
 *    high commitment + permission blocked = 自動変更不可。commitment は「痛みの重み」、permission は「可否」
 *
 * 規律:
 *  - pure（I/O・DB・localStorage・時刻 API・乱数・LLM なし）。新規 read / 保存 / UI 接続ゼロ
 *  - **unknown を low 扱いしない**（信号が無い時 socialWeight/changeCost は null = 欠測。0 や low を捏造しない）
 *  - **title 文字列だけで high commitment を断定しない**（verb は kernel 由来の粗分類ゆえ低確信≤0.5 でのみ使用）
 *  - 構造化 signal（companions[]・sensitiveCategory・rigidity・latencyTolerance）は高確信
 *  - otherPeople/reservation/work が不明 → 保守側（downstream は unknown を「あり得る」として扱う）
 */

import type { DayGraph, EventNode } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { AnchorRigidity } from "@/lib/plan/external-anchor";
import type { ProtectionReason } from "@/lib/plan/reality/authority";
import {
  heuristicAttribute,
  inferredAttribute,
  realityAttributeViolations,
  unknownAttribute,
  type RealityAttribute,
} from "./realityAttribute";

/** derive version（RC2a-1b §4 — manifest 一致 fixture） */
export const COMMITMENT_SIGNAL_COMPILE_VERSION = 0;

const SUBJECTIVE_DAY_START_HOUR = 5;

function subjectiveDateOf(date: string, startHHMM: string): string {
  const h = Number(startHHMM.slice(0, 2));
  if (Number.isNaN(h) || h >= SUBJECTIVE_DAY_START_HOUR) return date;
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface CommitmentSignalV0 {
  readonly schemaVersion: 0;
  readonly commitmentSignalId: string; // cs:<date>:<anchorId>
  readonly targetNodeId: string; // ern:<date>:<anchorId>（join key）
  readonly date: string;
  readonly subjectiveDate: string;
  readonly sourceRefs: {
    readonly anchorId: string;
    readonly dayGraphNodeId: string;
    readonly dayGraphSnapshotId: string;
  };
  /** 事実値（DayGraph 計算済み・裸でよい — ern の verb/timeWindow と同じ扱い） */
  readonly rigidity: AnchorRigidity;
  // ── 全て RealityAttribute（field-level provenance） ──
  /** 守る理由（複合・既存 ProtectionReason 語彙）。空配列は「強い保護理由が見つからない」（≠ commitment 低 confirmed） */
  readonly protectionReasons: RealityAttribute<ProtectionReason[]>;
  readonly otherPeoplePossible: RealityAttribute<boolean>;
  readonly workOrShiftPossible: RealityAttribute<boolean>;
  readonly reservationOrPaymentPossible: RealityAttribute<boolean>;
  readonly fixedStart: RealityAttribute<boolean>;
  /** v0 は unknown（TaskRealityNode/Deadline 未実装 — 値供給は RJ4/Task slice） */
  readonly deadlineOrCarryoverImpact: RealityAttribute<boolean>;
  /** 0-1 heuristic（≤0.35 confidence・debugOnly）。otherPeople 不明時は unknown（low を捏造しない） */
  readonly socialWeight: RealityAttribute<number>;
  /** 0-1 heuristic（≤0.35・debugOnly）。崩す難易度。不明入力時は unknown */
  readonly changeCost: RealityAttribute<number>;
  readonly missingInputs: ReadonlyArray<string>;
  readonly evidenceRefs: ReadonlyArray<string>;
}

export interface CompileCommitmentSignalInput {
  date: string;
  graph: DayGraph;
  anchors: ReadonlyArray<ExternalAnchor>;
}

function compileOne(
  node: EventNode,
  input: CompileCommitmentSignalInput,
  anchorsById: ReadonlyMap<string, ExternalAnchor>,
  laterStrictExists: boolean,
): CommitmentSignalV0 {
  const anchor = anchorsById.get(node.anchorId);
  const companions = anchor?.companions;
  const hasCompanions = companions !== undefined && companions.length > 0;
  const rigidity = node.rigidity;
  const lt = node.latencyTolerance;
  const verb = node.verb;
  const sensitive = node.sensitive;

  // ── otherPeoplePossible: 構造化（companions）= 高確信 / verb（title 由来粗分類）= 低確信 / 無信号 = unknown ──
  let otherPeoplePossible: RealityAttribute<boolean>;
  if (hasCompanions) {
    otherPeoplePossible = inferredAttribute(true, 0.7, ["companions_present"], { displayPolicy: "visible" });
  } else if (verb === "social" || verb === "work") {
    otherPeoplePossible = inferredAttribute(true, 0.5, ["social_or_work_verb_weak"], { displayPolicy: "debugOnly" });
  } else {
    // unknown（low ではない — 「他人が関わるか不明」。downstream は保守的に扱う）
    otherPeoplePossible = unknownAttribute<boolean>({ evidenceRefs: ["no_companion_or_social_signal"], displayPolicy: "hidden" });
  }

  // ── workOrShiftPossible: verb work（低確信）/ 無信号 unknown（day-level shift は別経路） ──
  const workOrShiftPossible: RealityAttribute<boolean> =
    verb === "work"
      ? inferredAttribute(true, 0.5, ["work_verb_weak"], { displayPolicy: "debugOnly" })
      : unknownAttribute<boolean>({ evidenceRefs: ["no_work_signal"], displayPolicy: "hidden" });

  // ── reservationOrPaymentPossible: sensitive medical/legal/exam（予約性高い・構造化）/ 無信号 unknown ──
  const sensitiveCat = node.sensitiveCategory;
  const reservationLikely = sensitiveCat === "medical" || sensitiveCat === "legal" || sensitiveCat === "exam";
  const reservationOrPaymentPossible: RealityAttribute<boolean> = reservationLikely
    ? inferredAttribute(true, 0.5, ["sensitive_reservation_likely"], { displayPolicy: "debugOnly" })
    : unknownAttribute<boolean>({ evidenceRefs: ["no_reservation_signal"], displayPolicy: "hidden" });

  // ── fixedStart: rigidity hard / latencyTolerance strict|tight = 高確信 / soft+flexible = 低確信 false ──
  let fixedStart: RealityAttribute<boolean>;
  if (rigidity === "hard") {
    fixedStart = inferredAttribute(true, 0.8, ["rigidity_hard"], { displayPolicy: "visible", status: "confirmed", source: "known_from_user" });
  } else if (lt === "strict" || lt === "tight") {
    fixedStart = inferredAttribute(true, 0.7, ["latency_" + lt], { displayPolicy: "visible" });
  } else {
    fixedStart = inferredAttribute(false, 0.5, ["rigidity_soft_flexible"], { displayPolicy: "debugOnly" });
  }

  // ── deadlineOrCarryoverImpact: v0 unknown（task/deadline 未実装） ──
  const deadlineOrCarryoverImpact = unknownAttribute<boolean>({ evidenceRefs: [], displayPolicy: "hidden" });

  // ── protectionReasons（既存 ProtectionReason・複合） ──
  const reasons: ProtectionReason[] = [];
  const reasonEvidence: string[] = [];
  if (otherPeoplePossible.value === true || reservationOrPaymentPossible.value === true || sensitive) {
    reasons.push("hard_external");
    reasonEvidence.push(sensitive ? "sensitive_external" : "others_or_reservation");
  }
  if (verb === "rest" || verb === "eat") {
    reasons.push("recovery_core");
    reasonEvidence.push("recovery_verb");
  }
  if (laterStrictExists) {
    reasons.push("cascade_guard");
    reasonEvidence.push("strict_event_follows");
  }
  const protectionReasons: RealityAttribute<ProtectionReason[]> =
    reasons.length > 0
      ? inferredAttribute(reasons, 0.6, reasonEvidence, { displayPolicy: "visible" })
      : // 空 = 「強い保護理由が見つからない」。confirmed low ではない（debugOnly・missingInput で弱さを明示）
        inferredAttribute([], 0.3, ["no_strong_protection_signal"], { displayPolicy: "debugOnly" });

  // ── socialWeight: otherPeople 不明時は unknown（low を捏造しない — 「unknown を軽く見ない」の実装） ──
  let socialWeight: RealityAttribute<number>;
  if (otherPeoplePossible.value === true) {
    socialWeight = heuristicAttribute(0.7, 0.3, ["other_people_present"]);
  } else if (otherPeoplePossible.value === false) {
    socialWeight = heuristicAttribute(0.2, 0.3, ["solo_likely"]);
  } else {
    socialWeight = unknownAttribute<number>({ evidenceRefs: ["other_people_unknown"], displayPolicy: "hidden" });
  }

  // ── changeCost: hard / otherPeople / reservation で高。不明入力が支配的なら unknown ──
  const highCost = rigidity === "hard" || otherPeoplePossible.value === true || reservationOrPaymentPossible.value === true;
  const lowCost = rigidity === "soft" && otherPeoplePossible.value === false;
  let changeCost: RealityAttribute<number>;
  if (highCost) {
    changeCost = heuristicAttribute(0.7, 0.3, ["hard_or_others_or_reservation"]);
  } else if (lowCost) {
    changeCost = heuristicAttribute(0.25, 0.3, ["soft_solo"]);
  } else {
    changeCost = unknownAttribute<number>({ evidenceRefs: ["change_cost_inputs_unknown"], displayPolicy: "hidden" });
  }

  // ── missingInputs（弱さの明示） ──
  const missingInputs: string[] = [];
  if (otherPeoplePossible.status === "unknown") missingInputs.push("other_people_unknown");
  if (reservationOrPaymentPossible.status === "unknown") missingInputs.push("reservation_payment_unknown");
  missingInputs.push("deadline_model_pending"); // task/deadline 未実装
  if (reasons.length === 0) missingInputs.push("commitment_signal_weak");

  return {
    schemaVersion: 0,
    commitmentSignalId: `cs:${input.date}:${node.anchorId}`,
    targetNodeId: `ern:${input.date}:${node.anchorId}`,
    date: input.date,
    subjectiveDate: subjectiveDateOf(input.date, node.startTime),
    sourceRefs: { anchorId: node.anchorId, dayGraphNodeId: node.id, dayGraphSnapshotId: input.graph.snapshotId },
    rigidity,
    protectionReasons,
    otherPeoplePossible,
    workOrShiftPossible,
    reservationOrPaymentPossible,
    fixedStart,
    deadlineOrCarryoverImpact,
    socialWeight,
    changeCost,
    missingInputs,
    evidenceRefs: [...new Set([...reasonEvidence, "rigidity_" + rigidity])],
  };
}

export function compileCommitmentSignals(input: CompileCommitmentSignalInput): CommitmentSignalV0[] {
  const anchorsById = new Map(input.anchors.map((a) => [a.id, a]));
  const eventNodes = input.graph.nodes.filter((n): n is EventNode => n.kind === "event");
  return eventNodes.map((node) => {
    const laterStrictExists = eventNodes.some(
      (o) =>
        o.id !== node.id &&
        o.startTime > node.startTime &&
        (o.latencyTolerance === "strict" || o.latencyTolerance === "tight"),
    );
    return compileOne(node, input, anchorsById, laterStrictExists);
  });
}

const CS_ATTRIBUTE_KEYS = [
  "protectionReasons",
  "otherPeoplePossible",
  "workOrShiftPossible",
  "reservationOrPaymentPossible",
  "fixedStart",
  "deadlineOrCarryoverImpact",
  "socialWeight",
  "changeCost",
] as const;

export function commitmentSignalViolations(cs: CommitmentSignalV0): string[] {
  const out: string[] = [];
  for (const key of CS_ATTRIBUTE_KEYS) {
    out.push(...realityAttributeViolations(`${cs.commitmentSignalId}.${key}`, cs[key]));
  }
  // commitment ≠ permission: permission 系 field を持たないことを構造で保証（型に無いので runtime 検証は不要）
  // unknown を low 扱いしない: otherPeople unknown のとき socialWeight も unknown であること
  if (cs.otherPeoplePossible.status === "unknown" && cs.socialWeight.status !== "unknown") {
    out.push(`${cs.commitmentSignalId}: otherPeople unknown なのに socialWeight が unknown でない（low 捏造の疑い）`);
  }
  return out;
}
