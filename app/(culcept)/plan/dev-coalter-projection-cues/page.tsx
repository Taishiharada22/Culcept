/**
 * /plan/dev-coalter-projection-cues — T11-B(CoAlter) CoAlter Cue **read-only dev preview**
 *   （**fixture cue のみ・runtime 非実行・read-only・送信なし・本番 /plan 非接触**）
 *
 * 設計: docs/t11-g-h-a-b-closeout-and-next-branch.md §8（Option B）
 *
 * 目的: `deriveCoAlterProjectionCues` が projection から作る display/proposal cue を **目視確認**する。
 *   CoAlter runtime（useCoAlter / /talk / send / server-authoritative）は一切実行しない。
 *
 * 厳守:
 *   - flag は **既存 `PLAN_TRAVEL_PROJECTION_PREVIEW`（PLAN_FLAGS.travelProjectionPreview）を再利用**
 *     （新 flag を足さない）。OFF なら Disabled（render しない）。default OFF。
 *   - **fixture cue のみ**（runtime/engine 非実行・authoritative packet/raw FitResult 不使用）。
 *   - **read-only**（write/apply/seed なし・PlanClient 非接続）。
 *   - no API/fetch/DB/Supabase/送信/realtime/read receipt/useCoAlter/talk runtime。本番 /plan に触れない。
 */

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { CoAlterCuesPreview } from "./CoAlterCuesPreview";
import { FIXTURE_COALTER_CUES } from "./fixture";

export const dynamic = "force-dynamic";

/** flag OFF（本番デフォルト）の fail-closed 表示。preview を render しない。 */
function Disabled() {
  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-600" data-testid="coalter-cues-disabled">
      <h1 className="text-lg font-bold">CoAlter Cues Preview（read-only・dev）</h1>
      <p className="mt-2 text-[12px] text-gray-500">PLAN_TRAVEL_PROJECTION_PREVIEW=OFF（表示しません）。</p>
    </div>
  );
}

export default function DevCoAlterProjectionCuesPage() {
  // flag OFF → fail-closed（fixture cue も render しない）。本番デフォルト OFF。既存 flag を再利用。
  if (!PLAN_FLAGS.travelProjectionPreview) {
    return <Disabled />;
  }
  // flag ON → fixture cue を read-only 表示（runtime/CoAlter は実行しない）。
  return <CoAlterCuesPreview cues={FIXTURE_COALTER_CUES} />;
}
