"use client";
/**
 * A1-7-35 Tendency Feedback Buttons — dev-second-self の confirm/correct/reject 操作（**operator-only・dev preview**）。
 *   POST /api/reality/tendency-feedback `{ tendencyKey, feedback, correctionKind? }`。**fetch はこのファイルにのみ**置く
 *   （SecondSelfPreviewClient を route-free に保つ）。非断定・共同編集トーン。flag OFF 時は親が描画しない。
 *   厳守: 送るのは tendencyKey + enum のみ（**free-text なし**）。partial failure を隠さず表示。
 */
import { useState } from "react";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "done"; line: string };

async function send(tendencyKey: string, feedback: "confirm" | "correct" | "reject", correctionKind?: "direction_adjusted" | "context_refined"): Promise<string> {
  try {
    const res = await fetch("/api/reality/tendency-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(correctionKind ? { tendencyKey, feedback, correctionKind } : { tendencyKey, feedback }),
    });
    const j = (await res.json()) as { ok?: boolean; reason?: string; partialFailure?: string | null };
    if (j.partialFailure) return `一部のみ反映（${j.partialFailure}）`;
    if (j.ok) return "受け取りました";
    return `見送りました（${j.reason ?? "unknown"}）`;
  } catch {
    return "通信に失敗しました";
  }
}

export function TendencyFeedbackButtons({ tendencyKey }: { tendencyKey: string }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "sending";

  async function act(feedback: "confirm" | "correct" | "reject", correctionKind?: "direction_adjusted" | "context_refined") {
    setStatus({ kind: "sending" });
    const line = await send(tendencyKey, feedback, correctionKind);
    setStatus({ kind: "done", line });
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="tendency-feedback">
      <button type="button" disabled={busy} onClick={() => act("confirm")} className="rounded-md border border-violet-300 px-2 py-0.5 text-[10px] text-violet-700 disabled:opacity-40" data-testid="feedback-confirm">
        合っている
      </button>
      <button type="button" disabled={busy} onClick={() => act("correct", "direction_adjusted")} className="rounded-md border border-amber-300 px-2 py-0.5 text-[10px] text-amber-700 disabled:opacity-40" data-testid="feedback-correct-direction">
        向きを調整
      </button>
      <button type="button" disabled={busy} onClick={() => act("correct", "context_refined")} className="rounded-md border border-amber-300 px-2 py-0.5 text-[10px] text-amber-700 disabled:opacity-40" data-testid="feedback-correct-context">
        文脈を補う
      </button>
      <button type="button" disabled={busy} onClick={() => act("reject")} className="rounded-md border border-gray-300 px-2 py-0.5 text-[10px] text-gray-500 disabled:opacity-40" data-testid="feedback-reject">
        これは違う
      </button>
      {status.kind === "done" && <span className="text-[10px] text-gray-500" data-testid="feedback-status">{status.line}</span>}
    </div>
  );
}
