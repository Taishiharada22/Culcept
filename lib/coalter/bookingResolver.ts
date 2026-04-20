/**
 * CoAlter Phase A: Booking Handoff Resolver (2026-04-18)
 * Phase B Commit 3 (2026-04-19): 5 分類化
 *   official / official_site / official_reservation_partner /
 *   third_party_listing / unknown
 *
 * 責務:
 *  - searchCandidates / catalog sourceUrl から候補に対応する URL を抽出
 *  - URL を providerType (5 分類) に分類
 *  - entity 一致強度と URL 種別から confidence を判定
 *    (third_party_listing / official_reservation_partner は high 不可)
 *  - theme × confidence × providerType から CTA label を決定
 *    - movie は confidence によらず「予約」系 CTA を出さない（上映ページ誘導止まり）
 *    - unknown は CTA 非表示（呼び出し側で落とす）
 *
 * 設計原則:
 *  1. URL はハルシネーションしない。入力の searchCandidates / catalog 由来のみ。
 *  2. 一致エビデンスが弱ければ confidence を落とす（label が自動で弱くなる）。
 *  3. phone は保持のみ。v1 CTA には使わない。
 *  4. 分類不能時は unknown を返す（hard filter にはしない。観測可能な明示カテゴリ）。
 */

import type {
  BookingConfidence,
  BookingHandoff,
  BookingProviderType,
  ConversationBrief,
  SearchCandidate,
} from "./types";

// ─────────────────────────────────────────────
// ドメイン分類
// ─────────────────────────────────────────────

/**
 * 映画館チェーンの公式ドメイン。
 * これらに該当し、かつ booking path を含むと "official" になる。
 */
const MOVIE_OFFICIAL_DOMAINS = new Set<string>([
  "tohotheater.jp",
  "hlo.tohotheater.jp",
  "109cinemas.net",
  "unitedcinemas.jp",
  "aeoncinema.com",
  "movix.jp",
  "tjoy.jp",
  "cinemasunshine.co.jp",
  "kinezo.jp",
  "grand-cinemasunshine.com",
]);

/**
 * 映画系の第三者サイト（レビュー・時刻表集約）。
 * 公式ではないので confidence は medium までに cap する。
 */
const MOVIE_THIRD_PARTY_DOMAINS = new Map<string, string>([
  ["eiga.com", "映画.com"],
  ["filmarks.com", "Filmarks"],
  ["imdb.com", "IMDb"],
  ["kinejun.com", "キネマ旬報"],
  ["walkerplus.com", "映画ウォーカー"],
  ["movies.yahoo.co.jp", "Yahoo!映画"],
]);

/**
 * 食事系の第三者リスティングサイト（venue-bearing: ページ単位で店舗情報完備）。
 * 公式ではないので confidence は medium までに cap する。
 */
const FOOD_THIRD_PARTY_DOMAINS = new Map<string, string>([
  ["tabelog.com", "食べログ"],
  ["gurunavi.com", "ぐるなび"],
  ["r.gnavi.co.jp", "ぐるなび"],
  ["hotpepper.jp", "ホットペッパーグルメ"],
  ["retty.me", "Retty"],
  ["tripadvisor.com", "Tripadvisor"],
  ["tripadvisor.jp", "Tripadvisor"],
]);

/**
 * 公式が採用している予約 SaaS ドメイン（Phase B Commit 3 で 5 分類化）。
 *
 * これらへの導線は「公式の予約パートナー」扱い。
 * confidence は medium までに cap（official ほど直接ではないが、unknown よりは強い）。
 */
const OFFICIAL_RESERVATION_PARTNER_DOMAINS = new Map<string, string>([
  ["tablecheck.com", "TableCheck"],
  ["www.tablecheck.com", "TableCheck"],
  ["opentable.jp", "OpenTable"],
  ["opentable.com", "OpenTable"],
  ["toreta.in", "Toreta"],
  ["toreta.app", "Toreta"],
  ["ebica.jp", "ebica"],
  ["hitosara.com", "ヒトサラ"],
  ["autoreserve.com", "AutoReserve"],
  ["ikyu.com", "一休レストラン"],
  ["restaurant.ikyu.com", "一休レストラン"],
]);

