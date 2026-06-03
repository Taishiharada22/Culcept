/**
 * composeSaveRunner — 予定追加/編集の保存オーケストレーション（pure・テスト可能）。
 *
 * 目的（CEO×GPT 2026-06-03・2重登録 fix）:
 *   完了の **double-submit → server duplicate** を防ぐ。React state は非同期更新のため、
 *   同一tick の二度押しは `saveState` だけでは素通りする。**同期 ref guard を注入**して止める。
 *
 * 契約（不変）:
 *   - edits（editingAnchorId 有）は **PATCH のみ**（絶対に POST しない＝重複作成なし）。
 *   - news は createAnchorBundle（POST）**1回**。
 *   - 未配置 / 日跨ぎ等は対象外（splitDraftsForSave / planComposeSave が除外）。
 */

import { splitDraftsForSave, buildEditPatch } from "./composeEdit";
import { planComposeSave } from "./composeToAnchorInput";
import type { ComposeDraftState } from "./composeDraft";
import type { AnchorUpdatePatch } from "@/lib/plan/external-anchor-repository";
import type { CreateExternalAnchorInput } from "@/lib/plan/external-anchor-input";

export interface ComposeSaveDeps {
  updateAnchor: (
    anchorId: string,
    patch: AnchorUpdatePatch,
  ) => Promise<{ ok: boolean; error?: string }>;
  createAnchorBundle: (input: {
    source: { sourceType: "manual" };
    anchors: CreateExternalAnchorInput[];
  }) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * 同期ガード（呼び出し側は useRef で backing）。
 * React の setState は非同期のため、同一tick の二度押しは ref（同期）でしか止められない。
 */
export interface ComposeSaveGuard {
  isInFlight: () => boolean;
  setInFlight: (v: boolean) => void;
}

export type ComposeSaveResult =
  | { status: "saved"; savedDraftIds: string[] } // 呼び出し側が compose state から除去（再オープン時の二重表示防止）
  | { status: "busy" } // in-flight 中の二重呼び出し → 無視（1回目が所有）
  | { status: "nothing"; message: string }
  | { status: "error"; message: string };

/**
 * 保存実行。**先頭で同期 ref guard を立て**、in-flight 中の2回目は即 `busy`（POST しない）。
 */
export async function runComposeSave(
  drafts: ReadonlyArray<ComposeDraftState>,
  dateISO: string,
  deps: ComposeSaveDeps,
  guard: ComposeSaveGuard,
): Promise<ComposeSaveResult> {
  // ① 同期 ref guard（最初の await より前に立てる＝同一tick の二度押しを止める核）。
  if (guard.isInFlight()) return { status: "busy" };
  guard.setInFlight(true);
  try {
    const { edits, news } = splitDraftsForSave(drafts);
    const plan = planComposeSave(news, dateISO);
    if (edits.length === 0 && plan.kind === "nothing_to_save") {
      return {
        status: "nothing",
        message:
          plan.excluded.length > 0
            ? "保存できる予定がありません（日跨ぎ等は除外されます）"
            : "左のタイムラインに予定を配置してください",
      };
    }
    // ② 編集分は PATCH のみ。
    for (const ed of edits) {
      if (!ed.editingAnchorId) continue;
      const r = await deps.updateAnchor(ed.editingAnchorId, buildEditPatch(ed));
      if (!r.ok) {
        return { status: "error", message: r.error ?? "予定の更新に失敗しました" };
      }
    }
    // ③ 新規分は POST 1回。
    if (plan.kind === "save") {
      const r = await deps.createAnchorBundle({
        source: { sourceType: "manual" },
        anchors: plan.inputs,
      });
      if (!r.ok) {
        return { status: "error", message: r.error ?? "保存に失敗しました" };
      }
    }
    // 保存済み draft の id（編集分 + 実際に POST された新規分・日跨ぎ等の除外は含めない）。
    // 呼び出し側がこれを compose state から remove ＝ 再オープン時に既存予定と二重表示しない核。
    const savedDraftIds = [
      ...edits.map((e) => e.id),
      ...(plan.kind === "save"
        ? news.filter((n) => !plan.excluded.some((x) => x.id === n.id)).map((n) => n.id)
        : []),
    ];
    return { status: "saved", savedDraftIds };
  } finally {
    // 成功/失敗どちらでも解除（次の保存・再試行を可能にする）。busy 早期 return はここを通らない。
    guard.setInFlight(false);
  }
}
