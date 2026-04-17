/**
 * CoAlter Plan Timeline — 時系列ドキュメント化の基盤
 *
 * Phase 1.5.3（Claude 旅行プラン機能の取り込み ①）
 *
 * Plan Shelf のアイテム群を「時系列旅程」として扱うためのユーティリティ。
 *
 * 責務:
 *  1. timeSlot 文字列 → 分数への正規化（"朝" "19:30" "午後" 等を統一的に扱う）
 *  2. 同一日付のアイテムを時刻順にソート
 *  3. 隣り合う 2 アイテム間の「空き時間」を計算し、ラベル化
 *
 * 非責務（将来）:
 *  - 移動時間の算出（③ 実所要時間）
 *  - 現実性チェック（③ reality check）
 *
 * 設計ポリシー:
 *  - UI を知らない（pure）。Shelf / Calendar / 詳細シート どこからでも呼べる
 *  - 時刻不明のアイテムは末尾に安定ソートする（sortOrder にフォールバック）
 */

import type { PlanItem } from "@/lib/coalter/planShelf";

// ─────────────────────────────────────────────
// timeSlot の正規化
// ─────────────────────────────────────────────

/**
 * 日本語/英語の時間帯表現 → 1日の開始からの分数 の対応表。
 * ゆるく当てる（完璧な精度は求めない）。文字列が含まれていれば採用。
 *
 * 注: 順序は長いキーを先に入れる（例: "深夜" は "夜" より先に評価）。
 */
const NAMED_SLOTS: Array<{ keyword: string; minutes: number; label: string }> = [
  { keyword: "早朝", minutes: 6 * 60, label: "早朝" },
  { keyword: "朝食", minutes: 8 * 60, label: "朝食" },
  { keyword: "ブランチ", minutes: 10 * 60 + 30, label: "ブランチ" },
  { keyword: "ランチ", minutes: 12 * 60, label: "ランチ" },
  { keyword: "午前中", minutes: 10 * 60, label: "午前" },
  { keyword: "夕食", minutes: 19 * 60, label: "夕食" },
  { keyword: "ディナー", minutes: 19 * 60, label: "ディナー" },
  { keyword: "深夜", minutes: 23 * 60, label: "深夜" },
  { keyword: "午前", minutes: 10 * 60, label: "午前" },
  { keyword: "午後", minutes: 14 * 60, label: "午後" },
  { keyword: "夕方", minutes: 17 * 60, label: "夕方" },
  { keyword: "朝", minutes: 8 * 60, label: "朝" },
  { keyword: "昼", minutes: 12 * 60, label: "昼" },
  { keyword: "夜", minutes: 19 * 60, label: "夜" },
  { keyword: "morning", minutes: 8 * 60, label: "朝" },
  { keyword: "noon", minutes: 12 * 60, label: "昼" },
  { keyword: "afternoon", minutes: 14 * 60, label: "午後" },
  { keyword: "evening", minutes: 19 * 60, label: "夜" },
  { keyword: "night", minutes: 21 * 60, label: "夜" },
];

/** "HH:MM" "H時" "H時MM分" 等から分数を取る（見つからなければ null） */
function parseNumericTime(raw: string): number | null {
  // HH:MM (2-digit)
  const colon = raw.match(/([0-2]?\d):([0-5]\d)/);
  if (colon) {
    const h = parseInt(colon[1], 10);
    const m = parseInt(colon[2], 10);
    if (h >= 0 && h <= 27) return ((h % 24) * 60 + m);
  }
  // H時MM分 or H時
  const jpHour = raw.match(/([0-2]?\d)\s*時(?:\s*([0-5]?\d)\s*分?)?/);
  if (jpHour) {
    const h = parseInt(jpHour[1], 10);
    const m = jpHour[2] ? parseInt(jpHour[2], 10) : 0;
    if (h >= 0 && h <= 27) return ((h % 24) * 60 + m);
  }
  return null;
}

/**
 * timeSlot 文字列を1日の分数（0〜1439）に変換。
 * 時刻不明なら null。
 */
