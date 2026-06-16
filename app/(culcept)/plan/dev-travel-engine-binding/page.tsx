/**
 * /plan/dev-travel-engine-binding — B2-bind C: **form/session events → binding → provider → engine** preview
 *   （**SessionSurfaceEvent fixture → bindTravelSessionIntake → getProductionTravelInput → runTravelPlanEngine → display chain**）
 *
 * 設計: docs/t11-real-session-intake-source-binding-design.md §12 案 C
 *
 * 目的: 構造化 surface event から決定論 binding で TravelIntakeInput を作り、provider 経由で engine を駆動できることを示す。
 *   既存 /plan/dev-travel-engine-session-intake（手組み TravelIntakeInput）と別 route（兄弟・既存を壊さない）。
 *
 * 厳守:
 *   - flag は既存 `PLAN_TRAVEL_PROJECTION_PREVIEW`。OFF → Disabled（fail-closed）。
 *   - provider gate は production-like（fixtureAllowed:false）。binding/provider not ready → engine を走らせず Disabled。
 *   - **event fixture のみ**（実 user data / DB / fetch / route・weather・place live なし）。
 *   - binding diagnostics / provenance / authoritative output を client へ渡さない・render しない（server-only）。
 *   - read-only（button / send / booking なし）。本番 /plan・useCoAlter・talk 非接触。
 */

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { runTravelPlanEngine } from "@/lib/shared/travel/engine";
import { toDisplayPacket } from "@/lib/shared/travel/engine-consume";
import { buildPlanIntelligenceProjection } from "@/lib/shared/travel/plan-intelligence-projection";
import { deriveCoAlterProjectionCues } from "@/lib/shared/travel/coalter-projection-consume";
import { bindTravelSessionIntake } from "@/lib/shared/travel/travel-session-binding";
import { getProductionTravelInput } from "@/lib/shared/travel/production-travel-input";
import { TravelProjectionPreview } from "../dev-travel-projection/TravelProjectionPreview";
import { CoAlterCuesPreview } from "../dev-coalter-projection-cues/CoAlterCuesPreview";
import { FIXTURE_BINDING_EVENTS, FIXTURE_BINDING_VIEWER_ID } from "./binding-events-fixture";

export const dynamic = "force-dynamic";

function Disabled({ reason }: { reason: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-600" data-testid="travel-engine-binding-disabled">
      <h1 className="text-lg font-bold">Travel Engine（session binding → provider・read-only・dev）</h1>
      <p className="mt-2 text-[12px] text-gray-500">{reason}</p>
    </div>
  );
}

export default function DevTravelEngineBindingPage() {
  // flag OFF → Disabled（fail-closed・engine を走らせない）。
  if (!PLAN_FLAGS.travelProjectionPreview) {
    return <Disabled reason="PLAN_TRAVEL_PROJECTION_PREVIEW=OFF（実行・表示しません）。" />;
  }
  // ★ 構造化 event → 決定論 binding → real TravelIntakeInput → production gate provider。
  const intake = bindTravelSessionIntake(FIXTURE_BINDING_EVENTS);
  const provided = getProductionTravelInput(intake, { fixtureAllowed: false });
  if (provided.status !== "ready") {
    return <Disabled reason={`provider status=${provided.status}（実行しません）。`} />;
  }
  try {
    const output = runTravelPlanEngine(provided.input);
    const packet = toDisplayPacket(output, FIXTURE_BINDING_VIEWER_ID);
    const projection = buildPlanIntelligenceProjection({ packet, viewerId: FIXTURE_BINDING_VIEWER_ID });
    const cues = deriveCoAlterProjectionCues(projection);
    return (
      <div className="space-y-6 py-2">
        <TravelProjectionPreview projection={projection} />
        <CoAlterCuesPreview cues={cues} title="CoAlter Cues（session binding → provider・read-only）" />
      </div>
    );
  } catch {
    return <Disabled reason="engine 実行に失敗しました（binding 検証用・read-only）。" />;
  }
}
