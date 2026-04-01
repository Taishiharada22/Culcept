/**
 * Shared Wear Events Domain — 正本
 *
 * 着用履歴の型定義とリポジトリ。
 * Calendar も My-Style もここを通じて着用データにアクセスする。
 *
 * 現状の問題:
 *   - Calendar: `culcept_calendar_worn_v1` (localStorage) + `calendar_outfits` (Supabase)
 *   - My-Style: `culcept_wear_records_v1` (costPerWear) + `SavedState.wearHistory`
 *   - calendarBridge.ts で一方向 sync (calendar → my-style)
 *
 * 共通化の方針:
 *   1. 着用イベントの正本型を定義
 *   2. 将来的に保存先を `style_wear_events_v1` に統一
 *   3. 現時点では既存ストレージから読み取るアダプター層を提供
 */

/** 着用イベントの正本型 — Calendar と My-Style の共通形式 */
export interface WearEvent {
  /** 着用日 (YYYY-MM-DD) */
  date: string;
  /** 着用アイテム ID 群 */
  itemIds: string[];
  /** 満足度 (1-5, optional — Calendar のみ記録) */
  satisfaction?: number;
  /** メモ */
  note?: string;
  /** 気分タグ */
  moodTag?: string;
  /** ソース（どちらが記録したか） */
  source: "calendar" | "my-style";
}

/** My-Style の WearRecord (アイテム単位の集計) */
export interface WearSummary {
  /** アイテムID */
  itemId: string;
  /** 累積着用回数 */
  count: number;
  /** 最終着用日 */
  lastWornAt: string;
  /** 関連セットアップ ID */
  setupIds: string[];
}

// ── 読み取りアダプター ──

const CALENDAR_WORN_KEY = "culcept_calendar_worn_v1";
const MYSTYLE_WEAR_KEY = "culcept_wear_records_v1";

interface CalendarWornRecord {
  date: string;
  itemIds: string[];
  satisfaction?: number;
  note?: string;
}

interface CostPerWearRecord {
  itemId: string;
  date: string;
  occasion?: string;
}

/**
 * 全ソースから着用イベントを統合して返す
 * Calendar + My-Style の両方から読み、日付順でマージ
 */
export function loadAllWearEvents(): WearEvent[] {
  if (typeof window === "undefined") return [];

  const events: WearEvent[] = [];

  // Calendar source
  try {
    const raw = localStorage.getItem(CALENDAR_WORN_KEY);
    if (raw) {
      const records: CalendarWornRecord[] = JSON.parse(raw);
      for (const r of records) {
        events.push({
          date: r.date,
          itemIds: r.itemIds ?? [],
          satisfaction: r.satisfaction,
          note: r.note,
          source: "calendar",
        });
      }
    }
  } catch { /* ignore */ }

  // My-Style source (costPerWear records)
  try {
    const raw = localStorage.getItem(MYSTYLE_WEAR_KEY);
    if (raw) {
      const records: CostPerWearRecord[] = JSON.parse(raw);
      // Group by date
      const byDate = new Map<string, string[]>();
      for (const r of records) {
        const existing = byDate.get(r.date) ?? [];
        existing.push(r.itemId);
        byDate.set(r.date, existing);
      }
      for (const [date, itemIds] of byDate) {
        // Calendar の同日レコードと重複しない場合のみ追加
        const hasCalendar = events.some(e => e.date === date && e.source === "calendar");
        if (!hasCalendar) {
          events.push({ date, itemIds, source: "my-style" });
        }
      }
    }
  } catch { /* ignore */ }

  return events.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * アイテム単位の着用サマリーを構築
 */
export function buildWearSummaries(events: WearEvent[]): Map<string, WearSummary> {
  const map = new Map<string, WearSummary>();

  for (const event of events) {
    for (const itemId of event.itemIds) {
      const existing = map.get(itemId);
      if (existing) {
        existing.count += 1;
        if (event.date > existing.lastWornAt) {
          existing.lastWornAt = event.date;
        }
      } else {
        map.set(itemId, {
          itemId,
          count: 1,
          lastWornAt: event.date,
          setupIds: [],
        });
      }
    }
  }

  return map;
}