/** booking / reservation を示す URL パス */
const BOOKING_PATH_PATTERNS: RegExp[] = [
  /\/ticket(s)?(\/|$|\?)/i,
  /\/reserve(\/|$|\?)/i,
  /\/reservation(\/|$|\?)/i,
  /\/book(ing)?(\/|$|\?)/i,
  /\/purchase(\/|$|\?)/i,
  /\/buy(\/|$|\?)/i,
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return "";
  }
}

function isBookingPath(url: string): boolean {
  const path = pathOf(url);
  return BOOKING_PATH_PATTERNS.some((re) => re.test(path));
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[\s　・:：\-―－\!！\?？。、,.]/g, "");
}

/**
 * theme × URL から providerType を判定する（5 分類）。
 *
 * - movie:
 *   - MOVIE_OFFICIAL_DOMAINS に一致 → "official" (booking path あり) / "official_site" (なし)
 *   - MOVIE_THIRD_PARTY_DOMAINS に一致 → "third_party_listing"
 *   - それ以外 → "unknown" (判定不能の明示カテゴリ。hard filter にはしない)
 * - food:
 *   - OFFICIAL_RESERVATION_PARTNER_DOMAINS に一致 → "official_reservation_partner"
 *   - FOOD_THIRD_PARTY_DOMAINS に一致 → "third_party_listing"
 *   - 未知ドメイン + booking path あり → "official" (path ベース heuristic)
 *   - それ以外（未知ドメイン + booking path なし） → "unknown"
 *     * 保守的: 任意 URL を official_site と扱うと公式を誤認するため、判定不能を明示する
 */
function classifyProvider(
  theme: ConversationBrief["theme"] | string,
  url: string,
): { providerType: BookingProviderType; providerName: string | null } {
  const host = hostOf(url);
  if (!host) {
    return { providerType: "unknown", providerName: null };
  }

  if (theme === "movie") {
    // 公式映画館チェーン
    for (const domain of MOVIE_OFFICIAL_DOMAINS) {
      if (host === domain || host.endsWith(`.${domain}`)) {
        return {
          providerType: isBookingPath(url) ? "official" : "official_site",
          providerName: null,
        };
      }
    }
    // 第三者映画サイト
    for (const [domain, label] of MOVIE_THIRD_PARTY_DOMAINS) {
      if (host === domain || host.endsWith(`.${domain}`)) {
        return { providerType: "third_party_listing", providerName: label };
      }
    }
    // 判定不能
    return { providerType: "unknown", providerName: null };
  }

  // 食事系
  if (theme === "food") {
    // 公式予約パートナー（最優先に判定: listing より強い確信）
    for (const [domain, label] of OFFICIAL_RESERVATION_PARTNER_DOMAINS) {
      if (host === domain || host.endsWith(`.${domain}`)) {
        return {
          providerType: "official_reservation_partner",
          providerName: label,
        };
      }
    }
    // 第三者リスティング
    for (const [domain, label] of FOOD_THIRD_PARTY_DOMAINS) {
      if (host === domain || host.endsWith(`.${domain}`)) {
        return { providerType: "third_party_listing", providerName: label };
      }
    }
    // 未知ドメイン: booking path があれば official (path ベース heuristic)
    if (isBookingPath(url)) {
      return { providerType: "official", providerName: null };
    }
    // それ以外は判定不能
    return { providerType: "unknown", providerName: null };
  }

  // その他 theme は unknown
  return { providerType: "unknown", providerName: null };
}

/**
 * searchCandidate と候補のエンティティ一致強度を 0-1 で返す。
 *
 *  - 0.9: title 完全一致 AND (theater 省略 OR description に theater 含む)
 *  - 0.7: title 部分一致 AND theater 含む
 *  - 0.5: title 部分一致のみ
 *  - 0.3: title に関連語のみ
 *  - 0.0: 不一致
 */
