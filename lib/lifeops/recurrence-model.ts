/**
 * Life Ops — Recurrence Engine（毎月/毎年の繰り返し日・**pure・no-DB・no-外部**・barrel 非 export）
 *
 * 設計: docs/life-ops-recurring-mini-design.md / boundary §2 / Appendix A.6 群4・A.8 / deadline-engine（類似）
 *
 * 役割: 4 つ目の時間構造「**recurring（毎月 dayOfMonth / 毎年 month-day）**」。次の発生日を自動算出し
 *   「次までN日」で within_lead を候補化する pure engine。家賃/クレカ/サブスク(毎月)、将来の誕生日/記念日(毎年)を解錠。
 *   deadline と違い **overdue 概念なし**（過ぎたら次の発生へ）。日付は注入（実収集=CEO ゲート）。
 *
 * 厳守:
 *   - pure・deterministic: **Date.now/argless new Date() 不使用**。`Date.parse(now)`＋`Date.UTC()`／`new Date(ms)`(引数あり) で UTC 計算。
 *   - 日付比較は **date-only（UTC 0時）** で行い時刻ゆれを排除。月末クランプ（31 指定でも 2月=28/29）。横エンジン非 import。
 */

import { getCategorySpec } from "./category-model";
import type { LifeOpsCandidate } from "./candidate-types";

export type RecurrencePhase = "unknown" | "upcoming" | "within_lead";

/** 繰り返し定義（毎月 / 毎年 / 毎週曜日）。 */
export type Recurrence =
  | { readonly kind: "monthly"; readonly dayOfMonth: number } // 1-31（月末超は当月末にクランプ）
  | { readonly kind: "annual"; readonly month: number; readonly day: number } // month 1-12
  | { readonly kind: "weekly"; readonly weekdays: readonly number[] }; // 0=日..6=土（ゴミ出し等）

/** 注入観測（日付は per-user 実データ＝注入）。 */
export interface RecurringObservation {
  readonly categoryId: string;
  readonly recurrence: Recurrence;
}

export interface RecurringStatus {
  readonly phase: RecurrencePhase;
  readonly daysUntilNext: number | null;
  readonly leadDays: number;
}

const MS_PER_DAY = 86_400_000;

/** MVP recurring の leadDays（事務 毎月 + ゴミ出し 毎週）。 */
const RECURRING_LEAD_DAYS: Record<string, number> = { rent: 3, card_payment: 3, subscription_review: 7, garbage: 1 };
export function getRecurringLeadDays(categoryId: string): number | undefined {
  return RECURRING_LEAD_DAYS[categoryId];
}

/** y/mZero(0-11) の当月日数。 */
function daysInMonth(y: number, mZero: number): number {
  return new Date(Date.UTC(y, mZero + 1, 0)).getUTCDate();
}

/** nowISO → その日の UTC 0時 ms（不正は null）。 */
function nowDateMs(nowISO: string): number | null {
  const t = Date.parse(nowISO);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Recurrence + now(date-only ms) → 次発生の UTC 0時 ms（不正は null）。当日含む（≥ now）。 */
function nextOccurrenceMs(recurrence: Recurrence, nowDate: number): number | null {
  const ref = new Date(nowDate);
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  if (recurrence.kind === "monthly") {
    const D = recurrence.dayOfMonth;
    if (!Number.isInteger(D) || D < 1 || D > 31) return null;
    const thisMonth = Date.UTC(y, m, Math.min(D, daysInMonth(y, m)));
    if (thisMonth >= nowDate) return thisMonth;
    const ny = m === 11 ? y + 1 : y;
    const nm = m === 11 ? 0 : m + 1;
    return Date.UTC(ny, nm, Math.min(D, daysInMonth(ny, nm)));
  }
  if (recurrence.kind === "annual") {
    const M = recurrence.month;
    const D = recurrence.day;
    if (!Number.isInteger(M) || M < 1 || M > 12 || !Number.isInteger(D) || D < 1 || D > 31) return null;
    const thisYear = Date.UTC(y, M - 1, Math.min(D, daysInMonth(y, M - 1)));
    if (thisYear >= nowDate) return thisYear;
    return Date.UTC(y + 1, M - 1, Math.min(D, daysInMonth(y + 1, M - 1)));
  }
  // weekly: now(当日含む)から 0..6 日先で最初に該当曜日になる日
  const wds = recurrence.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (wds.length === 0) return null;
  for (let k = 0; k <= 6; k++) {
    const cand = nowDate + k * MS_PER_DAY;
    if (wds.includes(new Date(cand).getUTCDay())) return cand;
  }
  return null; // 到達不能（wds 非空）
}

/** 次発生日の ISO（pure・debug/表示用）。 */
export function nextOccurrenceISO(recurrence: Recurrence, nowISO: string): string | null {
  const nd = nowDateMs(nowISO);
  if (nd === null) return null;
  const ms = nextOccurrenceMs(recurrence, nd);
  return ms === null ? null : new Date(ms).toISOString();
}

/** leadDays + recurrence + now → 段階（within_lead / upcoming / unknown）。overdue なし。 */
export function computeRecurringStatus(leadDays: number, recurrence: Recurrence, nowISO: string): RecurringStatus {
  const nd = nowDateMs(nowISO);
  if (nd === null) return { phase: "unknown", daysUntilNext: null, leadDays };
  const nextMs = nextOccurrenceMs(recurrence, nd);
  if (nextMs === null) return { phase: "unknown", daysUntilNext: null, leadDays };
  const daysUntilNext = Math.round((nextMs - nd) / MS_PER_DAY);
  return { phase: daysUntilNext <= leadDays ? "within_lead" : "upcoming", daysUntilNext, leadDays };
}

/**
 * recurring observation[] → LifeOpsCandidate[]（pure・nowISO 注入）。
 *   within_lead のみ候補化（upcoming/unknown は skip）。MVP 外 categoryId / L-1 未定義 は skip。daysUntilNext 昇順。
 */
export function generateRecurringCandidates(
  observations: readonly RecurringObservation[],
  nowISO: string
): readonly LifeOpsCandidate[] {
  const out: LifeOpsCandidate[] = [];
  for (const obs of observations) {
    const leadDays = getRecurringLeadDays(obs.categoryId);
    if (leadDays === undefined) continue; // MVP 外
    const status = computeRecurringStatus(leadDays, obs.recurrence, nowISO);
    if (status.phase !== "within_lead" || status.daysUntilNext === null) continue;
    const cat = getCategorySpec(obs.categoryId);
    if (!cat) continue; // L-1 未定義
    out.push({
      category: cat.id,
      menu: null,
      dueReason: {
        kind: "recurring",
        daysUntilNext: status.daysUntilNext,
        leadDays: status.leadDays,
        recurrenceLabel: obs.recurrence.kind === "monthly" ? "毎月" : obs.recurrence.kind === "annual" ? "毎年" : "毎週",
      },
      suggestedWindow: null,
      placeQuery: cat.placeQueryHint,
      permissionLevelHint: cat.defaultMaxLevelHint,
      riskFlags: cat.typicalRiskFlags,
    });
  }
  return out
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const da = a.c.dueReason.kind === "recurring" ? a.c.dueReason.daysUntilNext : 0;
      const db = b.c.dueReason.kind === "recurring" ? b.c.dueReason.daysUntilNext : 0;
      return da !== db ? da - db : a.i - b.i;
    })
    .map((x) => x.c);
}
