/**
 * Reality Control OS — A-1 Apply Precondition Checker（**pure・no-apply・no-write**・barrel 非 export）
 *
 * 設計: docs/reality-apply-readiness-audit.md（§3 G1–G7 / §5 A-1）
 *
 * 役割: `ChangeSet draft` を **実 apply する前**に、apply 可能性を **1 関数で判定**する pure checker。
 *   Apply Readiness Audit が固定した不足条件（stale / conflict / permission 再評価 / undoability /
 *   idempotency / confirmation / provenance）を **判定だけ**行う。**書かない・適用しない・配送しない**。
 *
 * 厳守（最重要）:
 *   - **apply の許可は `propose` ではない**。permission は **apply 用 ActionKind（adjust_plan/draft 等）で再評価**する。
 *   - **高リスクは never auto can_apply**（confirm_required か blocked）。**文脈不足は止める**。
 *   - **判定材料が不足したら捏造せず insufficient_context**（freshness/idempotency snapshot 欠落）。
 *   - 出力は **redacted**（raw/PII/title/location/seedRef を出さない）・blocker は **安定コード**・pure（Date.now/IO/DB なし・nowMs は caller）。
 */

import type { ChangeOp, ChangeSet } from "../change-set";
import { validateUndoability } from "../change-set";
import type { WorldState } from "../world-state/world-state";
import { assessWorldState } from "../world-state/world-state-readiness";
import { evaluatePermission } from "./permission-gate";
import { classifyRisk, type ActionKind, type PermissionLevel, type RiskFlag } from "./permission-model";

/** draft が前提とした状態と live のズレ / 衝突 / 権限 / 可逆性 / 確認 を集約した最終判定。 */
export type ApplyPreconditionVerdict =
  | "can_apply"
  | "confirm_required"
  | "blocked"
  | "stale"
  | "conflict"
  | "insufficient_context";

/** idempotency 判定用の applied-set スナップショット（**ledger 実装はまだしない**・判定 interface のみ）。 */
export interface AppliedSetSnapshot {
  readonly appliedChangeSetIds: readonly string[];
}

export interface ApplyPreconditionInput {
  /** apply 対象の ChangeSet draft（full・envelope summary ではない）。 */
  readonly draft: ChangeSet;
  /** 現在の現実状態（apply 直前に再取得した版）。 */
  readonly liveWorldState: WorldState;
  /** 実 permission level。 */
  readonly level: PermissionLevel;
  /** **apply 用 ActionKind**（propose ではない・adjust_plan/draft 等）。 */
  readonly applyAction: ActionKind;
  /** apply の risk flags（任意・既定 []）。 */
  readonly flags?: readonly RiskFlag[];
  /** draft 生成時の WorldState signature（stale 判定用・欠落→判定不能）。 */
  readonly baseVersion?: string;
  /** draft 生成時刻（ms・stale 判定用）。 */
  readonly computedAtMs?: number;
  /** 現在時刻（ms・**pure: caller が渡す**・stale 判定用）。 */
  readonly nowMs?: number;
  /** idempotency snapshot（欠落→判定不能 insufficient_context）。 */
  readonly appliedSnapshot?: AppliedSetSnapshot;
  /** 明示確認の状態（confirm_required 解消用）。 */
  readonly confirmation?: { readonly confirmed: boolean };
}

export interface ApplyPreconditionResult {
  readonly canApply: boolean;
  readonly verdict: ApplyPreconditionVerdict;
  /** apply を妨げる安定コード（redacted・raw を含まない）。 */
  readonly blockers: readonly string[];
  /** 非ブロックの注意（redacted）。 */
  readonly warnings: readonly string[];
  /** 確認が必要か（confirm_required / 高リスク / 確認 flag / immovable 衝突）。 */
  readonly requiredConfirmation?: boolean;
}

/** draft が古くなったとみなす最大経過（15 分）。 */
export const MAX_DRAFT_AGE_MS = 15 * 60 * 1000;

/** 確認 flag（他人/予約/購入/個人情報/連絡）。いずれも high-risk だが明示的に確認必須。 */
const CONFIRM_FLAGS: ReadonlySet<RiskFlag> = new Set<RiskFlag>([
  "involves_others",
  "confirms_booking",
  "purchase",
  "personal_info",
  "sends_message",
]);

/**
 * apply 用の WorldState signature（**stale 判定の基準**）。
 *   schedule（開始/終了/protection）+ windows（開始/終了）+ date のみ。**label/title は含めない**（PII 非搬送・deterministic）。
 */