export function parseTimeSlotMinutes(slot: string | null | undefined): number | null {
  if (!slot) return null;
  const trimmed = slot.trim();
  if (!trimmed) return null;

  // 数値表記を優先
  const num = parseNumericTime(trimmed);
  if (num !== null) return num;

  // 名前付きスロット
  for (const s of NAMED_SLOTS) {
    if (trimmed.includes(s.keyword)) return s.minutes;
  }
  return null;
}

/**
 * timeSlot を表示用に整形。
 * - "19:30" → "19:30"
 * - "夜" → "夜"
 * - 数値と名前の両方 → "19:30（夜）" 等の装飾はしない。元の文字列を尊重
 */
export function formatTimeSlotLabel(slot: string | null | undefined): string {
  if (!slot) return "";
  return slot.trim();
}

// ─────────────────────────────────────────────
// 時刻順ソート
// ─────────────────────────────────────────────

/**
 * 同一日付想定のアイテムを時刻順にソートする。
 * 時刻不明のものは末尾に安定ソート（sortOrder で二次ソート）。
 */
export function sortByTimeSlot<T extends Pick<PlanItem, "timeSlot" | "sortOrder">>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const am = parseTimeSlotMinutes(a.timeSlot);
    const bm = parseTimeSlotMinutes(b.timeSlot);
    // 両方時刻不明 → sortOrder
    if (am === null && bm === null) return a.sortOrder - b.sortOrder;
    // 片方のみ不明 → 不明を後ろへ
    if (am === null) return 1;
    if (bm === null) return -1;
    // 両方時刻あり → 分数比較、同じなら sortOrder
    if (am !== bm) return am - bm;
    return a.sortOrder - b.sortOrder;
  });
}

// ─────────────────────────────────────────────
// ギャップ計算
// ─────────────────────────────────────────────

/**
 * 2アイテム間の空き時間（時間単位、小数可）を計算。
 * どちらかが時刻不明なら null。
 */
export function computeGapHours(
  prev: Pick<PlanItem, "timeSlot">,
  next: Pick<PlanItem, "timeSlot">,
): number | null {
  const pm = parseTimeSlotMinutes(prev.timeSlot);
  const nm = parseTimeSlotMinutes(next.timeSlot);
  if (pm === null || nm === null) return null;
  const diffMin = nm - pm;
  if (diffMin <= 0) return null; // 同時刻 or 逆順
  return diffMin / 60;
}

/**
 * ギャップを人間向けラベルに整形。
 * - 〜30分: "すぐ"（密着）
 * - 30分〜2時間: "N時間の間"（整数寄せ、0.5刻み）
 * - 2〜6時間: "約N時間"
 * - 6時間〜: "半日以上"
 * - null: 空文字
 */
export function formatGapLabel(gapHours: number | null): string {
  if (gapHours === null) return "";
  if (gapHours < 0.5) return "すぐ";
  if (gapHours < 2) {
    const rounded = Math.round(gapHours * 2) / 2; // 0.5刻み
    return `${rounded}時間`;
  }
  if (gapHours < 6) return `約${Math.round(gapHours)}時間`;
  return "半日以上";
}

// ─────────────────────────────────────────────
// 日付別グルーピング（時系列旅程ビュー用）
// ─────────────────────────────────────────────

export interface TimelineDay {
  /** YYYY-MM-DD */
  date: string;
  /** 時刻順ソート済みアイテム */
  items: PlanItem[];
}

/**
 * targetDate で日別にまとめ、各日の中は時刻順にソートして返す。
 * 日付は昇順。
 */
export function groupByDayTimeline(items: PlanItem[]): TimelineDay[] {
  const byDate = new Map<string, PlanItem[]>();
  for (const item of items) {
    const list = byDate.get(item.targetDate) ?? [];
    list.push(item);
    byDate.set(item.targetDate, list);
  }
  const days: TimelineDay[] = [];
  for (const [date, list] of byDate) {
    days.push({ date, items: sortByTimeSlot(list) });
  }
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return days;
}
