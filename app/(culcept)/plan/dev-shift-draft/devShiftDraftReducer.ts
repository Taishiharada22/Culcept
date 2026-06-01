/**
 * SR B1b-2C-8-c-2 — DevShiftDraftClient state machine（pure reducer）
 *
 * 役割:
 *   - dev-shift-draft host の 6 状態（idle / image_loaded / row_selected / extracting / cells_loaded / error）の
 *     遷移ルールを純関数として定義する。
 *   - IO（File / Blob / base64 / URL.createObjectURL / DOM / Date / Math.random）は一切扱わない。
 *     ObjectURL は呼び出し側（client）が createObjectURL で生成して action に乗せる。
 *
 * 不変原則（CEO 補正・2026-06-01）:
 *   - **File / Blob は state に持たない**（型で構造的に禁止 — state に File 系 field なし）。
 *   - **base64 / dataURL を state に持たない**（imageObjectUrl は文字列だが `blob:` URL のみ host が渡す約束）。
 *   - **cells_loaded への遷移で imageObjectUrl は変えない**（review 中に元画像を見られるよう維持）。
 *     → 同一 ObjectURL を持ち越すため、自動 revoke は発火しない（client 側の revoke ロジックの設計前提）。
 *   - **本 reducer は revoke を実行しない**（pure 維持 — revoke は client の useEffect 責務）。
 *
 * 到達する状態:
 *   - 8-c-2: idle / image_loaded / row_selected
 *   - 8-c-3: extracting / cells_loaded / error（extract_started/succeeded/failed/retry で到達）
 *   - 8-c-4: saved（cells_loaded → save_succeeded で到達。imageObjectUrl 不保持＝自動 revoke）
 *           cells_loaded に reviewOpen フラグ追加（open_review / close_review）
 */

import type { AssistedRowSelection } from "@/lib/plan/shift/assistedRowSelection";
import type { ShiftReviewCell } from "@/lib/plan/shift/shiftReviewClassification";
import type { DraftExtractionSubmitOutcome } from "@/lib/plan/shift/runDraftExtractionSubmit";

/** 画像メタデータ（File 本体は持たない）。 */
export interface ImageMeta {
  width: number;
  height: number;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
}

/** crop 1 枚分の寸法 trace（Blob 本体は持たない・数値のみ）。 */
export interface CropDimsMeta {
  width: number;
  height: number;
  sizeBytes: number;
}

/** crop_review が持つ 3 crop の寸法（preview 用・Blob/base64 は持たない）。 */
export interface DraftCropMeta {
  header: CropDimsMeta;
  personRow: CropDimsMeta;
  combined: CropDimsMeta;
}

/** State machine — 6 種。imageObjectUrl は image_loaded 以降ずっと同一値を引き継ぐ。 */
export type DevShiftDraftState =
  | { kind: "idle" }
  | {
      kind: "image_loaded";
      imageObjectUrl: string;
      imageMeta: ImageMeta;
    }
  | {
      kind: "row_selected";
      imageObjectUrl: string;
      imageMeta: ImageMeta;
      selection: AssistedRowSelection;
    }
  | {
      // 9-FIX: VLM 入力 preview。row_selected → crop_review → extracting の必須ゲート。
      // crop URL（string）と寸法のみ保持。**Blob/base64 は持たない**（preview は ObjectURL）。
      kind: "crop_review";
      imageObjectUrl: string;
      imageMeta: ImageMeta;
      selection: AssistedRowSelection;
      year: number;
      month: number;
      headerCropUrl: string;
      personRowCropUrl: string;
      /** header+personRow を上下結合した「VLM に渡す予定」の画像。 */
      combinedCropUrl: string;
      cropMeta: DraftCropMeta;
    }
  | {
      kind: "extracting";
      imageObjectUrl: string;
      imageMeta: ImageMeta;
      selection: AssistedRowSelection;
      /** 対象年（targetMonth 由来）。cells_loaded へ引き継ぐ。 */
      year: number;
      /** 対象月 1..12。 */
      month: number;
    }
  | {
      kind: "cells_loaded";
      imageObjectUrl: string;
      imageMeta: ImageMeta;
      selection: AssistedRowSelection;
      cells: ShiftReviewCell[];
      year: number;
      month: number;
      /** 確認画面（ShiftImportModal）を開いているか。CEO 補正: 自動 open 禁止 → 既定 false。 */
      reviewOpen: boolean;
    }
  | {
      // error は retry context を保持（再アップロード無しで extract_retry 可能に）。
      kind: "error";
      imageObjectUrl: string;
      imageMeta: ImageMeta;
      selection: AssistedRowSelection;
      year: number;
      month: number;
      /** safe copy（server action の error.message 由来 / decode 失敗時の固定文）。 */
      message: string;
    }
  | {
      // 保存成功後の終端状態。**imageObjectUrl を持たない** → 既存 useEffect の差分検出が
      // 自動 revoke を発火する（CEO 要件: saved 時に revoke）。cells は保持しない（保存済）。
      kind: "saved";
      year: number;
      month: number;
      cellCount: number;
    };

