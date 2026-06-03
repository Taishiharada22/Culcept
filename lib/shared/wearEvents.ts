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

import { wearEventToEntry } from "@/lib/shared/wornHistory/converters";
import {
  getCanonicalWornHistoryEntries,
  upsertCanonicalWornHistoryEntry,
} from "@/lib/shared/wornHistory/writeStore";

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

// ── ストレージキー ──

const CALENDAR_WORN_KEY = "culcept_calendar_worn_v1";
const MYSTYLE_WEAR_KEY = "culcept_wear_records_v1";

// ── 書き込み ──

/**
 * Phase 4-4c shadow mirror: My-Style / Home morning の wear を canonical 正本（culcept_worn_history_v1）へ複製。
 *   - `origin="style"` / `source="my_style"` / `learningEligible=false`（wearEventToEntry が決める）。
 *   - note / moodTag は載せない。 (date, origin=style) で 1 件に丸める（同日複数 wear は最後が代表）。
 *   - best-effort。 失敗しても wearEvents の old key 保存は壊さない（throw / console spam しない）。
 */
function mirrorStyleWearToCanonical(date: string, itemIds: string[], satisfaction: number | undefined): void {
  try {
    upsertCanonicalWornHistoryEntry(wearEventToEntry({ date, itemIds, satisfaction }));
  } catch {
    // canonical 失敗は無視（old key 保存は別に完了している）。
  }
}

/**
 * 着用イベントを正本ストレージに保存する。
 * 現時点では Calendar 互換形式 (culcept_calendar_worn_v1) に書き込む。
 * 将来的に style_wear_events_v1 に統一予定。
 */
export function saveWearEvent(event: Omit<WearEvent, "source"> & { source?: WearEvent["source"] }): void {
  if (typeof window === "undefined") return;
  try {
    const records: unknown[] = JSON.parse(localStorage.getItem(CALENDAR_WORN_KEY) ?? "[]");
    records.push({
      date: event.date,
      itemIds: event.itemIds,
      satisfaction: event.satisfaction,
      note: event.note,
      source: event.source ?? "my-style",
    });
    localStorage.setItem(CALENDAR_WORN_KEY, JSON.stringify(records));
  } catch { /* ignore */ }
  // Phase 4-4c: My-Style/Home wear（source=my-style）を canonical へ shadow mirror（best-effort）。
  // calendar-source の event（現状呼出元なし）は style として誤ラベルしないため除外。
  if ((event.source ?? "my-style") === "my-style") {
    mirrorStyleWearToCanonical(event.date, event.itemIds, event.satisfaction);
  }
}

/**
 * 既存の着用イベントの satisfaction を更新する。
 * 同日の最新レコードを対象にする。
 */
export function updateWearSatisfaction(date: string, satisfaction: number): void {
  if (typeof window === "undefined") return;
  try {
    const records: { date: string; satisfaction?: number }[] = JSON.parse(localStorage.getItem(CALENDAR_WORN_KEY) ?? "[]");
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].date === date) {
        records[i].satisfaction = satisfaction;
        break;
      }
    }
    localStorage.setItem(CALENDAR_WORN_KEY, JSON.stringify(records));
  } catch { /* ignore */ }
  // Phase 4-4c: canonical 側に既存の style entry（=過去の saveWearEvent mirror）があれば satisfaction を反映。
  // canonical の style entry のみ対象＝/calendar 記録を style として誤更新しない。 best-effort。
  try {
    const existing = getCanonicalWornHistoryEntries().find((e) => e.date === date && e.origin === "style");
    if (existing) {
      upsertCanonicalWornHistoryEntry(wearEventToEntry({ date, itemIds: existing.itemIds, satisfaction }));
    }
  } catch {
    // best-effort
  }
}

// ── 読み取りアダプター ──

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

  // Calendar source (reads stored source field — may contain "my-style" entries saved via saveWearEvent)
  try {
    const raw = localStorage.getItem(CALENDAR_WORN_KEY);
    if (raw) {
      const records: (CalendarWornRecord & { source?: WearEvent["source"] })[] = JSON.parse(raw);
      for (const r of records) {
        events.push({
          date: r.date,
          itemIds: r.itemIds ?? [],
          satisfaction: r.satisfaction,
          note: r.note,
          source: r.source ?? "calendar",
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

// ── 日付ベースの簡易チェック ──

/**
 * 指定日に着用イベントが存在するかチェック（read-only）
 */
export function hasWearEventForDate(date: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(CALENDAR_WORN_KEY);
    if (!raw) return false;
    const records: { date: string }[] = JSON.parse(raw);
    return records.some((r) => r.date === date);
  } catch {
    return false;
  }
}

/**
 * 指定日に satisfaction が記録済みかチェック（read-only）
 */
export function hasSatisfactionForDate(date: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(CALENDAR_WORN_KEY);
    if (!raw) return false;
    const records: { date: string; satisfaction?: number }[] = JSON.parse(raw);
    return records.some((r) => r.date === date && r.satisfaction != null);
  } catch {
    return false;
  }
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
