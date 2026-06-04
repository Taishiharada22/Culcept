"use client";

/**
 * ShiftImportModal — シフト取り込み確認 + 保存の host shell（SR host flow E1）
 *
 * 役割（E1 = shell のみ）:
 *   - cells（確認済セル）を props で受け取り、ShiftReviewGrid（確認画面）を modal で表示。
 *   - 内部で useShiftSaveController を wire し、実 importShiftRosterAction を save に注入。
 *   - ShiftReviewGrid に 6D 保存 contract（saveEnabled / saveState / onConfirm / onConfirmBlankRisk / onCancel）を渡す。
 *   - 保存成功時に onSuccess() を呼ぶ（host が /plan refetch を wire）。
 *
 * E1 でやらないこと:
 *   - PlanClient 実入口（entry point）への接続。
 *   - 実画像アップロード / VLM 抽出（cells は呼び出し側が渡す = B1b 依存は別 gate）。
 *
 * dormant 原則:
 *   - saveEnabled 既定 false → ShiftReviewGrid の保存 CTA は旧 disabled placeholder のまま。
 *   - flag（PLAN_SHIFT_IMPORT_SAVE）は server 側で読み、host が saveEnabled として流す（本 modal は受けるだけ）。
 */

import { useShiftSaveController } from "@/lib/plan/shift/useShiftSaveController";
import { importShiftRosterAction } from "../_actions/importShiftRoster";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";
import type { ShiftGridGeometry } from "@/lib/plan/shift/shiftGridGeometry";
import type { GridCalibration } from "@/lib/plan/shift/assistedRowSelection";
import { ShiftReviewGrid, type ShiftReviewCell } from "./ShiftReviewGrid";

export interface ShiftImportModalProps {
  /** modal の開閉 */
  open: boolean;
  /** 取り込み対象年 */
  year: number;
  /** 取り込み対象月（1–12） */
  month: number;
  /** 確認済セル（date + rawCode + confidence）。抽出 action の成果物（E1 では props 注入）。 */
  cells: ShiftReviewCell[];
  /** 元ファイル名等の trace（任意） */
  source?: { originalFilename?: string };
  /** 保存導線を出すか（server で isShiftImportSaveEnabled() を読み host が流す）。既定 false で dormant。 */
  saveEnabled?: boolean;
  /** 原稿画像（任意。確認画面で該当セル crop を表示） */
  imageSrc?: string;
  geometry?: ShiftGridGeometry;
  /**
   * S-geo Persist-2: 現在の校正値（reducer selection.gridCalibration の素通し）。
   * ShiftReviewGrid の校正 UI が controlled で表示 / reset 判定に使う。
   */
  gridCalibration?: GridCalibration;
  /**
   * S-geo Persist-2: 校正値変更ハンドラ（cal=set / null=reset）。
   * host（ShiftDraftInApp）の onSetGridCalibration → reducer set_grid_calibration へ素通し。
   */
  onGridCalibrationChange?: (gridCalibration: GridCalibration | null) => void;
  /** SR B1b-2C-8-c-1: draft review hint（既定 false=dormant）。ShiftReviewGrid に pass-through。 */
  riskReviewEnabled?: boolean;
  /** SR B1b-2C-8-c-1: draft chunk 境目（既定なし）。ShiftReviewGrid に pass-through。 */
  chunkBoundaries?: number[];
  /** 保存成功時（host が /plan refetch を wire） */
  onSuccess: () => void;
  /** modal を閉じる */
  onClose: () => void;
}

export function ShiftImportModal({
  open,
  year,
  month,
  cells,
  source,
  saveEnabled = false,
  imageSrc,
  geometry,
  gridCalibration,
  onGridCalibrationChange,
  riskReviewEnabled,
  chunkBoundaries,
  onSuccess,
  onClose,
}: ShiftImportModalProps) {
  // 6D controller を wire（実 server action を save に注入）。flag OFF なら controller が disabled を返す。
  const { state, requestSave, confirmBlankRisk, cancel } = useShiftSaveController({
    save: importShiftRosterAction,
    year,
    month,
    dictionary: HARADA_SPRIX_DICTIONARY, // MVP seed（per-user 辞書は将来）
    saveEnabled,
    source,
    onSuccess,
  });

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="シフト表の取り込み"
      data-testid="shift-import-modal"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-4 shadow-2xl backdrop-blur-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">
            シフト表の取り込み
          </h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="shift-import-modal-close"
            className="text-xs text-gray-400"
          >
            閉じる
          </button>
        </div>

        <ShiftReviewGrid
          cells={cells}
          dictionary={HARADA_SPRIX_DICTIONARY}
          monthLabel={`${year}年${month}月`}
          year={year}
          month={month}
          imageSrc={imageSrc}
          geometry={geometry}
          gridCalibration={gridCalibration}
          onGridCalibrationChange={onGridCalibrationChange}
          // ── 6D 保存 contract ──
          saveEnabled={saveEnabled}
          saveState={state}
          onConfirm={requestSave}
          onConfirmBlankRisk={confirmBlankRisk}
          onCancel={cancel}
          // ── B1b-2C-8-c-1: draft review hint pass-through（既定 undefined=dormant） ──
          riskReviewEnabled={riskReviewEnabled}
          chunkBoundaries={chunkBoundaries}
        />
      </div>
    </div>
  );
}
