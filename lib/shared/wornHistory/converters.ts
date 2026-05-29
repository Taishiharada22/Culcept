/**
 * shared WornHistory — converters（Phase 3-A: pure・store 非接触）
 *
 * /plan の PlanWornRecord と /calendar の WornRecord を canonical な WornHistoryEntry に
 * 正規化する pure 関数群。 **実 store は読まない / 書かない**（型変換のみ）。
 *
 * 設計判断:
 *   - `/calendar/_lib` も `/plan` store も **直接 import しない**。 入力は構造的に写した
 *     mirror 型（下記）で受ける。 これにより shared ドメインは両 feature に依存しない。
 *   - 元型との整合は test 側で type-only import の assignability 検査により pin する。
 */

import {
  computeLearningEligibility,
  isSatisfactionLevel,
  type LearningEligibilityOptions,
} from "./eligibility";
import type { SatisfactionLevel, WornHistoryEntry } from "./types";

/**
 * /plan の PlanWornRecord を構造的に写した入力型（直接 import せず mirror）。
 * 出典: app/(culcept)/plan/tabs/_calendar-outfit/wornStore.ts の PlanWornRecord。
 * satisfaction は防御的に number も許容し、 変換時に 1-5 へ検証する。
 */
export interface PlanWornRecordInput {
  date: string;
  wornAt: string;
  itemIds: string[];
  source: "engine" | "mock" | "hydrated_mock";
  satisfaction?: number;
  ratedAt?: string;
  proposalId?: string;
}

/**
 * /calendar の WornRecord を構造的に写した入力型（直接 import せず mirror）。
 * 出典: app/(culcept)/calendar/_lib/types.ts:138 の WornRecord（2026-05 時点）。
 * 元の WornRecord は wornAt / source を持たないため、 wornAt は opts で上書き可（既定は date 深夜）。
 */
export interface CalendarWornRecordInput {
  date: string;
  itemIds: string[];
  satisfaction: number;
  note?: string;
}

/** number を満足度（1-5）へ検証。 範囲外・非整数・undefined は undefined。 */
function toSatisfactionLevel(value: number | undefined): SatisfactionLevel | undefined {
  return isSatisfactionLevel(value) ? value : undefined;
}

/** PlanWornRecord → WornHistoryEntry（pure・origin=plan・source は passthrough）。 */
export function planWornRecordToEntry(
  record: PlanWornRecordInput,
  options: LearningEligibilityOptions = {},
): WornHistoryEntry {
  const satisfaction = toSatisfactionLevel(record.satisfaction);
  const base = {
    date: record.date,
    wornAt: record.wornAt,
    itemIds: [...record.itemIds],
    satisfaction,
    source: record.source,
    origin: "plan" as const,
  };
  const learningEligible = computeLearningEligibility(base, options);
  return {
    ...base,
    ...(record.ratedAt != null ? { ratedAt: record.ratedAt } : {}),
    learningEligible,
  };
}

export interface CalendarConvertOptions extends LearningEligibilityOptions {
  /** calendar は時刻を持たないため、 必要なら wornAt を明示指定（既定は `${date}T00:00:00.000Z`）。 */
  wornAt?: string;
}

/** Calendar WornRecord → WornHistoryEntry（pure・origin=calendar・source=calendar_form）。 */
export function calendarWornRecordToEntry(
  record: CalendarWornRecordInput,
  options: CalendarConvertOptions = {},
): WornHistoryEntry {
  const satisfaction = toSatisfactionLevel(record.satisfaction);
  const wornAt = options.wornAt ?? `${record.date}T00:00:00.000Z`;
  const base = {
    date: record.date,
    wornAt,
    itemIds: [...record.itemIds],
    satisfaction,
    source: "calendar_form" as const,
    origin: "calendar" as const,
  };
  const learningEligible = computeLearningEligibility(base, options);
  return { ...base, learningEligible };
}
