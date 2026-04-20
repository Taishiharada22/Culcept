/**
 * CoAlter §6.4 (6)-2: Page Type Classifier (2026-04-20)
 *
 * 目的:
 *   search で取得した 1 件の URL / title / description を読み、どの PageType に
 *   属するかを決める純関数。BLOCKED_PAGE_TYPES ("listicle" / "news") は direct
 *   candidate に昇格させない、という契約を upstream で enforce するための入力。
 *
 * BookingProviderType (bookingResolver.ts) との違い:
 *   - BookingProviderType: URL の所有者分類（official / partner / third-party / unknown）。
 *     CTA label / confidence を決める。
 *   - PageType: ページの「中身」分類（特定店 1 件の詳細か / 複数店列挙の記事か / ニュースか）。
 *     候補昇格のブロック判定に使う。
 *   両者は同じ URL でも独立に判定される（例: tabelog /matome/ は
 *   BookingProviderType=third_party_listing かつ PageType=listicle）。
 *
 * 設計原則:
 *   1. 純関数。副作用なし・外部 I/O なし。
 *   2. 判定順は listicle/news を最優先（誤って venue_detail に流さない）。
 *   3. 既知ドメインのパス・タイトル両方を見て判定する。
 *   4. confidence は「signal がどれだけ強いか」を示す診断用メタ。
 *      ブロック契約そのものは pageType==="listicle"|"news" で決まる。
 *   5. 分類不能は venue_detail を返さず、保守的に listicle/news 寄りを検出できない
 *      場合のみ unknown-like path の結果を venue_detail として扱う。
 */

import type { PageType } from "./types";

// ─────────────────────────────────────────────
// Known domain classification
// ─────────────────────────────────────────────

/**
 * 公式採用の予約 SaaS ドメイン（pageType="reservation_partner"）。
 * bookingResolver.ts の OFFICIAL_RESERVATION_PARTNER_DOMAINS と一致させておく。
 */
const RESERVATION_PARTNER_DOMAINS: readonly string[] = [
  "tablecheck.com",
  "opentable.jp",
  "opentable.com",
  "toreta.in",
  "toreta.app",
  "ebica.jp",
  "hitosara.com",
  "autoreserve.com",
  "ikyu.com",
  "restaurant.ikyu.com",
];

/**
 * 食事系の第三者リスティングサイト（venue 詳細ページと listicle が混在するドメイン）。
 * 個別店ページなら third_party_listing、記事系パスなら listicle/news に落ちる。
 */
const THIRD_PARTY_LISTING_DOMAINS: readonly string[] = [
  "tabelog.com",
  "retty.me",
  "hotpepper.jp",
  "gnavi.co.jp",
  "r.gnavi.co.jp",
  "gurunavi.com",
  "tripadvisor.com",
  "tripadvisor.jp",
];

/**
 * news 的ドメイン（記事が主体のサイト）。
 * ここに該当 + 記事パスなら news、listicle title を含めば listicle に上書きされる。
 */
const NEWS_ORIENTED_DOMAINS: readonly string[] = [
  "news.yahoo.co.jp",
  "news.livedoor.com",
  "prtimes.jp",
  "nikkei.com",
  "asahi.com",
  "mainichi.jp",
  "yomiuri.co.jp",
  "sankei.com",
  "itmedia.co.jp",
  "j-cast.com",
];

// ─────────────────────────────────────────────
// Path patterns
// ─────────────────────────────────────────────

/** listicle を示す URL パス（まとめ/一覧/ランキング系） */
const LISTICLE_PATH_PATTERNS: readonly RegExp[] = [
  /\/matome(\/|$)/i,
  /\/rstlst(\/|$)/i, // tabelog 一覧
  /\/ranking(s)?(\/|$)/i,
  /\/best\b/i,
  /\/top\d+/i,
  /\/summary(\/|$)/i,
  /\/feature(s)?(\/|$)/i,
  /\/osusume(\/|$)/i,
];

/** news を示す URL パス */
const NEWS_PATH_PATTERNS: readonly RegExp[] = [
  /\/news(\/|$)/i,
  /\/article(s)?(\/|$)/i,
  /\/column(s)?(\/|$)/i,
  /\/press(\/|$)/i,
  /\/topics?(\/|$)/i,
];

/**
 * venue 詳細ページらしさを示す URL パス。
 * tabelog は /A\d{4}/A\d{6}/\d{7,}/、gnavi は /[a-z0-9]+/、retty は /restaurants/\d+ など。
 */
const VENUE_DETAIL_PATH_PATTERNS: readonly RegExp[] = [
  /\/rstdata(\/|$)/i, // tabelog 詳細 (/rstdata/basic/ など)
  /\/dtlrvwlst(\/|$)/i, // tabelog 口コミ一覧は詳細ページ扱い
  /\/\d{7,}\/?($|\?)/, // 末尾が 7 桁以上の id（tabelog / r.gnavi 慣例）
  /\/restaurants?\/[^/]+\/?($|\?)/i, // retty や generic /restaurant/slug
  /\/shop\/[^/]+\/?($|\?)/i,
  /\/store\/[^/]+\/?($|\?)/i,
];

