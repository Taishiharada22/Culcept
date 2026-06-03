/**
 * シフト取り込み RPC 契約 — SR Step 6B
 *
 * 真の atomic（all-or-nothing）+ range-scoped replace + conflict 検出は、
 * Postgres の plpgsql 関数（= 1 トランザクション）で行う。本ファイルはその
 * **入出力契約** と、関数呼び出しを抽象化した **injected client interface** を定義する。
 *
 * 6B 範囲（CEO 2026-05-31）:
 *   - 契約 + injected RPC client interface + fake client による unit test まで。
 *   - 実 Supabase client / database.types 接続は migration apply + types regen 後（6B-apply）。
 *     → migration 前なので RPC を database.types から無理に型付けしない（fake client で検証）。
 */

import type { AnchorRigidity } from "@/lib/plan/external-anchor";
import type {
  ShiftImportRange,
  ShiftImportSummary,
} from "./shiftImportRepository";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RPC 入力（JSON 化される最小形）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ShiftImportRpcAnchor {
  date: string;
  title: string;
  startTime: string;
  endTime?: string;
  rigidity: AnchorRigidity;
}

export interface ShiftImportRpcIndicator {
  date: string;
  kind: "off" | "off_request";
  label: string;
  countsAsPublicHoliday: boolean;
  rawCode: string;
  semanticType: string;
}

export interface ShiftImportRpcParams {
  userId: string;
  importRange: ShiftImportRange;
  source: { originalFilename?: string };
  anchors: ShiftImportRpcAnchor[];
  indicators: ShiftImportRpcIndicator[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RPC 結果
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * RPC の結果。3 状態:
 *   - ok      : range-scoped replace + insert 成功（summary）
 *   - conflict: その月に手動 day_indicator がある日に shift_image 印を入れようとした
 *               → 関数は何も書かず（rollback）、衝突日を返す。
 *   - error   : その他の永続化失敗（全体 rollback）
 */
export type ShiftImportRpcResult =
  | { status: "ok"; summary: ShiftImportSummary }
  | { status: "conflict"; dates: string[] }
  | { status: "error"; message: string };

/**
 * RPC 呼び出しの抽象。実装は:
 *   - 6B-apply: Supabase client 経由（supabase.rpc('import_shift_roster', ...)）
 *   - test:     fake client（DB なしで契約を検証）
 */
export interface ShiftImportRpcClient {
  importShiftRoster(
    params: ShiftImportRpcParams
  ): Promise<ShiftImportRpcResult>;
}
