/**
 * Draft extraction submit orchestrator — client-safe・DI（SR B1b-2C-8-c-3）
 *
 * 役割: dev-shift-draft host の「下書きを取り出す」submit を、
 *   crop 生成 → FormData 作成 → server action 呼出 → outcome 変換 の順で組み立てる。
 *   server 側 runExtractShiftDraft（DI runner）の client 版鏡写し。
 *
 * 設計核心（CEO 補正・2026-06-01）:
 *   - **画像 decode は本 module の外**（component / browser）。本 module は decode 済 image に
 *     束縛された `generateCrops` thunk を受けるだけ → **node で単体テスト可**（jsdom/canvas 不要）。
 *   - **callAction は引数注入（DI seam）**: 実 component は extractShiftDraftAction、test は fake。
 *     → **VLM 本体は test で絶対に走らない**。
 *   - **onActionStart は crop 成功後・action 直前に発火**: invalid selection（crop null）では
 *     呼ばれない → 「無効選択なのに loading」を防ぐ（component が extracting へ入る合図）。
 *   - **raw response / base64 / Blob を outcome に載せない**: cells（safe）/ message（safe copy）のみ。
 *   - **FormData は本 submit 内だけで作る**: header/personRow（Blob）+ year/month/daysInMonth。
 *     base64 は client で作らない（Blob を直接 append、FileReader 不使用）。
 *
 * 不変原則: 実行時 import ゼロ（型は全て import type で erase）。FormData / String のみ使用。
 *   throw は呼び元（component）が拾う（decode/canvas 例外）。本 module は throw しない。
 */

import type { AssistedCropOutput } from "./assistedCropGenerator";
import type { ExtractShiftDraftResult } from "./runExtractShiftDraft";
import type { ShiftReviewCell } from "./shiftReviewClassification";

export interface DraftExtractionSubmitDeps {
  /** 対象年（targetMonth から）。FormData metadata に使う。 */
  year: number;
  /** 対象月 1..12。 */
  month: number;
  /** 当月日数（targetYear/month から再計算済）。 */
  daysInMonth: number;
  /**
   * SR B1b-2C-9-FIX-2: VLM 画像入力モード。
   *   - "split"（既定）: generateCrops の戻り（header + personRow）を 2 field で送る
   *   - "combined": generateCombined の戻り（combined）を 1 field で送る
   * **mode は server-side env 由来**（page.tsx 経由で client に渡る）。client は
   * このモードに従って FormData を組み立てるが、**server 側で env から再評価**して
   * 不一致なら invalid_input（client から mode を信用しない設計）。
   */
  mode: "split" | "combined";
  /**
   * split mode 用: decode 済 image に束縛された 2 枚 crop 生成 thunk。
   * combined mode では使わない（null 不要）。
   */
  generateCrops?: () => Promise<AssistedCropOutput | null>;
  /**
   * combined mode 用: decode 済 image に束縛された 1 枚 combined 生成 thunk。
   * split mode では使わない。
   */
  generateCombined?: () => Promise<{ blob: Blob } | null>;
  /**
   * server action（DI seam）。
   * - 実 component: extractShiftDraftAction
   * - test: fake（VLM 非実行）
   */
  callAction: (formData: FormData) => Promise<ExtractShiftDraftResult>;
  /** crop 成功後・action 直前に 1 回発火（component が extracting へ遷移する合図）。 */
  onActionStart?: () => void;
}

/** submit の結果。Blob / base64 / raw response を含まない（cells と safe message のみ）。 */
export type DraftExtractionSubmitOutcome =
  | { kind: "cells"; cells: ShiftReviewCell[]; year: number; month: number }
  | { kind: "error"; message: string }
  | { kind: "invalid_selection" };

/**
 * crop → FormData → action → outcome。
 *
 * 手順:
 *   ① generateCrops()。null（invalid selection）→ **action を呼ばず** invalid_selection。
 *   ② FormData 作成（header/personRow Blob + year/month/daysInMonth 文字列）。
 *   ③ onActionStart()（extracting 合図）→ callAction()。
 *   ④ result.ok → cells / それ以外 → error（message は既に safe copy）。
 */
export async function runDraftExtractionSubmit(
  deps: DraftExtractionSubmitDeps
): Promise<DraftExtractionSubmitOutcome> {
  // ① crop 生成（mode 別・invalid selection は null → action 未呼出）
  const formData = new FormData();
  formData.set("year", String(deps.year));
  formData.set("month", String(deps.month));
  formData.set("daysInMonth", String(deps.daysInMonth));

  if (deps.mode === "combined") {
    if (!deps.generateCombined) return { kind: "invalid_selection" };
    const combined = await deps.generateCombined();
    if (!combined) return { kind: "invalid_selection" };
    formData.set("combined", combined.blob);
  } else {
    if (!deps.generateCrops) return { kind: "invalid_selection" };
    const crops = await deps.generateCrops();
    if (!crops) return { kind: "invalid_selection" };
    formData.set("header", crops.header.blob);
    formData.set("personRow", crops.personRow.blob);
  }

  // ② extracting 合図 → action（VLM cost 入口・DI seam）
  deps.onActionStart?.();
  const result = await deps.callAction(formData);

  // ③ outcome 変換（raw / base64 を載せない）
  if (result.ok) {
    return { kind: "cells", cells: result.cells, year: deps.year, month: deps.month };
  }
  return { kind: "error", message: result.error.message };
}
