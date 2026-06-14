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

export function RealitySurfaceDogfoodClient({ payload }: { payload: RealitySurfaceDogfoodPreviewPayloadV0 }) {
  return (
    <div className="mx-auto max-w-md px-4 py-6" data-testid="reality-surface-dogfood">
      <h1 className="text-lg font-bold text-gray-800">Reality Surface dogfood（read-only / 配信なし）</h1>
      <p className="mt-1 text-[12px] text-gray-500">代表シナリオ・deliveredNow=false・通知しません</p>

      <div className="mt-4 space-y-5">
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
