/**
 * Modal mount selector — pure（SR B1b-2C-8-c-4）
 *
 * 役割: dev-shift-draft host の state から ShiftImportModal の props を組み立てる純関数。
 *   「いつ Modal を mount するか」「どんな props を渡すか」を component 外で固定し、
 *   node 環境の単体 test で「CTA 押下で Modal が開く（reviewOpen=true → props 返却）」を
 *   論理的に固定する（既存規約: @testing-library 不使用・renderToStaticMarkup のみ）。
 *
 * 設計核心（CEO 補正・2026-06-01）:
 *   - **自動 open 禁止**: cells_loaded.reviewOpen=false → null（mount しない）。
 *   - **saveEnabled は server prop 由来**: opts.saveEnabled をそのまま渡す。**hardcode true 禁止**。
 *   - **riskReviewEnabled は dev host で hardcode true**（検証用途・本流ではない）。
 *   - **chunkBoundaries=[15] を hardcode**（B1b-1R で 92.8% 最良の運用前提）。
 *   - **imageSrc は cells_loaded.imageObjectUrl**（review に元画像必須）。
 *
 * 不変原則: pure（IO / DOM / Date / random / env なし）。throw しない。
 */

import type { ShiftReviewCell } from "./shiftReviewClassification";
import type { AssistedRowSelection } from "./assistedRowSelection";
import type { ShiftGridGeometry } from "./shiftGridGeometry";
import { buildShiftGridGeometry } from "./buildShiftGridGeometry";
import { daysInMonth } from "./targetMonth";

/** state.kind === "cells_loaded" の最小契約（selector が依存する形）。 */
export interface CellsLoadedShape {
  kind: "cells_loaded";
  year: number;
  month: number;
  cells: ShiftReviewCell[];
  imageObjectUrl: string;
  reviewOpen: boolean;
  /**
   * S-geo-2C-1: 照合枠 geometry の算出入力（imageW/H・personRowBand・dayColumns）。
   * reducer の cells_loaded は必須保持するが、selector 契約では **optional** とし、
   * 未指定/未捕捉（dayColumns なし）でも geometry undefined で fail-soft（modal は返す）。
   */
  selection?: AssistedRowSelection;
}

/** ShiftImportModal の props サブセット（selector の戻り値契約）。 */
export interface ImportModalSelected {
  /** Modal の open（cells_loaded.reviewOpen=true でのみ true で返る）。 */
  open: boolean;
  year: number;
  month: number;
  cells: ShiftReviewCell[];
  /** server prop 由来。**hardcode true 禁止**（既定 false で dormant）。 */
  saveEnabled: boolean;
  /** 元画像（review に必須）。blob: ObjectURL。 */
  imageSrc: string;
  /** dev host 検証用 hint hardcode true（本流ではない）。 */
  riskReviewEnabled: true;
  /** B1b-1R で 92.8% 最良の chunk 境界（運用前提）。 */
  chunkBoundaries: number[];
  /**
   * S-geo-2C-1: 照合枠用の calibrated geometry。day列中心 X（selection.dayColumns）から
   * buildShiftGridGeometry で逆算する。dayColumns 未捕捉 or invalid なら undefined（fail-soft）。
   * **blankDays は含めない** — packing 補正は ShiftReviewGrid が cells から自己算出する正本を維持する。
   */
  geometry?: ShiftGridGeometry;
}

/** selector に渡すオプション（context 注入）。 */
export interface SelectImportModalPropsOptions {
  /** server-side flag（PLAN_SHIFT_IMPORT_SAVE）由来。既定 false で dormant。 */
  saveEnabled?: boolean;
}

/** B1b-1R の運用前提（chunk 境界 92.8% 最良）。dev host で固定。 */
export const DEV_SHIFT_DRAFT_CHUNK_BOUNDARIES: number[] = [15];

/**
 * cells_loaded.reviewOpen=true のときだけ Modal props を返す。それ以外は null。
 * - state が cells_loaded でなければ null（saved / extracting / error / idle 等）。
 * - cells_loaded.reviewOpen=false なら null（自動 open 禁止）。
 * - saveEnabled は **opts.saveEnabled ?? false**（hardcode true なし）。
 */
export function selectImportModalProps(
  state: unknown,
  opts: SelectImportModalPropsOptions = {}
): ImportModalSelected | null {
  if (!isCellsLoaded(state)) return null;
  if (!state.reviewOpen) return null;
  return {
    open: true,
    year: state.year,
    month: state.month,
    cells: state.cells,
    saveEnabled: opts.saveEnabled ?? false,
    imageSrc: state.imageObjectUrl,
    riskReviewEnabled: true,
    chunkBoundaries: DEV_SHIFT_DRAFT_CHUNK_BOUNDARIES,
    geometry: computeReviewGeometry(state),
  };
}

/**
 * cells_loaded の selection（day列中心 X）から照合枠用 geometry を算出する（pure）。
 * - selection or dayColumns 未捕捉 → undefined（fail-soft）。
 * - buildShiftGridGeometry が invalid（範囲外/順序逆/span 不足等）→ undefined（fail-soft）。
 * - dayCount は daysInMonth(year, month)（pure・throw しない・範囲外は 30）。
 * - **blankDays には触れない**（ShiftReviewGrid 内部の cells 自己算出が正本）。
 */
function computeReviewGeometry(
  state: CellsLoadedShape
): ShiftGridGeometry | undefined {
  const selection = state.selection;
  if (!selection?.dayColumns) return undefined;
  const result = buildShiftGridGeometry({
    imageW: selection.imageW,
    imageH: selection.imageH,
    personRowBand: selection.personRowBand,
    dayCount: daysInMonth(state.year, state.month),
    firstDayCenterX: selection.dayColumns.firstDayCenterX,
    lastDayCenterX: selection.dayColumns.lastDayCenterX,
    headerBand: selection.headerBand,
  });
  return result.ok && result.geometry ? result.geometry : undefined;
}

// ─────────────────────────────────────────────────────────────
// 内部 type guard
// ─────────────────────────────────────────────────────────────

function isCellsLoaded(state: unknown): state is CellsLoadedShape {
  if (state === null || typeof state !== "object") return false;
  const s = state as { kind?: unknown };
  return s.kind === "cells_loaded";
}
