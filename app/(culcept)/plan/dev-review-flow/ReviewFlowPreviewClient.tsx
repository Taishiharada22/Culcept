"use client";
/**
 * /plan/dev-review-flow — A1-7-9 Review Flow Preview（dev/staging 限定・render-only・**no-persist・no-route・no-DB**・fixtures のみ）
 *
 * 目的: A1-7-7/7-8 の review flow（candidate proposal → 人間 decision → `ReviewDecisionRecord`）を fixture で描画し、
 *   **永続化前**に「decision ごとに何が起きるか（effect）・blocked は review 不可（fail-closed）・保存しない（persisted:false）」を目視検証。
 *   実 decision UI / DB / persistence / route 接続なし。pure helper を render するだけ。
 */

import { toDryRunLearningEvent, type CandidateActionContext } from "@/lib/plan/reality/learning/dry-run-learning-event";
import { aggregateDryRunEvents } from "@/lib/plan/reality/learning/dry-run-aggregation";
import { projectPrmDryRun } from "@/lib/plan/reality/learning/prm-dry-run-projection";
import { toReviewDecisionRecords, type ReviewDecisionRecord } from "@/lib/plan/reality/learning/review-decision-dry-run";
import type { CandidateActionKind } from "@/lib/plan/reality/candidate-action";
import type { ConfidenceBand, TimeBandLabel } from "@/lib/plan/reality/integration/candidate-surface";

const HANDLE = "c1:" + "e".repeat(64);
function ev(action: CandidateActionKind, band: TimeBandLabel, confidenceBand: ConfidenceBand) {
  const ctx: CandidateActionContext = { handle: HANDLE, date: "2026-06-15", band, confidenceBand, durationMin: 60, evidenceSource: "seed_explicit" };
  return toDryRunLearningEvent(ctx, action);
}

/** fixture: evening dismiss ×6（candidate）+ morning accept ×3（blocked）→ 4 種 review を simulate。 */
function fixtureRecords(): readonly ReviewDecisionRecord[] {
  const proj = projectPrmDryRun(
    aggregateDryRunEvents([
      ...Array.from({ length: 6 }, () => ev("dismiss", "evening", "high")),
      ...Array.from({ length: 3 }, () => ev("accept", "morning", "low")),
    ])
  );
  const candEvening = proj.proposals.find((p) => p.sourceDimension === "band" && p.sourceValue === "evening")!; // candidate（timing）
  const candConf = proj.proposals.find((p) => p.sourceDimension === "confidence" && p.sourceValue === "high")!; // candidate（framing）
  const blockMorning = proj.proposals.find((p) => p.sourceDimension === "band" && p.sourceValue === "morning")!; // blocked
  return toReviewDecisionRecords([
    { proposal: candEvening, decision: "approve", reviewer: "operator" }, // → add_model_entry_candidate
    { proposal: candConf, decision: "reject", reviewer: "operator" }, // → record_rejection
    { proposal: candEvening, decision: "defer", reviewer: "user" }, // → no_model_change（再 review 可）
    { proposal: blockMorning, decision: "approve", reviewer: "operator" }, // → invalid（not_reviewable・fail-closed）
  ]);
}

function ReviewRecordCard({ r }: { r: ReviewDecisionRecord }) {
  return (
    <li
      className={`rounded-lg border px-3 py-2 text-[12px] ${r.valid ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40"}`}
      data-testid="review-record-card"
    >
      <div className="flex items-center gap-2">
        <span className="font-medium text-gray-700">{r.proposalFingerprint}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] ${r.valid ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}`}
          data-testid={r.valid ? "review-valid" : "review-invalid"}
        >
          {r.valid ? "valid" : `invalid: ${r.reason}`}
        </span>
        <span className="ml-auto text-[10px] text-gray-400">{r.reviewer}</span>
      </div>
      <div className="mt-1 text-[11px]">
        decision: <b>{r.decision ?? "—"}</b> → effect: <b className="text-purple-700">{r.effect ?? "—"}</b>
      </div>
      <div className="mt-1 text-[10px] text-gray-500">
        snapshot: certainty {r.snapshot.certainty} / evidence {r.snapshot.evidenceCount} / counter {r.snapshot.counterCount}
      </div>
      <div className="mt-1 text-[10px] text-gray-400">
        persisted: {String(r.persisted)} / reviewRequired: {String(r.reviewRequired)} / assertsPersonality: {String(r.assertsPersonality)}
      </div>
    </li>
  );
}

export function ReviewFlowPreviewClient() {
  const records = fixtureRecords();
  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-800" data-testid="review-flow-report">
      <h1 className="text-lg font-bold">Review Flow Preview（dry-run）</h1>
      <p className="mt-1 text-[12px] text-gray-500">
        A1-7-9・dev/staging 限定・<b>render-only</b>。candidate proposal を approve/reject/defer した
        <b>ReviewDecisionRecord</b>（A1-7-8）を描画。<b>実 decision UI / DB / persistence なし</b>。
        decision ごとの effect・blocked は review 不可（fail-closed）・<b>persisted:false</b> を目視確認。
      </p>
      <div className="mt-2 text-[11px] text-gray-400">
        records: {records.length} / valid: {records.filter((r) => r.valid).length} / invalid:{" "}
        {records.filter((r) => !r.valid).length}
      </div>
      <ul className="mt-3 space-y-2" data-testid="review-record-list">
        {records.map((r, i) => (
          <ReviewRecordCard key={i} r={r} />
        ))}
      </ul>
    </div>
  );
}
