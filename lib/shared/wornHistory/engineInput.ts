/**
 * shared WornHistory — engine input bundle builder（Phase 5-C1: async 層で用意・engine 非接続）
 *
 * shared readView → 5-B adapter で、将来 engine に渡す `WornHistoryEngineInput` を組み立てる。
 * **engine にはまだ渡さない**（5-C2/5-C3 で gated 注入）。 ここは「入力準備」だけ。
 *
 * 用途分離（5-A 確定）:
 *   - 満足度 / コンボ学習 → `learningRecords`（learningCorpus 由来・my_style/mock 除外）
 *   - recency / rotation   → `recencyRecords`（entries 由来・my_style 含む・mock 除外）
 *
 * 厳守: storage write しない / log・analytics しない / engine に接続しない。
 */

import {
  learningCorpusToWornRecords,
  wornHistoryEntriesToRecencyWornRecords,
  type LearningWornRecord,
  type RecencyWornRecord,
} from "./learningAdapter";
import { loadWornHistoryView } from "./readView";

/** engine へ渡す worn history 入力束（学習用 / recency 用を分離）。 */
export interface WornHistoryEngineInput {
  /** 満足度 / コンボ学習用（learningCorpus 由来）。 */
  learningRecords: LearningWornRecord[];
  /** recency / rotation 用（entries 由来・着た事実）。 */
  recencyRecords: RecencyWornRecord[];
}

export interface BuildWornHistoryEngineInputOptions {
  /** 実在 wardrobe id 集合（現在の wardrobe から導出）。 空 / 未指定なら null を返す。 */
  knownWardrobeIds?: Iterable<string>;
  /** calendar 履歴を含めるか（既定 true: readView 既定）。 */
  includeCalendar?: boolean;
  /** canonical を含めるか（既定 true）。 */
  includeCanonical?: boolean;
}

function toKnownSet(ids: Iterable<string> | undefined): Set<string> | null {
  if (!ids) return null;
  return ids instanceof Set ? ids : new Set(ids);
}

/**
 * shared readView から `WornHistoryEngineInput` を組み立てる（async・read-only）。
 * fallback として **null** を返す条件:
 *   - knownWardrobeIds が空 / 未指定
 *   - readView 失敗（throw → catch）／ SSR・localStorage 不可（readView が空 view を返す）
 *   - learningRecords / recencyRecords が**両方**空
 * learning だけ / recency だけある場合は bundle を返す（per-purpose 注入できるように）。
 */
export async function buildWornHistoryEngineInput(
  options: BuildWornHistoryEngineInputOptions = {},
): Promise<WornHistoryEngineInput | null> {
  const known = toKnownSet(options.knownWardrobeIds);
  if (!known || known.size === 0) return null;
  try {
    const view = await loadWornHistoryView({
      knownWardrobeIds: known,
      ...(options.includeCalendar !== undefined ? { includeCalendar: options.includeCalendar } : {}),
      ...(options.includeCanonical !== undefined ? { includeCanonical: options.includeCanonical } : {}),
    });
    const learningRecords = learningCorpusToWornRecords(view.learningCorpus, { knownWardrobeIds: known });
    const recencyRecords = wornHistoryEntriesToRecencyWornRecords(view.entries, { knownWardrobeIds: known });
    if (learningRecords.length === 0 && recencyRecords.length === 0) return null;
    return { learningRecords, recencyRecords };
  } catch {
    return null; // read 失敗 → old path fallback（呼出側が loadWornHistory に倒す）
  }
}

/** referenceDate（YYYY-MM-DD・既定 today）から days 日前の cutoff（YYYY-MM-DD）を返す。 */
function recencyCutoff(referenceDate: string | undefined, days: number): string {
  const base = referenceDate ? new Date(`${referenceDate}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(base.getTime())) return new Date().toISOString().slice(0, 10);
  base.setUTCDate(base.getUTCDate() - days);
  return base.toISOString().slice(0, 10);
}

/**
 * recencyRecords から「直近 days 日に着た item id」を返す（pure・dedupe 済）。
 *   - 現行 `getRecentlyWornItemIds(7)`（loadWornHistory 直読み）の shared 版。 5-C2/5-C3 で使用。
 *   - mock / hydrated_mock は adapter で既に除外済（防御的に壊れない）。 note / moodTag は扱わない。
 *   - referenceDate を渡せば決定的（既定は実行時 today）。
 */
export function getRecentlyWornItemIdsFromRecencyRecords(
  records: ReadonlyArray<{ date: string; itemIds: string[] }>,
  options: { days?: number; referenceDate?: string } = {},
): string[] {
  const days = options.days ?? 7;
  const cutoff = recencyCutoff(options.referenceDate, days);
  const ids = new Set<string>();
  for (const r of records) {
    if (!r || typeof r.date !== "string" || !Array.isArray(r.itemIds)) continue;
    if (r.date >= cutoff) {
      for (const id of r.itemIds) if (typeof id === "string") ids.add(id);
    }
  }
  return Array.from(ids);
}
