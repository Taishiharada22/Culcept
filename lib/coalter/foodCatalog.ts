/**
 * CoAlter L4.5: 食事候補の構造化 — Phase B Commit 1 (2026-04-18)
 *
 * 目的: movie 側の `parseMovieScreenings` と同じ設計で、search 結果から
 * 構造化された FoodVenue / ActivityCandidate を生成する。
 *
 * 設計原則:
 *   1. FoodVenue は pure entity（店そのもの）
 *   2. ActivityCandidate は提案単位の wrapper（candidateId / sourceUrl / confidence）
 *   3. name 必須ゲート: 店名抽出失敗の venue は出力から hard drop
 *      → 観測は rawCandidateCount - catalogCount の差分で取れる
 *   4. candidateId は stable material のみ（sourceDomain + normalized name +
 *      normalized stationOrArea）— snippet / URL path は使わない
 *   5. 同じ店舗が別 search で出ても candidateId は同一になる（daily-mode dedup 前提）
 *   6. cross-source dedup（tabelog vs retty で同一店舗）は Phase B スコープ外
 *      → 同一店舗でも source が違えば別 candidateId として扱う
 *
 * パイプライン:
 *   検索結果 (SearchCandidate[])
 *     ↓  parseFoodVenues
 *   ActivityCandidate<FoodVenue>[]  ← ranker に渡す
 */

import type {
  ActivityCandidate,
  FoodVenue,
  SearchCandidate,
} from "./types";

// ─────────────────────────────────────────────
// 既知の食事系ドメイン（信頼度に加点する）
// ─────────────────────────────────────────────

/**
 * 食事情報で実績のある日本の主要ドメイン。
 * ここに載っているドメイン由来の search 結果は confidence に +0.10 される。
 *
 * 非 listicle・店舗情報そのものを出すドメインに限る（一覧記事系は除く）。
 */
const KNOWN_FOOD_DOMAINS = new Set<string>([
  "tabelog.com",
  "retty.me",
  "hotpepper.jp",
  "r.gnavi.co.jp", // ぐるなび
  "gnavi.co.jp",
  "opentable.jp",
  "tablecheck.com",
  "ikyu.com",
]);

// ─────────────────────────────────────────────
// 基本抽出関数
// ─────────────────────────────────────────────

/**
 * 候補の sourceUrl から hostname を取り出す（正規化: 小文字 + 先頭 www. 剥離）。
 *
 * 失敗したら空文字を返す（candidateId 生成は name 側が null なら drop するので、
 * sourceDomain が空でもここでは落とさない）。
 */