/** 予約導線 URL パス（bookingResolver と並行。official 判定の補助） */
const BOOKING_PATH_PATTERNS: readonly RegExp[] = [
  /\/ticket(s)?(\/|$|\?)/i,
  /\/reserve(\/|$|\?)/i,
  /\/reservation(\/|$|\?)/i,
  /\/book(ing)?(\/|$|\?)/i,
];

// ─────────────────────────────────────────────
// Title / description patterns
// ─────────────────────────────────────────────

/** listicle タイトル signal（高信頼） */
const LISTICLE_TITLE_PATTERNS: readonly RegExp[] = [
  /\d+\s*選/, // 10選 / 20選
  /BEST\s*\d+/i,
  /ベスト\s*\d+/,
  /TOP\s*\d+/i,
  /トップ\s*\d+/,
  /ランキング/,
  /まとめ/,
  /特集/,
  /比較/,
  /おすすめ.{0,8}(店|レストラン|居酒屋|カフェ|焼肉|寿司|ラーメン|イタリアン|フレンチ|中華|バー|スポット)/,
  /人気.{0,8}(店|レストラン|居酒屋|カフェ|スポット)/,
  /名店\s*\d+/,
  /厳選\s*\d+/,
];

/** news タイトル signal（新店・閉店・メディア掲載） */
const NEWS_TITLE_PATTERNS: readonly RegExp[] = [
  /閉店/,
  /オープン予定/,
  /グランドオープン/,
  /新装開店/,
  /リニューアルオープン/,
  /移転オープン/,
  /新店情報/,
  /プレオープン/,
  /期間限定.{0,6}(オープン|出店)/,
];

