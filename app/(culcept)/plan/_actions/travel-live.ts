"use server";
/**
 * B2-disp C — Production /plan Travel Live **read-only server action**（staging-gated・useActionState 返却・no persistence）
 *
 * 設計正本: docs/t11-rich-display-transport-boundary-design.md（§5 H + CEO 補正: 返り値型を構造で拘束）
 *
 * 役割: FormData の **許可 field のみ**を受け、**server で** gate→event 組成→binding→provider→adapter を実行し、
 *   **display-safe な `TravelLiveActionState` を RETURN**（`useActionState` 経由）。**rich を URL/persistence で運ばない**。
 *
 * 厳守:
 *   - gate first（`isPlanTravelLiveAllowed`・server-only flag が source of truth・production は常に deny）。off → 中立 unavailable（compute せず）。
 *   - ★ B: participant identity は **server auth context のみ**（`supabaseServer().auth.getUser()`・read-only）。
 *     未認証/anonymous → 中立 unavailable（engine/adapter を呼ばない）。**FormData から identity を読まない**。
 *   - permissioned event field のみ（`buildTravelSessionEventsFromFormData`）。status/participantId/user_id を **FormData から読まない**。
 *   - ready のみ engine（`buildTravelPlanDisplayResult` 内）→ **display-safe payload を返す**。AuthoritativePacketForServer/
 *     raw input/raw output/diagnostics/provenance を **返さない**（`toTravelLiveActionState` が型で拘束）。
 *   - **redirect しない**・**projection/cues を URL query に置かない**・**DB/persistence/Supabase write なし**・**service_role/admin path なし**。
 *   - no booking/calendar/action・no send/realtime/read receipt・no CoAlter/useCoAlter・no `/talk`・no Maps/safe link・no M2/route/weather/place。
 */

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { supabaseServer } from "@/lib/supabase/server";
import { isPlanTravelLiveAllowed } from "@/lib/plan/travel/plan-travel-live-gate";
import { buildTravelSessionEventsFromFormData } from "@/lib/plan/travel/travel-formdata-intake";
import { buildTravelPlanDisplayResult } from "@/lib/shared/travel/travel-plan-display-adapter";
import { toTravelLiveActionState, type TravelLiveActionState } from "@/lib/plan/travel/travel-live-action-state";

export async function submitTravelLiveIntakeAction(
  _prevState: TravelLiveActionState,
  formData: FormData,
): Promise<TravelLiveActionState> {
  // ① gate（server-only・default OFF・production deny）。off → 中立 unavailable（compute も transport もしない）。
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!isPlanTravelLiveAllowed({ travelLive: PLAN_FLAGS.travelLive, planRouteLive: PLAN_FLAGS.planRouteLive, supabaseUrl })) {
    return { status: "unavailable" };
  }

  // ② participant identity は **server auth context のみ**（read-only・FormData を信用しない）。
  //    未認証/anonymous → 中立 unavailable（engine/adapter を呼ばない・fail closed）。
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user || auth.user.is_anonymous) {
    return { status: "unavailable" };
  }
  const authUserId = auth.user.id;

  // ③ 許可 event field のみ（participantId/user_id は読まない）。participant は auth から注入（client 不信任）。
  const events = buildTravelSessionEventsFromFormData(formData);
  const result = buildTravelPlanDisplayResult(
    { events, participantIds: [authUserId], viewerId: authUserId },
    { fixtureAllowed: false },
  );

  // ④ display-safe な action state を RETURN（型で AuthoritativePacket/raw/diagnostics を拘束・redirect/persistence なし）。
  return toTravelLiveActionState(result);
}
