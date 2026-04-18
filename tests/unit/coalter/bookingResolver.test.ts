/**
 * CoAlter Phase A: bookingResolver tests (2026-04-18)
 *
 * 検証:
 *  - 公式ドメイン + booking path → official + high confidence
 *  - 公式ドメインだが booking path なし → official_site + medium
 *  - third_party (映画.com / 食べログ) → third_party + 最大 medium (high 禁止)
 *  - 映画は confidence が high でも CTA は「予約」にしない
 *  - URL が全く無ければ null
 *  - entity 一致弱ければ confidence が落ちる
 */

import { describe, it, expect } from "vitest";
import {
  resolveBookingHandoff,
  __internal,
} from "@/lib/coalter/bookingResolver";
import type { SearchCandidate } from "@/lib/coalter/types";

function makeSearch(partial: Partial<SearchCandidate>): SearchCandidate {
  return {
    title: "",
    description: "",
    externalRating: null,
    practicalInfo: null,
    source: "",
    url: null,
    ...partial,
  };
}

describe("bookingResolver.classifyProvider", () => {
  const { classifyProvider } = __internal;

  it("movie: TOHOシネマズ 公式 + booking path → official", () => {
    const r = classifyProvider(
      "movie",
      "https://hlo.tohotheater.jp/net/ticket/053/TNPI2000J01.do",
    );
    expect(r.providerType).toBe("official");
  });

  it("movie: TOHOシネマズ 公式 TOP → official_site", () => {
    const r = classifyProvider("movie", "https://www.tohotheater.jp/theater/053/");
    expect(r.providerType).toBe("official_site");
  });

  it("movie: 映画.com → third_party (providerName=映画.com)", () => {
    const r = classifyProvider("movie", "https://eiga.com/movie/12345/");
    expect(r.providerType).toBe("third_party");
    expect(r.providerName).toBe("映画.com");
  });

  it("movie: Filmarks → third_party (providerName=Filmarks)", () => {
    const r = classifyProvider("movie", "https://filmarks.com/movies/99999");
    expect(r.providerType).toBe("third_party");
    expect(r.providerName).toBe("Filmarks");
  });

  it("food: 食べログ → third_party (providerName=食べログ)", () => {
    const r = classifyProvider("food", "https://tabelog.com/tokyo/A1303/rstdetail/");
    expect(r.providerType).toBe("third_party");
    expect(r.providerName).toBe("食べログ");
  });
});

describe("bookingResolver.resolveBookingHandoff — movie theme", () => {
  const candidateTitle = "ラストマイル";
  const candidateTheater = "TOHOシネマズ渋谷";

  it("公式 + booking path でも CTA は『予約』にしない（上映ページ誘導止まり）", () => {
    const b = resolveBookingHandoff({
      theme: "movie",
      candidateTitle,
      candidateTheater,
      catalogSourceUrl:
        "https://hlo.tohotheater.jp/net/ticket/053/TNPI2000J01.do?sakuhin=ラストマイル",
      searchCandidates: [
        makeSearch({
          title: "ラストマイル",
          description: "TOHOシネマズ渋谷で上映中",
          url: "https://hlo.tohotheater.jp/net/ticket/053/TNPI2000J01.do",
          source: "TOHO シネマズ",
        }),
      ],
    });
    expect(b).not.toBeNull();
    expect(b!.providerType).toBe("official");
    expect(b!.confidence).toBe("high");
    // 映画は "予約する" 禁止
    expect(b!.label).not.toContain("予約");
    // 代わりに上映ページ誘導になっている
    expect(b!.label).toBe("上映ページを見る");
    expect(b!.bookingUrl).toBeTruthy();
  });

  it("映画.com のみ → third_party + medium + ラベルは『映画.comで見る』", () => {
    const b = resolveBookingHandoff({
      theme: "movie",
      candidateTitle,
      candidateTheater,
      catalogSourceUrl: "https://eiga.com/movie/last-mile",
      searchCandidates: [
        makeSearch({
          title: "ラストマイル",
          description: "TOHOシネマズ渋谷で上映中",
          url: "https://eiga.com/movie/last-mile",
          source: "映画.com",
        }),
      ],
    });
    expect(b).not.toBeNull();
    expect(b!.providerType).toBe("third_party");
    // third_party は絶対 high にならない
    expect(b!.confidence).not.toBe("high");
    expect(b!.confidence).toBe("medium");
    expect(b!.label).toBe("映画.comで見る");
  });

  it("URL が全く無ければ null", () => {
    const b = resolveBookingHandoff({
      theme: "movie",
      candidateTitle,
      candidateTheater,
      catalogSourceUrl: null,
      searchCandidates: [],
    });
    expect(b).toBeNull();
  });

  it("entity 一致が弱い searchCandidate は寄与しない（catalog sourceUrl のみ採用）", () => {
    const b = resolveBookingHandoff({
      theme: "movie",
      candidateTitle,
      candidateTheater,
      catalogSourceUrl: "https://eiga.com/movie/last-mile",
      searchCandidates: [
        makeSearch({
          title: "全く別の映画",
          description: "別の内容",
          url: "https://filmarks.com/movies/other",
          source: "Filmarks",
        }),
      ],
    });
    expect(b).not.toBeNull();
    // catalog 由来だけが pool に残る
    expect(b!.providerType).toBe("third_party");
  });
});

describe("bookingResolver.resolveBookingHandoff — food theme", () => {
  it("公式サイト + /reservation → high + 『公式の予約ページへ』", () => {
    const b = resolveBookingHandoff({
      theme: "food",
      candidateTitle: "炭火焼 風月",
      candidateTheater: null,
      catalogSourceUrl: null,
      searchCandidates: [
        makeSearch({
          title: "炭火焼 風月",
          description: "渋谷の和食。予約受付中。",
          url: "https://fugetsu-shibuya.com/reservation/",
          source: "公式",
        }),
      ],
    });
    expect(b).not.toBeNull();
    expect(b!.providerType).toBe("official");
    expect(b!.confidence).toBe("high");
    expect(b!.label).toBe("公式の予約ページへ");
  });

  it("食べログのみ → third_party + medium (high にしない)", () => {
    const b = resolveBookingHandoff({
      theme: "food",
      candidateTitle: "炭火焼 風月",
      candidateTheater: null,
      catalogSourceUrl: null,
      searchCandidates: [
        makeSearch({
          title: "炭火焼 風月",
          description: "渋谷の和食",
          url: "https://tabelog.com/tokyo/A1303/rstdetail/",
          source: "食べログ",
        }),
      ],
    });
    expect(b).not.toBeNull();
    expect(b!.providerType).toBe("third_party");
    expect(b!.confidence).not.toBe("high");
    expect(b!.label).toBe("食べログで見る");
  });
});
