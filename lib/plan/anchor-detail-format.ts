/**
 * Anchor Detail 表示用フォーマット helpers (W1-X5)
 *
 * AnchorDetailModal が anchor の詳細を人間可読な形に整形する pure 関数群。
 *
 * 設計書: docs/alter-plan-w1x5-anchor-detail-mini-design.md §3
 *
 * 不変原則:
 *   - すべて pure（副作用なし、現在時刻参照なし、入力 mutate なし）
 *   - 入力が不正でも throw しない、UI fail-safe な default を返す
 *   - timezone は UTC 内部、表示は日本語
 */

import type {
  AnchorRigidity,
  AnchorSensitiveCategory,
  ExternalAnchor,
} from "./external-anchor";
import type { LocationCategory } from "./location-category";
import type { ExternalAnchorSource } from "./external-anchor-source";
import { parseWeekdaysFromRRule, type Weekday } from "./weekday-template";
import { parseCanonicalLocationText } from "@/lib/shared/canonicalLocationText";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Date / time
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const WEEKDAY_LABEL_JP: Record<string, string> = {
  SU: "日",
  MO: "月",
  TU: "火",
  WE: "水",
  TH: "木",
  FR: "金",
  SA: "土",
};

function parseDateOnly(s: string): Date | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

/** "2026-05-25" → "5月25日(月)"。不正なら入力そのまま返す（fail-safe） */
export function formatJpDateLong(date: string): string {
  const d = parseDateOnly(date);
  if (!d) return date;
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const wd = ["日", "月", "火", "水", "木", "金", "土"][d.getUTCDay()];
  return `${m}月${day}日(${wd})`;
}

/** "14:30:45" → "14:30" / "14:30" → "14:30" */
export function formatTime(t: string): string {
  return t.slice(0, 5);
}

