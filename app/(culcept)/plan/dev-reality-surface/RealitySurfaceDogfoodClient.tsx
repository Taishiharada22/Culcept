"use client";

/**
 * RealitySurfaceDogfoodClient — RJ2g dogfood preview の **表示専用** client component。
 *
 * 厳守（CEO RJ2g）:
 *   - **safe payload（RealitySurfaceDogfoodPreviewPayloadV0）のみ表示**。derive 関数を import しない（型のみ）。
 *   - **read-only / no-action**: onClick/送信/書込なし。choice は span（押せない・配信しない・apply しない）。
 *   - deliveredNow=false を表示（届けない）。internal object/trace/id は payload に含まれない（server で除去済）。
 */

import type { RealitySurfaceDogfoodPreviewPayloadV0 } from "@/lib/plan/realityCore/dogfoodPreview";
import type { RealDaySurfacePayloadV0 } from "@/lib/plan/realityCore/operatorDayPreview";

/** consumerView/renderedCopy/delivery の表示（fixture シナリオ・real 当日で共有・表示専用） */
function SurfaceBody({ display, claimTexts, questions, deliveryEligibility, deliveredNow }: {
  display: "render" | "suppress";
  claimTexts: ReadonlyArray<string>;
  questions: ReadonlyArray<{ text: string; choiceLabels: ReadonlyArray<string> }>;
  deliveryEligibility: string;
  deliveredNow: boolean;
}) {
  return (
    <>
      <p className="mt-0.5 text-[11px] text-gray-400">表示: {display} / 配信: {deliveryEligibility}（届けない: {deliveredNow === false ? "yes" : "no"}）</p>
      {claimTexts.length > 0 && (
        <ul className="mt-2 space-y-1">
          {claimTexts.map((t, i) => (
            <li key={i} className="text-[13px] text-gray-800">・{t}</li>
          ))}
        </ul>
      )}
      {questions.map((q, i) => (
        <div key={i} className="mt-2">
          <p className="text-[13px] text-gray-800">{q.text}</p>
          <div className="mt-1 flex gap-2">
            {q.choiceLabels.map((l, j) => (
              <span key={j} className="rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600">{l}</span>
            ))}
          </div>
        </div>
      ))}
      {display === "suppress" && <p className="mt-2 text-[12px] text-gray-400">（何も表示しない）</p>}
    </>
  );
}

export function RealitySurfaceDogfoodClient({ payload, realPayload }: { payload: RealitySurfaceDogfoodPreviewPayloadV0; realPayload?: RealDaySurfacePayloadV0 | null }) {
  return (
    <div className="mx-auto max-w-md px-4 py-6" data-testid="reality-surface-dogfood">
      <h1 className="text-lg font-bold text-gray-800">Reality Surface dogfood（read-only / 配信なし）</h1>
      <p className="mt-1 text-[12px] text-gray-500">deliveredNow=false・通知しません</p>

      {/* ── real-data section（あなたの当日・RD1a・fixture と明確に分離・fallback なし）── */}
      {realPayload && (
        <section className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3" data-testid="real-day-section">
          <h2 className="text-base font-bold text-emerald-800">あなたの当日（real・read-only）</h2>
          <p className="mt-0.5 text-[11px] text-emerald-700/70">
            one-off {realPayload.summary.includedOneOffCount} 件 / recurring 除外 {realPayload.summary.recurringExcludedCount} 件
          </p>
          {!realPayload.available || !realPayload.consumerView || !realPayload.renderedCopy || !realPayload.delivery ? (
            <p className="mt-2 text-[12px] text-emerald-700/60" data-testid="real-day-unavailable">表示できません（{realPayload.reasonCode ?? "unavailable"}）</p>
          ) : (
            <SurfaceBody
              display={realPayload.consumerView.display}
              claimTexts={realPayload.renderedCopy.claimCopies.map((c) => c.text)}
              questions={realPayload.renderedCopy.questionCopies.map((q) => ({ text: q.text, choiceLabels: q.choiceLabels }))}
              deliveryEligibility={realPayload.delivery.eligibility}
              deliveredNow={realPayload.delivery.deliveredNow}
            />
          )}
        </section>
      )}

      <h2 className="mt-8 text-base font-bold text-gray-700">代表シナリオ（fixture）</h2>
      <div className="mt-2 space-y-5">
        {payload.scenarios.map((s) => (
          <section key={s.scenarioKey} className="rounded-lg border border-gray-200 p-3" data-testid={`scenario-${s.scenarioKey}`}>
            <h2 className="text-sm font-semibold text-gray-700">{s.label}</h2>
            <p className="mt-0.5 text-[11px] text-gray-400">
              表示: {s.consumerView.display} / 配信: {s.delivery.eligibility}（届けない: {s.delivery.deliveredNow === false ? "yes" : "no"}）
            </p>

            {s.renderedCopy.claimCopies.length > 0 && (
              <ul className="mt-2 space-y-1">
                {s.renderedCopy.claimCopies.map((c, i) => (
                  <li key={i} className="text-[13px] text-gray-800">
                    ・{c.text}
                  </li>
                ))}
              </ul>
            )}

            {s.renderedCopy.questionCopies.map((q, i) => (
              <div key={i} className="mt-2">
                <p className="text-[13px] text-gray-800">{q.text}</p>
                <div className="mt-1 flex gap-2">
                  {q.choiceLabels.map((l, j) => (
                    <span key={j} className="rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600">
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            {s.consumerView.display === "suppress" && <p className="mt-2 text-[12px] text-gray-400">（何も表示しない）</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
