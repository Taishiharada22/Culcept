/**
 * Reality Control OS — PRM 学習イベントの契約（Slice 2B + ハードニング）
 *
 * 親設計: docs/aneurasync-live-plan-controller-golden-scenarios.md
 * 関連 Invariant:
 *   INV-12 学習閉包: 採用/編集/拒否/無視/遅延/undo を記録。**採用だけでなく拒否・無視・
 *          編集・Undo まで学ぶ**。ただし編集=微調整の成功、undo=誤タップ/外部要因 もあるため
 *          単純 negative にしない（signalPolarity で表現）。
 *   INV-4/23 Source Traceability: 提案系は「なぜ」を sourceTraces で辿れる。
 *
 * これは「保存先」ではなく append-only な学習イベントの *契約 + validation + dedupe*。
 *
 * プライバシー（重要・将来 DB 保存される行動ログ）:
 *   raw location / raw user text / raw notification body / 第三者名 を持たない。
 *   参照 ID・分類・差分（field 名）・source trace・**抽象化された** reason のみ。
 *
 * 制約: 純関数 + 型のみ。I/O・DB・Date.now・乱数なし（時刻・eventId は呼び出し側が渡す）。
 */

import type { SourceTrace } from "./source-trace";
import type { ProtectionReason } from "./authority";

export type PrmEventKind =
  | "proposal_shown"
  | "proposal_adopted"
  | "proposal_edited"
  | "proposal_rejected"
  | "proposal_ignored"
  | "undo_performed"
  | "plan_item_added"
  | "plan_item_moved"
  | "plan_item_deleted"
  | "deviation_detected"
  | "final_check_missed"
  | "departure_risk_detected"
  | "recovery_core_protected"
  | "source_trace_assigned"
  | "permission_boundary_hit"
  | "degradation_mode_entered";

export type SignalPolarity = "positive" | "negative" | "mixed" | "unknown";

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

/** 無視の意味（見て無視 vs 届かず無視 は学習上まったく違う） */
export type IgnoredReason =
  | "unknown"
  | "seen_no_action" // 見たが行動なし（強い負シグナル）
  | "delivered_no_action" // 届いたが反応なし（弱い）
  | "expired" // ウィンドウ期限切れ
  | "push_unavailable"; // そもそも届けられない（負シグナルにしない）

/** PRM 学習イベント（append-only な契約） */
export interface PrmEvent {
  /** 一意 id（呼び出し側が採番。dedupe の最終手段） */
  readonly eventId: string;
  readonly kind: PrmEventKind;
  /** 事象発生時刻（基準時刻からの分 or epoch。呼び出し側が渡す） */
  readonly occurredAt: number;
  /** 記録時刻（任意） */
  readonly recordedAt?: number;
  /** 二重学習防止キー（未指定なら computeDedupeKey で導出） */
  readonly dedupeKey?: string;
  // --- 参照 ---
  readonly itemId?: string;
  readonly proposalId?: string;
  readonly changeSetId?: string;
  /** なぜ（source-trace 接続。提案系は必須） */
  readonly sourceTraces?: readonly SourceTrace[];
  /** 抽象化された理由（raw 本文を入れない） */
  readonly reason?: string;
  /** 学習方向（未指定なら kind 既定）。edited=mixed, undo=unknown を固定しない */
  readonly signalPolarity?: SignalPolarity;
  // --- kind 固有 ---
  readonly editedFields?: readonly string[]; // proposal_edited（field 名のみ・値は持たない）
  readonly ignoredReason?: IgnoredReason; // proposal_ignored
  readonly deviation?: DeviationKind; // deviation_detected
  readonly riskLevel?: RiskLevel; // departure_risk_detected
  readonly protectionReason?: ProtectionReason; // recovery_core_protected
  readonly permissionReason?: PermissionReason; // permission_boundary_hit
  readonly degradationMode?: DegradationMode; // degradation_mode_entered
}

