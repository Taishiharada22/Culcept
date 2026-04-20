/**
 * CoAlter §6.4 (6)-2: Page Type Classifier tests
 *
 * 契約:
 *   1. listicle / news と判定されたページは isDirectCandidateBlocked=true
 *   2. venue_detail / official / reservation_partner / third_party_listing は false
 *   3. listicle/news signal は他の signal より優先（venue_detail に誤って落ちない）
 */

import { describe, expect, it } from "vitest";
import {
  classifyPageType,
  isDirectCandidateBlocked,
} from "@/lib/coalter/pageTypeClassifier";

describe("pageTypeClassifier.classifyPageType", () => {
  // ─────────────────────────────────────────────
  // listicle
  // ─────────────────────────────────────────────

  describe("listicle", () => {
    it("title に『10選』があれば listicle (high)", () => {
      const r = classifyPageType({
        url: "https://example.com/article/123",
        title: "新宿のラーメン10選",
        description: "",
      });
      expect(r.pageType).toBe("listicle");
      expect(r.confidence).toBe("high");
      expect(r.signals.titleHit).toMatch(/10\s*選/);
    });

    it("title に『ランキング』があれば listicle (high)", () => {
      const r = classifyPageType({
        url: "https://foo.example/bar",
        title: "新宿ラーメンランキング2026",
      });
      expect(r.pageType).toBe("listicle");
      expect(r.confidence).toBe("high");
    });

    it("title に『BEST 10』があれば listicle (high)", () => {
      const r = classifyPageType({
        url: "https://foo.example/bar",
        title: "Best 10 Shinjuku Ramen",
      });
      expect(r.pageType).toBe("listicle");
    });

    it("title に『まとめ』があれば listicle", () => {
      const r = classifyPageType({
        url: "https://foo.example/bar",
        title: "新宿ランチまとめ",
      });
      expect(r.pageType).toBe("listicle");
    });

    it("tabelog /matome/ path は listicle (high, 既知ドメイン)", () => {
      const r = classifyPageType({
        url: "https://tabelog.com/matome/26283/",
        title: "新宿のおいしいお店",
      });
      expect(r.pageType).toBe("listicle");
      expect(r.confidence).toBe("high");
      expect(r.signals.pathHit).toMatch(/matome/i);
      expect(r.signals.domainHit).toBe("tabelog.com");
    });

    it("tabelog /rstLst/ path (一覧) は listicle", () => {
      const r = classifyPageType({
        url: "https://tabelog.com/tokyo/A1304/rstLst/ramen/",
        title: "新宿のラーメン",
      });
      expect(r.pageType).toBe("listicle");
      expect(r.confidence).toBe("high");
    });

    it("未知ドメインの /ranking/ path は listicle (medium)", () => {
      const r = classifyPageType({
        url: "https://other.example/ranking/2026/",
        title: "東京グルメ",
      });
      expect(r.pageType).toBe("listicle");
      expect(r.confidence).toBe("medium");
    });

    it("『おすすめラーメン店』title は listicle", () => {
      const r = classifyPageType({
        url: "https://random.example/foo",
        title: "新宿のおすすめラーメン店",
      });
      expect(r.pageType).toBe("listicle");
    });
  });

  // ─────────────────────────────────────────────
  // news
  // ─────────────────────────────────────────────

  describe("news", () => {
    it("title に『閉店』があれば news (high)", () => {
      const r = classifyPageType({
        url: "https://example.com/foo",
        title: "老舗ラーメン店が5月末で閉店",
      });
      expect(r.pageType).toBe("news");
      expect(r.confidence).toBe("high");
    });

    it("title に『グランドオープン』があれば news", () => {
      const r = classifyPageType({
        url: "https://example.com/foo",
        title: "新宿に新店がグランドオープン",
      });
      expect(r.pageType).toBe("news");
    });

    it("news.yahoo.co.jp + /article/ path は news (high)", () => {
      const r = classifyPageType({
        url: "https://news.yahoo.co.jp/articles/abc123",
        title: "都内グルメ速報",
      });
      expect(r.pageType).toBe("news");
      expect(r.confidence).toBe("high");
    });

    it("prtimes.jp は news-oriented ドメインとして news (low)", () => {
      const r = classifyPageType({
        url: "https://prtimes.jp/main/html/rd/p/foo.html",
        title: "株式会社◯◯のお知らせ",
      });
      expect(r.pageType).toBe("news");
      expect(r.confidence).toBe("low");
    });

    it("未知ドメインの /news/ path は news (medium)", () => {
      const r = classifyPageType({
        url: "https://some.example/news/2026/01",
        title: "東京ラーメン事情",
      });
      expect(r.pageType).toBe("news");
      expect(r.confidence).toBe("medium");
    });
  });

  // ─────────────────────────────────────────────
  // reservation_partner
  // ─────────────────────────────────────────────

  describe("reservation_partner", () => {
    it("tablecheck.com は reservation_partner (high)", () => {
      const r = classifyPageType({
        url: "https://www.tablecheck.com/ja/shops/abc/reserve",
        title: "Sample Restaurant 予約",
      });
      expect(r.pageType).toBe("reservation_partner");
      expect(r.confidence).toBe("high");
      expect(r.signals.domainHit).toBe("tablecheck.com");
    });

    it("opentable.jp は reservation_partner", () => {
      const r = classifyPageType({
        url: "https://www.opentable.jp/r/some-restaurant-tokyo",
        title: "Some Restaurant | OpenTable",
      });
      expect(r.pageType).toBe("reservation_partner");
    });

    it("ikyu.com は reservation_partner", () => {
      const r = classifyPageType({
        url: "https://restaurant.ikyu.com/100100/",
        title: "銀座 寿司店 | 一休レストラン",
      });
      expect(r.pageType).toBe("reservation_partner");
    });
  });

  // ─────────────────────────────────────────────
  // third_party_listing
  // ─────────────────────────────────────────────

  describe("third_party_listing", () => {
    it("tabelog 店舗詳細 URL は third_party_listing (high)", () => {
      const r = classifyPageType({
        url: "https://tabelog.com/tokyo/A1304/A130401/13123456/",
        title: "麺屋〇〇 (新宿/ラーメン)",
      });
      expect(r.pageType).toBe("third_party_listing");
      expect(r.confidence).toBe("high");
      expect(r.signals.domainHit).toBe("tabelog.com");
    });

    it("retty 店舗詳細 URL は third_party_listing", () => {
      const r = classifyPageType({
        url: "https://retty.me/area/PRE13/ARE2/SUB201/100000012345/",
        title: "麺屋〇〇 - Retty",
      });
      expect(r.pageType).toBe("third_party_listing");
      expect(r.confidence).toBe("high");
    });

    it("r.gnavi.co.jp 店舗ページは third_party_listing", () => {
      const r = classifyPageType({
        url: "https://r.gnavi.co.jp/abc12345/",
        title: "店舗詳細",
      });
      expect(r.pageType).toBe("third_party_listing");
    });

    it("既知リスティングドメインで venue path 未確認でも third_party_listing (medium)", () => {
      const r = classifyPageType({
        url: "https://tabelog.com/help/",
        title: "食べログ ヘルプ",
      });
      expect(r.pageType).toBe("third_party_listing");
      expect(r.confidence).toBe("medium");
    });
  });

  // ─────────────────────────────────────────────
  // official
  // ─────────────────────────────────────────────

  describe("official", () => {
    it("title に『公式サイト』があれば official (medium)", () => {
      const r = classifyPageType({
        url: "https://some-restaurant.jp/",
        title: "〇〇（公式サイト）",
      });
      expect(r.pageType).toBe("official");
      expect(r.confidence).toBe("medium");
    });

    it("title『公式サイト』+ booking path は official (high)", () => {
      const r = classifyPageType({
        url: "https://some-restaurant.jp/reserve",
        title: "〇〇 公式サイト | 予約",
      });
      expect(r.pageType).toBe("official");
      expect(r.confidence).toBe("high");
    });

    it("booking path のみ (unknown 公式) は official (medium)", () => {
      const r = classifyPageType({
        url: "https://custom-restaurant.jp/reservation",
        title: "お店の名前",
      });
      expect(r.pageType).toBe("official");
      expect(r.confidence).toBe("medium");
    });

    it("description のみに公式 signal は official (low)", () => {
      const r = classifyPageType({
        url: "https://custom-restaurant.jp/about",
        title: "店舗案内",
        description: "〇〇の公式サイトです",
      });
      expect(r.pageType).toBe("official");
      expect(r.confidence).toBe("low");
    });
  });

  // ─────────────────────────────────────────────
  // venue_detail (fallback)
  // ─────────────────────────────────────────────

  describe("venue_detail", () => {
    it("未知ドメインの /restaurants/xxx は venue_detail (medium)", () => {
      const r = classifyPageType({
        url: "https://custom-food-blog.jp/restaurants/shinjuku-xxx",
        title: "新宿の隠れ家ラーメン",
      });
      expect(r.pageType).toBe("venue_detail");
      expect(r.confidence).toBe("medium");
    });

    it("未知ドメイン・パスも signal も無い場合は fallback venue_detail (low)", () => {
      const r = classifyPageType({
        url: "https://obscure-blog.jp/some-post",
        title: "ラーメンの話",
      });
      expect(r.pageType).toBe("venue_detail");
      expect(r.confidence).toBe("low");
      expect(r.signals.reason).toBe("fallback");
    });

    it("壊れた URL でもクラッシュせず fallback", () => {
      const r = classifyPageType({
        url: "not-a-url",
        title: "Some Shop",
      });
      expect(r.pageType).toBe("venue_detail");
      expect(r.confidence).toBe("low");
    });
  });

  // ─────────────────────────────────────────────
  // 判定優先順位
  // ─────────────────────────────────────────────

  describe("priority: listicle/news 優先", () => {
    it("tabelog 詳細風 URL でも title listicle なら listicle (誤って third_party_listing に落ちない)", () => {
      const r = classifyPageType({
        url: "https://tabelog.com/tokyo/A1304/A130401/13123456/",
        title: "新宿のラーメン厳選10選",
      });
      expect(r.pageType).toBe("listicle");
      expect(isDirectCandidateBlocked(r.pageType)).toBe(true);
    });

    it("公式風 title でも listicle signal があれば listicle", () => {
      const r = classifyPageType({
        url: "https://shop.example/reserve",
        title: "〇〇公式サイト 人気ラーメン店ランキング",
      });
      expect(r.pageType).toBe("listicle");
    });

    it("予約 partner ドメインでも title news signal があれば news", () => {
      const r = classifyPageType({
        url: "https://www.tablecheck.com/ja/shops/xxx",
        title: "有名店が閉店、リニューアルオープンへ",
      });
      expect(r.pageType).toBe("news");
    });
  });
});

describe("pageTypeClassifier.isDirectCandidateBlocked", () => {
  it("listicle は block される", () => {
    expect(isDirectCandidateBlocked("listicle")).toBe(true);
  });
  it("news は block される", () => {
    expect(isDirectCandidateBlocked("news")).toBe(true);
  });
  it("venue_detail は block されない", () => {
    expect(isDirectCandidateBlocked("venue_detail")).toBe(false);
  });
  it("official は block されない", () => {
    expect(isDirectCandidateBlocked("official")).toBe(false);
  });
  it("reservation_partner は block されない", () => {
    expect(isDirectCandidateBlocked("reservation_partner")).toBe(false);
  });
  it("third_party_listing は block されない", () => {
    expect(isDirectCandidateBlocked("third_party_listing")).toBe(false);
  });
});
