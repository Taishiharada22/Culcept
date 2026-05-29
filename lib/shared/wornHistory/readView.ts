/**
 * shared WornHistory — read-view（Phase 3-B-B: read-only・dual-read merge・書き込みゼロ）
 *
 * /plan diary（culcept_plan_worn_v1）と /calendar 着用履歴（facade loadWornHistory 経由）を
 * canonical WornHistoryEntry[] に束ねる read-only ビュー。 新しい保存先は作らない。
 *
 * 厳守:
 *   - **書かない**（localStorage / IndexedDB / server / Supabase いずれも）。 新 key を作らない。
 *   - calendar は facade `@/lib/shared/outfitEngine` の `loadWornHistory()` 経由のみ
 *     （`/calendar/_lib` 直 import 禁止）。 facade は engine を含むため **dynamic import** し、
 *     この barrel / static graph に engine を持ち込まない。
 *   - learning corpus は conflict policy で「1 日 1 ソース」に解決した上で learningEligible のみ。
 *     mock / hydrated_mock は絶対に corpus に入らない。
 *   - SSR / 非ブラウザ / facade 失敗時は fail-open（plan-only / 空）で throw しない。
 *
 * 設計分離:
 *   - `buildWornHistoryView` = storage 非接触の pure merge（テストの主対象）。
 *   - `loadWornHistoryView` 他 = 実 store を読む薄い async シェル（pure コアに委譲）。
 */

import {
  resolveWornHistoryConflict,
  type WornHistoryConflictDecision,
} from "./conflictPolicy";
import {
  calendarWornRecordToEntry,
  planWornRecordToEntry,
  type CalendarWornRecordInput,
  type PlanWornRecordInput,
} from "./converters";
import type { WornHistoryEntry } from "./types";

/** /plan diary の物理 key（writer は app/(culcept)/plan/tabs/_calendar-outfit/wornStore.ts）。 read のみ。 */
const PLAN_WORN_KEY = "culcept_plan_worn_v1";

export interface BuildWornHistoryViewInput {
  planRecords?: PlanWornRecordInput[];
  calendarRecords?: CalendarWornRecordInput[];
  knownWardrobeIds?: Iterable<string>;
}

/** plan / calendar が同日衝突した日の判断（透明性・debug/観測用）。 */
export interface WornHistoryConflictNote {
  date: string;
  decision: WornHistoryConflictDecision;
}

export interface WornHistoryView {
  /** 日記表示用: 1 日 1 件の代表エントリ（date 降順）。 */
  entries: WornHistoryEntry[];
  /** 学習用: conflict 解決後 1 日 1 ソース、 learningEligible のみ（entries の部分集合・date 降順）。 */
  learningCorpus: WornHistoryEntry[];
  /** plan/calendar が同日衝突した日の判断一覧（date 降順）。 */
  conflicts: WornHistoryConflictNote[];
}

interface DateResolution {
  representative: WornHistoryEntry;
  inCorpus: boolean;
  conflict?: WornHistoryConflictNote;
}

/** 同日の calendar / plan エントリから「代表エントリ」と「学習可否」を決める（pure）。 */
function resolveDate(
  date: string,
  cal: WornHistoryEntry | undefined,
  plan: WornHistoryEntry | undefined,
): DateResolution | null {
  if (cal && plan) {
    const decision = resolveWornHistoryConflict(cal, plan);
    const conflict: WornHistoryConflictNote = { date, decision };
    switch (decision.action) {
      case "use_plan_diary":
        return { representative: plan, inCorpus: plan.learningEligible, conflict };
      case "use_existing_calendar":
        return { representative: cal, inCorpus: cal.learningEligible, conflict };
      case "needs_confirmation":
      case "skip_learning":
      default:
        // calendar を既存の確定記録として表示。 学習は自動では行わない（確認/対象外）。
        return { representative: cal, inCorpus: false, conflict };
    }
  }
  if (cal) {
    // calendar 単独 = 現行 learning source。
    return { representative: cal, inCorpus: cal.learningEligible };
  }
  if (plan) {
    const decision = resolveWornHistoryConflict(null, plan);
    return {
      representative: plan,
      inCorpus: decision.action === "use_plan_diary" && plan.learningEligible,
    };
  }
  return null;
}

const byDateDesc = (a: { date: string }, b: { date: string }): number =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : 0;