export function extractSourceDomain(rawUrl: string | null | undefined): string {
  if (!rawUrl) return "";
  try {
    const u = new URL(rawUrl);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * 食事候補の店名を search title / description から抽出する。
 *
 * 優先順:
 *   1. 『店名』「店名」の括弧パターン（title / description の先頭から）
 *   2. title をパイプ分割した先頭セグメントで、meta (食べログ / Retty 等) を除く
 *   3. 失敗なら null（= 出力から hard drop）
 */
export function extractFoodVenueName(
  rawTitle: string,
  description?: string,
): string | null {
  const cleanStr = (s: string) => s.replace(/\s+/g, " ").trim();

  // (1) 『』「」 括弧優先
  for (const source of [rawTitle, description ?? ""]) {
    if (!source) continue;
    const b = source.match(/[『「]([^』」]{1,30})[』」]/);
    if (b) {
      const picked = cleanStr(b[1]);
      if (isAcceptableVenueName(picked)) return picked;
    }
  }

  // (2) title をパイプ分割 → meta でない先頭セグメント
  if (rawTitle) {
    const segments = rawTitle
      .split(/[|｜\-−–ー]/) // 「〇〇 - 食べログ」「〇〇 | Retty」にも対応
      .map(cleanStr)
      .filter(Boolean);
    for (const seg of segments) {
      if (NON_VENUE_SEGMENT.test(seg)) continue;
      if (isListicleLike(seg)) continue;
      if (isAcceptableVenueName(seg)) return seg;
    }
  }

  return null;
}

/** サイト名 / ジャンル語 / listicle / meta — 店名候補から除外する segment */
const NON_VENUE_SEGMENT =
  /(食べログ|tabelog|Retty|retty|ホットペッパー|hotpepper|ぐるなび|gnavi|OpenTable|opentable|TableCheck|tablecheck|一休|ikyu|公式サイト|Official|official|ぐるなびまとめ|食事|レストラン|ランキング|特集|まとめ|予約|クーポン|メニュー)/i;

const LISTICLE_FOOD_PATTERNS: RegExp[] = [
  /\d+\s*選/,
  /ランキング/,
  /おすすめ.{0,4}(店|レストラン|居酒屋|カフェ|焼肉|寿司|ラーメン|イタリアン|フレンチ)/,
  /人気.{0,4}(店|レストラン)/,
  /特集/,
  /まとめ/,
  /比較/,
];

function isListicleLike(s: string): boolean {
  if (!s) return true;
  return LISTICLE_FOOD_PATTERNS.some((re) => re.test(s));
}

const GENRE_ONLY_FOOD = new Set([
  "焼肉",
  "寿司",
  "ラーメン",
  "イタリアン",
  "フレンチ",
  "中華",
  "居酒屋",
  "カフェ",
  "レストラン",
  "食事",
  "ランチ",
  "ディナー",
]);

function isAcceptableVenueName(s: string): boolean {
  if (!s) return false;
  if (s.length > 30) return false;
  if (s.length < 2) return false;
  if (GENRE_ONLY_FOOD.has(s)) return false;
  if (NON_VENUE_SEGMENT.test(s)) return false;
  if (isListicleLike(s)) return false;
  return true;
}

/**
 * 最寄駅を抽出する。
 *
 * マッチ例:
 *   - 渋谷駅 / 新宿駅 / 恵比寿駅
 *   - 渋谷駅徒歩5分 → "渋谷駅"
 *   - 新宿駅東口 → "新宿駅東口"
 *
 * 最初の 1 件のみ返す（複数駅併記はメインの近接駅を取る慣習）。
 */
export function extractStation(text: string): string | null {
  if (!text) return null;
  // 「○○駅」（オプションで「東口」「西口」「南口」「北口」「中央口」）
  const m = text.match(/([\u4E00-\u9FFF\u30A0-\u30FFa-zA-Z]{1,12}駅(?:[東西南北]口|中央口)?)/);
  if (m) return m[1];
  return null;
}

/**
 * 大まかなエリアを抽出する。
 *
 * 主要エリア名をホワイトリストで拾う（広く取ると誤爆しやすいため）。
 */
const KNOWN_AREAS: RegExp[] = [
  /渋谷区(?:[\u4E00-\u9FFF]{1,8})?/,
  /新宿区(?:[\u4E00-\u9FFF]{1,8})?/,
  /港区(?:[\u4E00-\u9FFF]{1,8})?/,
  /千代田区(?:[\u4E00-\u9FFF]{1,8})?/,
  /中央区(?:[\u4E00-\u9FFF]{1,8})?/,
  /目黒区(?:[\u4E00-\u9FFF]{1,8})?/,
  /世田谷区(?:[\u4E00-\u9FFF]{1,8})?/,
  /(?:代官山|恵比寿|六本木|麻布十番|西麻布|広尾|表参道|青山|原宿|自由が丘|中目黒|下北沢|吉祥寺|銀座|丸の内|日本橋|築地|新橋|秋葉原|上野|浅草)/,
];

export function extractArea(text: string): string | null {
  if (!text) return null;
  for (const re of KNOWN_AREAS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

/**
 * 価格帯を抽出する。
 *
 * マッチ例:
 *   - ¥3,000〜¥3,999 / ¥5,000 〜 ¥6,000
 *   - 3,000円〜4,000円 / 3000円〜4000円
 *   - 予算 5,000円 / 平均予算 5000円前後
 */
export function extractPriceBand(text: string): string | null {
  if (!text) return null;
  // ¥3,000〜¥3,999 系
  const range = text.match(
    /[¥￥]\s*(\d{1,3}(?:,?\d{3})+)\s*[〜~～-]\s*[¥￥]\s*(\d{1,3}(?:,?\d{3})+)/,
  );
  if (range) return `¥${range[1]}〜¥${range[2]}`;

  // 3,000円〜4,000円 / 3000円〜4000円 系
  const yenRange = text.match(
    /(\d{1,3}(?:,?\d{3})+)\s*円\s*[〜~～-]\s*(\d{1,3}(?:,?\d{3})+)\s*円/,
  );
  if (yenRange) return `${yenRange[1]}円〜${yenRange[2]}円`;

  // 予算 5,000円 / 予算:5000円 / 平均予算 5,000 円
  const budget = text.match(
    /(?:予算|平均予算|平均)\s*[:：]?\s*(\d{1,3}(?:,?\d{3})+)\s*円/,
  );
  if (budget) return `予算 ${budget[1]} 円`;

  return null;
}

/**
 * 営業時間を抽出する（raw 文字列をそのまま返す）。
 *
 * マッチ例:
 *   - 17:00-24:00
 *   - 11:30〜14:30
 *   - 営業時間: 17:00〜23:00
 */
export function extractOpeningHours(text: string): string | null {
  if (!text) return null;
  // HH:MM〜HH:MM or HH:MM-HH:MM
  const m = text.match(/(\d{1,2}:\d{2})\s*[〜~～\-–]\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  return `${m[1]}〜${m[2]}`;
}

/**
 * 評価を抽出する（食事用、movie と共通のパターンも拾う）。
 */
export function extractFoodRating(text: string): string | null {
  if (!text) return null;
  // 食べログ 3.52 / Retty 4.2
  const site = text.match(/(食べログ|Retty|retty|Tabelog|tabelog)\s*[:：]?\s*(\d\.\d{1,2})/);
  if (site) return `${site[1]} ${site[2]}`;
  // ★4.2 / ★ 3.5
  const stars = text.match(/★\s*(\d(?:\.\d)?)/);
  if (stars) return `★${stars[1]}`;
  // "4.2点" or "4.2/5"
  const score = text.match(/(\d\.\d{1,2})\s*(点|\/\s*5)/);
  if (score) return `★${score[1]}`;
  return null;
}

// ─────────────────────────────────────────────
// 正規化 & candidateId
// ─────────────────────────────────────────────

/**
 * candidateId の材料文字列を正規化する。
 *
 * 処理:
 *   1. NFKC で全半角を統一（「焼肉ＡＢＣ」→「焼肉ABC」）
 *   2. 空白系（ASCII space / U+3000）を除去
 *   3. 駅サフィックス（末尾「駅」）を剥離（station と area が同一単語に正規化されるように）
 *   4. 記号（・ー-−「」『』【】）を除去
 *   5. 小文字化
 */
export function normalizeForId(s: string | null | undefined): string {
  if (!s) return "";
  let out = s.trim().normalize("NFKC");
  out = out.replace(/[\s\u3000]+/g, "");
  out = out.replace(/駅$/, "");
  out = out.replace(/[・ー\-−「」『』【】()（）]+/g, "");
  return out.toLowerCase();
}

/**
 * candidateId を生成する。
 *
 * material: `{domain}:{sourceDomain}:{normalizedName}:{normalizedStationOrArea}`
 *
 * 設計判断:
 *  - snippet / URL path は使わない（不安定・予約 URL は rotate する）
 *  - station が null の時は area を fallback（station 固定だと frequent null で弱い）
 *  - search A=station / B=area の揺れは best-effort。NFKC 正規化と駅剥離で
 *    「渋谷駅」「渋谷」が同一 token に寄るので吸収できるケースが多い
 *  - 完全一致しない場合は別 ID として daily-mode dedup が失敗するが、
 *    fuzzy dedup は Phase B スコープ外（明示）
 */
export function makeFoodCandidateId(args: {
  sourceDomain: string;
  name: string;
  station: string | null;
  area: string | null;
}): string {
  const stationOrArea = args.station ?? args.area ?? "";
  return [
    "food",
    args.sourceDomain || "unknown",
    normalizeForId(args.name),
    normalizeForId(stationOrArea),
  ].join(":");
}

// ─────────────────────────────────────────────
// Confidence
// ─────────────────────────────────────────────

/**
 * 提案信頼度を算出する。
 *
 * 仕様（name はゲート、加点対象から除外）:
 *   - priceBand 取得: +0.25
 *   - station または area 取得: +0.25（両方あっても +0.25 上限）
 *   - openingHours 取得: +0.25
 *   - rating 取得: +0.15
 *   - sourceDomain が KNOWN_FOOD_DOMAINS: +0.10
 *
 * 上限 1.0、下限 0.0。name 未取得は呼ばれない前提（hard drop 済み）。
 */
function computeFoodConfidence(args: {
  hasPriceBand: boolean;
  hasStationOrArea: boolean;
  hasOpeningHours: boolean;
  hasRating: boolean;
  isKnownDomain: boolean;
}): number {
  let score = 0;
  if (args.hasPriceBand) score += 0.25;
  if (args.hasStationOrArea) score += 0.25;
  if (args.hasOpeningHours) score += 0.25;
  if (args.hasRating) score += 0.15;
  if (args.isKnownDomain) score += 0.1;
  return Math.min(1, Math.max(0, score));
}

// ─────────────────────────────────────────────
// メイン: SearchCandidate[] → ActivityCandidate<FoodVenue>[]
// ─────────────────────────────────────────────

/**
 * 食事 search 結果を ActivityCandidate<FoodVenue> の catalog に変換する。
 *
 * name 必須ゲート: 店名が抽出できない venue は出力に含めない（hard drop）。
 * 観測は呼び出し側で `rawCandidateCount - catalog.length` を取れば「落ちた件数」が分かる。
 *
 * 同一 candidateId が複数の search 結果から出た場合は先勝ち（最初に出た 1 件だけ残す）。
 * 同一店舗が別 sourceDomain（tabelog / retty）から出た場合は別の candidateId になる
 * ため両方残る（cross-source dedup は Phase B スコープ外）。
 */
export function parseFoodVenues(
  searchCandidates: SearchCandidate[],
): ActivityCandidate<FoodVenue>[] {
  const catalog: ActivityCandidate<FoodVenue>[] = [];
  const seenIds = new Set<string>();

  for (const sc of searchCandidates) {
    const combinedText = [sc.title, sc.description, sc.practicalInfo ?? ""].join(
      " ",
    );

    // name 抽出（必須ゲート）
    const name = extractFoodVenueName(sc.title, sc.description);
    if (!name) continue;

    const station = extractStation(combinedText);
    const area = extractArea(combinedText);
    const priceBand = extractPriceBand(combinedText);
    const openingHours = extractOpeningHours(combinedText);
    const rating = extractFoodRating(combinedText) ?? sc.externalRating ?? null;
    const sourceDomain = extractSourceDomain(sc.url);
    const isKnownDomain = KNOWN_FOOD_DOMAINS.has(sourceDomain);

    const candidateId = makeFoodCandidateId({
      sourceDomain,
      name,
      station,
      area,
    });

    if (seenIds.has(candidateId)) continue;
    seenIds.add(candidateId);

    const confidence = computeFoodConfidence({
      hasPriceBand: priceBand !== null,
      hasStationOrArea: station !== null || area !== null,
      hasOpeningHours: openingHours !== null,
      hasRating: rating !== null,
      isKnownDomain,
    });

    const entity: FoodVenue = {
      name,
      station,
      area,
      priceBand,
      openingHours,
      rating,
      snippet: (sc.description ?? "").slice(0, 140),
    };

    catalog.push({
      candidateId,
      sourceUrl: sc.url ?? "",
      sourceDomain,
      confidence,
      domain: "food",
      entity,
      durationEstimate: null,
      bestTimeWindows: [],
      reservationNeed: "unknown",
    });
  }

  return catalog;
}
