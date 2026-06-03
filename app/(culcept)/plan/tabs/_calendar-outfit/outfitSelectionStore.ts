/**
 * Slice 2 (Option B-5D-B-1) — おすすめコーデの「選択」を保存する独立 store（client / localStorage）
 *
 * 役割:
 *   - 「このコーデにする」で選んだコーデを **日付ごと**に保存し、 再訪時に復元できるようにする。
 *   - これは初の write 副作用。 ただし **学習・着用記録ではない**（「選んだ」だけを覚える）。
 *
 * 設計判断 (CEO/GPT B-5D-B):
 *   - **独立 localStorage key** `culcept_plan_outfit_selection_v1`。 既存 `culcept_calendar_*` と非衝突。
 *   - **`rotationTracker.saveWornRecord`（= 学習 + server-sync）には絶対に書かない**。
 *     satisfactionLearner / 着用記録 / My-Style state / IndexedDB / Supabase にも書かない。
 *   - date 単位で 1 件（同日上書き）。 件数上限 60。
 *
 * 安全制約:
 *   - SSR / localStorage 不可 → read は空 / write は no-op（throw しない）。
 *   - 破損 JSON は安全に無視（[] を返す）。 quota error も no-op。
 *   - module top-level で localStorage に触らない（関数内のみ）。
 *   - 機微情報は保存しない（呼び出し側が shape を組み立てる。 store は受け取った値をそのまま永続化）。
 */

import type {
  CalendarOutfitProposalSource,
  CalendarOutfitProposalVM,
  SyncBandKey,
} from "./types";

/** /plan カレンダータブ専用・選択記録 key（独立、 学習系とは別） */
const SELECTION_KEY = "culcept_plan_outfit_selection_v1";
/** 保持する最大日数（古いものから剪定） */
const MAX_ENTRIES = 60;

/** 保存する選択コーデ（最小・privacy-safe。 機微予定名 / anchor title / 画像 / wardrobe 全体は含めない） */
export interface CalendarOutfitSelection {
  /** YYYY-MM-DD */
  date: string;
  /** ISO 時刻（呼び出し側が生成して渡す） */
  selectedAt: string;
  proposalId: string;
  proposalTitle: string;
  itemIds: string[];
  itemLabels: string[];
  syncScore?: number;
  syncBand?: SyncBandKey;
  /** 提案の出所（engine 実推薦 / 素 mock / 画像ハイドレート mock） */
  source: CalendarOutfitProposalSource;
  /** B-3 でサニタイズ済の人間可読タグのみ（機微なし） */
  dayContextTags?: string[];
}

/** localStorage を安全に取得（SSR / 制限環境では null） */
function getLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function isValidSelection(value: unknown): value is CalendarOutfitSelection {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.date === "string" &&
    typeof o.proposalId === "string" &&
    Array.isArray(o.itemIds) &&
    typeof o.source === "string"
  );
}

/** 全選択を読む（破損・未存在・SSR は []） */
function loadAll(): CalendarOutfitSelection[] {
  const ls = getLocalStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(SELECTION_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSelection);
  } catch {
    return [];
  }
}

/** 指定日の選択を取得（無ければ null） */
export function getSelectionForDate(date: string): CalendarOutfitSelection | null {
  return loadAll().find((s) => s.date === date) ?? null;
}

/**
 * 選択を保存（同日上書き、 新しい順 60 件まで）。
 * SSR / quota / serialize 失敗は **黙って no-op**（throw しない、 UI を壊さない）。
 */
export function saveSelection(selection: CalendarOutfitSelection): void {
  const ls = getLocalStorage();
  if (!ls) return;
  try {
    const others = loadAll().filter((s) => s.date !== selection.date);
    const next = [selection, ...others]
      // date 降順（新しい日付を優先保持）
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, MAX_ENTRIES);
    ls.setItem(SELECTION_KEY, JSON.stringify(next));
  } catch {
    // quota / serialize → no-op
  }
}

/** 指定日の選択を削除（無ければ何もしない）。 rollback / 解除用。 */
export function clearSelectionForDate(date: string): void {
  const ls = getLocalStorage();
  if (!ls) return;
  try {
    const remaining = loadAll().filter((s) => s.date !== date);
    ls.setItem(SELECTION_KEY, JSON.stringify(remaining));
  } catch {
    // no-op
  }
}

/**
 * proposal VM → 保存レコード（pure・privacy-safe）。
 *   - 保存するのは id / 表示名 / item id・label / sync / source のみ。
 *   - anchor title / 機微 / 画像 / wardrobe 全体は **含めない**。
 *   - selectedAt は副作用を避けるため呼び出し側で生成して渡す。
 */
export function toSelectionRecord(
  proposal: CalendarOutfitProposalVM,
  dayIso: string,
  source: CalendarOutfitProposalSource,
  selectedAt: string,
): CalendarOutfitSelection {
  return {
    date: dayIso,
    selectedAt,
    proposalId: proposal.id,
    proposalTitle: proposal.title,
    itemIds: proposal.items.map((i) => i.id),
    itemLabels: proposal.items.map((i) => i.label),
    ...(typeof proposal.syncScore === "number" ? { syncScore: proposal.syncScore } : {}),
    syncBand: proposal.syncBandKey,
    source,
  };
}
