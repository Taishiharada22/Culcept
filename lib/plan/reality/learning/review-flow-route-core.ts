/**
 * Reality Control OS — A1-7-33 Review Flow Route Core（**pure・no-DB・injected repos**・barrel 非 export）
 *
 * 設計: docs/prm-review-flow-route-design.md（A1-7-33）
 *
 * 役割: operator の review 決定を実行する **testable core**。**server 再導出済 proposals** を受け取り（client snapshot を信用しない）、
 *   候補を fingerprint で解決 → validate → M2 insert → **approve なら M3 entry insert（review_decision_id FK）**。
 *   **partial failure（M2 ok / M3 失敗）を隠さず redacted に明示**。route handler が auth/flag/reader/Supabase repo を注入。
 *
 * 厳守:
 *   - **client snapshot 不信**: proposal は server 再導出のものを使う（request は fingerprint+decision のみ）。
 *   - **blocked → fail-closed**（candidate のみ reviewable）。**reviewer は operator 固定**（operator-only・client が変えられない）。
 *   - **approve=M2+M3 / reject·defer=M2 のみ**。**M3 は必ず review_decision_id（M2 id）経由**（reviewRequired）。
 *   - **certainty high 禁止**（snapshot 由来≤tentative + DB CHECK）。raw/seedRef/id を return に出さない（redacted）。pure・Date.now なし。
 */

import { proposalFingerprint, validateReview, isReviewDecisionKind, type ReviewDecisionKind } from "./review-flow-contract";
import type { PrmDryRunProposal } from "./prm-dry-run-projection";
import { toReviewDecisionRecord } from "./review-decision-dry-run";
import { reviewDecisionRecordToInsertRow, type PrmReviewDecisionRepository } from "./prm-review-decision-write";
import { approvedReviewToModelEntryRow, type PrmModelEntryRepository } from "./prm-model-entry-write";

/** review 実行の **redacted** 結果（raw/seedRef/id を出さない・partial failure 明示）。 */
export interface ReviewFlowResult {
  /** fail-closed でない（M2 まで成立 or reject/defer 成立）か。 */
  readonly ok: boolean;
  /** M2 review 決定が記録されたか。 */
  readonly reviewed: boolean;
  /** 有効 decision（fail-closed 時 null）。 */
  readonly decision: ReviewDecisionKind | null;
  /** M3 model entry が作られたか（approve 時のみ true 可）。 */
  readonly modelEntryCreated: boolean;
  /** redacted reason code。 */
  readonly reason: string;
  /** **partial failure**（M2 ok だが M3 失敗 等）を隠さず明示・無ければ null。 */
  readonly partialFailure: string | null;
}

function failClosed(reason: string): ReviewFlowResult {
  return { ok: false, reviewed: false, decision: null, modelEntryCreated: false, reason, partialFailure: null };
}

interface ParsedRequest {
  readonly proposalFingerprint: string;
  readonly decision: ReviewDecisionKind;
}
function parseRequest(raw: unknown): ParsedRequest | { readonly error: string } {
  if (typeof raw !== "object" || raw === null) return { error: "not_object" };
  const r = raw as Record<string, unknown>;
  if (typeof r.proposalFingerprint !== "string" || r.proposalFingerprint.length === 0) return { error: "invalid_fingerprint" };
  if (typeof r.decision !== "string" || !isReviewDecisionKind(r.decision)) return { error: "unknown_decision" };
  return { proposalFingerprint: r.proposalFingerprint, decision: r.decision };
}

export interface ExecuteReviewDecisionInput {
  /** **server 再導出済** proposals（client から受けない）。 */
  readonly proposals: readonly PrmDryRunProposal[];
  /** request raw（{proposalFingerprint, decision}）。 */
  readonly rawRequest: unknown;
  /** M2 review decision repository（注入・live=Supabase / test=fake）。 */
  readonly m2: PrmReviewDecisionRepository;
  /** M3 model entry repository（注入）。 */
  readonly m3: PrmModelEntryRepository;
  /** route 境界の Date.now（注入）。 */
  readonly nowMs: number;
}

/**
 * A1-7-33: operator review を実行。fail-closed（不正/未解決/blocked）・M2 insert・approve なら M3 insert・partial failure 明示。
 */
export async function executeReviewDecision(input: ExecuteReviewDecisionInput): Promise<ReviewFlowResult> {
  const parsed = parseRequest(input.rawRequest);
  if ("error" in parsed) return failClosed(parsed.error);

  // server 再導出 proposal を fingerprint で解決（client snapshot を信用しない）
  const proposal = input.proposals.find((p) => proposalFingerprint(p) === parsed.proposalFingerprint);
  if (!proposal) return failClosed("proposal_not_found");

  // candidate のみ reviewable（blocked → fail-closed）
  const validity = validateReview(proposal, parsed.decision);
  if (!validity.valid) return failClosed(validity.reason);

  // reviewer は **operator 固定**（operator-only）。snapshot は proposal（server）由来。reviewedAtISO は注入。
  const nowISO = new Date(input.nowMs).toISOString();
  const record = toReviewDecisionRecord(proposal, parsed.decision, "operator", nowISO);
  const m2Row = reviewDecisionRecordToInsertRow(record);
  if (!m2Row) return failClosed("invalid_record");

  const m2Result = await input.m2.insert([m2Row]);
  if (!m2Result.ok || m2Result.ids.length === 0) {
    return { ok: false, reviewed: false, decision: parsed.decision, modelEntryCreated: false, reason: "m2_insert_failed", partialFailure: null };
  }

  // reject / defer は M2 のみ
  if (parsed.decision !== "approve") {
    return { ok: true, reviewed: true, decision: parsed.decision, modelEntryCreated: false, reason: "ok", partialFailure: null };
  }

  // approve → M3 entry（**review_decision_id = M2 id**・reviewRequired）
  const m3Row = approvedReviewToModelEntryRow({ reviewDecisionId: m2Result.ids[0]!, decision: parsed.decision, snapshot: record.snapshot });
  if (!m3Row) {
    return { ok: true, reviewed: true, decision: "approve", modelEntryCreated: false, reason: "ok", partialFailure: "model_entry_mapping_failed" };
  }
  const m3Result = await input.m3.insert([m3Row]);
  if (!m3Result.ok) {
    // **partial failure を隠さない**: review(M2) は確定・model entry(M3) は失敗→retry/sweep 要
    return { ok: true, reviewed: true, decision: "approve", modelEntryCreated: false, reason: "ok", partialFailure: "model_entry_insert_failed" };
  }
  return { ok: true, reviewed: true, decision: "approve", modelEntryCreated: true, reason: "ok", partialFailure: null };
}
