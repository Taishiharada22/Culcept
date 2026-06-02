/**
 * Reality Control OS — PRM 学習イベントの契約（Slice 2B）
 *
 * 親設計: docs/aneurasync-live-plan-controller-golden-scenarios.md
 * 関連 Invariant:
 *   INV-12 学習閉包: 採用/編集/拒否/無視/遅延 を全て記録。**採用だけでなく拒否・無視・
 *          編集・Undo まで学ぶ**（ここが無いと秘書は育たない）。
 *   INV-4/23 Source Traceability: 提案系イベントは「なぜ」を sourceTraces で辿れる。
 *
 * これは「保存先」ではなく append-only な学習イベントの *契約 + validation*。
 * DB 保存・rollup・Best Action への接続は別スライス。
 *
 * 制約: 純関数 + 型のみ。I/O・DB・Date.now なし（時刻は呼び出し側が渡す）。
 */

import type { SourceTrace } from "./source-trace";
import type { ProtectionReason } from "./authority";

export type PrmEventKind =
  // 提案への反応（採用 / 編集 / 拒否 / 無視）— 負シグナルが学習の要
  | "proposal_shown"
  | "proposal_adopted"
  | "proposal_edited"
  | "proposal_rejected"
  | "proposal_ignored"
  | "undo_performed"
  // 予定の変更（change-set 由来）
  | "plan_item_added"
  | "plan_item_moved"
  | "plan_item_deleted"
  // 現実ドリフト
  | "deviation_detected"
  | "final_check_missed"
  | "departure_risk_detected"
  // 秘書の保護・根拠・権限・縮退
  | "recovery_core_protected"
  | "source_trace_assigned"
  | "permission_boundary_hit"
  | "degradation_mode_entered";

export type DegradationMode =
  | "normal"
  | "reduced_location"
  | "no_location"
  | "no_network"
  | "no_push"
  | "no_api"
  | "low_battery"
  | "low_confidence"
  | "manual";

export type DeviationKind = "still_at_origin" | "behind_pace" | "lingering" | "off_route" | "delay";

export type RiskLevel = "low" | "medium" | "high";

export type PermissionReason =
  | "others"
  | "reservation"
  | "payment"
  | "long_distance"
  | "destination_change"
  | "hard_anchor"
  | "import_locked";

/** PRM 学習イベント（append-only な契約） */
export interface PrmEvent {
  readonly kind: PrmEventKind;
  /** 時刻（基準時刻からの分 or epoch。呼び出し側が渡す） */
  readonly at: number;
  readonly itemId?: string;
  readonly changeSetId?: string;
  /** なぜ（source-trace 接続。提案系は必須） */
  readonly sourceTraces?: readonly SourceTrace[];
  readonly reason?: string;
  // --- kind 固有の補足 ---
  readonly editedFields?: readonly string[]; // proposal_edited
  readonly deviation?: DeviationKind; // deviation_detected
  readonly riskLevel?: RiskLevel; // departure_risk_detected
  readonly protectionReason?: ProtectionReason; // recovery_core_protected
  readonly permissionReason?: PermissionReason; // permission_boundary_hit
  readonly degradationMode?: DegradationMode; // degradation_mode_entered
}

/** 負シグナル（提案が通らなかった学習の核。GPT 強調） */
const NEGATIVE: ReadonlySet<PrmEventKind> = new Set<PrmEventKind>([
  "proposal_rejected",
  "proposal_ignored",
  "proposal_edited",
  "undo_performed",
]);

/** 正シグナル（採用） */
const POSITIVE: ReadonlySet<PrmEventKind> = new Set<PrmEventKind>(["proposal_adopted"]);

/** 現実ドリフトシグナル */
const DRIFT: ReadonlySet<PrmEventKind> = new Set<PrmEventKind>([
  "deviation_detected",
  "final_check_missed",
  "departure_risk_detected",
]);

/** 「なぜ」を必須とする kind（INV-4/23） */
const REQUIRES_SOURCE_TRACE: ReadonlySet<PrmEventKind> = new Set<PrmEventKind>([
  "proposal_shown",
  "proposal_adopted",
  "plan_item_added",
  "source_trace_assigned",
]);

export function isNegativeSignal(kind: PrmEventKind): boolean {
  return NEGATIVE.has(kind);
}

export function isPositiveSignal(kind: PrmEventKind): boolean {
  return POSITIVE.has(kind);
}

export function isDriftSignal(kind: PrmEventKind): boolean {
  return DRIFT.has(kind);
}

export function requiresSourceTrace(kind: PrmEventKind): boolean {
  return REQUIRES_SOURCE_TRACE.has(kind);
}

/**
 * PRM イベントの妥当性検証（契約チェック）。
 * kind 固有の必須フィールドと、提案系の source-trace 必須を確認する。
 */
export function validatePrmEvent(e: PrmEvent): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!Number.isFinite(e.at)) errors.push("at must be finite");

  const needItem = (): void => {
    if (!e.itemId) errors.push(`${e.kind}: itemId required`);
  };
  const needChangeSet = (): void => {
    if (!e.changeSetId) errors.push(`${e.kind}: changeSetId required`);
  };

  switch (e.kind) {
    case "proposal_edited":
      needItem();
      if (!e.editedFields || e.editedFields.length === 0) errors.push("proposal_edited: editedFields required");
      break;
    case "undo_performed":
      needChangeSet();
      break;
    case "plan_item_added":
    case "plan_item_moved":
    case "plan_item_deleted":
      needItem();
      needChangeSet();
      break;
    case "deviation_detected":
      if (!e.deviation) errors.push("deviation_detected: deviation required");
      break;
    case "departure_risk_detected":
      needItem();
      if (!e.riskLevel) errors.push("departure_risk_detected: riskLevel required");
      break;
    case "recovery_core_protected":
      needItem();
      if (!e.protectionReason) errors.push("recovery_core_protected: protectionReason required");
      break;
    case "permission_boundary_hit":
      if (!e.permissionReason) errors.push("permission_boundary_hit: permissionReason required");
      break;
    case "degradation_mode_entered":
      if (!e.degradationMode) errors.push("degradation_mode_entered: degradationMode required");
      break;
    case "source_trace_assigned":
      needItem();
      if (!e.sourceTraces || e.sourceTraces.length === 0) errors.push("source_trace_assigned: sourceTraces required");
      break;
    case "final_check_missed":
      needItem();
      break;
    default:
      // proposal_shown / adopted / rejected / ignored: itemId は任意（全日提案もある）
      break;
  }

  if (REQUIRES_SOURCE_TRACE.has(e.kind) && (!e.sourceTraces || e.sourceTraces.length === 0)) {
    errors.push(`${e.kind}: sourceTraces required (INV-4/23 — 根拠なき提案を学習しない)`);
  }

  return { ok: errors.length === 0, errors };
}
