/**
 * T11-B(CoAlter) — CoAlter Projection consume helper（**pure・未配線**）
 *
 * 設計: coalter-projection-consume-types.ts + consume-contract preflight §8
 *
 * 役割: `PlanIntelligenceProjection` を CoAlter 用の **display/proposal cue** へ写像する純関数。
 *   cue は **表示/提案のみ**で、execution/booking/scheduling/send authority を一切持たない。
 *
 * 厳守（純・決定論・境界）:
 *   - import は projection / cue 型のみ（**useCoAlter / /talk / runtime / fetch / DB を import しない**）。
 *   - cue は **execution authority を産まない**・**booking/scheduling/send action を作らない**。
 *   - private rationale を推論しない（projection は既に private-free）・diagnostics を使わない。
 */

import type { PlanIntelligenceProjection } from "./plan-intelligence-projection-types";
import type { CoAlterProjectionCue } from "./coalter-projection-consume-types";

/**
 * projection → display/proposal cue[]。決定論・副作用なし。
 *   - questionsToAsk   → ask_question
 *   - needsConfirmation → ask_confirmation（weather_reversal_uncertainty も**確認 cue**＝予約権限ではない）
 *   - readinessWarning  → note_risk（ready_to_propose 以外のときのみ）
 *   - fallbackNote      → show_fallback
 *   - fitAdvisory       → risk あり: note_risk / なし: explain_plan
 */
export function deriveCoAlterProjectionCues(projection: PlanIntelligenceProjection): CoAlterProjectionCue[] {
  const cues: CoAlterProjectionCue[] = [];

  for (const q of projection.questionsToAsk) {
    cues.push({ action: "ask_question", source: "questionsToAsk", ref: q.intent });
  }
  for (const c of projection.needsConfirmation) {
    cues.push({ action: "ask_confirmation", source: "needsConfirmation", ref: c.reason });
  }
  // readiness は ready_to_propose 以外のときだけ「注意」cue（実行可否ではない）
  if (projection.readinessWarning.readinessState !== "ready_to_propose") {
    cues.push({ action: "note_risk", source: "readinessWarning", ref: projection.readinessWarning.readinessState });
  }
  for (const f of projection.fallbackNote) {
    cues.push({ action: "show_fallback", source: "fallbackNote", ref: f.trigger });
  }
  for (const s of projection.fitAdvisory) {
    cues.push({
      action: s.riskCodes.length > 0 ? "note_risk" : "explain_plan",
      source: "fitAdvisory",
      ref: s.candidateId,
    });
  }

  return cues;
}