/** pure: 与えられた plan/calendar レコードを canonical view に束ねる（storage 非接触・書かない）。 */
export function buildWornHistoryView(input: BuildWornHistoryViewInput = {}): WornHistoryView {
  const opts = input.knownWardrobeIds ? { knownWardrobeIds: input.knownWardrobeIds } : {};
  const byDate = new Map<string, { cal?: WornHistoryEntry; plan?: WornHistoryEntry }>();

  for (const rec of input.calendarRecords ?? []) {
    const entry = calendarWornRecordToEntry(rec, opts);
    const slot = byDate.get(entry.date) ?? {};
    slot.cal = entry; // 同日 calendar 複数は後勝ち（loadWornHistory は通常 1/date）。
    byDate.set(entry.date, slot);
  }
  for (const rec of input.planRecords ?? []) {
    const entry = planWornRecordToEntry(rec, opts);
    const slot = byDate.get(entry.date) ?? {};
    slot.plan = entry; // 同日 plan 複数は後勝ち（plan store は 1/date 上書き）。
    byDate.set(entry.date, slot);
  }

  const entries: WornHistoryEntry[] = [];
  const learningCorpus: WornHistoryEntry[] = [];
  const conflicts: WornHistoryConflictNote[] = [];

  for (const [date, slot] of byDate) {
    const res = resolveDate(date, slot.cal, slot.plan);
    if (!res) continue;
    entries.push(res.representative);
    if (res.inCorpus) learningCorpus.push(res.representative);
    if (res.conflict) conflicts.push(res.conflict);
  }

  entries.sort(byDateDesc);
  learningCorpus.sort(byDateDesc);
  conflicts.sort(byDateDesc);

  return { entries, learningCorpus, conflicts };
}

// ── IO シェル（read-only・throw しない） ──────────────────────────────

function getLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** /plan diary を read-only で読む（書かない・SSR / 破損は []）。 */
function readPlanWornRecords(): PlanWornRecordInput[] {
  const ls = getLocalStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(PLAN_WORN_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: PlanWornRecordInput[] = [];
    for (const v of parsed) {
      if (!v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      if (typeof o.date !== "string" || !Array.isArray(o.itemIds) || typeof o.source !== "string") {
        continue;
      }
      out.push({
        date: o.date,
        wornAt: typeof o.wornAt === "string" ? o.wornAt : o.date,
        itemIds: o.itemIds.filter((x): x is string => typeof x === "string"),
        source: o.source as PlanWornRecordInput["source"],
        ...(typeof o.satisfaction === "number" ? { satisfaction: o.satisfaction } : {}),
        ...(typeof o.ratedAt === "string" ? { ratedAt: o.ratedAt } : {}),
        ...(typeof o.proposalId === "string" ? { proposalId: o.proposalId } : {}),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * /calendar 着用履歴を facade 経由で read-only に読む。
 *   - 非ブラウザでは facade に触れず [] を返す（engine を node で起動しない）。
 *   - facade は engine を含むため dynamic import。 失敗時は fail-open（[]）。
 *   - raw な note 等は持ち越さない（date / itemIds / satisfaction のみ）。
 */
async function readCalendarWornRecords(): Promise<CalendarWornRecordInput[]> {
  if (getLocalStorage() === null) return [];
  try {
    const mod = await import("@/lib/shared/outfitEngine");
    const raw = mod.loadWornHistory();
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (r) =>
          r &&
          typeof r.date === "string" &&
          Array.isArray(r.itemIds) &&
          typeof r.satisfaction === "number",
      )
      .map((r) => ({
        date: r.date,
        itemIds: r.itemIds.filter((x): x is string => typeof x === "string"),
        satisfaction: r.satisfaction,
      }));
  } catch {
    return [];
  }
}

export interface LoadWornHistoryViewOptions {
  /** calendar 履歴を含めるか（既定 true: canonical = plan + calendar）。 */
  includeCalendar?: boolean;
  knownWardrobeIds?: Iterable<string>;
}

/** read-only: 実 store から canonical view を組み立てる（書かない・throw しない）。 */
export async function loadWornHistoryView(
  options: LoadWornHistoryViewOptions = {},
): Promise<WornHistoryView> {
  const includeCalendar = options.includeCalendar ?? true;
  const planRecords = readPlanWornRecords();
  const calendarRecords = includeCalendar ? await readCalendarWornRecords() : [];
  return buildWornHistoryView({
    planRecords,
    calendarRecords,
    ...(options.knownWardrobeIds ? { knownWardrobeIds: options.knownWardrobeIds } : {}),
  });
}

/** read-only: 指定日の代表エントリ（無ければ null）。 */
export async function getWornHistoryEntryForDate(
  date: string,
  options: LoadWornHistoryViewOptions = {},
): Promise<WornHistoryEntry | null> {
  const view = await loadWornHistoryView(options);
  return view.entries.find((e) => e.date === date) ?? null;
}

/** read-only: 学習コーパス（conflict 解決後 1/date・learningEligible のみ）。 */
export async function getLearningCorpus(
  options: LoadWornHistoryViewOptions = {},
): Promise<WornHistoryEntry[]> {
  const view = await loadWornHistoryView(options);
  return view.learningCorpus;
}
