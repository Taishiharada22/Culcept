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

/** state.kind === "cells_loaded" の最小契約（selector が依存する形）。 */
export interface CellsLoadedShape {
  kind: "cells_loaded";
  year: number;
  month: number;
  cells: ShiftReviewCell[];
  imageObjectUrl: string;
  reviewOpen: boolean;
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
  };
}

// ─────────────────────────────────────────────────────────────
// 内部 type guard
// ─────────────────────────────────────────────────────────────

function isCellsLoaded(state: unknown): state is CellsLoadedShape {
  if (state === null || typeof state !== "object") return false;
  const s = state as { kind?: unknown };
  return s.kind === "cells_loaded";
}