/** start - end のレンジ。end なしなら start のみ */
export function formatTimeRange(start: string, end?: string): string {
  const s = formatTime(start);
  return end ? `${s} – ${formatTime(end)}` : s;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Recurring の曜日 / validity
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Weekday[] → "月・水・金" 形式（中黒区切り） */
export function formatWeekdaysJp(days: ReadonlyArray<Weekday>): string {
  if (days.length === 0) return "曜日なし";
  return days.map((d) => WEEKDAY_LABEL_JP[d] ?? d).join("・");
}

/** RRULE → "毎週 月・水・金" 表示 */
export function formatRRuleJp(rrule: string): string {
  const days = parseWeekdaysFromRRule(rrule);
  if (!days || days.length === 0) return rrule;
  return `毎週 ${formatWeekdaysJp(days)}`;
}

/** validity 期間: "2026-05-04 〜 2026-12-31" / 終了未定なら "2026-05-04 〜（終了未定）" */
export function formatValidityRange(
  validFrom: string,
  validUntil?: string
): string {
  const from = formatJpDateLong(validFrom);
  if (!validUntil) return `${from} 〜（終了未定）`;
  return `${from} 〜 ${formatJpDateLong(validUntil)}`;
}

/** exceptionDates の一覧 (5月3日(日) / 7月17日(月)) または "例外日なし" */
export function formatExceptionDates(
  dates: ReadonlyArray<string> | undefined
): string {
  if (!dates || dates.length === 0) return "例外日なし";
  return dates.map(formatJpDateLong).join(" / ");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Label maps
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const RIGIDITY_LABEL: Record<AnchorRigidity, string> = {
  hard: "動かせない",
  soft: "動かせる",
};

export const LOCATION_CATEGORY_LABEL: Record<LocationCategory, string> = {
  home: "家",
  office: "職場",
  school: "学校",
  cafe: "カフェ",
  outdoor: "屋外",
  public: "公共",
  transit: "移動",
  unknown: "未分類",
};

export const SENSITIVE_LABEL: Record<AnchorSensitiveCategory, string> = {
  medical: "医療",
  legal: "法務",
  exam: "試験",
  other: "敏感",
};

export const SOURCE_TYPE_LABEL: Record<
  ExternalAnchorSource["sourceType"],
  string
> = {
  manual: "手動",
  template: "テンプレ",
  pdf: "PDF",
  image: "画像",
  chat: "会話",
  ics: "カレンダー", // P3 W3 (= 2026-05-26): .ics / iCalendar
  google_calendar: "Google", // P3 Phase B (= 2026-05-29): Google Calendar 連携
  microsoft_calendar: "Outlook", // Track B (= 2026-05-29): Outlook / Microsoft 365 連携
};

/** anchor.locationCategory + locationText を 1 行に整形。両方無ければ "場所未指定" */
export function formatLocation(anchor: ExternalAnchor): string {
  const cat = anchor.locationCategory;
  const text = anchor.locationText;
  if (!cat && !text) return "場所未指定";
  const catLabel = cat ? LOCATION_CATEGORY_LABEL[cat] : null;
  if (catLabel && text) return `${catLabel} / ${text}`;
  if (catLabel) return catLabel;
  return text ?? "場所未指定";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 2-F: Place Identity Contract / 場所アイデンティティ表示契約 (display layer)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 場所表示の part 分解 (Compact / Detail density で共有)。
 *
 * 設計書: docs/alter-plan-phase2-f-display-coherence-mini-design.md
 *
 * - categoryLabel: raw label (debug / 内部用、UI は displayCategoryLabel を使う)
 * - displayCategoryLabel: UI 用 (補正 6: categoryLabel === primary (trim normalize) なら undefined)
 * - primary: 主名 (canonical なら displayName、空なら locationText.trim() fallback / 補正 2)
 * - secondary: 補助 (canonical の address)
 * - fullLabel: accessibility / title 用 (補正 5: primary + "、" (全角読点) + secondary、category 含めず)
 */
export interface LocationDisplayParts {
  categoryLabel?: string;
  displayCategoryLabel?: string;
  primary?: string;
  secondary?: string;
  fullLabel?: string;
}

/**
 * Phase 2-F: canonical location text の display 用 part 分解。
 *
 * 既存 formatLocation(anchor): string は **不変** (= 補正 1、他 caller を壊さない)。
 * 本 helper は AnchorDetailModal + 3 tab で display layer 専用に使う。
 *
 * 不変原則 (mini design CEO/GPT 補正 1-7 厳守):
 *   - 補正 1: formatLocation 戻り値仕様を変更しない (= 別 helper として追加)
 *   - 補正 2: displayName 空でも locationText.trim() fallback で保存情報を消さない
 *   - 補正 3: parseCanonicalLocationText に渡すのは anchor.locationText のみ
 *             (locationCategory と canonical text を混ぜて parse しない)
 *   - 補正 5: fullLabel = primary + "、" + secondary、categoryLabel は含めない
 *   - 補正 6: categoryLabel === primary (trim normalize) なら displayCategoryLabel を抑制
 *   - sensitive 区別なし (= 時刻重なり helper と同思想、UI 側で privacy 配慮)
 *
 * @param anchor ExternalAnchor (sensitive / category / text 等を含む)
 * @returns LocationDisplayParts (= 空フィールド undefined、3 段 density で使い分け)
 */
export function formatLocationDisplayParts(
  anchor: ExternalAnchor,
): LocationDisplayParts {
  const cat = anchor.locationCategory;
  const text = anchor.locationText;

  const categoryLabel = cat ? LOCATION_CATEGORY_LABEL[cat] : undefined;

  // 補正 2: locationText が空 / whitespace-only → primary undefined (= UI 行を出さない)
  //   ただし locationCategory のみあれば categoryLabel は返す
  if (!text || !text.trim()) {
    if (!categoryLabel) return {};
    // primary なし → 重複比較不要、displayCategoryLabel = categoryLabel
    return {
      categoryLabel,
      displayCategoryLabel: categoryLabel,
    };
  }

  // 補正 3: anchor.locationText のみを parse 対象 (categoryLabel と混ぜない)
  const { displayName, address } = parseCanonicalLocationText(text);

  // 補正 2: displayName 空でも保存情報を消さない → original text.trim() fallback
  const primary = displayName || text.trim();
  const secondary = address ?? undefined;

  // 補正 6: categoryLabel === primary (trim normalize 後) なら displayCategoryLabel を抑制
  const isDuplicate =
    !!categoryLabel && categoryLabel.trim() === primary.trim();
  const displayCategoryLabel =
    categoryLabel && !isDuplicate ? categoryLabel : undefined;

  // 補正 5: fullLabel = primary + "、" + secondary、categoryLabel は含めない
  const fullLabel = secondary ? `${primary}、${secondary}` : primary;

  const result: LocationDisplayParts = { primary, fullLabel };
  if (categoryLabel) result.categoryLabel = categoryLabel;
  if (displayCategoryLabel) result.displayCategoryLabel = displayCategoryLabel;
  if (secondary) result.secondary = secondary;
  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 削除 confirm 用: 影響を受ける anchor のリスト + 代表タイトル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DeleteImpactSummary {
  /** 該当 source に紐づく anchor 総数（削除予定数） */
  totalCount: number;
  /** 表示用 代表タイトル（最大 N 件） */
  representativeTitles: string[];
  /** 表示しきれない件数（totalCount - representativeTitles.length） */
  remaining: number;
}

const REPRESENTATIVE_LIMIT = 3;

/** anchors[] のうち sourceId が一致するもの → 影響件数と代表タイトル */
export function buildDeleteImpactSummary(
  allAnchors: ReadonlyArray<ExternalAnchor>,
  sourceId: string
): DeleteImpactSummary {
  const matched = allAnchors.filter((a) => a.sourceId === sourceId);
  const reps: string[] = [];
  for (const a of matched) {
    if (reps.length >= REPRESENTATIVE_LIMIT) break;
    if (reps.includes(a.title)) continue;
    reps.push(a.title);
  }
  // 「代表として表示しきれた件数」分を 残り計算に使う
  // 代表は unique titles なので、totalCount - matched_displayed ではなく
  // matched 全件のうち表示しきれない件数を表示
  const displayedAnchorCount = Math.min(matched.length, REPRESENTATIVE_LIMIT);
  return {
    totalCount: matched.length,
    representativeTitles: reps,
    remaining: Math.max(0, matched.length - displayedAnchorCount),
  };
}
