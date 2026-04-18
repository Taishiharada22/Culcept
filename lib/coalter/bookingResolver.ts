/**
 * CoAlter Phase A: Booking Handoff Resolver (2026-04-18)
 *
 * 責務:
 *  - searchCandidates / catalog sourceUrl から候補に対応する URL を抽出
 *  - URL を providerType (official / official_site / third_party) に分類
 *  - entity 一致強度と URL 種別から confidence を判定（third_party は high 不可）
 *  - theme × confidence × providerType から CTA label を決定
 *    - movie は confidence によらず「予約」系 CTA を出さない（上映ページ誘導止まり）
 *
 * 設計原則:
 *  1. URL はハルシネーションしない。入力の searchCandidates / catalog 由来のみ。
 *  2. 一致エビデンスが弱ければ confidence を落とす（label が自動で弱くなる）。
 *  3. phone は保持のみ。v1 CTA には使わない。
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
 * 食事系（Phase B 予定。Phase A では theme=food でこの枝に入らないが、
 * 将来のための骨格として残しておく）。
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
 * theme × URL から providerType を判定する。
 *
 * - movie:
 *   - MOVIE_OFFICIAL_DOMAINS に一致 → "official" (booking path あり) / "official_site" (なし)
 *   - MOVIE_THIRD_PARTY_DOMAINS に一致 → "third_party"
 *   - それ以外 → "third_party" (unknown 扱い / 最弱)
 * - food:
 *   - FOOD_THIRD_PARTY_DOMAINS に一致 → "third_party"
 *   - それ以外 + booking path あり → "official" (固有ドメインは確定不可なので path ベース)
 *   - それ以外 + トップ → "official_site"
 */
function classifyProvider(
  theme: ConversationBrief["theme"] | string,
  url: string,
): { providerType: BookingProviderType; providerName: string | null } {
  const host = hostOf(url);
  if (!host) {
    return { providerType: "third_party", providerName: null };
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
        return { providerType: "third_party", providerName: label };
      }
    }
    // その他のドメインは third_party（unknown 扱い）
    return { providerType: "third_party", providerName: null };
  }

  // 食事系
  if (theme === "food") {
    for (const [domain, label] of FOOD_THIRD_PARTY_DOMAINS) {
      if (host === domain || host.endsWith(`.${domain}`)) {
        return { providerType: "third_party", providerName: label };
      }
    }
    if (isBookingPath(url)) {
      return { providerType: "official", providerName: null };
    }
    return { providerType: "official_site", providerName: null };
  }

  // その他 theme は一旦 third_party 扱い
  return { providerType: "third_party", providerName: null };
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
  if (theme === "movie") {
    // 映画は「予約」を出さない
    if (providerType === "official" && confidence !== "low") {
      return "上映ページを見る";
    }
    if (providerType === "official_site") {
      return "劇場サイトで確認する";
    }
    if (providerType === "third_party") {
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
    if (providerType === "third_party") {
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
  const thirdParty = pickBest(
    pool.filter((p) => p.providerType === "third_party"),
  );

  const bookingUrl = officialBooking?.url ?? null;
  const officialUrl = officialSite?.url ?? null;

  // 出すべきプロバイダを選ぶ（confidence と label の主語）
  let primary: UrlCandidate | null = null;
  if (officialBooking) primary = officialBooking;
  else if (officialSite) primary = officialSite;
  else if (thirdParty) primary = thirdParty;

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
 * confidence 決定:
 *  - official + booking path + match>=0.7 → high
 *  - official + (booking path なし OR match<0.7) → medium
 *  - official_site + match>=0.5 → medium
 *  - third_party + match>=0.7 → medium（cap）
 *  - third_party + match<0.7 → low
 *  - それ以外の弱い一致 → low
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
  // third_party: never high
  if (match >= 0.7) return "medium";
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
