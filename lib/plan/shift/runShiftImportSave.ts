/**
 * シフト取り込み 本保存の orchestration helper（pure / DI）— SR Step 6B-apply-C (B)
 *
 * server action（importShiftRosterAction）の **中身**を、`"use server"` から切り離した
 * 純 helper として固める。auth / flag / importRange 算出 / repo 結線 / result 写像を
 * ここに集約し、unit test 可能にする（"use server" を node env で import すると壊れるため）。
 *
 * 不変原則（Microsoft/Google import helper と同思想）:
 *   1. 副作用なし（DB/IO/time/env は **すべて deps で注入**）。throw しない（戻り値で表現）。
 *   2. server-only 依存なし（vitest "node" で直接 import 可）。
 *   3. **userId は deps.getUserId() のみ**（client 入力を信頼しない）。
 *   4. **importRange は year/month から server 側で算出**（client range を信頼しない・半開区間）。
 *   5. **raw error を UI result に絶対載せない**。安全な定数メッセージのみ返す
 *      （upstream の message すら forward しない = 防御一段）。raw は server log（action 側 logDetail）へ。
 *   6. projection は server 側で実行（client から projected anchors/indicators を受け取らない）。
 */

import {
  executeShiftImportSave,
  type ExecuteShiftImportSaveInput,
} from "./shiftImportSave";
import type { ShiftCellReading } from "./shiftRosterProjection";
import type { ShiftCodeDictionary } from "./shiftCodeDictionary";
import type { ShiftImportSkipped } from "./shiftImportAdapter";
import type {
  ShiftImportRepository,
  ShiftImportSourceInput,
  ShiftImportRange,
  ShiftImportSummary,
  ShiftImportSaveError,
} from "./shiftImportRepository";
import {
  isShiftImportSaveConnectionAllowed,
  type ShiftImportSaveConnectionEnv,
} from "./shiftImportSaveGuard";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 入出力
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** server action の入力。client は確認済セル（rawCode）と年月のみ送る（projected 結果は送らない）。 */
export interface ShiftImportSaveActionInput {
  /** 取り込み対象年（西暦） */
  year: number;
  /** 取り込み対象月（1–12） */
  month: number;
  /** 確認画面で承認したセル（date + rawCode）。projection は server 側で行う。 */
  cells: ShiftCellReading[];
  /** 元ファイル名等の trace（任意） */
  source?: ShiftImportSourceInput;
}

/** runShiftImportSave の依存（実 client/flag/repo を action が注入）。 */
export interface RunShiftImportSaveDeps {
  /** 認証済 userId を返す（未認証は null）。client 入力ではなく server auth から。 */
  getUserId: () => Promise<string | null>;
  /** 本保存 flag（OFF なら dormant）。 */
  isEnabled: () => boolean;
  /** S-save-0: 接続先 guard（staging allowlist + production deny）。fail-closed。 */
  connection: ShiftImportSaveConnectionEnv;
  /** 保存先 repository（6B-apply-C: 実 Supabase RPC repo）。 */
  repo: ShiftImportRepository;
  /** rawCode 解決辞書（MVP: HARADA_SPRIX seed。per-user は将来）。 */
  dictionary: ShiftCodeDictionary;
}

/**
 * UI に返す result。**raw error を含まない**安全な discriminated union。
 *   - ok           : 保存成功（count summary）
 *   - disabled     : flag OFF（保存無効）
 *   - unauthenticated : 未ログイン（repo 未呼出）
 *   - invalid      : 入力不備（年月不正 / validate 失敗）
 *   - unresolved   : 未確定セルあり（確認画面へ差し戻し。repo 未呼出）
 *   - conflict     : 手動印との衝突（無保存）
 *   - duplicate    : 同日 anchor∩indicator（無保存）
 *   - error        : 永続化失敗 / owner guard 等（safe message のみ）
 */
export type ShiftImportActionResult =
  | { ok: true; summary: ShiftImportSummary }
  | { ok: false; kind: "disabled"; message: string }
  | { ok: false; kind: "unauthenticated"; message: string }
  | { ok: false; kind: "invalid"; message: string }
  | { ok: false; kind: "unresolved"; message: string; skipped: ShiftImportSkipped[] }
  | { ok: false; kind: "conflict"; message: string; dates: string[] }
  | { ok: false; kind: "duplicate"; message: string; dates: string[] }
  | { ok: false; kind: "error"; message: string };

