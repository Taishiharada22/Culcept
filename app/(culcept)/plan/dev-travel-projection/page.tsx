/**
 * /plan/dev-travel-projection — T11-A Travel Projection **read-only dev preview**
 *   （**fixture 入力のみ・live engine 非配線・read-only・送信なし・本番 /plan 非接触**）
 *
 * 設計: docs/t11-ui-coalter-consume-wiring-preflight.md §7（Option A）
 *
 * 目的: 純 display chain（toDisplayPacket → buildPlanIntelligenceProjection）が作る
 *   `PlanIntelligenceProjection` の **説明 UX を目視確認**する。engine runtime は実行しない。
 *
 * 厳守:
 *   - flag `PLAN_TRAVEL_PROJECTION_PREVIEW`（server default OFF）→ OFF なら Disabled（render しない）。
 *   - **fixture projection のみ**（runTravelPlanEngine 非実行・authoritative packet 不使用・raw FitResult 不使用）。
 *   - **read-only**（write/insert/update/delete/upsert/apply/seed なし・PlanClient 非接続）。
 *   - no API/fetch/DB/Supabase/送信/realtime/read receipt/useCoAlter。本番 `/plan` 体験に触れない。
 */

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { TravelProjectionPreview } from "./TravelProjectionPreview";
import { FIXTURE_TRAVEL_PROJECTION } from "./fixture";

export const dynamic = "force-dynamic";

/** flag OFF（本番デフォルト）の fail-closed 表示。preview を render しない。 */
function Disabled() {
  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-600" data-testid="travel-projection-disabled">
      <h1 className="text-lg font-bold">Travel Projection Preview（read-only・dev）</h1>
      <p className="mt-2 text-[12px] text-gray-500">PLAN_TRAVEL_PROJECTION_PREVIEW=OFF（表示しません）。</p>
    </div>
  );
}

export default function DevTravelProjectionPage() {
  // flag OFF → fail-closed（fixture も render しない）。本番デフォルト OFF。
  if (!PLAN_FLAGS.travelProjectionPreview) {
    return <Disabled />;
  }
  // flag ON → fixture projection を read-only 表示（engine は実行しない）。
  return <TravelProjectionPreview projection={FIXTURE_TRAVEL_PROJECTION} />;
}
