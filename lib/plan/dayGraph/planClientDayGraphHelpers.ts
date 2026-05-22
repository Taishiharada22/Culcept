/**
 * PlanClient DayGraph helpers — Phase 3-K-2 (= PlanClient 接続層、 K-2)。
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §14 K-2 placeholder
 *
 * 役割:
 *   PlanClient が `buildDayGraph` を date 別に useMemo 計算するための pure helper。
 *   anchorsForDay (= app/(culcept)/plan/tabs/_helpers.ts) を caller 経由で
 *   inject する形式で、 lib/ → app/ の依存方向を作らない。
 *
 * 不変原則:
 *   - pure deterministic (= 同 input → 同 output)
 *   - anchor mutation 不可
 *   - LLM 不使用
 *   - JSON-safe output (= Map ではなく Record、 §22.9 整合)
 *   - lib/ から app/ への import 不可 (= resolver は caller 注入)
 *   - K-2 では UI 接続用 data 構造のみ、 表示なし
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";

import { buildDayGraph } from "./buildDayGraph";
import type {
  BuildDayGraphOptions,
  BuildDayGraphResult,
  DayGraphWarning,
} from "./dayGraphTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers — date extraction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Date → "YYYY-MM-DD" (UTC 基準、 existing convention と整合) */
function formatDateString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

