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

/**
 * My-Style / Home morning の wearEvents を構造的に写した入力型（直接 import せず mirror）。
 * 出典: lib/shared/wearEvents.ts の WearEvent（date / itemIds / satisfaction のみ消費）。
 * note / moodTag は **意図的に受け取らない**（canonical に自由記述・曖昧情報を載せない）。
 */
export interface WearEventInput {
  /** YYYY-MM-DD */
  date: string;
  /** 着用アイテム id 群 */
  itemIds: string[];
  /** 満足度（あれば。 多くの wearEvents 経路は持たない） */
  satisfaction?: number;
}

export interface WearEventConvertOptions extends LearningEligibilityOptions {
  /** wearEvents は時刻を持たないため、 既定は `${date}T00:00:00.000Z`。 */
  wornAt?: string;
}

/**
 * wearEvents → WornHistoryEntry（pure・origin=style・source=my_style）。
 *   - **learningEligible は常に false**：my_style は学習 whitelist 外（手動ログで「推薦→結果」の因果が無い）。
 *     satisfaction があっても false（computeLearningEligibility が source で弾く）。
 *   - note / moodTag は載せない（privacy-minimal・入力型が受け取らない）。
 *   - wornAt は副作用回避のため呼出側 or 既定（date 深夜）。
 */
export function wearEventToEntry(
  input: WearEventInput,
  options: WearEventConvertOptions = {},
): WornHistoryEntry {
  const satisfaction = toSatisfactionLevel(input.satisfaction);
  const wornAt = options.wornAt ?? `${input.date}T00:00:00.000Z`;
  const base = {
    date: input.date,
    wornAt,
    itemIds: [...input.itemIds],
    satisfaction,
    source: "my_style" as const,
    origin: "style" as const,
  };
  const learningEligible = computeLearningEligibility(base, options);
  return { ...base, learningEligible };
}
