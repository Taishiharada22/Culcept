/**
 * locationHistory — 既ロード anchor から場所チップを導出（pure・④ Phase 1a 改）。
 *
 * CEO 改善（2026-06-02）:
 *   ① **具体的な場所のみ**（「家」「カフェ」等の一般名詞は除外。固有名のみ提示）。
 *   ② 「最近」→ **予定内容（title）連動**。最初から出さず、title を入れたら過去の同種予定で
 *      選んだ場所を提示（例: "勉強" → 過去の勉強予定の場所）。よく行く は従来どおり常時提示。
 *
 * 思想:
 *   - 新 endpoint も migration も不要。PlanClient が持つ全 anchor を純関数で集計＝fail-open by construction。
 *   - 外部 AI ではなく「本人が保存した場所」から提示（Aneurasync 的・観測して先回り）。自動確定しない。
 *
 * 範囲外: known_places 永続化（Phase 3・migration）/ 入力中 prefix サジェスト（Phase 2）。
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { LocationCategory } from "@/lib/plan/location-category";

export const LOCATION_CHIP_LIMIT = 5;

/** 1 anchor 分の場所利用ログ（集計の素）。 */
export interface LocationUsage {
  text: string;
  category?: LocationCategory;
  /** 予定タイトル（title 連動マッチ用）。 */
  title: string;
  /** 使用日時（one_off は date、無ければ confirmedAt）。 */
  usedAtISO: string;
}

export interface LocationChip {
  text: string;
  category?: LocationCategory;
  count: number;
  usedAtISO: string;
  /** ① 長押し詳細用: この場所で使った最近の予定タイトル（直近・最大 2 件・重複/空除外）。 */
  sampleTitles?: string[];
}

export interface LocationChips {
  /** よく行く（頻度・常時）。 */
  frequent: LocationChip[];
  /** この予定（title 連動・title が非空かつ frequent 外のマッチがある時のみ）。 */
  forTitle: LocationChip[];
}

export const EMPTY_LOCATION_CHIPS: LocationChips = { frequent: [], forTitle: [] };

/**
 * ① 一般名詞の場所は除外する（「どこの〜か」が分からない曖昧語）。固有名のみ採用。
 * 完全一致のみ判定＝「渋谷オフィス」「隠れ房 新宿店」等の固有名は通す。
 */
const GENERIC_PLACES: ReadonlySet<string> = new Set([
  // 住居・職場
  "家", "自宅", "実家", "うち", "自室", "部屋",
  "職場", "会社", "オフィス", "事務所",
  // 飲食・店
  "カフェ", "喫茶店", "レストラン", "店", "お店", "飲食店", "居酒屋", "バー",
  "ファミレス", "ランチ", "ディナー", "ご飯", "食事",
  // 設備・施設（種別）
  "ジム", "公園", "駅", "学校", "大学", "高校", "中学", "中学校", "小学校",
  "病院", "クリニック", "図書館", "コンビニ", "スーパー", "銀行", "役所",
  "美容院", "美容室", "ホテル", "空港", "会議室", "ミーティングスペース",
  "打ち合わせ", "打合せ", "自習室", "教室", "食堂", "モール", "デパート",
  "体育館", "映画館", "カラオケ", "サウナ", "温泉", "銭湯", "神社", "寺",
  // 抽象・方向
  "外", "近所", "近く", "どこか", "その辺", "現地", "出先",
  // 英語の一般語
  "home", "office", "cafe", "coffee", "gym", "station", "school",
  "hospital", "library", "store", "shop", "restaurant", "bar", "mall", "park",
]);

function normKey(s: string): string {
  return s.trim().replace(/[\s　]+/g, " ");
}

function normLower(s: string): string {
  return normKey(s).toLowerCase();
}

/** 固有の場所か（一般名詞でない）。空文字・一般語は false。 */
export function isSpecificPlace(text: string): boolean {
  const n = normLower(text);
  if (n.length === 0) return false;
  return !GENERIC_PLACES.has(n);
}

function usedAt(a: ExternalAnchor): string {
  if (a.anchorKind === "one_off" && a.date) return a.date;
  return a.confirmedAt;
}

