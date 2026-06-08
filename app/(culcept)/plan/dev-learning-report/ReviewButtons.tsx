"use client";
/**
 * A1-7-33 Review Buttons — operator が candidate proposal を review（approve/reject/defer）し
 *   POST /api/reality/review-decision する dev 限定 UI。**flag-gated・operator-only**。partial failure を明示表示。
 *   LearningReportPreviewClient（fixture preview）を route-free に保つため別 file（fetch はここだけ）。
 */
import { useState } from "react";
import { proposalFingerprint } from "@/lib/plan/reality/learning/review-flow-contract";
import type { PrmDryRunProposal } from "@/lib/plan/reality/learning/prm-dry-run-projection";

export function ReviewButtons({ p }: { p: PrmDryRunProposal }) {
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function review(decision: "approve" | "reject" | "defer") {
    setBusy(true);
    try {
      const res = await fetch("/api/reality/review-decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalFingerprint: proposalFingerprint(p), decision }),
      });
      const d = (await res.json()) as { reviewed?: boolean; modelEntryCreated?: boolean; reason?: string; partialFailure?: string | null };
      setResult(
        d.reviewed
          ? `${decision}: reviewed${d.modelEntryCreated ? " + model entry" : ""}${d.partialFailure ? ` ⚠ ${d.partialFailure}` : ""}`
          : `${decision}: ${d.reason ?? "failed"}`
      );
    } catch {
      setResult(`${decision}: error`);
    }
    setBusy(false);
  }
  return (
    <div className="mt-2 flex items-center gap-1" data-testid="review-buttons">
      {(["approve", "reject", "defer"] as const).map((d) => (
        <button
          key={d}
          type="button"
          disabled={busy}
          onClick={() => review(d)}
          className="rounded-md border border-violet-300 px-2 py-0.5 text-[10px] text-violet-700 hover:bg-violet-50 disabled:opacity-50"
        >
          {d}
        </button>
      ))}
      {result && <span className="ml-1 text-[10px] text-gray-600" data-testid="review-result">{result}</span>}
    </div>
  );
}
