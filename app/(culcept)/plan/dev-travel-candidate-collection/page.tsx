/**
 * /plan/dev-travel-candidate-collection — Candidate Collection Display **read-only dev preview**
 *   （**fixture 入力のみ・runtime 非配線・read-only・送信なし・本番 /plan 非接触**）
 *
 * 設計: docs/t11-candidate-collection-display-preview-preflight.md §7
 *
 * 目的: server-only CandidateCollectionDraft → client-safe `DisplayCandidateCollection` の表示 UX を目視確認。
 *   solver/converter/insertion runtime は実行しない（fixture draft を display 投影するのみ）。
 *
 * 厳守:
 *   - flag `PLAN_TRAVEL_PROJECTION_PREVIEW`（既存・server default OFF）→ OFF なら Disabled（render しない）。
 *   - **fixture のみ**（real data なし・engine/converter/insertion 非実行・raw draft 非表示）。
 *   - **read-only**（write/insert/update/delete/upsert/apply/seed なし）。
 *   - no API/fetch/DB/Supabase/送信/realtime/read receipt/useCoAlter/外部 Maps/booking。本番 `/plan` に触れない。
 *   - TravelCorePlan に触れない（CandidateCollectionDraft のみ消費）。
 */

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { projectDisplayCandidateCollection } from "@/lib/shared/travel/candidate-collection-display";
import { CandidateCollectionDisplay } from "./CandidateCollectionDisplay";
import { FIXTURE_COLLECTION_DRAFT } from "./fixture";

export const dynamic = "force-dynamic";

/** flag OFF（本番デフォルト）の fail-closed 表示。preview を render しない。 */
function Disabled() {
  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-600" data-testid="candidate-collection-disabled">
      <h1 className="text-lg font-bold">Candidate Collection Preview（read-only・dev）</h1>
      <p className="mt-2 text-[12px] text-gray-500">PLAN_TRAVEL_PROJECTION_PREVIEW=OFF（表示しません）。</p>
    </div>
  );
}

export default function DevTravelCandidateCollectionPage() {
  // flag OFF → fail-closed（fixture も render しない）。本番デフォルト OFF。
  if (!PLAN_FLAGS.travelProjectionPreview) {
    return <Disabled />;
  }
  // flag ON → fixture draft を client-safe 投影して read-only 表示（runtime は実行しない）。
  const collection = projectDisplayCandidateCollection(FIXTURE_COLLECTION_DRAFT);
  return <CandidateCollectionDisplay collection={collection} />;
}
