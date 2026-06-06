/**
 * Reality Control OS — A1-5-7-6 Capture Candidate Banner（**UI・控えめ・additive・no-DB**）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.46
 *
 * 役割: route response の `data.captureCandidate?`（A1-5-7-5）を MorningPlanCard 内で **控えめに additive 表示**する。
 *   `presentCaptureCandidate`（pure presenter）で友好ラベル化 → 控えめ banner。
 *
 * 厳守:
 *   - **candidate 無 / hasCandidate=false → null**（DOM に何も足さない＝既存 UI 完全不変）。
 *   - **控えめ**: 「候補があります」止まり。「確定」と断定しない。evidenceSource の技術名・source_ref・UUID・raw を出さない（presenter 済）。
 *   - pure presentational（hooks / DB / network なし）。既存 UI を壊さない（additive section のみ）。
 */

import { presentCaptureCandidate } from "./captureCandidatePresenter";
import type { CandidateSurfaceDTO } from "@/lib/plan/reality/integration/candidate-surface";

export function CaptureCandidateBanner({ candidate }: { candidate?: CandidateSurfaceDTO | null }) {
  const display = presentCaptureCandidate(candidate);
  if (!display) return null; // 表示なし（既存 UI 不変）

  return (
    <div
      data-testid="capture-candidate-banner"
      className="mb-3 rounded-xl border border-purple-200/60 bg-purple-50/50 px-3 py-2"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-purple-700">{display.heading}</span>
        <span className="text-[10px] text-purple-400">（候補）</span>
      </div>
      <div className="text-[11px] text-gray-500 mt-0.5">{display.note}</div>
      {display.items.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {display.items.map((it, i) => (
            <li key={i} className="text-[11px] text-gray-600">
              {it.durationText}
              <span className="text-gray-400"> · {it.sourceLabel}</span>
              {it.bandLabel ? <span className="text-gray-400"> · {it.bandLabel}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
