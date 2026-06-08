/**
 * Reality Control OS — R2-1 Empty-day Input Contract（**pure・no-DB・barrel 非 export**）
 *
 * 設計: docs/r2-empty-day-asset-audit-and-boundary.md（R2-0）/ docs/reality-secretary-os-unbuilt-roadmap.md（R2）
 *
 * 役割: 「空白の日を組む」R2 の **入力契約**（pure 型 + 正規化）。R2-0 監査の境界に従い、
 *   energy/weather/mobility は **placeholder**、Day Rehearsal/mobility 正本は **触らず型 consume のみ**。
 *   **output はまだ Plan 本線に接続しない**（本 slice は入力契約だけ）。
 *
 * 厳守（CEO 方針）:
 *   - **hard constraints 最優先**（memory は上書きしない）・memory は **personal overlay / hint・重み付けのみ**。
 *   - **usableContexts だけ使う**（ready ∧ 非 suppressed）。insufficient/emerging/suppressed/excluded は入力で防御的に除外。
 *   - certainty high 禁止・trait/fixed/liked-disliked 断定禁止（型レベルで持ち込まない）。pure。
 */

import type { GapMeaning } from "../gap-meaning";
import type { ProtectionReason } from "../authority";
import type { WeatherKind } from "../../context/contextModifier";
import type { SynthesizedContext } from "../learning/memory-synthesis";
import type { MemoryContext } from "../learning/memory-model";

/** 空き枠（分単位・gap 分類 hint を consume）。 */
export interface AvailableWindow {
  readonly startMinute: number; // 0..1440（深夜起点）
  readonly endMinute: number;
  readonly meaning: GapMeaning | null; // classifyGap 由来（consume・任意）
}

/** 動かせない既存制約（最優先・authority の保護理由を consume）。 */
export interface HardConstraint {
  readonly startMinute: number;
  readonly endMinute: number;
  readonly label: string | null; // 粗いラベル（個人情報を持ち込まない・任意）
  readonly protection: ProtectionReason | null; // recovery_core / user_declared 等
}

/** ユーザーの今日の傾き（3 案のどれを好むか・null=指定なし）。 */
export type EmptyDayIntent = "protect" | "easy" | "push";

/** 汎用 Permission Level（**placeholder**・将来の R5 authority Level と整合予定）。 */
export type EmptyDayPermissionLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** 移動 placeholder（**MAP 正本に触らず**最小の travel buffer 仮定のみ）。 */
export interface MobilityPlaceholder {
  readonly typicalTravelBufferMin: number | null;
}

/** R2 empty-day の入力契約（全 placeholder/consume・Plan 本線非接続）。 */
export interface EmptyDayInput {
  readonly date: string;
  readonly availableWindows: readonly AvailableWindow[];
  readonly hardConstraints: readonly HardConstraint[];
  readonly energy: number | null; // 0..1 placeholder（InnerWeather→正規化は呼び出し側）
  readonly weather: WeatherKind | null; // placeholder（consume）
  readonly mobility: MobilityPlaceholder | null; // placeholder
  readonly memoryUsableContexts: readonly SynthesizedContext[]; // R1 hint（**usable のみ**）
  readonly userIntent: EmptyDayIntent | null;
  readonly permissionLevel: EmptyDayPermissionLevel;
  readonly excludedContexts: readonly MemoryContext[]; // 本人/系統が除外した context
}

const DAY_MIN = 0;
const DAY_MAX = 24 * 60;

function ctxKey(c: MemoryContext): string {
  return `${c.dimension ?? "∅"}:${c.value ?? "∅"}`;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
function validWindow(w: { startMinute: number; endMinute: number }): boolean {
  return Number.isFinite(w.startMinute) && Number.isFinite(w.endMinute) && w.startMinute >= DAY_MIN && w.endMinute <= DAY_MAX && w.startMinute < w.endMinute;
}

/**
 * R2-1: memory hint の **防御的フィルタ**＝ready ∧ 非 suppressed ∧ 非 excluded のみ通す。
 *   呼び出し側が usableContexts を渡す前提だが、二重に保証して insufficient/suppressed/excluded を使わせない。
 */
export function effectiveMemoryContexts(
  contexts: readonly SynthesizedContext[],
  excludedContexts: readonly MemoryContext[],
): readonly SynthesizedContext[] {
  const excluded = new Set(excludedContexts.map(ctxKey));
  return contexts.filter((c) => c.readiness === "ready" && !c.suppressed && !excluded.has(ctxKey(c.context)));
}

/** 入力の正規化（energy clamp[0,1]・無効 window/constraint 除外・permission clamp・memory hint 防御フィルタ）。 */
export function normalizeEmptyDayInput(input: EmptyDayInput): EmptyDayInput {
  return {
    ...input,
    availableWindows: input.availableWindows.filter(validWindow),
    hardConstraints: input.hardConstraints.filter(validWindow),
    energy: typeof input.energy === "number" && Number.isFinite(input.energy) ? clamp(input.energy, 0, 1) : null,
    permissionLevel: clamp(input.permissionLevel, 0, 5) as EmptyDayPermissionLevel,
    memoryUsableContexts: effectiveMemoryContexts(input.memoryUsableContexts, input.excludedContexts),
  };
}

/** 空き枠の合計分（hard constraints と重なる分は引かない・window は既に空きの前提）。 */
export function totalAvailableMinutes(input: EmptyDayInput): number {
  return input.availableWindows.filter(validWindow).reduce((sum, w) => sum + (w.endMinute - w.startMinute), 0);
}
