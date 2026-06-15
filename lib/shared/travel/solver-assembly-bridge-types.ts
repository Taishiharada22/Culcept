/**
 * AB1 — S4→A Assembly Bridge 契約型（**pure types only**・未配線）
 *
 * 設計正本: docs/t11-s4a-assembly-bridge-design.md（+ CEO 補正: 成功側も server-only envelope で包む）
 *
 * 役割: S4 の server-only `AssemblyInputCandidate` を copy-only assembler に渡す bridge の戻り値契約。
 *   ★成功側も envelope（`outcome:"scheduled_draft", serverOnly:true, draft`）にし、bridge 由来であることを
 *   型で明示する（将来の UI/dev preview が draft を直接表示する事故を防ぐ）。
 *
 * 厳守:
 *   - bridge 結果は **server-only**（client/display payload でない）。
 *   - `TravelCandidate` でない・executionAuthority/booking/calendar field を持たない・UI/client projection 型でない・raw FitResult なし。
 *
 * 純粋性: 型 + as-const のみ。
 */

import type { ScheduledTravelItineraryDraft } from "./assembly-types";

export const BRIDGE_NO_DRAFT_REASONS = [
  "non_candidate_input", // outcome ≠ assembly_input_candidate（unresolved/rejected/needs_input/infeasible）
  "not_server_only", // serverOnly !== true / authoritative !== false / draft !== true
  "not_assembly_ready", // detectAssemblyReadiness 独立再実行が not ready（second gate）
  "assembler_rejected", // assembleScheduledDraft が scheduled_draft を返さなかった（defensive）
] as const;
export type BridgeNoDraftReason = (typeof BRIDGE_NO_DRAFT_REASONS)[number]; // ★ neutral・private を含まない

/** ★ bridge 結果（成功も server-only envelope）。raw ScheduledTravelItineraryDraft を直接返さない */
export type AssemblyBridgeResult =
  | { outcome: "scheduled_draft"; serverOnly: true; draft: ScheduledTravelItineraryDraft }
  | { outcome: "no_draft"; serverOnly: true; reason: BridgeNoDraftReason };