/** UI-facing safe messages（日本語・raw を含まない）。 */
export const SHIFT_IMPORT_ACTION_MESSAGES = {
  disabled: "シフトの保存は現在ご利用いただけません。",
  unauthenticated: "ログインが必要です。",
  invalid: "取り込み対象の年月が正しくありません。",
  unresolved: "未確定のセルがあります。確認画面で内容を確定してください。",
  conflict: "手動で設定した休みと重なる日があります。ご確認ください。",
  duplicate: "同じ日に勤務と休みの両方が指定されています。",
  error: "シフトの保存に失敗しました。",
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// month → 半開 importRange（pure / server 算出）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** year/month(1–12) が妥当か（client 入力の防御）。 */
export function isValidYearMonth(year: number, month: number): boolean {
  return (
    Number.isInteger(year) &&
    year >= 1970 &&
    year <= 9999 &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
  );
}

/**
 * その月の半開区間 [start, endExclusive) を返す（pure）。
 * 例: (2025, 7) → { start: "2025-07-01", endExclusive: "2025-08-01" }。
 * 12 月は翌年 1 月へ繰り上げ。
 */
export function monthImportRange(year: number, month: number): ShiftImportRange {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: `${year}-${pad2(month)}-01`,
    endExclusive: `${nextYear}-${pad2(nextMonth)}-01`,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 結果写像（save errors → safe UI result。raw を forward しない）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mapSaveErrors(errors: ShiftImportSaveError[]): ShiftImportActionResult {
  const conflict = errors.find((e) => e.kind === "manual_indicator_conflict");
  if (conflict && conflict.kind === "manual_indicator_conflict") {
    return {
      ok: false,
      kind: "conflict",
      message: SHIFT_IMPORT_ACTION_MESSAGES.conflict,
      dates: conflict.dates,
    };
  }
  const duplicate = errors.find((e) => e.kind === "duplicate_import_date");
  if (duplicate && duplicate.kind === "duplicate_import_date") {
    return {
      ok: false,
      kind: "duplicate",
      message: SHIFT_IMPORT_ACTION_MESSAGES.duplicate,
      dates: duplicate.dates,
    };
  }
  const invalid = errors.find(
    (e) => e.kind === "anchor_invalid" || e.kind === "indicator_invalid"
  );
  if (invalid) {
    return { ok: false, kind: "invalid", message: SHIFT_IMPORT_ACTION_MESSAGES.invalid };
  }
  // persistence_failed / owner guard(42501) / その他 → safe error。
  // ★ upstream の message は forward しない（raw 混入の可能性を構造的に断つ）。
  return { ok: false, kind: "error", message: SHIFT_IMPORT_ACTION_MESSAGES.error };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// orchestration core
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 確認画面で承認したシフトを /plan に保存する（auth/flag/range/repo を結線、safe result を返す）。
 * 実 client / flag / repo は deps で注入（action が結線）。throw せず ShiftImportActionResult で表現。
 */
export async function runShiftImportSave(
  input: ShiftImportSaveActionInput,
  deps: RunShiftImportSaveDeps
): Promise<ShiftImportActionResult> {
  // 0. flag（OFF なら dormant。getUserId/repo を呼ばない）
  if (!deps.isEnabled()) {
    return { ok: false, kind: "disabled", message: SHIFT_IMPORT_ACTION_MESSAGES.disabled };
  }

  // 0.5 S-save-0: 接続先 guard（staging allowlist + production deny。fail-closed）。
  //     NG（接続先が production / staging 不一致 / URL 未設定）なら **auth/projection/RPC に到達せず**
  //     disabled で停止。env 誤設定でも production への保存をコードで遮断する多重防御。
  if (!isShiftImportSaveConnectionAllowed(deps.connection)) {
    return { ok: false, kind: "disabled", message: SHIFT_IMPORT_ACTION_MESSAGES.disabled };
  }

  // 1. 認証（userId は server auth のみ。未認証は repo 未呼出で返す）
  const userId = await deps.getUserId();
  if (!userId) {
    return {
      ok: false,
      kind: "unauthenticated",
      message: SHIFT_IMPORT_ACTION_MESSAGES.unauthenticated,
    };
  }

  // 2. year/month 防御 → server 側で importRange 算出（client range を信頼しない）
  if (!isValidYearMonth(input.year, input.month)) {
    return { ok: false, kind: "invalid", message: SHIFT_IMPORT_ACTION_MESSAGES.invalid };
  }
  const importRange = monthImportRange(input.year, input.month);

  // 3. projection + 保存（projection は server 側。unresolved があれば repo 未呼出で差し戻し）
  const saveInput: ExecuteShiftImportSaveInput = {
    userId,
    cells: input.cells,
    dictionary: deps.dictionary,
    source: input.source ?? {},
    importRange,
  };
  const outcome = await executeShiftImportSave(saveInput, deps.repo);

  if (outcome.status === "blocked_unresolved") {
    return {
      ok: false,
      kind: "unresolved",
      message: SHIFT_IMPORT_ACTION_MESSAGES.unresolved,
      skipped: outcome.skipped,
    };
  }

  // 4. 保存結果 → safe UI result
  const result = outcome.result;
  if (result.ok) {
    return { ok: true, summary: result.summary };
  }
  return mapSaveErrors(result.errors);
}
