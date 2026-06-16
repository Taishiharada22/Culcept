/**
 * /plan/dev-travel-engine-session-intake — B2-prod C: **session/intake provider path** preview
 *   （**TravelIntakeInput fixture → getProductionTravelInput → TravelPlanEngineInput → engine → display chain**）
 *
 * 設計: docs/t11-production-travel-input-provider-preflight.md §13 案 C
 *
 * 目的: engine が **生 FIXTURE_ENGINE_INPUT でなく** session/intake provider 経由の real input で駆動できることを示す。
 *   既存 /plan/dev-travel-engine-projection（dev_fixture provider 実証）と別 route（兄弟・既存を壊さない）。
 *
 * 厳守:
 *   - flag は既存 `PLAN_TRAVEL_PROJECTION_PREVIEW`（PLAN_FLAGS.travelProjectionPreview）。OFF → Disabled（fail-closed）。
 *   - provider gate は **production-like（fixtureAllowed:false）**。provider not ready → engine を走らせず Disabled。
 *   - **session/intake fixture のみ**（実 user data / DB / fetch / route・weather・place live なし）。
 *   - provider provenance / authoritative output を client へ渡さない・render しない（server-only）。
 *   - read-only（button / send / booking なし）。本番 /plan・useCoAlter・talk 非接触。
 */

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { runTravelPlanEngine } from "@/lib/shared/travel/engine";
import { toDisplayPacket } from "@/lib/shared/travel/engine-consume";
import { buildPlanIntelligenceProjection } from "@/lib/shared/travel/plan-intelligence-projection";
import { deriveCoAlterProjectionCues } from "@/lib/shared/travel/coalter-projection-consume";
import { getProductionTravelInput } from "@/lib/shared/travel/production-travel-input";
import { TravelProjectionPreview } from "../dev-travel-projection/TravelProjectionPreview";
import { CoAlterCuesPreview } from "../dev-coalter-projection-cues/CoAlterCuesPreview";
import { FIXTURE_SESSION_INTAKE, FIXTURE_INTAKE_VIEWER_ID } from "./session-intake-fixture";

export const dynamic = "force-dynamic";

function Disabled({ reason }: { reason: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-600" data-testid="travel-engine-session-intake-disabled">
      <h1 className="text-lg font-bold">Travel Engine（session/intake provider・read-only・dev）</h1>
      <p className="mt-2 text-[12px] text-gray-500">{reason}</p>
    </div>
  );
}

export default function DevTravelEngineSessionIntakePage() {
  // flag OFF → Disabled（fail-closed・engine を走らせない）。
  if (!PLAN_FLAGS.travelProjectionPreview) {
    return <Disabled reason="PLAN_TRAVEL_PROJECTION_PREVIEW=OFF（実行・表示しません）。" />;
  }
  // ★ production-like gate（fixtureAllowed:false）で session/intake fixture から real input を取得。
  //   生 TravelPlanEngineInput fixture は使わない（provider 経由）。not ready → engine を走らせず Disabled。
  const provided = getProductionTravelInput(FIXTURE_SESSION_INTAKE, { fixtureAllowed: false });
  if (provided.status !== "ready") {
    return <Disabled reason={`provider status=${provided.status}（実行しません）。`} />;
  }
  try {
    const output = runTravelPlanEngine(provided.input);
    const packet = toDisplayPacket(output, FIXTURE_INTAKE_VIEWER_ID);
    const projection = buildPlanIntelligenceProjection({ packet, viewerId: FIXTURE_INTAKE_VIEWER_ID });
    const cues = deriveCoAlterProjectionCues(projection);
    return (
      <div className="space-y-6 py-2">
        <TravelProjectionPreview projection={projection} />
        <CoAlterCuesPreview cues={cues} title="CoAlter Cues（session/intake provider・read-only）" />
      </div>
    );
  } catch {
    return <Disabled reason="engine 実行に失敗しました（session/intake 検証用・read-only）。" />;
  }
}
