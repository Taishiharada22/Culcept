"use client";
/**
 * A1-6-9 Candidate Action E2E Preview client（§9.15・dev/staging 限定・**real route / real staging DB**）
 *
 * フロー: 「テスト候補を作成」（server action: sentinel seed insert）→ getE2EPreviewState（un-gated surface DTO + reflected plan）
 *   → banner のボタン → `postCandidateAction`（**real** /api/reality/candidate-action POST・browser auth cookie）→ 実 DB re-fetch:
 *     - accept → status=consumed → MorningPlan に item 反映（候補は surfaceable でなくなり消える）
 *     - dismiss → status=rejected → 候補消える・plan には出ない
 *     - later → no-op → 候補は残る（「あとで」表示）
 *   → 「クリーンアップ」（sentinel 削除・remaining 表示）。**optimistic でなく実 DB を読む**ので E2E の真値。
 *
 * 厳守: seedRef/UUID/raw を DOM/state に出さない（candidate は redacted DTO・plan item は opaque handle id）。
 */

import { useState } from "react";
import { CaptureCandidateBanner } from "@/components/home/morning/CaptureCandidateBanner";
import { postCandidateAction, type CandidateActionResult } from "@/components/home/morning/captureCandidateClient";
import type { CandidateActionKind } from "@/lib/plan/reality/candidate-action";
import { setupE2ETestCandidate, getE2EPreviewState, cleanupE2ETestCandidates, type E2EPreviewState } from "./actions";

export function CandidateActionsE2EClient() {
  const [state, setState] = useState<E2EPreviewState>({ candidate: null, planItems: [] });
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setState(await getE2EPreviewState());
  };

  const onSetup = async () => {
    setBusy(true);
    setMsg("テスト候補を作成中…");
    const r = await setupE2ETestCandidate();
    await refresh();
    setMsg(r.ok ? "テスト候補を作成しました（real seed）" : `作成失敗: ${r.error}`);
    setBusy(false);
  };

  const onCleanup = async () => {
    setBusy(true);
    setMsg("クリーンアップ中…");
    const r = await cleanupE2ETestCandidates();
    await refresh();
    setMsg(`クリーンアップ完了（残り ${r.remaining} 件）`);
    setBusy(false);
  };

  const onCandidateAction = async (handle: string, action: CandidateActionKind): Promise<CandidateActionResult> => {
    const result = await postCandidateAction(handle, action); // REAL route POST（auth cookie）
    await refresh(); // 実 DB 再読込（optimistic でなく真値）
    setMsg(`${action}: ${result.ok && result.accepted ? "成功（real DB 更新）" : `失敗(${result.reason})`}`);
    return result;
  };

  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-800">
      <h1 className="text-lg font-bold">Candidate Action E2E Preview</h1>
      <p className="mt-1 text-[12px] text-gray-500">
        A1-6-9・dev/staging 限定・<b>E2E（real route / real staging DB）</b>。「テスト候補を作成」→ banner のボタンで実際に{" "}
        <code className="text-[11px]">/api/reality/candidate-action</code> に POST し、DB status 更新 + MorningPlan 反映を確認します。
        <b>終わったら必ず「クリーンアップ」</b>。
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
        <button type="button" disabled={busy} onClick={onSetup} className="rounded-md bg-purple-600 px-2 py-1 font-medium text-white disabled:opacity-50">
          テスト候補を作成
        </button>
        <button type="button" disabled={busy} onClick={refresh} className="rounded-md border border-gray-300 px-2 py-1 text-gray-600 disabled:opacity-50">
          状態を更新
        </button>
        <button type="button" disabled={busy} onClick={onCleanup} className="rounded-md border border-red-300 px-2 py-1 text-red-600 disabled:opacity-50">
          クリーンアップ
        </button>
      </div>
      {msg && (
        <div className="mt-2 text-[12px] text-gray-600" data-testid="e2e-status">
          {msg}
        </div>
      )}

      <h2 className="mt-5 text-[13px] font-semibold text-gray-700">候補 banner（real route POST）</h2>
      <div className="mt-1">
        <CaptureCandidateBanner candidate={state.candidate} onCandidateAction={onCandidateAction} />
        {(!state.candidate || !state.candidate.hasCandidate) && (
          <p className="text-[12px] text-gray-400">候補なし（「テスト候補を作成」で追加）。</p>
        )}
      </div>

      <h2 className="mt-5 text-[13px] font-semibold text-gray-700">MorningPlan（real reflection・consumed→反映）</h2>
      <ul className="mt-1 space-y-1" data-testid="e2e-plan-items">
        {state.planItems.length === 0 && <li className="text-[12px] text-gray-400">（まだ反映なし）</li>}
        {state.planItems.map((it) => (
          <li key={it.id} className="rounded-md bg-gray-50 px-2 py-1 text-[12px] text-gray-700">
            <span className="text-gray-400">{it.startTime ?? "—"}</span> {it.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