/** official site を示唆する signal（title または description） */
const OFFICIAL_TITLE_PATTERNS: readonly RegExp[] = [
  /公式サイト/,
  /公式ホームページ/,
  /official\s*site/i,
  /official\s*web/i,
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function extractHost(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function extractPath(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return "";
  }
}

function matchesDomain(host: string, domains: readonly string[]): string | null {
  for (const d of domains) {
    if (host === d || host.endsWith(`.${d}`)) return d;
  }
  return null;
}

function firstMatch(
  patterns: readonly RegExp[],
  text: string,
): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface ClassifyPageTypeInput {
  url: string;
  title: string;
  description?: string;
}

export interface PageTypeSignals {
  /** 判定に使ったドメイン（known list にマッチした場合のみ） */
  domainHit?: string;
  /** 判定に使ったパスパターン（正規表現の一致文字列） */
  pathHit?: string;
  /** 判定に使った title キーワード */
  titleHit?: string;
  /** 判定に使った description キーワード */
  descriptionHit?: string;
  /** 判定理由の短い英語タグ（observability / test 用） */
  reason: string;
}

export interface PageTypeClassification {
  pageType: PageType;
  confidence: "high" | "medium" | "low";
  signals: PageTypeSignals;
}

/**
 * direct candidate として昇格させてはいけない PageType。
 * foodQueryBuilder の BLOCKED_PAGE_TYPES と揃える契約。
 */
const BLOCKED: readonly PageType[] = ["listicle", "news"] as const;

export function isDirectCandidateBlocked(pageType: PageType): boolean {
  return BLOCKED.includes(pageType);
}

/**
 * URL / title / description から PageType を判定する。
 *
 * 判定順（重要: listicle/news が誤って venue_detail に流れないこと）:
 *   1. title に listicle signal → listicle (high)
 *   2. title に news signal → news (high)
 *   3. path に listicle signal → listicle (medium/high: 既知ドメインなら high)
 *   4. path に news signal → news (medium/high: news-oriented ドメインなら high)
 *   5. 予約 partner ドメイン → reservation_partner (high)
 *   6. 第三者 listing ドメイン + venue 詳細 path → third_party_listing (high)
 *   7. 第三者 listing ドメイン（詳細 path 未確認） → third_party_listing (medium)
 *   8. 官公式 signal（title or booking path） → official (medium/high)
 *   9. venue 詳細 path → venue_detail (medium)
 *  10. fallback → venue_detail (low)
 */
export function classifyPageType(
  input: ClassifyPageTypeInput,
): PageTypeClassification {
  const url = input.url ?? "";
  const title = input.title ?? "";
  const description = input.description ?? "";
  const host = extractHost(url) ?? "";
  const path = extractPath(url);

  // (1) title listicle
  const listicleTitle = firstMatch(LISTICLE_TITLE_PATTERNS, title);
  if (listicleTitle) {
    return {
      pageType: "listicle",
      confidence: "high",
      signals: { titleHit: listicleTitle, reason: "listicle-title" },
    };
  }

  // (2) title news
  const newsTitle = firstMatch(NEWS_TITLE_PATTERNS, title);
  if (newsTitle) {
    return {
      pageType: "news",
      confidence: "high",
      signals: { titleHit: newsTitle, reason: "news-title" },
    };
  }

  const partnerDomainHit = host
    ? matchesDomain(host, RESERVATION_PARTNER_DOMAINS)
    : null;
  const listingDomainHit = host
    ? matchesDomain(host, THIRD_PARTY_LISTING_DOMAINS)
    : null;
  const newsDomainHit = host
    ? matchesDomain(host, NEWS_ORIENTED_DOMAINS)
    : null;

  // (3) path listicle
  const listiclePath = firstMatch(LISTICLE_PATH_PATTERNS, path);
  if (listiclePath) {
    const domainHit = listingDomainHit ?? newsDomainHit ?? undefined;
    return {
      pageType: "listicle",
      confidence: listingDomainHit || newsDomainHit ? "high" : "medium",
      signals: {
        pathHit: listiclePath,
        ...(domainHit ? { domainHit } : {}),
        reason: "listicle-path",
      },
    };
  }

  // (4) path news
  const newsPath = firstMatch(NEWS_PATH_PATTERNS, path);
  if (newsPath) {
    const domainHit = newsDomainHit ?? listingDomainHit ?? undefined;
    return {
      pageType: "news",
      confidence: newsDomainHit ? "high" : "medium",
      signals: {
        pathHit: newsPath,
        ...(domainHit ? { domainHit } : {}),
        reason: "news-path",
      },
    };
  }

  // (5) reservation partner
  if (partnerDomainHit) {
    return {
      pageType: "reservation_partner",
      confidence: "high",
      signals: {
        domainHit: partnerDomainHit,
        reason: "reservation-partner-domain",
      },
    };
  }

  // (6)(7) third-party listing
  if (listingDomainHit) {
    const venuePath = firstMatch(VENUE_DETAIL_PATH_PATTERNS, path);
    return {
      pageType: "third_party_listing",
      confidence: venuePath ? "high" : "medium",
      signals: {
        domainHit: listingDomainHit,
        ...(venuePath ? { pathHit: venuePath } : {}),
        reason: venuePath
          ? "third-party-listing-domain+venue-path"
          : "third-party-listing-domain",
      },
    };
  }

  // news-oriented domain but no listicle/news path → news (low, 保守的)
  if (newsDomainHit) {
    return {
      pageType: "news",
      confidence: "low",
      signals: { domainHit: newsDomainHit, reason: "news-domain-only" },
    };
  }

  // (8) official signals
  const officialTitle = firstMatch(OFFICIAL_TITLE_PATTERNS, title);
  const officialDesc = firstMatch(OFFICIAL_TITLE_PATTERNS, description);
  const bookingPath = firstMatch(BOOKING_PATH_PATTERNS, path);
  if (officialTitle) {
    return {
      pageType: "official",
      confidence: bookingPath ? "high" : "medium",
      signals: {
        titleHit: officialTitle,
        ...(bookingPath ? { pathHit: bookingPath } : {}),
        reason: bookingPath ? "official-title+booking-path" : "official-title",
      },
    };
  }
  if (bookingPath) {
    return {
      pageType: "official",
      confidence: "medium",
      signals: { pathHit: bookingPath, reason: "booking-path" },
    };
  }
  if (officialDesc) {
    return {
      pageType: "official",
      confidence: "low",
      signals: { descriptionHit: officialDesc, reason: "official-desc" },
    };
  }

  // (9) venue detail path
  const venuePath = firstMatch(VENUE_DETAIL_PATH_PATTERNS, path);
  if (venuePath) {
    return {
      pageType: "venue_detail",
      confidence: "medium",
      signals: { pathHit: venuePath, reason: "venue-detail-path" },
    };
  }

  // (10) fallback
  return {
    pageType: "venue_detail",
    confidence: "low",
    signals: { reason: "fallback" },
  };
}

// ─────────────────────────────────────────────
// Test-only exports
// ─────────────────────────────────────────────

export const __internal = {
  RESERVATION_PARTNER_DOMAINS,
  THIRD_PARTY_LISTING_DOMAINS,
  NEWS_ORIENTED_DOMAINS,
  LISTICLE_PATH_PATTERNS,
  NEWS_PATH_PATTERNS,
  VENUE_DETAIL_PATH_PATTERNS,
  BOOKING_PATH_PATTERNS,
  LISTICLE_TITLE_PATTERNS,
  NEWS_TITLE_PATTERNS,
  OFFICIAL_TITLE_PATTERNS,
  BLOCKED,
  extractHost,
  extractPath,
  matchesDomain,
  firstMatch,
};