/**
 * Action — 8-c-2 の 3 種 + 8-c-3 の抽出 4 種。
 */
export type DevShiftDraftAction =
  | {
      type: "image_loaded";
      imageObjectUrl: string;
      imageMeta: ImageMeta;
    }
  | {
      type: "row_selected";
      selection: AssistedRowSelection;
    }
  // ── 9-FIX: crop preview ──
  | {
      // row_selected → crop_review。crop URL + 寸法 + targetMonth を持ち込む。
      type: "crops_prepared";
      year: number;
      month: number;
      headerCropUrl: string;
      personRowCropUrl: string;
      combinedCropUrl: string;
      cropMeta: DraftCropMeta;
    }
  | {
      // crop_review → row_selected（行指定に戻る）。crop URL は useEffect で revoke。
      type: "back_to_row_select";
    }
  // ── 8-c-3 → 9-FIX: 抽出 ──
  | {
      // crop_review → extracting。targetMonth を持ち込む（extracting/cells_loaded で使う）。
      type: "extract_started";
      year: number;
      month: number;
    }
  | {
      // extracting → cells_loaded。cells は server action result 由来（safe summary）。
      type: "extract_succeeded";
      cells: ShiftReviewCell[];
    }
  | {
      // extracting → error。message は safe copy。
      type: "extract_failed";
      message: string;
    }
  | {
      // error → extracting。同 selection で再試行（imageObjectUrl/year/month 引き継ぎ）。
      type: "extract_retry";
    }
  // ── 8-c-4: 確認画面 + 保存 ──
  | {
      // cells_loaded.reviewOpen を true へ（「確認画面を開く」CTA 押下時）。
      type: "open_review";
    }
  | {
      // cells_loaded.reviewOpen を false へ（Modal の onClose）。
      type: "close_review";
    }
  | {
      // cells_loaded → saved（Modal の onSuccess）。imageObjectUrl 不保持＝自動 revoke。
      type: "save_succeeded";
    }
  | { type: "cancel" };

export const INITIAL_STATE: DevShiftDraftState = { kind: "idle" };

/**
 * 純関数 reducer。
 *   - image_loaded: どの state からでも image_loaded（差替）に遷移可。
 *     → 旧 imageObjectUrl は client の useEffect 監視で revoke される（reducer は revoke しない）。
 *   - row_selected: image_loaded / row_selected からのみ受理。idle / 抽出系からは no-op。
 *     → imageObjectUrl / imageMeta は前 state を引き継ぐ（差替なし）。
 *   - cancel: 常に idle へ。
 *     → 旧 imageObjectUrl は client の useEffect 監視で revoke される。
 */