function entityMatchStrength(
  candidateTitle: string,
  candidateTheater: string | null,
  sc: SearchCandidate,
): number {
  const nt = normalizeTitle(candidateTitle);
  const nsc = normalizeTitle(sc.title);
  if (!nt || !nsc) return 0;

  const titleExact = nt === nsc;
  const titleContains =
    nsc.includes(nt) || nt.includes(nsc);

  const descRaw = `${sc.title} ${sc.description ?? ""} ${sc.practicalInfo ?? ""}`;
  const descNorm = normalizeTitle(descRaw);
  const descHasTitle = descNorm.includes(nt);
  const descHasTheater = candidateTheater
    ? descNorm.includes(normalizeTitle(candidateTheater))
    : true; // theater 不明なら pass

  if (titleExact && descHasTheater) return 0.9;
  if (titleExact) return 0.8;
  if (titleContains && descHasTheater) return 0.7;
  if (titleContains) return 0.55;
  if (descHasTitle && descHasTheater) return 0.5;
  if (descHasTitle) return 0.35;
  return 0;
}

// ─────────────────────────────────────────────
// Label 決定: theme × confidence × providerType
// ─────────────────────────────────────────────

/**
 * CEO 方針 (2026-04-18):
 *  - 映画は confidence が high でも CTA は「予約する」を出さない（上映ページ誘導止まり）
 *  - third_party は最大でも medium（high にしない）
 *  - low の場合は CTA を最弱ラベルにするか呼び出し側で隠す
 */