/** kind の既定の学習方向（edited=mixed, undo=unknown ＝ 単純 negative にしない） */
export function defaultPolarity(kind: PrmEventKind): SignalPolarity {
  switch (kind) {
    case "proposal_adopted":
    case "recovery_core_protected":
      return "positive";
    case "proposal_rejected":
    case "proposal_ignored":
    case "deviation_detected":
    case "final_check_missed":
    case "departure_risk_detected":
      return "negative";
    case "proposal_edited":
      return "mixed"; // 微調整による学習成功でもある
    case "undo_performed":
      return "unknown"; // 誤タップ・外部要因・気分変更の可能性
    default:
      return "unknown";
  }
}

/** 実効の学習方向（明示 > kind 既定） */
export function effectivePolarity(e: PrmEvent): SignalPolarity {
  return e.signalPolarity ?? defaultPolarity(e.kind);
}

export function isNegativeSignal(e: PrmEvent): boolean {
  return effectivePolarity(e) === "negative";
}

export function isPositiveSignal(e: PrmEvent): boolean {
  return effectivePolarity(e) === "positive";
}

const DRIFT: ReadonlySet<PrmEventKind> = new Set<PrmEventKind>([
  "deviation_detected",
  "final_check_missed",
  "departure_risk_detected",
]);

export function isDriftSignal(kind: PrmEventKind): boolean {
  return DRIFT.has(kind);
}

const REQUIRES_SOURCE_TRACE: ReadonlySet<PrmEventKind> = new Set<PrmEventKind>([
  "proposal_shown",
  "proposal_adopted",
  "plan_item_added",
  "source_trace_assigned",
]);

export function requiresSourceTrace(kind: PrmEventKind): boolean {
  return REQUIRES_SOURCE_TRACE.has(kind);
}

/**
 * dedupe キーを導出（同じ通知・proposal・undo を二重学習しない）。
 * 明示 dedupeKey > kind 別の自然キー > eventId。
 */
export function computeDedupeKey(e: PrmEvent): string {
  if (e.dedupeKey) return e.dedupeKey;
  switch (e.kind) {
    case "proposal_shown":
    case "proposal_adopted":
    case "proposal_edited":
    case "proposal_rejected":
    case "proposal_ignored":
    case "source_trace_assigned":
      return `${e.kind}:${e.proposalId ?? e.itemId ?? e.eventId}`;
    case "undo_performed":
    case "plan_item_added":
    case "plan_item_moved":
    case "plan_item_deleted":
      return `${e.kind}:${e.changeSetId ?? e.itemId ?? e.eventId}`;
    default:
      return `${e.kind}:${e.itemId ?? ""}:${e.occurredAt}`;
  }
}

/** dedupeKey ごとに最初の 1 件を残す（過学習防止）。順序保持。 */
export function dedupeEvents(events: readonly PrmEvent[]): PrmEvent[] {
  const seen = new Set<string>();
  const out: PrmEvent[] = [];
  for (const e of events) {
    const key = computeDedupeKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/**
 * PRM イベントの妥当性検証（契約チェック）。
 * eventId・occurredAt・kind 固有必須・提案系の source-trace 必須を確認。
 */
export function validatePrmEvent(e: PrmEvent): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof e.eventId !== "string" || e.eventId.length === 0) errors.push("eventId required");
  if (!Number.isFinite(e.occurredAt)) errors.push("occurredAt must be finite");

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
      // proposal_shown / adopted / rejected / ignored: itemId 任意（全日提案もある）
      // proposal_ignored の ignoredReason は任意（既定 unknown）
      break;
  }

  if (REQUIRES_SOURCE_TRACE.has(e.kind) && (!e.sourceTraces || e.sourceTraces.length === 0)) {
    errors.push(`${e.kind}: sourceTraces required (INV-4/23 — 根拠なき提案を学習しない)`);
  }

  return { ok: errors.length === 0, errors };
}
