"use client";
/**
 * Reality Control OS — A1-5-7-6 / A1-6-8 Capture Candidate Banner（**UI・控えめ・additive**）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.46 / §9.13（A1-6-8）
 *
 * 役割: route response の `data.captureCandidate?`（A1-5-7-5）を MorningPlanCard 内で **控えめに additive 表示**し、
 *   A1-6-8 で **accept / dismiss / later ボタン**を追加（`onCandidateAction` 提供時のみ）。
 *
 * 厳守:
 *   - **candidate 無 / hasCandidate=false → null**（DOM に何も足さない＝既存 UI 完全不変）。
 *   - **`onCandidateAction` 未提供 → ボタン非表示**（read-only banner＝A1-5-7-6 と同一・flag off で既存 UI 不変）。
 *   - **request は handle のみ**（presenter 由来 opaque handle）。**seedRef / UUID / raw を DOM にも state にも出さない**（handle は opaque）。
 *   - invalid / failed → **安全に失敗表示**（「うまくいきませんでした」）。later → no-op（「あとで」表示・item 残す）。
 *   - 控えめ: 「候補があります」止まり。「確定」と断定しない。pending 中は disabled。
 */

import { useState } from "react";
import { presentCaptureCandidate } from "./captureCandidatePresenter";
import type { CandidateSurfaceDTO } from "@/lib/plan/reality/integration/candidate-surface";
import type { CandidateActionKind } from "@/lib/plan/reality/candidate-action";
import type { CandidateActionResult } from "./captureCandidateClient";

/** 1 item の action UI 状態（pending=POST 中 / error=失敗 / deferred=later 済）。 */
type ItemActionState = { pending?: boolean; error?: boolean; deferred?: boolean };

export function CaptureCandidateBanner({
  candidate,
  onCandidateAction,
}: {
  candidate?: CandidateSurfaceDTO | null;
  /** A1-6-8: accept/dismiss/later を route に送る handler（**未提供→ボタン非表示**=read-only banner）。 */
  onCandidateAction?: (handle: string, action: CandidateActionKind) => Promise<CandidateActionResult>;
}) {
  const display = presentCaptureCandidate(candidate);
  const [states, setStates] = useState<Record<string, ItemActionState>>({});
  if (!display) return null; // 表示なし（既存 UI 不変）

  const act = async (handle: string, action: CandidateActionKind) => {
    if (!onCandidateAction) return;
    setStates((s) => ({ ...s, [handle]: { pending: true } }));
    const result = await onCandidateAction(handle, action);
    setStates((s) => ({
      ...s,
      [handle]:
        result.ok && result.accepted
          ? action === "later"
            ? { deferred: true } // later=no-op（item 残す・「あとで」表示）
            : {} // accept/dismiss=親が item 除去（再 render で消える）
          : { error: true }, // 安全に失敗表示
    }));
  };

  return (
    <div
      data-testid="capture-candidate-banner"
      className="mb-3 rounded-xl border border-purple-200/60 bg-purple-50/50 px-3 py-2"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-purple-700">{display.heading}</span>
        <span className="text-[10px] text-purple-400">（候補）</span>
      </div>
      <div className="text-[11px] text-gray-500 mt-0.5">{display.note}</div>
      {display.items.length > 0 && (
        <ul className="mt-1 space-y-1">
          {display.items.map((it, i) => {
            const handle = it.handle;
            const st = handle ? states[handle] ?? {} : {};
            return (
              // A1-6-10: 複数候補時は薄い区切りで item を視覚分離（i>0 に border-top）。
              <li key={i} className={`text-[11px] text-gray-600 ${i > 0 ? "mt-1 border-t border-purple-100 pt-1" : ""}`}>
                <span>
                  {it.durationText}
                  <span className="text-gray-400"> · {it.sourceLabel}</span>
                  {it.bandLabel ? <span className="text-gray-400"> · {it.bandLabel}</span> : null}
                </span>
                {/* A1-6-8: action ボタン（onCandidateAction 提供 + handle あり + 未 deferred のみ） */}
                {onCandidateAction && handle && !st.deferred && (
                  <div data-testid="candidate-action-buttons" className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={st.pending}
                      onClick={() => act(handle, "accept")}
                      className="rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-medium text-white disabled:opacity-50"
                    >
                      予定に入れる
                    </button>
                    <button
                      type="button"
                      disabled={st.pending}
                      onClick={() => act(handle, "dismiss")}
                      className="rounded-full border border-gray-300 px-2 py-0.5 text-[10px] text-gray-500 disabled:opacity-50"
                    >
                      今はいい
                    </button>
                    <button
                      type="button"
                      disabled={st.pending}
                      onClick={() => act(handle, "later")}
                      className="px-1 py-0.5 text-[10px] text-gray-400 disabled:opacity-50"
                    >
                      あとで
                    </button>
                    {/* A1-6-10: pending を明示（送信中…）+ 失敗時は再試行できることを伝える。 */}
                    {st.pending && <span className="text-[10px] text-gray-400">送信中…</span>}
                    {st.error && <span className="text-[10px] text-red-400">うまくいきませんでした。もう一度試せます</span>}
                  </div>
                )}
                {st.deferred && <span className="ml-1 text-[10px] text-gray-400">あとでにしました</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