/** "YYYY-MM-DD" → Date (= UTC midnight) */
function parseDateString(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (isNaN(d.getTime())) return null;
  return d;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public: collect anchored dates
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CollectAnchoredDatesInput {
  /** 全 anchor (= one_off + recurring 混在) */
  readonly anchors: ReadonlyArray<ExternalAnchor>;
  /** 「今日」 (= UTC midnight or any time)、 always 含める */
  readonly nowDate: Date;
  /**
   * 追加 date strings (= "YYYY-MM-DD" 配列、 K-3c-0 補正)。
   *
   * 用途:
   *   - FlowTab 7 day visible window
   *   - CalendarTab 選択週 visible dates
   *   - recurring-only day (= one_off date は持たないが anchorsForDay で展開される日)
   *
   * 不正 format ("YYYY-MM-DD" 以外) は skip (= 防御)。
   * union + sort で deterministic 昇順を保証。
   */
  readonly extraDateStrings?: ReadonlyArray<string>;
}

/** "YYYY-MM-DD" strict format check (= K-3c-0 補正、 防御) */
const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * DayGraph を計算する候補 date strings (= "YYYY-MM-DD") を抽出。
 *
 * 規則:
 *   - 今日 (= nowDate の YYYY-MM-DD) を必ず含める
 *   - 全 one_off anchor の `date` を含める
 *   - extraDateStrings (= K-3c-0 補正) を含める (= visible dates / recurring-only day カバー)
 *   - 不正 format の extraDateStrings entry は skip
 *
 * 戻り値: 一意な date strings の **昇順** 配列 (= deterministic 順序)。
 *
 * 性質:
 *   - 同 input → 同 output (= sort 済)
 *   - JSON-safe (= 配列、 Set ではない)
 *   - backward compat (= extraDateStrings 省略時は K-2 と完全同動作)
 */
export function collectAnchoredDateStrings(
  input: CollectAnchoredDatesInput,
): ReadonlyArray<string> {
  const set = new Set<string>();
  // 1. today
  set.add(formatDateString(input.nowDate));
  // 2. one_off anchor dates
  for (const a of input.anchors) {
    if (a.anchorKind === "one_off" && typeof a.date === "string" && a.date.length > 0) {
      set.add(a.date);
    }
  }
  // 3. extra visible dates (= K-3c-0 補正、 FlowTab 7 day / recurring-only day 等)
  if (input.extraDateStrings) {
    for (const s of input.extraDateStrings) {
      if (typeof s !== "string") continue;
      if (!YMD_PATTERN.test(s)) continue; // 防御: 不正 format skip
      set.add(s);
    }
  }
  return Array.from(set).sort();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Visible date window helper (= K-3c-0、 caller convenience)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MS_PER_DAY = 86400000;

/**
 * 「today ± N days」 の visible date window を生成する pure helper。
 *
 * 用途 (= K-3c-0):
 *   PlanClient で FlowTab 7 day + CalendarTab 選択週 + buffer を覆う range を
 *   宣言的に作る。 collectAnchoredDateStrings の extraDateStrings として渡す。
 *
 * 規則:
 *   - centerDate を UTC midnight に正規化
 *   - centerDate ± daysBefore / daysAfter の date strings を生成
 *   - 昇順 sort 済
 *
 * @param centerDate 中心日付 (= 通常 now)
 * @param daysBefore 過去側 day 数 (= default 7)
 * @param daysAfter 未来側 day 数 (= default 7)
 * @returns "YYYY-MM-DD" 配列、 昇順 (= 計 daysBefore + daysAfter + 1 個)
 */
export function buildVisibleDateWindow(
  centerDate: Date,
  daysBefore = 7,
  daysAfter = 7,
): ReadonlyArray<string> {
  const safeDaysBefore = Math.max(0, Math.floor(daysBefore));
  const safeDaysAfter = Math.max(0, Math.floor(daysAfter));
  const centerMs = Date.UTC(
    centerDate.getUTCFullYear(),
    centerDate.getUTCMonth(),
    centerDate.getUTCDate(),
  );
  const result: string[] = [];
  for (let i = -safeDaysBefore; i <= safeDaysAfter; i++) {
    const d = new Date(centerMs + i * MS_PER_DAY);
    result.push(formatDateString(d));
  }
  // 昇順 sort (= 既に時系列順だが defensive)
  return result.slice().sort();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public: build DayGraph map
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * date → anchors の resolver (= caller 注入、 app/ への依存を避けるため)。
 * 既存 anchorsForDay (= tabs/_helpers.ts) と shape 互換。
 */
export type AnchorsForDateResolver = (
  anchors: ReadonlyArray<ExternalAnchor>,
  date: Date,
) => ReadonlyArray<ExternalAnchor>;

export interface ComputeDayGraphMapInput {
  /** 全 anchor (= source、 resolver に渡す) */
  readonly anchors: ReadonlyArray<ExternalAnchor>;
  /** 計算対象 date strings (= "YYYY-MM-DD"、 caller 責任) */
  readonly dateStrings: ReadonlyArray<string>;
  /** date 別 anchor 抽出 (= caller 注入) */
  readonly resolveAnchorsForDate: AnchorsForDateResolver;
  /** buildDayGraph options (= 各 date に同 options を適用) */
  readonly options?: BuildDayGraphOptions;
}

export interface ComputeDayGraphMapResult {
  /** date → BuildDayGraphResult (= JSON-safe Record) */
  readonly byDate: Readonly<Record<string, BuildDayGraphResult>>;
  /** 全 date の warnings を flatten (= dev log / debug 用、 UI 表示は K-2 では行わない) */
  readonly allWarnings: ReadonlyArray<DayGraphWarning>;
}

/**
 * 各 date string について anchors を resolver で抽出 + buildDayGraph を実行。
 * 結果を date 別 Record + warnings flatten 配列で返す。
 *
 * 不変原則:
 *   - 全 BuildDayGraphResult は IntegrityContract + RedactionContract を満たす
 *     (= buildDayGraph 内 assertDayGraphCompliance 経由)
 *   - 不正 date string (= "YYYY-MM-DD" 形式違反) → skip + warning collect
 *   - anchor mutation なし (= readonly 維持)
 *
 * Caller (= PlanClient) usage:
 *   ```
 *   const dates = collectAnchoredDateStrings({ anchors, nowDate });
 *   const map = computeDayGraphMapForAnchors({
 *     anchors,
 *     dateStrings: dates,
 *     resolveAnchorsForDate: (allA, d) => anchorsForDay([...allA], d),
 *   });
 *   ```
 */
export function computeDayGraphMapForAnchors(
  input: ComputeDayGraphMapInput,
): ComputeDayGraphMapResult {
  const byDate: Record<string, BuildDayGraphResult> = {};
  const allWarnings: DayGraphWarning[] = [];

  for (const dateString of input.dateStrings) {
    const dateObj = parseDateString(dateString);
    if (!dateObj) {
      // 不正 format は collect 時に弾く想定だが防御
      allWarnings.push({
        kind: "missing_date",
        detail: `invalid date string format "${dateString}" in computeDayGraphMapForAnchors input`,
      });
      continue;
    }
    const dayAnchors = input.resolveAnchorsForDate(input.anchors, dateObj);
    const result = buildDayGraph({
      anchors: dayAnchors,
      date: dateString,
      options: input.options,
    });
    byDate[dateString] = result;
    for (const w of result.warnings) allWarnings.push(w);
  }

  return { byDate, allWarnings };
}
