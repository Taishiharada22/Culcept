"use server";
/**
 * B2-disp C — Production /plan Travel Live **read-only server action boundary**（staging-gated・no persistence）
 *
 * 設計正本: docs/t11-production-plan-travel-live-gate-design.md（§5/§7 + CEO boundary: rich display 転送は persistence を要する→本 slice 不可）
 *
 * 役割: FormData の **許可 field のみ**を受け、**server で** gate→event 組成→binding→provider readiness を実行し、
 *   **中立 status のみ** PRG で返す。**rich display（projection/cues）は転送しない**（persistence 不可ゆえ別 slice）。
 *
 * 厳守:
 *   - gate（`isPlanTravelLiveAllowed`・server-only flag が source of truth・production は常に deny）。off → fail closed（compute せず）。
 *   - 読むのは permissioned field のみ（`buildTravelSessionEventsFromFormData`）。status/user_id/raw input/raw output/
 *     AuthoritativePacketForServer/diagnostics/booking/calendar を **FormData から読まない**。
 *   - **engine を呼ばない**（readiness のみ・rich display 転送は本 slice では不可）・`buildTravelPlanDisplayResult` 不使用。
 *   - **DB/persistence/Supabase write なし**・**redirect/query に diagnostics/provenance/private を載せない**。
 *   - no booking/calendar/action・no send/realtime/read receipt・no CoAlter/useCoAlter・no `/talk`・no Maps URL/safe link・no M2/route/weather/place。
 */

import { redirect } from "next/navigation";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { isPlanTravelLiveAllowed } from "@/lib/plan/travel/plan-travel-live-gate";
import { buildTravelSessionEventsFromFormData } from "@/lib/plan/travel/travel-formdata-intake";
import { bindTravelSessionIntake } from "@/lib/shared/travel/travel-session-binding";
import { getProductionTravelInput } from "@/lib/shared/travel/production-travel-input";

export async function submitTravelLiveIntakeAction(formData: FormData): Promise<void> {
  // ① gate（server-only・default OFF・production deny）。off → fail closed（compute も transport もしない）。
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!isPlanTravelLiveAllowed({ travelLive: PLAN_FLAGS.travelLive, planRouteLive: PLAN_FLAGS.planRouteLive, supabaseUrl })) {
    redirect("/plan");
  }

  // ② 許可 field のみ → 構造化 events（status は読まず binding が surface から derive）。
  const input = buildTravelSessionEventsFromFormData(formData);
  const intake = bindTravelSessionIntake(input);

  // ③ provider で readiness のみ判定（**engine を呼ばない**・rich display は組まない）。
  const provided = getProductionTravelInput(intake, { fixtureAllowed: false });

  // ④ ★ rich display（projection/cues）転送は persistence を要するため本 slice では行わない（CEO boundary）。
  //   中立 status のみ PRG（diagnostics/provenance/private/missing 詳細を載せない）。
  redirect(`/plan?travelStatus=${encodeURIComponent(provided.status)}`);
}
