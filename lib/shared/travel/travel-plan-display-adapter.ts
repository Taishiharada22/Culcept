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
 *   - fetch/API/DB/Supabase なし・M2 runtime なし・route/weather/place なし・外部 retrieval なし・CoAlter/talk なし。
 *   - ★ server-only（intake/engine は private slot を扱う）だが **出力は display-safe**。
 *
 * ★ external links 契約（C-E・2026-06）:
 *   - **既定では external link を産まない**（option 不在/false → 従来結果と byte 等価）。
 *   - `options.includeExternalLinks === true`（server option で明示有効化）時のみ、**ready display** は
 *     **confirmed shared-safe destination から生成した Maps 検索 hand-off link** を含み得る（`extractGeneratedLinkDestination`
 *     → `prepareTravelExternalLinkHrefModels` に委譲・非空時のみ attach）。
 *   - adapter は **URL を構築しない**（両 helper に委譲）・**外部 retrieval しない**・**exact place を解決しない**・
 *     **Maps/Places API を呼ばない**・**manual URL source を未サポート**・**booking/availability/price/route を含意しない**。
 *   - option は **server gate が決める**（adapter は env/client flag を読まない）。production deny は adapter の外。
 */

import { bindTravelSessionIntake } from "./travel-session-binding";
import { getProductionTravelInput } from "./production-travel-input";
import { runTravelPlanEngine } from "./engine";
import { toDisplayPacket } from "./engine-consume";
import { buildPlanIntelligenceProjection } from "./plan-intelligence-projection";
import { deriveCoAlterProjectionCues } from "./coalter-projection-consume";
import { extractGeneratedLinkDestination } from "./generated-link-destination";
import { prepareTravelExternalLinkHrefModels } from "./travel-external-link-preparation";
import { mapM2SoftEnrichmentToSlots } from "./m2-soft-enrichment";
import { mergeM2SoftEnrichmentIntoReadyTravelInput } from "./m2-soft-enrichment-merge";
import type { M2TravelSoftPreference } from "./m2-soft-enrichment-types";
import type { TravelInputProviderGate } from "./travel-input-provider-types";
import type { PrereqAsk, TravelPlanDisplayInput, TravelPlanDisplayResult } from "./travel-plan-display-adapter-types";

/**
 * 構造化 events → display-safe 結果（ready は projection/cues/display packet・not-ready は中立）。
 *   gate.fixtureAllowed は production-like で false（dev_fixture を拒否・fixture fallback なし）。
 */
export function buildTravelPlanDisplayResult(
  input: TravelPlanDisplayInput,
  gate: TravelInputProviderGate,
  // ★ C-E: additive optional。absent/false → external links を産まない（従来挙動 byte 等価）。
  //   true は **server gate** が決める（adapter は env/client flag を読まない）。
  // ★ UX-6a: `softPersonalization` additive optional。**absent → engine 入力 byte 等価**（従来挙動）。
  //   提供時のみ、**ready engine 入力に M2 由来 soft slot を enrich**（pace/soft_preference 等）して
  //   personalization を proposal に反映する。**注入のみ（caller が flag 配下で渡す・DB/M2 runtime/snapshotReader は呼ばない）**。
  //   explicit 優先・hard key 非追加は merge helper が担保。owner は self（participantIds[0]）。
  options?: { includeExternalLinks?: boolean; softPersonalization?: M2TravelSoftPreference },
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

  // ★ UX-6a: ready engine 入力に M2 soft personalization を enrich（注入時のみ・absent は byte 等価）。
  //   private soft slot の owner = self（participantIds[0]）。explicit 優先・hard key 非追加は merge が担保。
  let engineInput = provided.input;
  const softPref = options?.softPersonalization;
  const selfId = provided.input.participantIds[0];
  if (softPref && typeof selfId === "string" && selfId.length > 0) {
    const m2Slots = mapM2SoftEnrichmentToSlots(softPref, { participantId: selfId });
    if (m2Slots.length > 0) {
      engineInput = mergeM2SoftEnrichmentIntoReadyTravelInput(provided.input, m2Slots);
    }
  }

  // ③ ready のみ engine を実行 → display chain（authoritative は server 内に留め client へ返さない）
  const output = runTravelPlanEngine(engineInput);
  const viewerId = input.viewerId;
  const packet = toDisplayPacket(output, viewerId); // DisplayPacketForClient（authority 無を assert）
  const projection = buildPlanIntelligenceProjection({ packet, ...(viewerId !== undefined ? { viewerId } : {}) });
  const cues = deriveCoAlterProjectionCues(projection);

  // ★ C-E: option 明示有効化時のみ external links を付与（confirmed shared-safe destination からのみ・
  //   URL 構築/eligibility は helper に委譲・非空時のみ attach・空は absent）。OFF は従来と byte 等価。
  if (options?.includeExternalLinks === true) {
    const dest = extractGeneratedLinkDestination(provided.input.slots);
    const externalLinks = prepareTravelExternalLinkHrefModels(dest ? { destination: dest } : {});
    if (externalLinks.length > 0) {
      return { status: "ready", display: { packet, projection, cues, externalLinks } };
    }
  }
  return { status: "ready", display: { packet, projection, cues } };
}
