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

/**
 * venue quality gate — 2026-04-20 live smoke 残差対応。
 *
 * 以下に該当した時点で pageType="non_venue" に倒す（= direct candidate 昇格 block）。
 *
 * (a) Municipal / 公共機関ホスト:
 *     city.shinjuku.lg.jp / www.city.shibuya.tokyo.jp / *.go.jp / *.pref.*.jp 等。
 *     日本の地方公共団体は慣例的に以下 TLD / サブドメインを使う:
 *       - *.lg.jp  : 全地方公共団体 (city/town/village/ward)
 *       - *.go.jp  : 中央省庁・政府機関
 *       - metro.tokyo.jp / city.*.tokyo.jp 等: 東京都 / 都内区市町村
 *       - pref.*.jp : 都道府県庁
 *
 * (b) Directory / ジャンル一覧パス（listing domain でも非 venue）:
 *     retty.me/category/, tabelog.com/genre/, /tags/, /search 等。
 *     VENUE_DETAIL_PATH に該当する場合はこのルールを適用しない（intent 併用）。
 *
 * 判定順: (a) host → (c) title → (b) path の順で評価する（path は最も誤爆しやすいため
 *   venue_detail path を先に拾い、残った時のみ directory 判定へ）。
 */
const MUNICIPAL_HOST_PATTERNS: readonly RegExp[] = [
  /(^|\.)lg\.jp$/i, // 全地方公共団体
  /(^|\.)go\.jp$/i, // 中央省庁・政府機関
  /(^|\.)pref\.[a-z0-9-]+\.jp$/i, // 都道府県庁 (pref.tokyo.jp etc.)
  /(^|\.)metro\.tokyo\.jp$/i, // 東京都庁
  /(^|\.)city\.[a-z0-9-]+\.(?:tokyo|jp)\b/i, // 市区
  /(^|\.)town\.[a-z0-9-]+\.jp$/i, // 町役場
  /(^|\.)village\.[a-z0-9-]+\.jp$/i, // 村役場
  /(^|\.)ward\.[a-z0-9-]+\.jp$/i, // 区(稀)
];

/**
 * 非 venue を強く示す title 語。
 * restaurant detail タイトルと衝突しないものだけ（「〇〇食堂」等は含めない）。
 */
const NON_VENUE_TITLE_PATTERNS: readonly RegExp[] = [
  /区役所/,
  /市役所/,
  /町役場/,
  /村役場/,
  /県庁/,
  /都庁/,
  /府庁/,
  /商工会(?:議所)?/,
  /観光協会/,
  /観光案内所/,
  /観光局/,
  /交通案内/,
  /料理ジャンル一覧/,
  /ジャンル一覧/,
  /エリア一覧/,
];

/**
 * Directory / ジャンル一覧 URL パス。
 * venue_detail path を先に評価し、それに該当しない時のみこのルールを適用する。
 */
