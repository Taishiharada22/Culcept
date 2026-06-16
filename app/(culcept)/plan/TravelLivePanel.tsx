"use client";
/**
 * B2-disp C — Travel Live read-only panel（**client・useActionState・display-safe state のみ render**）
 *
 * 設計正本: docs/t11-production-plan-travel-live-gate-design.md / t11-rich-display-transport-boundary-design.md
 *
 * 厳守:
 *   - **gate は server が計算**（`visible` prop）。client は env を読まない・flag を判定しない。
 *   - server action を `useActionState` で使う（**engine/adapter を直接 import/呼出しない**）。
 *   - 送るのは **permissioned field のみ**（status / TravelPlanEngineInput を送らない）。
 *   - render は **中立 prompt / projection / cues のみ**（display-safe state）。
 *   - **booking/calendar/execute/send button なし**・外部 link/href なし・useCoAlter/`/talk`/realtime なし。
 *   - 中立 copy（「旅行プランの下書き / まだ確認が必要です / 追加で教えてください / これは予約・確定ではありません」）。
 */

import { useActionState } from "react";
import { submitTravelLiveIntakeAction } from "./_actions/travel-live";
import { TRAVEL_LIVE_INITIAL_STATE, type TravelLiveActionState } from "@/lib/plan/travel/travel-live-action-state";

function ReadyView({ state }: { state: Extract<TravelLiveActionState, { status: "ready" }> }) {
  return (
    <div className="mt-3 space-y-1 rounded-lg border border-gray-200 bg-white/60 p-3" data-testid="travel-live-ready">
      <p className="text-[12px] font-bold text-gray-900">旅行プランの下書き</p>
      <p className="text-[12px] text-gray-700">{state.display.projection.whyThisPlan}</p>
      <p className="text-[11px] text-gray-400">これは予約・確定ではありません。</p>
    </div>
  );
}

export function TravelLivePanel({ visible }: { visible: boolean }) {
  const [state, formAction] = useActionState(submitTravelLiveIntakeAction, TRAVEL_LIVE_INITIAL_STATE);
  // ★ gate は server 計算（visible）。client は判定しない。OFF → 何も出さない。
  if (!visible) return null;

  return (
    <section className="mx-auto max-w-md space-y-2 px-4 py-4" data-testid="travel-live-panel">
      <header>
        <h2 className="text-[15px] font-bold text-gray-900">旅行プランの下書き</h2>
        <p className="text-[11px] text-gray-400">これは予約・確定ではありません。</p>
      </header>

      {/* permissioned field のみ（status/TravelPlanEngineInput を送らない・status は server が surface から derive） */}
      <form action={formAction} className="space-y-2" data-testid="travel-live-form">
        <input type="hidden" name="participantId" value="P1" />
        <input name="destination" placeholder="行き先（例: 京都）" className="w-full rounded border border-gray-200 px-2 py-1 text-[13px]" />
        <input name="date" type="date" className="w-full rounded border border-gray-200 px-2 py-1 text-[13px]" />
        <button type="submit" className="rounded bg-gray-800 px-3 py-1 text-[12px] text-white" data-testid="travel-live-submit">
          下書きを見る
        </button>
      </form>

      {state.status === "not_ready_missing" && (
        <p className="text-[12px] text-gray-600" data-testid="travel-live-missing">追加で教えてください。</p>
      )}
      {state.status === "not_ready_unconfirmed" && (
        <p className="text-[12px] text-gray-600" data-testid="travel-live-unconfirmed">まだ確認が必要です。</p>
      )}
      {state.status === "invalid" && (
        <p className="text-[12px] text-gray-500" data-testid="travel-live-invalid">入力をご確認ください。</p>
      )}
      {state.status === "unavailable" && (
        <p className="text-[11px] text-gray-400" data-testid="travel-live-unavailable">いまは表示できません。</p>
      )}
      {state.status === "ready" && <ReadyView state={state} />}
    </section>
  );
}
