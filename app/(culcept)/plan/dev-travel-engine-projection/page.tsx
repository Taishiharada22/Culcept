/**
 * /plan/dev-travel-engine-projection — T11-C Server-side **engine-generated** projection preview
 *   （**fixture 入力で実 runTravelPlanEngine を server 実行 → display chain → read-only 表示**）
 *
 * 設計: docs/t11-c-server-engine-runtime-wiring-preflight.md（+ CEO/GPT 修正: toServerAuthoritativePacket は呼ばない）
 *
 * 目的: app server route が **純 engine を実行**し、display chain（toDisplayPacket →
 *   buildPlanIntelligenceProjection → deriveCoAlterProjectionCues）だけを preview component へ渡せることを示す。
 *   authoritative output は **暗黙・server-only**（component へ渡さない・render しない・dump しない）。
 *
 * 厳守:
 *   - flag は既存 `PLAN_TRAVEL_PROJECTION_PREVIEW`（PLAN_FLAGS.travelProjectionPreview）を **dev fixture provider の
 *     gate（fixtureAllowed）に解決**。provider not_ready（flag OFF 等）→ **engine を走らせず Disabled**（fail-closed）。
 *   - **fixture 入力のみ**（実 user data / DB / fetch / route・weather・place live なし）。
 *   - **authoritative output / diagnostics / raw output / provider provenance を client へ渡さない・render しない**
 *     （provenance は server-only）。
 *   - **toServerAuthoritativePacket を呼ばない**（authoritative は暗黙 server-only）。
 *   - read-only（button / send / booking / scheduling なし）。本番 /plan・useCoAlter・talk 非接触。
 *   - engine 実行失敗 → Disabled（本番 path へ throw しない）。
 */

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { runTravelPlanEngine } from "@/lib/shared/travel/engine";
import { toDisplayPacket } from "@/lib/shared/travel/engine-consume";
import { buildPlanIntelligenceProjection } from "@/lib/shared/travel/plan-intelligence-projection";
import { deriveCoAlterProjectionCues } from "@/lib/shared/travel/coalter-projection-consume";
import { getDevFixtureTravelInput } from "@/lib/shared/travel/travel-input-provider";
import { TravelProjectionPreview } from "../dev-travel-projection/TravelProjectionPreview";
import { CoAlterCuesPreview } from "../dev-coalter-projection-cues/CoAlterCuesPreview";
import { FIXTURE_ENGINE_INPUT, FIXTURE_ENGINE_VIEWER_ID } from "./engine-fixture-input";

export const dynamic = "force-dynamic";

function Disabled({ reason }: { reason: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-600" data-testid="travel-engine-projection-disabled">
      <h1 className="text-lg font-bold">Travel Engine Projection（engine-generated・read-only・dev）</h1>
      <p className="mt-2 text-[12px] text-gray-500">{reason}</p>
    </div>
  );
}

export default function DevTravelEngineProjectionPage() {
  // ── dev fixture provider seam: flag を fixtureAllowed に解決し input を供給 or 拒否（fail-closed）。
  const provided = getDevFixtureTravelInput(FIXTURE_ENGINE_INPUT, { fixtureAllowed: PLAN_FLAGS.travelProjectionPreview });
  // not_ready（flag OFF 等）→ **engine を走らせず** Disabled。provenance は server-only（client へ出さない）。
  if (provided.status !== "ready") {
    return <Disabled reason="PLAN_TRAVEL_PROJECTION_PREVIEW=OFF / input not_ready（実行・表示しません）。" />;
  }
  try {
    // ── 純 engine を **provider が供給した input** で server 実行。authoritative output は暗黙・server-only（下流へ渡さない）。
    const output = runTravelPlanEngine(provided.input);
    // ── display chain（client へ渡すのは projection / cues のみ）。
    const packet = toDisplayPacket(output, FIXTURE_ENGINE_VIEWER_ID);
    const projection = buildPlanIntelligenceProjection({ packet, viewerId: FIXTURE_ENGINE_VIEWER_ID });
    const cues = deriveCoAlterProjectionCues(projection);
    return (
      <div className="space-y-6 py-2">
        <TravelProjectionPreview projection={projection} />
        <CoAlterCuesPreview cues={cues} title="CoAlter Cues（engine-generated・read-only）" />
      </div>
    );
  } catch {
    // fail-closed: engine 実行失敗でも本番 path へ throw しない。
    return <Disabled reason="engine 実行に失敗しました（fixture 検証用・read-only）。" />;
  }
}
