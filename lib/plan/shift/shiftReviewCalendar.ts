/**
 * シフト確認カレンダーの週組み立て（pure / no React）— 曜日配置 fix
 *
 * 確認グリッドは「原稿どおり正確に確認する」ための器。抽出セルを必ず
 * **実カレンダーの曜日スロット**へ置く。欠け日（VLM 抽出が返さなかった日）が
 * あっても後続セルがズレないよう、**連番詰めではなく day→曜日位置**で配置する。
 *
 * なぜ pure 化するか:
 *   - 「欠け日があっても day3 が真の曜日列に座る」を vitest "node" で直接固定するため。
 *   - ShiftReviewGrid（"use client"）と分離し、配置ロジックの単一 source とする
 *     （_monthGrid.ts と同方針）。
 *
 * 不変原則: 副作用なし・Date/random/env 非依存・throw しない。
 */

import type { ShiftReviewCell } from "./shiftReviewClassification";

/** Sakamoto のアルゴリズム: 0=Sun..6=Sat（pure・Date 非依存）。 */
export function dayOfWeek(y: number, m: number, d: number): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const yy = m < 3 ? y - 1 : y;
  return (
    (yy +
      Math.floor(yy / 4) -
      Math.floor(yy / 100) +
      Math.floor(yy / 400) +
      t[m - 1] +
      d) %
    7
  );
}

/** その月の日数（pure・Date 非依存）。 */
export function daysInMonth(y: number, m: number): number {
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/**
 * カレンダー 1 スロット（当月の 1 日分）。
 *   - day:  当月の日（1..daysInMonth）。
 *   - cell: その日の抽出セル。**null = 欠け日**（抽出が返さなかった日）。
 */
export interface ShiftReviewSlot {
  day: number;
  cell: ShiftReviewCell | null;
}

/**
 * cells を実カレンダーの曜日スロットへ配置した週配列を返す（pure）。
 *
 * 構造:
 *   - 先頭 pad（前月分）= `null`（firstDow 個）。
 *   - 当月各日 = `ShiftReviewSlot`（抽出セルがあれば `cell`、無ければ `cell=null` の欠け日）。
 *   - 末尾 pad（次月分）= `null`（週を 7 で割り切る分だけ）。
 *
 * **連番詰めしない** ＝ 欠け日があっても各日が真の曜日列に座る
 *   （例: 2025-07-03 は必ず木曜列、欠け日 1,2 があっても 3 は木曜のまま）。
 *
 * 防御:
 *   - 同 day 重複は **最初の出現を優先**（後処理しない原則）。
 *   - 範囲外（<1 / >daysInMonth）の day を持つ cell は黙って無視（配置先が無いため）。
 */
export function buildShiftReviewWeeks(
  cells: readonly ShiftReviewCell[],
  year: number,
  month: number
): (ShiftReviewSlot | null)[][] {
  const firstDow = dayOfWeek(year, month, 1);
  const total = daysInMonth(year, month);

  const byDay = new Map<number, ShiftReviewCell>();
  for (const c of cells) {
    if (c.day >= 1 && c.day <= total && !byDay.has(c.day)) {
      byDay.set(c.day, c);
    }
  }

  const slots: (ShiftReviewSlot | null)[] = [
    ...Array<ShiftReviewSlot | null>(firstDow).fill(null),
    ...Array.from({ length: total }, (_, i): ShiftReviewSlot => {
      const day = i + 1;
      return { day, cell: byDay.get(day) ?? null };
    }),
  ];
  while (slots.length % 7 !== 0) slots.push(null);

  const out: (ShiftReviewSlot | null)[][] = [];
  for (let i = 0; i < slots.length; i += 7) out.push(slots.slice(i, i + 7));
  return out;
}
