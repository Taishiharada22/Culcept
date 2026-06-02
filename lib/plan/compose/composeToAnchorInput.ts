/**
 * composeToAnchorInput — 保存境界 converter（A-4a・pure）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md §4.2 / §4.7 / A-0-1 / A-0-2
 *
 * placed な ComposeDraftState[] → CreateExternalAnchorInput[]（one_off）。
 *   - A-0-2: ComposeDraft → AnchorFormState → buildAnchorInputFromForm（既存の検証済み
 *     単一経路を再利用 = persisted contract を 1 ビットも変えない）。
 *   - A-0-1: endTime は both / 終了のみ で start+end、未定 / 開始のみ で start のみ（end=null）。
 *   - 日跨ぎ（crossesMidnight）は **保存除外**（CEO 条件: Phase A は wrap を保存しない）。
 *   - rigidity 未選択（""）は soft（動かせる＝安全側・Alter 調整可）に既定化。
 *
 * 範囲外（A-4a）: createAnchorBundle 呼び出し / source 構築 / PlanClient / flag / DB（A-4b）。
 */

import {
  type AnchorFormState,
  buildAnchorInputFromForm,
  emptyAnchorFormState,
} from "@/lib/plan/anchor-input-form";
import type {
  AnchorInputValidationError,
  CreateExternalAnchorInput,
} from "@/lib/plan/external-anchor-input";
import { formatMinutes } from "@/lib/plan/timeline-geometry";
import type { ComposeDraftState } from "@/lib/plan/compose/composeDraft";

/** 未選択 rigidity の既定。soft = 動かせる（安全側・Alter 調整可）。 */
export const DEFAULT_RIGIDITY = "soft" as const;

export type ComposeExcludeReason = "crosses_midnight" | "invalid";

export interface ComposeExcluded {
  id: string;
  reason: ComposeExcludeReason;
  errors?: AnchorInputValidationError[];
}

export interface ComposeConvertResult {
  /** createAnchorBundle にそのまま渡せる（one_off） */
  inputs: CreateExternalAnchorInput[];
  /** 保存除外（日跨ぎ）/ 検証失敗（errors 付き） */
  excluded: ComposeExcluded[];
}

/** placed draft 1 件 → AnchorFormState（保存境界の写像）。placed でなければ null。 */
export function placedDraftToFormState(
  draft: ComposeDraftState,
  dateISO: string,
): AnchorFormState | null {
  if (draft.placement.status !== "placed") return null;
  const p = draft.placement;
  return {
    ...emptyAnchorFormState(),
    kind: "one_off",
    title: draft.core.title,
    date: dateISO,
    startTime: formatMinutes(p.startMin),
    endTime: p.endMin != null ? formatMinutes(p.endMin) : "",
    rigidity: draft.core.rigidity === "" ? DEFAULT_RIGIDITY : draft.core.rigidity,
    locationText: draft.core.locationText,
    locationCategory: draft.core.locationCategory ?? "",
    // 誰と (P4): draft.core.companions → 保存境界。空/未指定は []（builder が列に書かない）。
    companions: draft.core.companions ?? [],
    sourceType: "manual",
  };
}

/**
 * placed draft 群 → 保存入力。
 *   - 日跨ぎ（crossesMidnight）は除外（reason: "crosses_midnight"）
 *   - 検証失敗も除外（reason: "invalid" + errors）
 *   - unplaced draft は対象外（無視）
 * 入力順を保つ。
 */
export function placedDraftsToAnchorInputs(
  drafts: ComposeDraftState[],
  dateISO: string,
): ComposeConvertResult {
  const inputs: CreateExternalAnchorInput[] = [];
  const excluded: ComposeExcluded[] = [];

  for (const draft of drafts) {
    if (draft.placement.status !== "placed") continue;
    if (draft.placement.crossesMidnight) {
      excluded.push({ id: draft.id, reason: "crosses_midnight" });
      continue;
    }
    const form = placedDraftToFormState(draft, dateISO);
    if (!form) continue;
    const built = buildAnchorInputFromForm(form);
    if (built.valid) {
      inputs.push(built.input);
    } else {
      excluded.push({ id: draft.id, reason: "invalid", errors: built.errors });
    }
  }

  return { inputs, excluded };
}

/**
 * 保存判断（pure・副作用なし）。container の「完了」が createAnchorBundle を呼ぶ前に使う。
 *
 *   - inputs が空（= 配置なし or 日跨ぎ等で全除外）→ kind:"nothing_to_save"
 *     → container は **API を呼ばず**警告 notice のみ（CEO 2026-06-01: 日跨ぎのみ配置 → 保存走らせない）
 *   - inputs あり → kind:"save"（container が createAnchorBundle に inputs を渡す）
 *
 * これにより「保存すべきか」の判断を副作用（fetch）から分離し、単体テストで固定する。
 */
export type ComposeSavePlan =
  | { kind: "nothing_to_save"; excluded: ComposeExcluded[] }
  | {
      kind: "save";
      inputs: CreateExternalAnchorInput[];
      excluded: ComposeExcluded[];
    };

export function planComposeSave(
  drafts: ComposeDraftState[],
  dateISO: string,
): ComposeSavePlan {
  const { inputs, excluded } = placedDraftsToAnchorInputs(drafts, dateISO);
  if (inputs.length === 0) return { kind: "nothing_to_save", excluded };
  return { kind: "save", inputs, excluded };
}
