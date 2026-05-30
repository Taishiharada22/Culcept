/**
 * Slice 2 (Option B-5E-B-1) — 「実際に着た」を /plan 専用に隔離記録する store（client / localStorage）
 *
 * 役割:
 *   - 選択済みコーデを「今日これを着た」と確認したとき、 日付ごとに /plan 専用で記録する。
 *   - これは **学習ではない**。 engine / server / /calendar worn history とは完全に分離する。
 *
 * 設計判断 (CEO/GPT B-5E-B / Path A):
 *   - **独立 key** `culcept_plan_worn_v1`。 以下には**書かない**:
 *       culcept_calendar_worn_v1（= rotationTracker / engine 学習 / server-sync /api/calendar/day）、
 *       culcept_wear_records_v1（My-Style cost-per-wear）、
 *       culcept_plan_outfit_selection_v1（選択）、 My-Style state、 IndexedDB。
 *   - `saveWornRecord` / satisfactionLearner には触れない。
 *   - satisfaction（評価）は **任意フィールド**として持つが、 B-5E-B では設定しない（rating は B-5E-C 別ゲート）。
 *
 * 安全制約（B-5D selection store と同方針）:
 *   - SSR / localStorage 不可 → read 空 / write no-op（throw しない）。 破損 JSON は無視。 quota は no-op。
 *   - date 単位で 1 件（上書き）、 新しい順 60 件まで。 機微・anchor title・画像・wardrobe 全体は保存しない。
 */

import { planWornRecordToEntry } from "@/lib/shared/wornHistory/converters";
import {
  clearCanonicalWornHistoryEntryForDate,
  upsertCanonicalWornHistoryEntry,
} from "@/lib/shared/wornHistory/writeStore";

import type { CalendarOutfitProposalSource, CalendarOutfitProposalVM } from "./types";

/** /plan 専用・着用記録 key（学習・server とは別、 隔離） */
const WORN_KEY = "culcept_plan_worn_v1";
const MAX_ENTRIES = 60;

/**
 * Phase 4-1 shadow mirror: /plan の着用「結果」を canonical 正本（culcept_worn_history_v1）へ複製する。
 *   - 旧 diary（WORN_KEY）の write は別に完了済み。 ここは追加の影 write のみ。
 *   - converter が source から learningEligible を決める（engine+評価→true / mock・hydrated_mock→false）。
 *     昇格はしない（engine はこの canonical を読まない＝Phase 5）。
 *   - best-effort。 失敗しても旧 diary を壊さない（throw しない）。
 */
function mirrorWornToCanonical(record: PlanWornRecord): void {
  try {
    upsertCanonicalWornHistoryEntry(planWornRecordToEntry(record));
  } catch {
    // mirror は補助。 canonical 失敗は無視（旧 diary は既に保存済み）。
  }
}

/** 「実際に着た」記録（最小・privacy-safe）。 satisfaction/ratedAt は B-5E-C 用の任意枠。 */
export interface PlanWornRecord {
  /** YYYY-MM-DD */
  date: string;
  /** ISO 時刻（着た確認時） */
  wornAt: string;
  proposalId: string;
  itemIds: string[];
  source: CalendarOutfitProposalSource;
  /** 評価（B-5E-C 以降。 B-5E-B では未設定） */
  satisfaction?: 1 | 2 | 3 | 4 | 5;
  ratedAt?: string;
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function isValidWorn(value: unknown): value is PlanWornRecord {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.date === "string" &&
    typeof o.proposalId === "string" &&
    Array.isArray(o.itemIds) &&
    typeof o.source === "string"
  );
}

function loadAll(): PlanWornRecord[] {
  const ls = getLocalStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(WORN_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidWorn);
  } catch {
    return [];
  }
}

/** 指定日の着用記録を取得（無ければ null） */
export function getWornForDate(date: string): PlanWornRecord | null {
  return loadAll().find((r) => r.date === date) ?? null;
}

/**
 * 着用記録を保存（同日上書き、 新しい順 60 件）。
 * SSR / quota / serialize 失敗は **黙って no-op**（throw しない）。
 * ここは /plan 隔離 key のみ。 engine 学習 / server sync には一切波及しない。
 */
export function saveWorn(record: PlanWornRecord): void {
  const ls = getLocalStorage();
  if (!ls) return;
  try {
    const others = loadAll().filter((r) => r.date !== record.date);
    const next = [record, ...others]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, MAX_ENTRIES);
    ls.setItem(WORN_KEY, JSON.stringify(next));
  } catch {
    // quota / serialize → no-op
  }
  // Phase 4-1: 旧 diary を保ったまま canonical へ shadow mirror（read-view はまだ旧 key を読む）。
  mirrorWornToCanonical(record);
}

/**
 * 既存の着用記録に **軽い評価** を追記する（B-5E-C-A）。
 *   - その日の worn record が無ければ no-op（着ていない日は評価できない）。
 *   - satisfaction は 1〜5 に clamp。 不正値は no-op。
 *   - ここも /plan 隔離 key のみ。 学習 / server-sync には一切波及しない。
 *   - SSR / quota / 破損は throw せず no-op。
 */
export function rateWornForDate(date: string, satisfaction: number, ratedAt: string): void {
  const ls = getLocalStorage();
  if (!ls) return;
  if (!Number.isFinite(satisfaction)) return;
  const clamped = Math.min(5, Math.max(1, Math.round(satisfaction))) as 1 | 2 | 3 | 4 | 5;
  try {
    const all = loadAll();
    const idx = all.findIndex((r) => r.date === date);
    if (idx < 0) return; // worn record が無い → 評価しない
    all[idx] = { ...all[idx], satisfaction: clamped, ratedAt };
    ls.setItem(WORN_KEY, JSON.stringify(all));
    // Phase 4-1: 更新後の record を canonical へ mirror（satisfaction / learningEligible を反映）。
    mirrorWornToCanonical(all[idx]);
  } catch {
    // no-op
  }
}

/** 指定日の着用記録を削除（rollback / 着用取り消し用） */
export function clearWornForDate(date: string): void {
  const ls = getLocalStorage();
  if (!ls) return;
  try {
    const remaining = loadAll().filter((r) => r.date !== date);
    ls.setItem(WORN_KEY, JSON.stringify(remaining));
  } catch {
    // no-op
  }
  // Phase 4-1: canonical からも該当日の plan origin を削除（rollback / undo の対称性）。
  clearCanonicalWornHistoryEntryForDate(date, "plan");
}

/**
 * proposal VM → 着用記録（pure・privacy-safe・rating なし）。
 *   - 保存するのは id / item id / source / date / 時刻のみ。
 *   - title / label / anchor / 機微 / 画像は含めない。
 *   - wornAt は副作用回避のため呼び出し側で生成して渡す。
 */
export function toWornRecord(
  proposal: CalendarOutfitProposalVM,
  dayIso: string,
  source: CalendarOutfitProposalSource,
  wornAt: string,
): PlanWornRecord {
  return {
    date: dayIso,
    wornAt,
    proposalId: proposal.id,
    itemIds: proposal.items.map((i) => i.id),
    source,
  };
}
