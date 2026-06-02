/**
 * locationHistory — 既ロードの anchor 群から「よく行く / 最近」場所チップを導出（pure・④ Phase 1a）。
 *
 * 設計: docs/decision-log + CEO/GPT 議論（2026-06-02）
 *
 * 思想（鵜呑みにせず独立判断した結果の核）:
 *   - **新 endpoint も migration も不要**。PlanClient が GET /api/plan/anchors で既に全 anchor を
 *     保持している（listAnchors は date 制限なし）。それを純関数で集計するだけ＝
 *     「endpoint が 500 化する」サーフェス自体が存在しない＝**fail-open by construction**。
 *   - 外部 AI が勝手に決めるのではなく、**ユーザー自身が保存した場所**から提示（Aneurasync 的）。
 *   - 自動確定しない。UI は 1 タップ選択（本 module は候補導出のみ）。
 *
 * 範囲外: スコア重み付け（titleMatch/category/timeBucket = Phase 1b）/ known_places 永続化（Phase 3・migration）。
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { LocationCategory } from "@/lib/plan/location-category";

export interface LocationChip {
  /** 表示・確定に使う場所文言（最頻出の原表記）。 */
  text: string;
  /** 履歴上のカテゴリ（任意・最新使用時のもの）。 */
  category?: LocationCategory;
  /** 出現回数。 */
  count: number;
  /** 最終使用日時（ISO・one_off は date、無ければ confirmedAt）。ソート用。 */
  usedAtISO: string;
}

export interface LocationHistory {
  frequent: LocationChip[];
  recent: LocationChip[];
}

export const LOCATION_CHIP_LIMIT = 4;

/** 集計キー: trim + 連続空白（全角含む）畳み込み。表示は原表記の最頻を採用。 */
function normKey(s: string): string {
  return s.trim().replace(/[\s　]+/g, " ");
}

/** anchor の「使った日時」= one_off は date（無ければ confirmedAt）、recurring は confirmedAt。 */
function usedAt(a: ExternalAnchor): string {
  if (a.anchorKind === "one_off" && a.date) return a.date;
  return a.confirmedAt;
}

function cmpDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}

interface Agg {
  displayCounts: Map<string, number>;
  category?: LocationCategory;
  catUsedAt: string;
  count: number;
  usedAtISO: string;
}

/**
 * 既ロード anchor（全期間）→「よく行く（頻度）/ 最近（直近）」チップ。
 * location_text 空はスキップ。recent は frequent と重複しないよう除外（UI の二重表示回避）。
 */
export function deriveLocationHistory(
  anchors: ReadonlyArray<ExternalAnchor>,
  limit: number = LOCATION_CHIP_LIMIT,
): LocationHistory {
  const map = new Map<string, Agg>();

  for (const a of anchors) {
    const raw = a.locationText?.trim();
    if (!raw) continue;
    const key = normKey(raw);
    if (key.length === 0) continue;
    const ua = usedAt(a);
    let agg = map.get(key);
    if (!agg) {
      agg = { displayCounts: new Map(), catUsedAt: "", count: 0, usedAtISO: ua };
      map.set(key, agg);
    }
    agg.count += 1;
    agg.displayCounts.set(raw, (agg.displayCounts.get(raw) ?? 0) + 1);
    if (ua > agg.usedAtISO) agg.usedAtISO = ua;
    if (a.locationCategory && ua >= agg.catUsedAt) {
      agg.category = a.locationCategory;
      agg.catUsedAt = ua;
    }
  }

  const chips: LocationChip[] = [...map.values()].map((agg) => {
    let best = "";
    let bestN = -1;
    for (const [disp, n] of agg.displayCounts) {
      if (n > bestN) {
        best = disp;
        bestN = n;
      }
    }
    const chip: LocationChip = {
      text: best,
      count: agg.count,
      usedAtISO: agg.usedAtISO,
    };
    if (agg.category) chip.category = agg.category;
    return chip;
  });

  const frequent = [...chips]
    .sort((a, b) => b.count - a.count || cmpDesc(a.usedAtISO, b.usedAtISO))
    .slice(0, limit);
  const freqKeys = new Set(frequent.map((c) => normKey(c.text)));
  const recent = [...chips]
    .sort((a, b) => cmpDesc(a.usedAtISO, b.usedAtISO) || b.count - a.count)
    .filter((c) => !freqKeys.has(normKey(c.text)))
    .slice(0, limit);

  return { frequent, recent };
}

/** 空履歴（fail-open 既定値）。 */
export const EMPTY_LOCATION_HISTORY: LocationHistory = {
  frequent: [],
  recent: [],
};
