/**
 * B2-disp B — Travel Plan Display Adapter helper（**pure/server-only・no production side effect・未配線**）
 *
 * 設計正本: docs/t11-production-plan-travel-input-wiring-preflight.md（§6/§13 案 B）
 *
 * 役割: 構造化 `TravelPlanDisplayInput` を **bind → provider → engine → display** の既存 pure chain に通し、
 *   **display-safe な ready / 中立 not-ready** のみを返す。**route wiring / server action / DB / persistence なし**。
 *
 * 厳守:
 *   - slot status は **binding が surface から derive**（client は status を渡せない＝型）。
 *   - **provider not ready なら engine を呼ばない**。**fixture fallback 禁止・dev_fixture 拒否**（gate）。
 *   - raw provider input / raw diagnostics / raw engine output / `AuthoritativePacketForServer` を**返さない**。
 *   - executionAuthority / booking / calendar / action なし・diagnostics は server-only。
 *   - fetch/API/DB/Supabase なし・M2 runtime なし・route/weather/place なし・外部 retrieval / safe links / Maps URL なし・CoAlter/talk なし。
 *   - ★ server-only（intake/engine は private slot を扱う）だが **出力は display-safe**。
 */

import { bindTravelSessionIntake } from "./travel-session-binding";
import { getProductionTravelInput } from "./production-travel-input";
import { runTravelPlanEngine } from "./engine";
import { toDisplayPacket } from "./engine-consume";
import { buildPlanIntelligenceProjection } from "./plan-intelligence-projection";
import { deriveCoAlterProjectionCues } from "./coalter-projection-consume";
import type { TravelInputProviderGate } from "./travel-input-provider-types";
import type { PrereqAsk, TravelPlanDisplayInput, TravelPlanDisplayResult } from "./travel-plan-display-adapter-types";

/**
 * 構造化 events → display-safe 結果（ready は projection/cues/display packet・not-ready は中立）。
 *   gate.fixtureAllowed は production-like で false（dev_fixture を拒否・fixture fallback なし）。
 */
export function buildTravelPlanDisplayResult(
  input: TravelPlanDisplayInput,
  gate: TravelInputProviderGate,
): TravelPlanDisplayResult {
  // ⓪ session source 不在（payload 自体が無い）→ unavailable（engine を呼ばず fail-closed）。
  if (!input || typeof input !== "object" || !Array.isArray(input.events) || !Array.isArray(input.participantIds)) {
    return { status: "unavailable" };
  }
  // ① 構造化 events → TravelIntakeInput（status は surface 由来・binding が derive）
  const intake = bindTravelSessionIntake(input);
  // ② provider（5 状態・production gate）。not ready は engine を呼ばず中立で返す。
  const provided = getProductionTravelInput(intake, gate);

  if (provided.status === "not_ready_missing") {
    return { status: "not_ready_missing", ask: provided.missing.map((p): PrereqAsk => ({ prerequisite: p })) };
  }
  if (provided.status === "not_ready_unconfirmed") {
    return { status: "not_ready_unconfirmed", ask: provided.unconfirmed.map((p): PrereqAsk => ({ prerequisite: p })) };
  }
  if (provided.status === "unavailable") {
    return { status: "unavailable" }; // 診断は server-only（client へ出さない）
  }
  if (provided.status === "invalid") {
    return { status: "invalid" }; // 構造違反理由は server-only
  }

  // ③ ready のみ engine を実行 → display chain（authoritative は server 内に留め client へ返さない）
  const output = runTravelPlanEngine(provided.input);
  const viewerId = input.viewerId;
  const packet = toDisplayPacket(output, viewerId); // DisplayPacketForClient（authority 無を assert）
  const projection = buildPlanIntelligenceProjection({ packet, ...(viewerId !== undefined ? { viewerId } : {}) });
  const cues = deriveCoAlterProjectionCues(projection);
  return { status: "ready", display: { packet, projection, cues } };
}
