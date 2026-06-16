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
import type { CoAlterProjectionCue } from "@/lib/shared/travel/coalter-projection-consume-types";

/** ★ cue.action → 中立 copy（raw cue.ref は UI に出さない・category/summary のみ）。 */
const CUE_ACTION_LABEL: Record<CoAlterProjectionCue["action"], string> = {
  ask_question: "追加で確認したいこと",
  ask_confirmation: "この点を確認してください",
  note_risk: "この案の注意点",
  show_fallback: "代替案があります",
  explain_plan: "補足",
};

/** richer read-only render（display-safe projection/cues のみ・中立 copy・action authority なし）。 */
export function TravelLiveReadyView({ state }: { state: Extract<TravelLiveActionState, { status: "ready" }> }) {
  const p = state.display.projection;
  const cueCount = state.display.cues.length;
  return (
    <div className="mt-3 space-y-1.5 rounded-lg border border-gray-200 bg-white/60 p-3" data-testid="travel-live-ready">
      <p className="text-[12px] font-bold text-gray-900">旅行プランの下書き</p>
      {p.answer.text && <p className="text-[12px] text-gray-800" data-testid="travel-live-answer">{p.answer.text}</p>}
      {p.whyThisPlan && p.whyThisPlan !== p.answer.text && (
        <p className="text-[12px] text-gray-700" data-testid="travel-live-why">理由: {p.whyThisPlan}</p>
      )}
      {p.viewerNote && (
        <p className="text-[12px] text-gray-700" data-testid="travel-live-viewer-note">あなた向け: {p.viewerNote}</p>
      )}
      {p.whatCouldFail.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-gray-500" data-testid="travel-live-risks">
          {p.whatCouldFail.map((f, i) => (
            <li key={i}>気をつける点: {f.note}</li>
          ))}
        </ul>
      )}
      {p.questionsToAsk.length > 0 && (
        <p className="text-[11px] text-gray-500" data-testid="travel-live-questions">追加で確認したいことがあります。</p>
      )}
      {p.readinessWarning.hasOpenConfirmations && (
        <p className="text-[11px] text-gray-500">確認が必要な項目があります。</p>
      )}
      {cueCount > 0 && (
        <div className="space-y-0.5" data-testid="travel-live-cues">
          <p className="text-[11px] font-bold text-gray-500">確認しておきたいこと</p>
          <ul className="space-y-0.5 text-[11px] text-gray-600">
            {/* ★ cue.action → 中立 copy のみ（raw cue.ref / id は出さない）。action 単位で dedupe。 */}
            {[...new Set(state.display.cues.map((c) => c.action))].map((action) => (
              <li key={action} data-testid="travel-live-cue">
                {CUE_ACTION_LABEL[action]}
              </li>
            ))}
          </ul>
        </div>
      )}
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

      {/* ★ B: participant identity は server auth から（client は送らない）。参加者は「あなた」のみ表示（raw userId 非表示）。 */}
      <p className="text-[11px] text-gray-500" data-testid="travel-live-participant">参加者: あなた</p>

      {/* permissioned event field のみ（status/participantId/user_id/TravelPlanEngineInput を送らない・status は server が surface から derive） */}
      <form action={formAction} className="space-y-2" data-testid="travel-live-form">
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
      {state.status === "ready" && <TravelLiveReadyView state={state} />}
    </section>
  );
}
