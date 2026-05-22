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
}

/**
 * DayGraph を計算する候補 date strings (= "YYYY-MM-DD") を抽出。
 *
 * 規則 (= K-2 最小):
 *   - 今日 (= nowDate の YYYY-MM-DD) を必ず含める
 *   - 全 one_off anchor の `date` を含める
 *   - recurring anchor の展開 date は **含めない** (= caller が visible range を別途決める)
 *
 * 戻り値: 一意な date strings の **昇順** 配列 (= deterministic 順序)。
 *
 * 性質:
 *   - 同 input → 同 output (= sort 済)
 *   - JSON-safe (= 配列、 Set ではない)
 */
export function collectAnchoredDateStrings(
  input: CollectAnchoredDatesInput,
): ReadonlyArray<string> {
  const set = new Set<string>();
  set.add(formatDateString(input.nowDate));
  for (const a of input.anchors) {
    if (a.anchorKind === "one_off" && typeof a.date === "string" && a.date.length > 0) {
      set.add(a.date);
    }
  }
  return Array.from(set).sort();
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
