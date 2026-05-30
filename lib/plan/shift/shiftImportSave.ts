/**
 * シフト取り込み 本保存オーケストレーション — SR Step 6A
 *
 * 確認画面で承認したセル群を /plan へ保存する手順を、**flag/DB から独立した純粋な orchestration**
 * として固める（test 可能）。実際の flag gate + 実 Supabase repo 注入は 6B の server action が行う。
 *
 * 手順（ゴールから逆算）:
 *   confirmed cells + dictionary
 *     → projectShiftRoster（勤務/休み/希望休/unresolved に分類）
 *     → buildShiftImportPlan（勤務=anchor / 休み=day_indicator / unresolved=skipped）
 *     → guard: unresolved があれば保存しない（確認画面へ差し戻し。沈黙の部分保存を防ぐ）
 *     → repo.saveShiftImportBundle（source+anchors+indicators を atomic 保存）
 *
 * 不変原則: unresolved が 1 件でもあれば save を試みない。save は repo の atomic 契約に委ねる。
 */

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import {
  projectShiftRoster,
  type ShiftCellReading,
} from "./shiftRosterProjection";
import type { ShiftCodeDictionary } from "./shiftCodeDictionary";
import {
  buildShiftImportPlan,
  isShiftImportReady,
  type ShiftImportSkipped,
} from "./shiftImportAdapter";
import type {
  ShiftImportRepository,
  ShiftImportSourceInput,
  ShiftImportSaveResult,
  ShiftImportRange,
} from "./shiftImportRepository";

export interface ExecuteShiftImportSaveInput {
  userId: string;
  cells: ShiftCellReading[];
  dictionary: ShiftCodeDictionary;
  source: ShiftImportSourceInput;
  /**
   * 取り込み月範囲（半開 [start, endExclusive)）。**6B の range-scoped replace に必須**。
   * 6A の in-memory repo（first-import）は無くても動くため optional（後方互換）。
   * server action（6B-apply-C）は year/month から算出して必ず渡す。
   */
  importRange?: ShiftImportRange;
}

export type ShiftImportSaveOutcome =
  /** unresolved があり保存を試みなかった（確認画面で要解決） */
  | { status: "blocked_unresolved"; skipped: ShiftImportSkipped[] }
  /** 保存を試みた（result.ok が成否。atomic なので false なら何も保存されていない） */
  | { status: "saved"; result: ShiftImportSaveResult };

/**
 * 確認済みセルを /plan に保存する（flag/DB 非依存の純 orchestration）。
 * repo は注入（6A: in-memory / 6B: Supabase）。
 */
export async function executeShiftImportSave(
  input: ExecuteShiftImportSaveInput,
  repo: ShiftImportRepository
): Promise<ShiftImportSaveOutcome> {
  const projection = projectShiftRoster(input.cells, input.dictionary);
  const plan = buildShiftImportPlan(projection);

  // unresolved があれば保存しない（部分・不正確な反映を防ぐ）
  if (!isShiftImportReady(plan)) {
    return { status: "blocked_unresolved", skipped: plan.skipped };
  }

  const result = await repo.saveShiftImportBundle(input.userId, {
    source: input.source,
    anchors: plan.anchorInputs,
    dayIndicators: plan.dayIndicators,
    // 渡された時のみ importRange を束ねる（in-memory repo は無視、RPC repo は必須）
    ...(input.importRange ? { importRange: input.importRange } : {}),
  });

  return { status: "saved", result };
}

/**
 * 本保存経路が有効か（server-side flag）。
 *
 * 6B の server action は：
 *   1. これが false なら disabled を返す（確認画面の「反映」は無効のまま）、
 *   2. true なら実 Supabase ShiftImportRepository を注入して executeShiftImportSave を呼ぶ。
 * 本 6A では flag は default OFF で dormant（実 DB 保存なし）。
 */
export function isShiftImportSaveEnabled(): boolean {
  return PLAN_FLAGS.shiftImportSave;
}