const DIRECTORY_PATH_PATTERNS: readonly RegExp[] = [
  /\/category(?:\/|$)/i,
  /\/categories(?:\/|$)/i,
  /\/genre(?:s)?(?:\/|$)/i,
  /\/tags?(?:\/|$)/i,
  /\/search(?:\/|$|\?)/i,
  /\/keyword(?:s)?(?:\/|$)/i,
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
 *
 * 2026-04-20: venue quality gate 追加で "non_venue" を block に含める。
 */
const BLOCKED: readonly PageType[] = [
  "listicle",
  "news",
  "non_venue",
] as const;

export function isDirectCandidateBlocked(pageType: PageType): boolean {
  return BLOCKED.includes(pageType);
}

/**
 * URL / title / description から PageType を判定する。
 *
 * 判定順（重要: 非 venue が誤って venue_detail / third_party_listing に流れないこと）:
 *   0a. host が municipal/政府 → non_venue (high) [2026-04-20 venue quality gate]
 *   0b. title が 区役所/観光協会/料理ジャンル一覧 等 → non_venue (high)
 *   1.  title に listicle signal → listicle (high)
 *   2.  title に news signal → news (high)
 *   3.  path に listicle signal → listicle (medium/high: 既知ドメインなら high)
 *   4.  path に news signal → news (medium/high: news-oriented ドメインなら high)
 *   5.  予約 partner ドメイン → reservation_partner (high)
 *   6.  第三者 listing ドメイン + venue 詳細 path → third_party_listing (high)
 *   6.5 venue_detail path が無く、directory path あり → non_venue (medium)
 *       [2026-04-20 venue quality gate: /category/ /genre/ /tags/ /search /keyword]
 *   7.  第三者 listing ドメイン（詳細 path 未確認） → third_party_listing (medium)
 *   8.  官公式 signal（title or booking path） → official (medium/high)
 *   9.  venue 詳細 path → venue_detail (medium)
 *  10.  fallback → venue_detail (low)
 */
export function classifyPageType(
  input: ClassifyPageTypeInput,
): PageTypeClassification {
  const url = input.url ?? "";
  const title = input.title ?? "";
  const description = input.description ?? "";
  const host = extractHost(url) ?? "";
  const path = extractPath(url);

  // (0a) municipal / 公共機関ホスト → non_venue
  if (host) {
    for (const re of MUNICIPAL_HOST_PATTERNS) {
      if (re.test(host)) {
        return {
          pageType: "non_venue",
          confidence: "high",
          signals: { domainHit: host, reason: "municipal-host" },
        };
      }
    }
  }

  // (0b) 非 venue title（区役所 / 観光協会 / ジャンル一覧 等）
  const nonVenueTitle = firstMatch(NON_VENUE_TITLE_PATTERNS, title);
  if (nonVenueTitle) {
    return {
      pageType: "non_venue",
      confidence: "high",
      signals: { titleHit: nonVenueTitle, reason: "non-venue-title" },
    };
  }

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

  // (6)(6.5)(7) third-party listing
  if (listingDomainHit) {
    const venuePath = firstMatch(VENUE_DETAIL_PATH_PATTERNS, path);
    if (venuePath) {
      // (6) venue 詳細 path あり → third_party_listing (high)
      return {
        pageType: "third_party_listing",
        confidence: "high",
        signals: {
          domainHit: listingDomainHit,
          pathHit: venuePath,
          reason: "third-party-listing-domain+venue-path",
        },
      };
    }
    // (6.5) venue 詳細 path 無し + directory path あり → non_venue
    //   listing domain（retty/tabelog 等）でも /category/ /genre/ /tags/ /search は
    //   単一店ページではない。venue path を先に見ることで誤爆を避ける。
    const directoryPath = firstMatch(DIRECTORY_PATH_PATTERNS, path);
    if (directoryPath) {
      return {
        pageType: "non_venue",
        confidence: "medium",
        signals: {
          domainHit: listingDomainHit,
          pathHit: directoryPath,
          reason: "directory-path-on-listing-domain",
        },
      };
    }
    // (7) listing domain のみ（詳細 path 未確認）
    return {
      pageType: "third_party_listing",
      confidence: "medium",
      signals: {
        domainHit: listingDomainHit,
        reason: "third-party-listing-domain",
      },
    };
  }

  // (6.5-b) listing domain でない URL でも directory path が明確な場合は non_venue
  //   例: example.com/category/japanese-food のような一般ディレクトリページ。
  //   listing domain 判定後に置くことで retty/tabelog の誤爆を先に回避済み。
  {
    const directoryPath = firstMatch(DIRECTORY_PATH_PATTERNS, path);
    if (directoryPath) {
      return {
        pageType: "non_venue",
        confidence: "medium",
        signals: {
          ...(host ? { domainHit: host } : {}),
          pathHit: directoryPath,
          reason: "directory-path",
        },
      };
    }
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
  MUNICIPAL_HOST_PATTERNS,
  NON_VENUE_TITLE_PATTERNS,
  DIRECTORY_PATH_PATTERNS,
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