/** 全 anchor → 場所利用ログ（空 / 一般語の場所は除外＝① 具体的のみ）。 */
export function extractLocationUsages(
  anchors: ReadonlyArray<ExternalAnchor>,
): LocationUsage[] {
  const out: LocationUsage[] = [];
  for (const a of anchors) {
    const raw = a.locationText?.trim();
    if (!raw || !isSpecificPlace(raw)) continue;
    const u: LocationUsage = { text: raw, title: a.title ?? "", usedAtISO: usedAt(a) };
    if (a.locationCategory) u.category = a.locationCategory;
    out.push(u);
  }
  return out;
}

function cmpDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}

/** usages を場所キーで集計し、頻度 → 直近で全件ソート（slice は呼び出し側）。 */
function aggregateAll(
  usages: ReadonlyArray<LocationUsage>,
): LocationChip[] {
  interface Agg {
    displayCounts: Map<string, number>;
    category?: LocationCategory;
    catUsedAt: string;
    count: number;
    usedAtISO: string;
    /** title → その title で最後に使った日時（最近タイトル抽出用）。 */
    titleAt: Map<string, string>;
  }
  const map = new Map<string, Agg>();
  for (const u of usages) {
    const key = normKey(u.text);
    if (key.length === 0) continue;
    let agg = map.get(key);
    if (!agg) {
      agg = {
        displayCounts: new Map(),
        catUsedAt: "",
        count: 0,
        usedAtISO: u.usedAtISO,
        titleAt: new Map(),
      };
      map.set(key, agg);
    }
    agg.count += 1;
    agg.displayCounts.set(u.text, (agg.displayCounts.get(u.text) ?? 0) + 1);
    if (u.usedAtISO > agg.usedAtISO) agg.usedAtISO = u.usedAtISO;
    if (u.category && u.usedAtISO >= agg.catUsedAt) {
      agg.category = u.category;
      agg.catUsedAt = u.usedAtISO;
    }
    const t = u.title.trim();
    if (t.length > 0) {
      const prev = agg.titleAt.get(t);
      if (!prev || u.usedAtISO > prev) agg.titleAt.set(t, u.usedAtISO);
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
    const chip: LocationChip = { text: best, count: agg.count, usedAtISO: agg.usedAtISO };
    if (agg.category) chip.category = agg.category;
    const sampleTitles = [...agg.titleAt.entries()]
      .sort((a, b) => cmpDesc(a[1], b[1]))
      .slice(0, 2)
      .map(([title]) => title);
    if (sampleTitles.length > 0) chip.sampleTitles = sampleTitles;
    return chip;
  });
  return chips.sort(
    (a, b) => b.count - a.count || cmpDesc(a.usedAtISO, b.usedAtISO),
  );
}

/** ② title マッチ: 正規化して 双方向 substring（"勉強" ⊂ "数学の勉強" 等）。 */
function titleMatches(usageTitle: string, query: string): boolean {
  const q = normLower(query);
  if (q.length === 0) return false;
  const t = normLower(usageTitle);
  if (t.length === 0) return false;
  return t === q || t.includes(q) || q.includes(t);
}

/**
 * usages → チップ。
 *   - forTitle: title 非空時のみ。同種 title の予定で選んだ場所を頻度順（**優先**）。
 *     頻度に関係なく必ずこのグループに出す＝「この予定ならではの場所」を確実に提示。
 *   - frequent（よく行く）: 全体の頻度上位。**forTitle と重複は除外**（二重表示しない）。
 *     title 空なら全体の頻度上位そのまま。
 */
export function deriveLocationChips(
  usages: ReadonlyArray<LocationUsage>,
  opts: { title?: string } = {},
  limit: number = LOCATION_CHIP_LIMIT,
): LocationChips {
  const title = (opts.title ?? "").trim();
  if (title.length === 0) {
    return { frequent: aggregateAll(usages).slice(0, limit), forTitle: [] };
  }
  const matched = usages.filter((u) => titleMatches(u.title, title));
  const forTitle = aggregateAll(matched).slice(0, limit);
  const forKeys = new Set(forTitle.map((c) => normKey(c.text)));
  const frequent = aggregateAll(usages)
    .filter((c) => !forKeys.has(normKey(c.text)))
    .slice(0, limit);
  return { frequent, forTitle };
}
