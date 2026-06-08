/**
 * Reality Control OS — A1-7-35 Tendency Feedback Core（**pure・no-DB・injected repos**・barrel 非 export）
 *
 * 設計: docs/prm-confirm-correct-loop-design.md（A1-7-35）
 *
 * 役割: operator の confirm/correct/reject を実行する testable core。**server 再読込済 M3 entry（id 付き）** を受け取り（client snapshot 不信）、
 *   tendencyKey で対象を解決し、**可逆**に記録する:
 *   - confirm → user M2 decision(approve) + 新 M3 version(supersedes old) + old retracted。
 *   - correct → 既存 M3 を user_correction で UPDATE（**破壊削除なし**）。
 *   - reject  → user M2 decision(reject) + M3 retracted（retracted_at・可逆）。
 *   **partial failure を隠さず** redacted に明示。
 *
 * 厳守: client snapshot 不信 / entry 無→fail-closed / 破壊削除なし(retracted/supersedes 可逆) / certainty no high(snapshot≤tentative) /
 *   raw/personality を作らない(enum code のみ・**free-text なし**) / id/raw を return に出さない / pure・Date.now なし。
 */

import {
  tendencyKey,
  type PrmModelEntryFeedbackEntry,
} from "./prm-model-entry-read";
import { decisionEffect, type ReviewDecisionKind } from "./review-flow-contract";
import type { ReviewDecisionRecord, ReviewedProposalSnapshot } from "./review-decision-dry-run";
import { reviewDecisionRecordToInsertRow, type PrmReviewDecisionRepository } from "./prm-review-decision-write";
import { approvedReviewToModelEntryRow, type PrmModelEntryRepository } from "./prm-model-entry-write";

/** M3 の可逆 patch（user_correction / retracted_at のみ・破壊削除しない）。 */
export interface ModelEntryPatch {
  readonly userCorrection?: "rejected" | "direction_adjusted" | "context_refined" | null;
  readonly retractedAtISO?: string | null;
}
/** M3 updater port（owner-RLS・破壊削除でなく UPDATE のみ）。 */
export interface PrmModelEntryUpdater {
  update(id: string, patch: ModelEntryPatch): Promise<{ readonly ok: boolean }>;
}

export type FeedbackKind = "confirm" | "correct" | "reject";
export type CorrectionKind = "direction_adjusted" | "context_refined";

/** feedback 結果（**redacted**・id/raw なし・partial failure 明示）。 */
export interface TendencyFeedbackResult {
  readonly ok: boolean;
  readonly feedback: FeedbackKind | null;
  readonly reviewed: boolean; // user M2 decision 作成
  readonly modelEntryCreated: boolean; // 新 M3 version（confirm）
  readonly corrected: boolean; // M3 user_correction set（correct）
  readonly retracted: boolean; // M3 retracted（reject/confirm の old）
  readonly reason: string;
  readonly partialFailure: string | null;
}

const TENDENCY_TO_ACTION: Record<string, "accept" | "dismiss" | "later"> = { adoption: "accept", non_adoption: "dismiss", deferral: "later" };

function base(feedback: FeedbackKind | null): TendencyFeedbackResult {
  return { ok: false, feedback, reviewed: false, modelEntryCreated: false, corrected: false, retracted: false, reason: "", partialFailure: null };
}
function failClosed(reason: string, feedback: FeedbackKind | null = null): TendencyFeedbackResult {
  return { ...base(feedback), reason };
}

/** M3 feedback entry → user ReviewDecisionRecord（snapshot は entry 由来・reviewer=user・integrity）。 */
function entryToUserReviewRecord(entry: PrmModelEntryFeedbackEntry, decision: ReviewDecisionKind, nowISO: string): ReviewDecisionRecord {
  const dominantAction = TENDENCY_TO_ACTION[entry.tendencyDirection];
  const snapshot: ReviewedProposalSnapshot = {
    sourceDimension: entry.contextDimension,
    sourceValue: entry.contextValue,
    dominantAction,
    favoredHypothesis: entry.favoredHypothesis,
    stillPossible: entry.stillPossible,
    evidenceCount: entry.evidenceCount,
    counterCount: entry.counterCount,
    certainty: entry.certainty,
  };
  return {
    kind: "review_decision_record",
    valid: true,
    reason: "ok",
    proposalFingerprint: `${entry.contextDimension}:${entry.contextValue}:${dominantAction}`,
    decision,
    reviewer: "user",
    effect: decisionEffect(decision),
    snapshot,
    reviewedAtISO: nowISO,
    reviewRequired: true,
    assertsPersonality: false,
    persisted: false,
  };
}