function resolveLabel(
  theme: ConversationBrief["theme"] | string,
  providerType: BookingProviderType,
  confidence: BookingConfidence,
  providerName: string | null,
): string {
  // unknown は CTA 非表示方針。呼び出し側で落とすのが本筋だが、
  // label は fallback として最弱表示を返しておく。
  if (providerType === "unknown") {
    return "詳しく見る";
  }

  if (theme === "movie") {
    // 映画は「予約」を出さない
    if (providerType === "official" && confidence !== "low") {
      return "上映ページを見る";
    }
    if (providerType === "official_site") {
      return "劇場サイトで確認する";
    }
    if (providerType === "third_party_listing") {
      return providerName ? `${providerName}で見る` : "上映情報を見る";
    }
    return "上映情報を見る";
  }

  if (theme === "food") {
    if (providerType === "official" && confidence === "high") {
      return "公式の予約ページへ";
    }
    if (providerType === "official" && confidence === "medium") {
      return "公式サイトで確認する";
    }
    if (providerType === "official_site") {
      return "公式サイトで確認する";
    }
    if (providerType === "official_reservation_partner") {
      return providerName ? `${providerName}で予約する` : "予約サイトで確認する";
    }
    if (providerType === "third_party_listing") {
      return providerName ? `${providerName}で見る` : "お店の情報を見る";
    }
  }

  // 汎用
  return "詳しく見る";
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface ResolveBookingInput {
  theme: ConversationBrief["theme"] | string;
  candidateTitle: string;
  candidateTheater: string | null;
  /** 優先 URL（例: MovieScreening.sourceUrl）。無ければ null */
  catalogSourceUrl: string | null;
  /** 絞り込んだ searchCandidates（movieOrchestrator から全件渡す想定） */
  searchCandidates: SearchCandidate[];
}

interface UrlCandidate {
  url: string;
  match: number;
  providerType: BookingProviderType;
  providerName: string | null;
  hasBookingPath: boolean;
  source: "catalog" | "search";
  /** 表示用の出典ラベル（providerName 優先、fallback で source フィールド） */
  sourceLabel: string;
}

/**
 * Booking Handoff を解決する。URL が全く見つからない場合は null を返す。
 */
export function resolveBookingHandoff(
  input: ResolveBookingInput,
): BookingHandoff | null {
  const {
    theme,
    candidateTitle,
    candidateTheater,
    catalogSourceUrl,
    searchCandidates,
  } = input;

  const pool: UrlCandidate[] = [];

  // catalog 由来の URL は強 match 扱い（そもそも catalog が抽出した titleからの URL）
  if (catalogSourceUrl) {
    const classified = classifyProvider(theme, catalogSourceUrl);
    pool.push({
      url: catalogSourceUrl,
      match: 0.85,
      providerType: classified.providerType,
      providerName: classified.providerName,
      hasBookingPath: isBookingPath(catalogSourceUrl),
      source: "catalog",
      sourceLabel: classified.providerName ?? "公式情報",
    });
  }

  // search candidates から URL を吸い上げる
  for (const sc of searchCandidates) {
    if (!sc.url) continue;
    const match = entityMatchStrength(candidateTitle, candidateTheater, sc);
    if (match <= 0) continue;
    const classified = classifyProvider(theme, sc.url);
    pool.push({
      url: sc.url,
      match,
      providerType: classified.providerType,
      providerName: classified.providerName,
      hasBookingPath: isBookingPath(sc.url),
      source: "search",
      sourceLabel: classified.providerName ?? sc.source ?? "参照",
    });
  }

  if (pool.length === 0) return null;

  // bookingUrl 優先度: official + booking path、次に高 match の official
  const officialBooking = pickBest(
    pool.filter((p) => p.providerType === "official" && p.hasBookingPath),
  );
  const officialSite = pickBest(
    pool.filter(
      (p) =>
        p.providerType === "official" || p.providerType === "official_site",
    ),
  );
  const officialPartner = pickBest(
    pool.filter((p) => p.providerType === "official_reservation_partner"),
  );
  const thirdParty = pickBest(
    pool.filter((p) => p.providerType === "third_party_listing"),
  );
  const unknownCandidate = pickBest(
    pool.filter((p) => p.providerType === "unknown"),
  );

  const bookingUrl = officialBooking?.url ?? null;
  const officialUrl = officialSite?.url ?? null;

  // 出すべきプロバイダを選ぶ（confidence と label の主語）
  // 優先: official(booking) > official_site > official_reservation_partner
  //       > third_party_listing > unknown
  let primary: UrlCandidate | null = null;
  if (officialBooking) primary = officialBooking;
  else if (officialSite) primary = officialSite;
  else if (officialPartner) primary = officialPartner;
  else if (thirdParty) primary = thirdParty;
  else if (unknownCandidate) primary = unknownCandidate;

  if (!primary) return null;

  const confidence = resolveConfidence(primary);
  const label = resolveLabel(
    theme,
    primary.providerType,
    confidence,
    primary.providerName,
  );

  // phone は v1 では抽出しない（将来の食事 fallback 用に field を残す）
  const phone: string | null = null;

  return {
    bookingUrl,
    officialUrl,
    phone,
    label,
    providerType: primary.providerType,
    providerName: primary.providerName,
    confidence,
  };
}

function pickBest(list: UrlCandidate[]): UrlCandidate | null {
  if (list.length === 0) return null;
  // match が高く、hasBookingPath が強い順
  const sorted = [...list].sort((a, b) => {
    if (b.match !== a.match) return b.match - a.match;
    return Number(b.hasBookingPath) - Number(a.hasBookingPath);
  });
  return sorted[0] ?? null;
}

/**
 * confidence 決定（5 分類対応）:
 *  - official + booking path + match>=0.7 → high
 *  - official + (booking path なし OR match<0.7) → medium
 *  - official_site + match>=0.5 → medium / else → low
 *  - official_reservation_partner + match>=0.7 → medium（cap、high 不可） / else → low
 *  - third_party_listing + match>=0.7 → medium（cap、high 不可） / else → low
 *  - unknown → low（CTA 非表示方針だが label fallback のため low を返す）
 */
function resolveConfidence(primary: UrlCandidate): BookingConfidence {
  const { providerType, hasBookingPath, match } = primary;

  if (providerType === "official") {
    if (hasBookingPath && match >= 0.7) return "high";
    return "medium";
  }
  if (providerType === "official_site") {
    if (match >= 0.5) return "medium";
    return "low";
  }
  if (providerType === "official_reservation_partner") {
    if (match >= 0.7) return "medium";
    return "low";
  }
  if (providerType === "third_party_listing") {
    if (match >= 0.7) return "medium";
    return "low";
  }
  // unknown
  return "low";
}

// 内部 API (test 用)
export const __internal = {
  classifyProvider,
  isBookingPath,
  entityMatchStrength,
  resolveConfidence,
  resolveLabel,
  hostOf,
  pathOf,
  normalizeTitle,
};
