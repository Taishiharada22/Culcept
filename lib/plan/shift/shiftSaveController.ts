/**
 * シフト保存 state machine / controller（pure / no React）— SR Step 6D
 *
 * ShiftReviewGrid から独立した、保存状態管理の host-agnostic な核。
 * 実 Server Action は **注入**（`save`）。本 module は副作用なし・throw しない・React 非依存で、
 * 単体 test 可能（fake save + onStateChange spy で全分岐を固定）。
 *
 * pre-save policy（CEO/GPT 2026-05-31）:
 *   - unresolved（未知コード）= hard block（保存しない）
 *   - candidate（希望休 HREQ）= 通す
 *   - blank-risk（低信頼/空欄隣接）= soft confirmation（1 度 needs_blank_risk_confirmation で止め、
 *     2 回目 confirmBlankRisk で保存へ進む）
 *
 * 不変原則:
 *   - userId/importRange/projection は注入 save（= server action → runShiftImportSave）が server 側で処理。
 *   - raw error を state に載せない（safe message のみ）。
 *   - 二重 submit ガード（saving 中の requestSave/confirmBlankRisk は無視）。
 */

import type { ShiftCodeDictionary } from "./shiftCodeDictionary";
import {
  classifyPreSave,
  DEFAULT_LOW_CONFIDENCE_THRESHOLD,
  type ShiftReviewCell,
} from "./shiftReviewClassification";
import {
  SHIFT_IMPORT_ACTION_MESSAGES,
  type ShiftImportActionResult,
  type ShiftImportSaveActionInput,
} from "./runShiftImportSave";
import type { ShiftImportSummary } from "./shiftImportRepository";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// state（8 状態）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ShiftSaveState =
  | { status: "idle" }
  | { status: "disabled" }
  | { status: "needs_blank_risk_confirmation"; blankRiskDays: number[] }
  | { status: "saving" }
  | { status: "success"; summary: ShiftImportSummary }
  | { status: "conflict"; dates: string[]; message: string }
  | { status: "unresolved_blocked"; dates: string[]; message: string }
  | { status: "error"; message: string };

/** blank-risk soft confirmation の確認文言（原稿照合の最終確認）。 */
export const SHIFT_SAVE_CONFIRM_MESSAGE =
  "要確認の日があります。原稿と照合しましたか？";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// action result → state（raw を載せない safe 写像）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ShiftImportActionResult を保存 state に写像（safe message のみ）。 */
export function mapActionResultToState(
  result: ShiftImportActionResult
): ShiftSaveState {
  if (result.ok) return { status: "success", summary: result.summary };
  switch (result.kind) {
    case "conflict":
      return { status: "conflict", dates: result.dates, message: result.message };
    case "unresolved":
      return {
        status: "unresolved_blocked",
        dates: result.skipped.map((s) => s.date),
        message: result.message,
      };
    case "disabled":
      return { status: "disabled" };
    case "duplicate":
    case "unauthenticated":
    case "invalid":
    case "error":
      // すべて safe message のみ（raw は含まれない）
      return { status: "error", message: result.message };
    default:
      return { status: "error", message: SHIFT_IMPORT_ACTION_MESSAGES.error };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ShiftSaveControllerDeps {
  /** 実保存（host が importShiftRosterAction を注入。test は fake）。 */
  save: (input: ShiftImportSaveActionInput) => Promise<ShiftImportActionResult>;
  year: number;
  month: number;
  dictionary: ShiftCodeDictionary;
  /** 保存導線の有効可否（flag OFF / host 未設定なら false → disabled）。 */
  saveEnabled: boolean;
  source?: { originalFilename?: string };
  lowConfidenceThreshold?: number;
  /** 状態遷移の通知（hook が setState を渡す。test は recorder）。 */
  onStateChange: (state: ShiftSaveState) => void;
  /** 保存成功時（host が /plan refetch を wire）。 */
  onSuccess?: () => void;
}

export interface ShiftSaveController {
  /** 保存要求（gate 判定: unresolved→block / blank-risk→soft confirm / else→save）。 */
  requestSave: (cells: ShiftReviewCell[]) => Promise<void>;
  /** soft confirm 後に保存へ進む。 */
  confirmBlankRisk: () => Promise<void>;
  /** 確認/結果から idle へ戻す。 */
  cancel: () => void;
  reset: () => void;
  getState: () => ShiftSaveState;
}

export function createShiftSaveController(
  deps: ShiftSaveControllerDeps
): ShiftSaveController {
  let state: ShiftSaveState = { status: "idle" };
  let inFlight = false;
  let pendingCells: ShiftReviewCell[] | null = null;

  const setState = (s: ShiftSaveState): void => {
    state = s;
    deps.onStateChange(s);
  };

  const doSave = async (cells: ShiftReviewCell[]): Promise<void> => {
    inFlight = true; // ← 同期で立てる（直後の requestSave の二重 submit を弾く）
    setState({ status: "saving" });
    try {
      const result = await deps.save({
        year: deps.year,
        month: deps.month,
        cells: cells.map((c) => ({ date: c.date, rawCode: c.rawCode })),
        ...(deps.source ? { source: deps.source } : {}),
      });
      setState(mapActionResultToState(result));
      if (result.ok) deps.onSuccess?.();
    } catch {
      // save 自体が throw（network 等）→ safe error（raw を出さない）
      setState({ status: "error", message: SHIFT_IMPORT_ACTION_MESSAGES.error });
    } finally {
      inFlight = false;
      pendingCells = null;
    }
  };

  const requestSave = async (cells: ShiftReviewCell[]): Promise<void> => {
    if (!deps.saveEnabled) {
      setState({ status: "disabled" });
      return;
    }
    if (inFlight) return; // 二重 submit ガード
    const threshold =
      deps.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE_THRESHOLD;
    const { unresolvedDates, blankRiskDays } = classifyPreSave(
      cells,
      deps.dictionary,
      threshold
    );
    if (unresolvedDates.length > 0) {
      // hard block: unresolved がある間は保存しない
      setState({
        status: "unresolved_blocked",
        dates: unresolvedDates,
        message: SHIFT_IMPORT_ACTION_MESSAGES.unresolved,
      });
      return;
    }
    if (blankRiskDays.length > 0) {
      // soft confirmation: 1 度止める（pending を保持）
      pendingCells = cells;
      setState({ status: "needs_blank_risk_confirmation", blankRiskDays });
      return;
    }
    await doSave(cells);
  };

  const confirmBlankRisk = async (): Promise<void> => {
    if (state.status !== "needs_blank_risk_confirmation") return;
    if (inFlight) return;
    const cells = pendingCells;
    if (!cells) {
      setState({ status: "idle" });
      return;
    }
    await doSave(cells);
  };

  const cancel = (): void => {
    pendingCells = null;
    setState({ status: "idle" });
  };

  const reset = (): void => {
    pendingCells = null;
    inFlight = false;
    setState({ status: "idle" });
  };

  return { requestSave, confirmBlankRisk, cancel, reset, getState: () => state };
}