interface ParsedFeedback {
  readonly tendencyKey: string;
  readonly feedback: FeedbackKind;
  readonly correctionKind: CorrectionKind | null;
}
function parseRequest(raw: unknown): ParsedFeedback | { readonly error: string } {
  if (typeof raw !== "object" || raw === null) return { error: "not_object" };
  const r = raw as Record<string, unknown>;
  if (typeof r.tendencyKey !== "string" || r.tendencyKey.length === 0) return { error: "invalid_tendency_key" };
  if (r.feedback !== "confirm" && r.feedback !== "correct" && r.feedback !== "reject") return { error: "unknown_feedback" };
  let correctionKind: CorrectionKind | null = null;
  if (r.feedback === "correct") {
    if (r.correctionKind !== "direction_adjusted" && r.correctionKind !== "context_refined") return { error: "invalid_correction_kind" };
    correctionKind = r.correctionKind;
  }
  return { tendencyKey: r.tendencyKey, feedback: r.feedback, correctionKind };
}

export interface ExecuteTendencyFeedbackInput {
  /** **server 再読込済** M3 entry（id 付き・client から受けない）。 */
  readonly entries: readonly PrmModelEntryFeedbackEntry[];
  readonly rawRequest: unknown;
  readonly m2: PrmReviewDecisionRepository;
  readonly m3Insert: PrmModelEntryRepository;
  readonly m3Update: PrmModelEntryUpdater;
  readonly nowMs: number;
}

/**
 * A1-7-35: confirm/correct/reject を可逆に実行。entry 無→fail-closed。partial failure 明示。破壊削除なし。
 */
export async function executeTendencyFeedback(input: ExecuteTendencyFeedbackInput): Promise<TendencyFeedbackResult> {
  const parsed = parseRequest(input.rawRequest);
  if ("error" in parsed) return failClosed(parsed.error);

  const entry = input.entries.find((e) => tendencyKey(e) === parsed.tendencyKey);
  if (!entry) return failClosed("entry_not_found", parsed.feedback);

  const nowISO = new Date(input.nowMs).toISOString();

  // ── correct: 既存 M3 を user_correction で UPDATE（破壊削除なし・可逆）──
  if (parsed.feedback === "correct") {
    const upd = await input.m3Update.update(entry.id, { userCorrection: parsed.correctionKind });
    if (!upd.ok) return { ...base("correct"), reason: "m3_update_failed" };
    return { ...base("correct"), ok: true, corrected: true, reason: "ok" };
  }

  // ── reject: user M2(reject) + M3 retracted（可逆）──
  if (parsed.feedback === "reject") {
    const m2Row = reviewDecisionRecordToInsertRow(entryToUserReviewRecord(entry, "reject", nowISO));
    if (!m2Row) return failClosed("invalid_record", "reject");
    const m2 = await input.m2.insert([m2Row]);
    if (!m2.ok || m2.ids.length === 0) return { ...base("reject"), reason: "m2_insert_failed" };
    const upd = await input.m3Update.update(entry.id, { retractedAtISO: nowISO });
    if (!upd.ok) return { ...base("reject"), ok: true, reviewed: true, reason: "ok", partialFailure: "m3_retract_failed" }; // M2 確定・隠さない
    return { ...base("reject"), ok: true, reviewed: true, retracted: true, reason: "ok" };
  }

  // ── confirm: user M2(approve) + 新 M3 version(supersedes old) + old retracted ──
  const m2Row = reviewDecisionRecordToInsertRow(entryToUserReviewRecord(entry, "approve", nowISO));
  if (!m2Row) return failClosed("invalid_record", "confirm");
  const m2 = await input.m2.insert([m2Row]);
  if (!m2.ok || m2.ids.length === 0) return { ...base("confirm"), reason: "m2_insert_failed" };

  const m3Row = approvedReviewToModelEntryRow({ reviewDecisionId: m2.ids[0]!, decision: "approve", snapshot: entryToUserReviewRecord(entry, "approve", nowISO).snapshot, supersedesId: entry.id });
  if (!m3Row) return { ...base("confirm"), ok: true, reviewed: true, reason: "ok", partialFailure: "model_entry_mapping_failed" };
  const m3ins = await input.m3Insert.insert([m3Row]);
  if (!m3ins.ok) return { ...base("confirm"), ok: true, reviewed: true, reason: "ok", partialFailure: "model_entry_insert_failed" };

  // 新 version 作成済 → old を retract（supersede・可逆）
  const upd = await input.m3Update.update(entry.id, { retractedAtISO: nowISO });
  if (!upd.ok) return { ...base("confirm"), ok: true, reviewed: true, modelEntryCreated: true, reason: "ok", partialFailure: "old_retract_failed" };
  return { ...base("confirm"), ok: true, reviewed: true, modelEntryCreated: true, retracted: true, reason: "ok" };
}
