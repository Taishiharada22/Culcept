/**
 * /plan/dev-travel-scheduled-draft — Scheduled-Draft Display **read-only dev preview**
 *   （**fixture 入力のみ・runtime 非配線・read-only・送信なし・本番 /plan 非接触**）
 *
 * 設計: docs/t11-pipeline-closeout-display-preview-preflight.md §6
 *
 * 目的: server-only AssemblyBridgeResult → display-safe `DisplayScheduledItinerary` の表示 UX を目視確認。
 *   solver/assembler runtime は実行しない（fixture bridge envelope を display 投影するのみ）。
 *
 * 厳守:
 *   - flag `PLAN_TRAVEL_PROJECTION_PREVIEW`（server default OFF）→ OFF なら Disabled（render しない）。
 *   - **fixture のみ**（real data なし・runTravelPlanEngine/assembleScheduledDraft 非実行・raw envelope 非表示）。
 *   - **read-only**（write/insert/update/delete/upsert/apply/seed なし）。
 *   - no API/fetch/DB/Supabase/送信/realtime/read receipt/useCoAlter/外部 Maps/booking。本番 `/plan` に触れない。
 */

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { projectDisplayScheduledItinerary } from "@/lib/shared/travel/scheduled-draft-display";
import { ScheduledDraftDisplay } from "./ScheduledDraftDisplay";
import { FIXTURE_BRIDGE_RESULT } from "./fixture";

export const dynamic = "force-dynamic";

/** flag OFF（本番デフォルト）の fail-closed 表示。preview を render しない。 */
function Disabled() {
  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-600" data-testid="scheduled-draft-disabled">
      <h1 className="text-lg font-bold">Scheduled-Draft Preview（read-only・dev）</h1>
      <p className="mt-2 text-[12px] text-gray-500">PLAN_TRAVEL_PROJECTION_PREVIEW=OFF（表示しません）。</p>
    </div>
  );
}

export default function DevTravelScheduledDraftPage() {
  // flag OFF → fail-closed（fixture も render しない）。本番デフォルト OFF。
  if (!PLAN_FLAGS.travelProjectionPreview) {
    return <Disabled />;
  }
  // flag ON → fixture bridge envelope を display 投影して read-only 表示（runtime は実行しない）。
  const display = projectDisplayScheduledItinerary(FIXTURE_BRIDGE_RESULT);
  if (!display) {
    return <Disabled />;
  }
  return <ScheduledDraftDisplay itinerary={display} />;
}
