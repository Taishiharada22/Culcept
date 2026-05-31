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
 * 8-c-2 で到達する状態（本コミット）:
 *   - idle / image_loaded / row_selected
 *
 * 8-c-3 以降で到達する状態（本コミットでは action がない＝unreachable・型のみ定義）:
 *   - extracting / cells_loaded / error
 */

import type { AssistedRowSelection } from "@/lib/plan/shift/assistedRowSelection";
import type { ShiftReviewCell } from "@/lib/plan/shift/shiftReviewClassification";

/** 画像メタデータ（File 本体は持たない）。 */
export interface ImageMeta {
  width: number;
  height: number;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
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
      kind: "extracting";
      imageObjectUrl: string;
      imageMeta: ImageMeta;
      selection: AssistedRowSelection;
    }
  | {
      kind: "cells_loaded";
      imageObjectUrl: string;
      imageMeta: ImageMeta;
      selection: AssistedRowSelection;
      cells: ShiftReviewCell[];
      year: number;
      month: number;
    }
  | {
      kind: "error";
      /** error 発生時の imageObjectUrl（あれば host が revoke 判断に使う）。 */
      imageObjectUrl: string | null;
      message: string;
    };

/**
 * Action — 8-c-2 で必要な 3 種。
 * 8-c-3 で extract_started / cells_loaded / extract_failed を追加する想定。
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

    case "cancel":
      return INITIAL_STATE;
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
      return null;
    case "image_loaded":
    case "row_selected":
    case "extracting":
    case "cells_loaded":
      return state.imageObjectUrl;
    case "error":
      return state.imageObjectUrl;
  }
}
