"use client";
/**
 * A1-6-8 Candidate Action UI — render-only preview client（§9.14・dev/staging 限定・real route/DB 不使用）
 *
 * fixture candidate + fixture MorningPlan を local state で持ち、`onCandidateAction` は **REAL pure helper**
 * `applyCandidateActionResult`（A1-6-8）で local plan に optimistic add する。banner / buttons / 状態遷移は本物。
 *   - accept → MorningPlan に item 追加 + 候補から除去（optimistic・A1-6-7 merge 経由）。
 *   - dismiss → 候補から除去。later → no-op（「あとで」表示・候補残す）。
 *   - 「失敗をシミュレート」ON → result.accepted=false → 安全に失敗表示（state 不変）。
 * **real network なし**（postCandidateAction は呼ばない）。route は A1-6-6・reflection は A1-6-7 で staging 検証済。
 */

import { useState } from "react";
import { CaptureCandidateBanner } from "@/components/home/morning/CaptureCandidateBanner";
import {
  applyCandidateActionResult,
  type CandidateActionResult,
  type CandidateActionState,
} from "@/components/home/morning/captureCandidateClient";
import type { CandidateSurfaceDTO } from "@/lib/plan/reality/integration/candidate-surface";
import type { MorningPlan } from "@/lib/alter-morning/types";
import type { CandidateActionKind } from "@/lib/plan/reality/candidate-action";

/** candidate.date と plan.date を一致させる（merge の date filter を通すため）。 */
const PREVIEW_DATE = "2026-06-15";
const HANDLE_1 = "c1:" + "1".repeat(64);
const HANDLE_2 = "c1:" + "2".repeat(64);

function initialCandidate(): CandidateSurfaceDTO {
  return {
    hasCandidate: true,
    candidateCount: 2,
    status: "has_candidate",
    items: [
      { durationMin: 60, evidenceSource: "seed_explicit", date: PREVIEW_DATE, band: "afternoon", confidenceBand: "high", handle: HANDLE_1 },
      { durationMin: 30, evidenceSource: "correction", date: PREVIEW_DATE, band: "evening", confidenceBand: "medium", handle: HANDLE_2 },
    ],
  };
}

function initialPlan(): MorningPlan {
  // 本 preview は date + items のみ参照（他 field は merge が spread 保持）。fixture cast。
  return {
    date: PREVIEW_DATE,
    items: [
      { id: "fixed-1", kind: "fixed", text: "ミーティング", what: "ミーティング", startTime: "10:00", durationMin: 60, fixedStart: true, orderHint: 0, sourceTurnIndex: 0, completed: false },
    ],
  } as unknown as MorningPlan;
}

export function CandidateActionsPreviewClient() {
  const [state, setState] = useState<CandidateActionState>(() => ({ plan: initialPlan(), candidate: initialCandidate() }));
  const [simulateFail, setSimulateFail] = useState(false);

  const onCandidateAction = async (handle: string, action: CandidateActionKind): Promise<CandidateActionResult> => {
    await new Promise((resolve) => setTimeout(resolve, 500)); // pending 状態を目視できるよう疑似遅延
    const result: CandidateActionResult = simulateFail
      ? { ok: true, accepted: false, reason: "simulated_fail", reflectsToPlan: false, deferred: false }
      : { ok: true, accepted: true, reason: "ok", reflectsToPlan: action === "accept", deferred: action === "later" };
    setState((s) => applyCandidateActionResult(s, handle, action, result)); // REAL pure helper（A1-6-8）
    return result;
  };

  const planItems = state.plan?.items ?? [];

  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-800">
      <h1 className="text-lg font-bold">Candidate Action UI Preview</h1>
      <p className="mt-1 text-[12px] text-gray-500">
        A1-6-8・dev/staging 限定・<b>render-only</b>（real route / DB は呼びません）。下の候補でボタンを押すと
        MorningPlan に <b>optimistic 反映</b>されます（実際の承認 route は A1-6-6 で staging 検証済）。
      </p>

      <div className="mt-3 flex items-center gap-3 text-[12px]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={simulateFail} onChange={(e) => setSimulateFail(e.target.checked)} />
          失敗をシミュレート
        </label>
        <button
          type="button"
          onClick={() => setState({ plan: initialPlan(), candidate: initialCandidate() })}
          className="rounded-md border border-gray-300 px-2 py-0.5 text-gray-600"
        >
          リセット
        </button>
      </div>

      <h2 className="mt-5 text-[13px] font-semibold text-gray-700">候補 banner</h2>
      <div className="mt-1">
        <CaptureCandidateBanner candidate={state.candidate} onCandidateAction={onCandidateAction} />
        {(!state.candidate || !state.candidate.hasCandidate) && (
          <p className="text-[12px] text-gray-400">候補はありません（accept / dismiss で消えました・リセットで戻ります）。</p>
        )}
      </div>

      <h2 className="mt-5 text-[13px] font-semibold text-gray-700">MorningPlan（optimistic 反映先）</h2>
      <ul className="mt-1 space-y-1" data-testid="preview-plan-items">
        {planItems.map((it) => (
          <li key={it.id} className="rounded-md bg-gray-50 px-2 py-1 text-[12px] text-gray-700">
            <span className="text-gray-400">{it.startTime ?? "—"}</span> {it.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