export function worldStateApplySignature(ws: WorldState): string {
  const sched = ws.todaySchedule
    .map((c) => `${c.startMinute}-${c.endMinute}:${c.protection ?? ""}`)
    .join(",");
  const win = ws.availableWindows.map((w) => `${w.startMinute}-${w.endMinute}`).join(",");
  return `${ws.date}|s=${sched}|w=${win}`;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** op の主対象スナップショット（remove は before・他は after）。 */
function subject(op: ChangeOp): { startMin?: number; endMin?: number } {
  return op.kind === "remove" ? op.before : op.after;
}

/**
 * live 状態との衝突検出。add/update の対象 window が:
 *   - 既存 hardConstraint と重なる → occupied（immovable=protection hard_external なら強い衝突）
 *   - どの availableWindow にも収まらない → occupied（窓が消えた）
 */
function detectConflicts(draft: ChangeSet, ws: WorldState): { occupied: boolean; immovable: boolean } {
  let occupied = false;
  let immovable = false;
  for (const op of draft.ops) {
    if (op.kind === "remove") continue; // remove は対象削除＝window 占有を増やさない
    const s = subject(op);
    if (typeof s.startMin !== "number" || typeof s.endMin !== "number") continue; // 不完全は undoability 側で捕捉
    // 既存固定予定と重なる？
    for (const c of ws.todaySchedule) {
      if (overlaps(s.startMin, s.endMin, c.startMinute, c.endMinute)) {
        occupied = true;
        if (c.protection === "hard_external") immovable = true;
      }
    }
    // いずれかの available window に収まる？収まらなければ窓が消えている。
    const fits = ws.availableWindows.some((w) => s.startMin! >= w.startMinute && s.endMin! <= w.endMinute);
    if (!fits) occupied = true;
  }
  return { occupied, immovable };
}

/**
 * A-1: apply 可能性を 1 関数で判定（**pure・判定のみ・apply しない**）。
 *   verdict 優先順位: insufficient_context > stale > conflict > blocked > confirm_required > can_apply。
 */
export function evaluateApplyPrecondition(input: ApplyPreconditionInput): ApplyPreconditionResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const flags = input.flags ?? [];
  const draft = input.draft;

  if (draft.ops.length === 0) warnings.push("empty_draft");

  // ── 判定材料の充足（欠落→捏造せず insufficient_context）──
  const hasFreshness = input.baseVersion != null && input.computedAtMs != null && input.nowMs != null;
  if (!hasFreshness) blockers.push("missing_freshness_inputs");
  if (!input.appliedSnapshot) blockers.push("missing_idempotency_snapshot");

  // ── live readiness（文脈不足は止める）──
  const readiness = assessWorldState(input.liveWorldState);
  const contextComplete = readiness.overall !== "insufficient";
  if (!contextComplete) blockers.push("live_context_insufficient");

  // ── G1 provenance（sourceTraces 空＝apply 不可）──
  if (draft.sourceTraces.length === 0) blockers.push("provenance_missing");

  // ── undoability（INV-24・既存 validateUndoability を参照）──
  const undo = validateUndoability(draft);
  if (!undo.ok) blockers.push("undo_incomplete");

  // ── G4 idempotency（snapshot があり既適用なら二重 apply 不可）──
  if (input.appliedSnapshot && input.appliedSnapshot.appliedChangeSetIds.includes(draft.id)) {
    blockers.push("already_applied");
  }

  // ── G3 stale（freshness 材料が揃う時のみ判定）──
  let stale = false;
  if (hasFreshness) {
    if (worldStateApplySignature(input.liveWorldState) !== input.baseVersion) {
      stale = true;
      blockers.push("stale_base_version");
    }
    if (input.nowMs! - input.computedAtMs! > MAX_DRAFT_AGE_MS) {
      stale = true;
      blockers.push("stale_draft_age");
    }
  }

  // ── G5 conflict ──
  const conflict = detectConflicts(draft, input.liveWorldState);
  if (conflict.occupied) blockers.push("conflict_window_occupied");
  if (conflict.immovable) blockers.push("conflict_immovable");

  // ── G6 permission 再評価（**propose ではなく apply ActionKind**）──
  const perm = evaluatePermission({
    action: input.applyAction,
    flags,
    level: input.level,
    governance: null, // add の draft（既存 item 非接触）。既存接触衝突は detectConflicts 側で捕捉。
    contextComplete,
  });
  if (perm.verdict === "blocked") blockers.push("permission_blocked");

  const risk = classifyRisk(input.applyAction, flags);

  // ── G7 confirmation 要否 ──
  const requiredConfirmation =
    perm.verdict === "confirm_required" ||
    risk === "high" ||
    flags.some((f) => CONFIRM_FLAGS.has(f)) ||
    conflict.immovable;
  const confirmed = input.confirmation?.confirmed === true;

  // ── verdict 決定（優先順位）──
  const insufficient =
    blockers.includes("missing_freshness_inputs") ||
    blockers.includes("missing_idempotency_snapshot") ||
    blockers.includes("live_context_insufficient") ||
    perm.verdict === "insufficient_context";
  const hardBlocked =
    blockers.includes("permission_blocked") ||
    blockers.includes("undo_incomplete") ||
    blockers.includes("provenance_missing") ||
    blockers.includes("already_applied");

  let verdict: ApplyPreconditionVerdict;
  if (insufficient) verdict = "insufficient_context";
  else if (stale) verdict = "stale";
  else if (conflict.occupied || conflict.immovable) verdict = "conflict";
  else if (hardBlocked) verdict = "blocked";
  else if (risk === "high") verdict = "confirm_required"; // 高リスクは never auto can_apply
  else if (requiredConfirmation && !confirmed) verdict = "confirm_required";
  else verdict = "can_apply";

  return {
    canApply: verdict === "can_apply",
    verdict,
    blockers,
    warnings,
    requiredConfirmation,
  };
}
