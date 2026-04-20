/**
 * CoAlter Reality Check — 実所要時間・現実性チェック
 *
 * Phase 1.5.3（Claude 旅行プラン機能取り込み ③）
 *
 * 2人のプランが「無理なく回れるか」を軽く検査し、気づきを返す。
 * 設計原則に従い、指示・禁止ではなく「気づき」の形で出す。
 *
 *   × 「この時間では間に合いません」
 *   ○ 「少しタイトかも。移動と滞在を考えると詰まりそう」
 *
 * 責務:
 *  - 同じ日の隣り合うアイテム間で「最小滞在時間で次に届くか」を判定
 *  - 1日あたりのアイテム数が多すぎないか
 *  - 時刻不明のアイテムは判定対象外（silent）
 *
 * 非責務:
 *  - 実際の移動時間計算（Maps API 等は別レイヤ）
 *  - カテゴリ自動推定（category フィールドに依存）
 */

import type { PlanItem } from "@/lib/coalter/planShelf";
import {
  parseTimeSlotMinutes,
  sortByTimeSlot,
  groupByDayTimeline,
} from "@/lib/coalter/planTimeline";

// ─────────────────────────────────────────────
// カテゴリごとの最小滞在時間（分）
// ─────────────────────────────────────────────

/**
 * 「この category の1アクションにかかる最小滞在時間」。
 * 移動時間を除いた純粋な滞在時間のミニマム。
 * 過小評価気味に置く（警告が出過ぎるよりマシ）。
 */
export const CATEGORY_MIN_DURATION_MIN: Record<string, number> = {
  food: 60,
  movie: 150,
  activity: 90,
  shopping: 60,
  travel: 120,
  other: 60,
};

/** 既知でないカテゴリは 60 分として扱う */
export function minDurationMinutes(category: string): number {
  return CATEGORY_MIN_DURATION_MIN[category] ?? 60;
}

// ─────────────────────────────────────────────
// Warning 型
// ─────────────────────────────────────────────

export type RealityWarningKind = "tight_gap" | "packed_day";

export interface RealityWarning {
  kind: RealityWarningKind;
  /** この警告が属する日付 (YYYY-MM-DD) */
  date: string;
  /** 警告に関係する planItem.id の配列 */
  affectedItemIds: string[];
  /** UI に出す短文（自己評価的、非断定） */
  message: string;
}

// ─────────────────────────────────────────────
// 判定本体
// ─────────────────────────────────────────────

/**
 * アイテム配列全体を走査して警告を返す。
 * 結果は date 昇順、同日内は kind="tight_gap" を先、"packed_day" を後。
 */
export function computeRealityWarnings(items: PlanItem[]): RealityWarning[] {
  if (items.length === 0) return [];
  const days = groupByDayTimeline(items);
  const warnings: RealityWarning[] = [];

  for (const day of days) {
    const sorted = sortByTimeSlot(day.items);

    // ── 1) 隣接ギャップが滞在時間に対して短すぎるか ──
    for (let i = 0; i < sorted.length - 1; i++) {
      const prev = sorted[i];
      const next = sorted[i + 1];
      const pm = parseTimeSlotMinutes(prev.timeSlot);
      const nm = parseTimeSlotMinutes(next.timeSlot);
      if (pm === null || nm === null) continue; // 時刻不明はスキップ
      const gap = nm - pm;
      const minStay = minDurationMinutes(prev.category);
      // minStay に +15分 のバッファを足して「移動ゼロでも滞在時間ぴったり」を要警告扱い
      const bufferMin = 15;
      if (gap < minStay + bufferMin) {
        warnings.push({
          kind: "tight_gap",
          date: day.date,
          affectedItemIds: [prev.id, next.id],
          message: buildTightGapMessage(prev.category, gap, minStay),
        });
      }
    }

    // ── 2) 1日のアイテム数が多すぎるか ──
    if (sorted.length >= 4) {
      warnings.push({
        kind: "packed_day",
        date: day.date,
        affectedItemIds: sorted.map((i) => i.id),
        message: `この日は ${sorted.length} 件。少し盛りだくさんかも`,
      });
    }
  }

  return warnings;
}

// ─────────────────────────────────────────────
// メッセージ整形
// ─────────────────────────────────────────────

const CATEGORY_JA: Record<string, string> = {
  food: "食事",
  movie: "映画",
  activity: "アクティビティ",
  shopping: "ショッピング",
  travel: "移動",
  other: "この予定",
};

function buildTightGapMessage(
  category: string,
  gapMin: number,
  minStayMin: number,
): string {
  const catJa = CATEGORY_JA[category] ?? "この予定";
  // 同時刻〜逆転
  if (gapMin <= 0) {
    return `時刻が重なっています。${catJa}の時間を見直すと安心`;
  }
  // ごく近接
  if (gapMin <= 30) {
    return `${catJa}からすぐ移動になる予定。少しタイトかも`;
  }
  // 滞在時間相当
  if (gapMin < minStayMin) {
    return `${catJa}の滞在が十分取れないかも（${minStayMin}分想定）`;
  }
  // 滞在時間+少しだけ
  return `${catJa}の後、移動を入れると余裕が薄いかも`;
}

/**
 * アイテム ID に対応する警告を抽出（UI でインライン表示に使う）。
 * `targetDate` と `itemId` を組み合わせて絞り込む。
 */
export function warningsForItem(
  warnings: RealityWarning[],
  itemId: string,
): RealityWarning[] {
  return warnings.filter((w) => w.affectedItemIds.includes(itemId));
}
