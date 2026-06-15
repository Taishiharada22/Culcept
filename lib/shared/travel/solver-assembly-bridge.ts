/**
 * AB2 — S4→A Assembly Bridge helper（**pure・server-only・未配線**）
 *
 * 設計正本: docs/t11-s4a-assembly-bridge-design.md（+ CEO 補正: 成功も server-only envelope）
 *
 * 役割: S4 `AssemblyInputCandidate` を検証し、**second 独立 fail-closed gate**（候補 invariant 再検証 +
 *   `detectAssemblyReadiness` 独立再実行）を経て、**唯一許可された `assembleScheduledDraft` 呼出**で
 *   `ScheduledTravelItineraryDraft` を作る。それ以外は **neutral no_draft**。
 *
 * 厳守（bridge がしてはならない）:
 *   - solve/reorder/時刻割当/日割/overlap 修復/lock 緩和/欠落 field 推論をしない。
 *   - route/weather/place API なし・`runTravelPlanEngine`/`evaluateFit` を呼ばない。
 *   - `TravelCandidate` を作らない・`TravelCorePlan.candidates` に挿入しない・executionAuthority を与えない。
 *   - bridge 結果は **server-only**（client/display projection でない）。
 */

import { detectAssemblyReadiness } from "./assembly-readiness-detector";
import { assembleScheduledDraft } from "./scheduled-draft-assembler";
import type { S4ResolutionResult } from "./solver-finalization-types";
import type { AssemblyBridgeResult } from "./solver-assembly-bridge-types";

/**
 * server-only bridge: valid な assembly_input_candidate の時のみ copy-only assembler を 1 回呼ぶ。
 *   - non_candidate_input: outcome ≠ assembly_input_candidate（unresolved/rejected/needs_input/infeasible）
 *   - not_server_only: serverOnly!==true / authoritative!==false / draft!==true（forged/unsound 入力に fail-closed）
 *   - not_assembly_ready: detectAssemblyReadiness 独立再実行が not ready
 *   - assembler_rejected: assembleScheduledDraft が scheduled_draft を返さなかった（defensive）
 */
export function bridgeAssemblyCandidate(result: S4ResolutionResult): AssemblyBridgeResult {
  if (result.outcome !== "assembly_input_candidate") {
    return { outcome: "no_draft", serverOnly: true, reason: "non_candidate_input" };
  }
  // ★ 型は serverOnly:true/authoritative:false/draft:true を保証するが、forged/unsound 入力に対し runtime で防御
  if (result.serverOnly !== true || result.authoritative !== false || result.draft !== true) {
    return { outcome: "no_draft", serverOnly: true, reason: "not_server_only" };
  }
  // ★ second 独立 gate（assembler 内の readiness check より前に明示）
  const readiness = detectAssemblyReadiness(result.assemblyInput);
  if (!readiness.assemblyReady) {
    return { outcome: "no_draft", serverOnly: true, reason: "not_assembly_ready" };
  }
  // ★ 唯一許可された assembler 呼出（readiness pass 後のみ・copy-only）
  const out = assembleScheduledDraft(result.assemblyInput);
  if (out.outcome !== "scheduled_draft") {
    return { outcome: "no_draft", serverOnly: true, reason: "assembler_rejected" };
  }
  // ★ 成功も server-only envelope（raw draft を直接返さない・UI 誤表示防止）
  return { outcome: "scheduled_draft", serverOnly: true, draft: out };
}