export function devShiftDraftReducer(
  state: DevShiftDraftState,
  action: DevShiftDraftAction
): DevShiftDraftState {
  switch (action.type) {
    case "image_loaded":
      return {
        kind: "image_loaded",
        imageObjectUrl: action.imageObjectUrl,
        imageMeta: action.imageMeta,
      };

    case "row_selected": {
      if (state.kind !== "image_loaded" && state.kind !== "row_selected") {
        // idle / extracting / cells_loaded / error からの row_selected は受理しない。
        return state;
      }
      return {
        kind: "row_selected",
        imageObjectUrl: state.imageObjectUrl,
        imageMeta: state.imageMeta,
        selection: action.selection,
      };
    }

    case "crops_prepared": {
      // row_selected からのみ。crop URL + 寸法 + targetMonth を持ち込んで crop_review へ。
      if (state.kind !== "row_selected") return state;
      return {
        kind: "crop_review",
        imageObjectUrl: state.imageObjectUrl,
        imageMeta: state.imageMeta,
        selection: state.selection,
        year: action.year,
        month: action.month,
        headerCropUrl: action.headerCropUrl,
        personRowCropUrl: action.personRowCropUrl,
        combinedCropUrl: action.combinedCropUrl,
        cropMeta: action.cropMeta,
      };
    }

    case "back_to_row_select": {
      // crop_review からのみ。row_selected へ戻す（crop URL は useEffect が revoke）。
      if (state.kind !== "crop_review") return state;
      return {
        kind: "row_selected",
        imageObjectUrl: state.imageObjectUrl,
        imageMeta: state.imageMeta,
        selection: state.selection,
      };
    }

    case "extract_started": {
      // crop_review からのみ（9-FIX: crop preview を確認してから VLM）。
      if (state.kind !== "crop_review") return state;
      return {
        kind: "extracting",
        imageObjectUrl: state.imageObjectUrl,
        imageMeta: state.imageMeta,
        selection: state.selection,
        year: action.year,
        month: action.month,
      };
    }

    case "extract_succeeded": {
      // extracting からのみ。year/month は extracting から引き継ぐ（targetMonth 一貫性）。
      // reviewOpen は **既定 false**（CEO 補正: Modal 自動 open 禁止）。
      if (state.kind !== "extracting") return state;
      return {
        kind: "cells_loaded",
        imageObjectUrl: state.imageObjectUrl,
        imageMeta: state.imageMeta,
        selection: state.selection,
        cells: action.cells,
        year: state.year,
        month: state.month,
        reviewOpen: false,
      };
    }

    case "extract_failed": {
      // extracting からのみ。retry context（image/selection/year/month）を保持。
      if (state.kind !== "extracting") return state;
      return {
        kind: "error",
        imageObjectUrl: state.imageObjectUrl,
        imageMeta: state.imageMeta,
        selection: state.selection,
        year: state.year,
        month: state.month,
        message: action.message,
      };
    }

    case "extract_retry": {
      // error からのみ。同 selection / targetMonth で extracting へ戻す（再アップロード不要）。
      if (state.kind !== "error") return state;
      return {
        kind: "extracting",
        imageObjectUrl: state.imageObjectUrl,
        imageMeta: state.imageMeta,
        selection: state.selection,
        year: state.year,
        month: state.month,
      };
    }

    case "open_review": {
      // cells_loaded のみ受理。reviewOpen を true へ（imageObjectUrl は保持＝同一 URL 持ち越し）。
      if (state.kind !== "cells_loaded") return state;
      if (state.reviewOpen) return state; // 冪等（同一 reference 維持）
      return { ...state, reviewOpen: true };
    }

    case "close_review": {
      // cells_loaded のみ受理。reviewOpen を false へ（imageObjectUrl は保持）。
      if (state.kind !== "cells_loaded") return state;
      if (!state.reviewOpen) return state; // 冪等
      return { ...state, reviewOpen: false };
    }

    case "save_succeeded": {
      // cells_loaded のみ受理。saved（imageObjectUrl 不保持）へ → useEffect が revoke。
      if (state.kind !== "cells_loaded") return state;
      return {
        kind: "saved",
        year: state.year,
        month: state.month,
        cellCount: state.cells.length,
      };
    }

    case "cancel":
      return INITIAL_STATE;
  }
}

/**
 * submit outcome → dispatch する action（pure・glue をテスト可能にする）。
 *   - cells → extract_succeeded
 *   - error → extract_failed
 *   - invalid_selection → null（dispatch しない＝row_selected 維持・component が inline 通知）
 *
 * 注: extract_started は targetMonth 由来のため outcome からは導出せず、
 *   onActionStart（crop 成功後）で別途 dispatch する。
 */
export function outcomeToAction(
  outcome: DraftExtractionSubmitOutcome
): DevShiftDraftAction | null {
  switch (outcome.kind) {
    case "cells":
      return { type: "extract_succeeded", cells: outcome.cells };
    case "error":
      return { type: "extract_failed", message: outcome.message };
    case "invalid_selection":
      return null;
  }
}

/**
 * 現在 state から imageObjectUrl を取り出す helper（pure）。
 * client 側 useEffect の revoke 監視で使う（前回値との差分検出）。
 */
export function currentImageObjectUrl(
  state: DevShiftDraftState
): string | null {
  switch (state.kind) {
    case "idle":
    case "saved":
      // saved は imageObjectUrl を持たない → 直前の cells_loaded で持っていた URL を
      // useEffect の差分検出が revoke する（CEO 要件: saved 時に revoke）。
      return null;
    case "image_loaded":
    case "row_selected":
    case "crop_review":
    case "extracting":
    case "cells_loaded":
    case "error":
      return state.imageObjectUrl;
  }
}

/**
 * state が保持する **全** ObjectURL（元画像 + crop preview）。
 * client の useEffect が「前回 set に有り・今回 set に無い」URL を revoke するために使う。
 *   - crop_review: 元画像 + header/personRow/combined crop の 4 本
 *   - その他: 元画像 1 本（idle/saved は 0 本）
 * crop_review を離れる（extracting / row_selected / cancel）と crop URL が set から消え、
 * useEffect が 3 本の crop URL を revoke する（元画像は持ち越し）。
 */
export function currentObjectUrls(state: DevShiftDraftState): string[] {
  switch (state.kind) {
    case "idle":
    case "saved":
      return [];
    case "image_loaded":
    case "row_selected":
    case "extracting":
    case "cells_loaded":
    case "error":
      return [state.imageObjectUrl];
    case "crop_review":
      return [
        state.imageObjectUrl,
        state.headerCropUrl,
        state.personRowCropUrl,
        state.combinedCropUrl,
      ];
  }
}
