/**
 * formatLocationDisplayParts — pure helper tests (Phase 2-F)
 *
 * 設計書: docs/alter-plan-phase2-f-display-coherence-mini-design.md §10
 *
 * 検証範囲:
 *   - canonical text の displayName 抽出 + secondary + fullLabel
 *   - free text の primary そのまま、secondary なし
 *   - malformed canonical の locationText.trim() fallback (= 補正 2)
 *   - multiple separator の parseCanonicalLocationText 仕様通り
 *   - categoryLabel === primary (trim normalize) で displayCategoryLabel 抑制 (= 補正 6)
 *   - locationCategory のみ (locationText 空) で categoryLabel のみ返す
 *   - fullLabel に categoryLabel を含めない (= 補正 5)
 *   - sensitive anchor も helper 通常通り (UI 側で privacy 配慮)
 *   - pure / deterministic / mutation 不変
 *
 * GPT/CEO 補正 1-7 反映:
 *   - 補正 1: formatLocation(anchor) は不変
 *   - 補正 2: locationText.trim() fallback で保存情報を消さない
 *   - 補正 3: locationCategory と canonical text を混ぜて parse しない
 *   - 補正 5: fullLabel = primary + "、" (全角読点) + secondary、categoryLabel 含めず
 *   - 補正 6: categoryLabel === primary (trim normalize) なら displayCategoryLabel = undefined
 *   - 補正 7: success criteria は「認知負荷が下がった」 (smoke で確認、本 unit test は helper 仕様)
 */

import { describe, it, expect } from "vitest";

import type {
  ExternalAnchor,
  OneOffExternalAnchor,
  AnchorSensitiveCategory,
} from "@/lib/plan/external-anchor";
import {
  formatLocation,
  formatLocationDisplayParts,
  type LocationDisplayParts,
} from "@/lib/plan/anchor-detail-format";
import type { LocationCategory } from "@/lib/plan/location-category";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixture builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface FixtureOpts {
  id?: string;
  locationText?: string | null;
  locationCategory?: LocationCategory;
  sensitive?: AnchorSensitiveCategory;
}

function anchor(opts: FixtureOpts = {}): OneOffExternalAnchor {
  const a: OneOffExternalAnchor = {
    id: opts.id ?? "a-test",
    userId: "u-test",
    title: "test anchor",
    startTime: "09:00",
    rigidity: "soft",
    sourceId: "src-test",
    confirmedAt: "2026-05-21T00:00:00Z",
    anchorKind: "one_off",
    date: "2026-05-25",
  };
  if (opts.locationText !== undefined) {
    // null も渡したいので cast (helper の defensive 性 test)
    a.locationText = (opts.locationText ?? undefined) as string;
  }
  if (opts.locationCategory) {
    a.locationCategory = opts.locationCategory;
  }
  if (opts.sensitive) {
    a.sensitiveCategory = opts.sensitive;
  }
  return a;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatLocationDisplayParts", () => {
  // ─── canonical text の分解 ───

  describe("canonical text", () => {
    it("standard canonical (locationCategory なし) → primary / secondary / fullLabel", () => {
      const r = formatLocationDisplayParts(
        anchor({
          locationText: "スターバックス 成田空港店 · 千葉県成田市古込1番地",
        }),
      );
      expect(r.primary).toBe("スターバックス 成田空港店");
      expect(r.secondary).toBe("千葉県成田市古込1番地");
      expect(r.fullLabel).toBe(
        "スターバックス 成田空港店、千葉県成田市古込1番地",
      );
      expect(r.categoryLabel).toBeUndefined();
      expect(r.displayCategoryLabel).toBeUndefined();
    });

    it("canonical + categoryLabel (異なる) → 両表示、fullLabel は category 含めず", () => {
      const r = formatLocationDisplayParts(
        anchor({
          locationText: "スターバックス 成田空港店 · 千葉県成田市古込1番地",
          locationCategory: "cafe",
        }),
      );
      expect(r.categoryLabel).toBe("カフェ");
      expect(r.displayCategoryLabel).toBe("カフェ");
      expect(r.primary).toBe("スターバックス 成田空港店");
      expect(r.secondary).toBe("千葉県成田市古込1番地");
      // 補正 5: categoryLabel は fullLabel に含めない
      expect(r.fullLabel).toBe(
        "スターバックス 成田空港店、千葉県成田市古込1番地",
      );
      expect(r.fullLabel).not.toContain("カフェ");
    });
  });

  // ─── free text の分解 ───

  describe("free text", () => {
    it("free text (canonical separator なし) → primary のみ、fullLabel も primary のみ", () => {
      const r = formatLocationDisplayParts(anchor({ locationText: "自宅" }));
      expect(r.primary).toBe("自宅");
      expect(r.secondary).toBeUndefined();
      expect(r.fullLabel).toBe("自宅");
      expect(r.categoryLabel).toBeUndefined();
    });
  });

  // ─── malformed canonical (補正 2 fallback) ───

  describe("malformed canonical (補正 2 fallback)", () => {
    it('displayName 空 " · 千葉県成田市" → primary に locationText.trim() fallback (= 消えない)', () => {
      const r = formatLocationDisplayParts(
        anchor({ locationText: " · 千葉県成田市" }),
      );
      // parseCanonicalLocationText は trim 後 "· 千葉県成田市" を 1 part として扱う (separator 前 \s+ 無し)
      // displayName = "· 千葉県成田市", address = null → primary = "· 千葉県成田市", secondary undefined
      expect(r.primary).toBe("· 千葉県成田市");
      expect(r.secondary).toBeUndefined();
      expect(r.fullLabel).toBe("· 千葉県成田市");
    });

    it('address 空 "スタバ · " → primary = "スタバ"、secondary undefined', () => {
      const r = formatLocationDisplayParts(anchor({ locationText: "スタバ · " }));
      // parseCanonicalLocationText: trim 後 "スタバ ·" → separator 後 \s+ 無し → 1 part
      // displayName = "スタバ ·", address = null → primary = "スタバ ·"
      // (補正 2: displayName 空でないので fallback 不要、parse 結果そのまま)
      expect(r.primary).toBe("スタバ ·");
      expect(r.secondary).toBeUndefined();
    });

    it('separator のみ " · " → primary = "·" (fallback)', () => {
      const r = formatLocationDisplayParts(anchor({ locationText: " · " }));
      // trim 後 "·" → primary "·"
      expect(r.primary).toBe("·");
      expect(r.secondary).toBeUndefined();
      expect(r.fullLabel).toBe("·");
    });
  });

  // ─── multiple separator ───

  describe("multiple separator (parseCanonicalLocationText 仕様継承)", () => {
    it('"Cafe · 渋谷区 · 別住所" → primary = "Cafe"、secondary = "渋谷区 · 別住所"', () => {
      const r = formatLocationDisplayParts(
        anchor({ locationText: "Cafe · 渋谷区 · 別住所" }),
      );
      expect(r.primary).toBe("Cafe");
      expect(r.secondary).toBe("渋谷区 · 別住所");
      expect(r.fullLabel).toBe("Cafe、渋谷区 · 別住所");
    });
  });

  // ─── category only (locationText 空) ───

  describe("category only (locationText 空)", () => {
    it("category のみ → categoryLabel + displayCategoryLabel のみ、primary undefined", () => {
      const r = formatLocationDisplayParts(
        anchor({ locationText: "", locationCategory: "cafe" }),
      );
      expect(r.categoryLabel).toBe("カフェ");
      expect(r.displayCategoryLabel).toBe("カフェ");
      expect(r.primary).toBeUndefined();
      expect(r.secondary).toBeUndefined();
      expect(r.fullLabel).toBeUndefined();
    });

    it("whitespace-only locationText + category → category のみ返す", () => {
      const r = formatLocationDisplayParts(
        anchor({ locationText: "   ", locationCategory: "office" }),
      );
      expect(r.categoryLabel).toBe("職場");
      expect(r.displayCategoryLabel).toBe("職場");
      expect(r.primary).toBeUndefined();
    });
  });

  // ─── duplicate suppression (補正 6) ───
  //   LOCATION_CATEGORY_LABEL は: home="家" / office="職場" / cafe="カフェ" etc.
  //   user が locationText に同じ label 文字列を入れた場合に重複発生

  describe("補正 6: categoryLabel === primary 重複抑制", () => {
    it('locationCategory="cafe" + locationText="カフェ" → displayCategoryLabel undefined', () => {
      const r = formatLocationDisplayParts(
        anchor({ locationText: "カフェ", locationCategory: "cafe" }),
      );
      expect(r.categoryLabel).toBe("カフェ");
      // 補正 6: categoryLabel === primary → 抑制
      expect(r.displayCategoryLabel).toBeUndefined();
      expect(r.primary).toBe("カフェ");
      expect(r.fullLabel).toBe("カフェ");
    });

    it("trim normalize 後同一 (locationText に末尾 space) → 抑制", () => {
      const r = formatLocationDisplayParts(
        anchor({ locationText: "家 ", locationCategory: "home" }),
      );
      expect(r.categoryLabel).toBe("家");
      expect(r.displayCategoryLabel).toBeUndefined(); // trim normalize で同一
      expect(r.primary).toBe("家"); // text.trim() で primary = "家"
    });

    it("異なる場合 (categoryLabel != primary) は両表示", () => {
      const r = formatLocationDisplayParts(
        anchor({
          locationText: "カフェ・ベローチェ",
          locationCategory: "cafe", // = "カフェ"
        }),
      );
      expect(r.categoryLabel).toBe("カフェ");
      expect(r.displayCategoryLabel).toBe("カフェ"); // 異なるので両表示
      expect(r.primary).toBe("カフェ・ベローチェ");
    });

    it('home category と "自宅" 入力は label 不一致 (= "家" != "自宅") なので両表示', () => {
      // 実 LOCATION_CATEGORY_LABEL["home"] = "家" (= "自宅" ではない)
      const r = formatLocationDisplayParts(
        anchor({ locationText: "自宅", locationCategory: "home" }),
      );
      expect(r.categoryLabel).toBe("家");
      expect(r.displayCategoryLabel).toBe("家"); // 異なるので両表示
      expect(r.primary).toBe("自宅");
    });
  });

  // ─── empty / null safety ───

  describe("empty / null safety", () => {
    it("locationText 空 + category なし → empty object {}", () => {
      const r = formatLocationDisplayParts(anchor({ locationText: "" }));
      expect(r).toEqual({});
    });

    it("locationText null + category なし → empty object {}", () => {
      const r = formatLocationDisplayParts(anchor({ locationText: null }));
      expect(r).toEqual({});
    });

    it("locationText whitespace-only + category なし → empty object", () => {
      const r = formatLocationDisplayParts(anchor({ locationText: "   " }));
      expect(r).toEqual({});
    });
  });

  // ─── sensitive anchor ───

  describe("sensitive anchor", () => {
    it("sensitive anchor も helper は通常通り判定 (= UI 側で privacy 配慮)", () => {
      const r = formatLocationDisplayParts(
        anchor({
          locationText: "スターバックス 成田空港店 · 千葉県成田市古込1番地",
          sensitive: "medical",
        }),
      );
      // helper は sensitive を考慮しない (= 時刻重なり helper と同思想)
      expect(r.primary).toBe("スターバックス 成田空港店");
      expect(r.secondary).toBe("千葉県成田市古込1番地");
      expect(r.fullLabel).toBe(
        "スターバックス 成田空港店、千葉県成田市古込1番地",
      );
    });
  });

  // ─── fullLabel composition rule (補正 5) ───

  describe("補正 5: fullLabel は primary + secondary、categoryLabel 含めない", () => {
    it("secondary なし時 → fullLabel = primary のみ", () => {
      const r = formatLocationDisplayParts(anchor({ locationText: "自宅" }));
      expect(r.fullLabel).toBe("自宅");
    });

    it("categoryLabel あり + canonical → fullLabel に category 含めない (strict)", () => {
      const r = formatLocationDisplayParts(
        anchor({
          locationText: "スターバックス · 千葉県",
          locationCategory: "cafe",
        }),
      );
      expect(r.categoryLabel).toBe("カフェ");
      expect(r.fullLabel).toBe("スターバックス、千葉県");
      // 補正 5: fullLabel に "カフェ" が含まれない
      expect(r.fullLabel).not.toContain("カフェ");
    });
  });

  // ─── pure / immutability ───

  describe("pure / immutability", () => {
    it("deterministic: 同入力で同出力", () => {
      const a = anchor({ locationText: "スターバックス · 千葉県" });
      const r1 = formatLocationDisplayParts(a);
      const r2 = formatLocationDisplayParts(a);
      expect(r1).toEqual(r2);
    });

    it("入力 anchor を mutate しない", () => {
      const a = anchor({
        locationText: "スターバックス · 千葉県",
        locationCategory: "cafe",
      });
      const snapshot = JSON.stringify(a);
      formatLocationDisplayParts(a);
      expect(JSON.stringify(a)).toBe(snapshot);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// formatLocation (既存) の不変性確認 (= 補正 1 遵守、他 caller を壊さない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatLocation (existing) — 補正 1 不変保証", () => {
  it('locationCategory="cafe" + locationText="スタバ" → "カフェ / スタバ" (1 行結合 / 既存仕様)', () => {
    const r = formatLocation(
      anchor({ locationText: "スタバ", locationCategory: "cafe" }),
    );
    expect(r).toBe("カフェ / スタバ");
  });

  it("locationCategory のみ → category label", () => {
    expect(
      formatLocation(anchor({ locationText: "", locationCategory: "cafe" })),
    ).toBe("カフェ");
  });

  it("locationText のみ → そのまま (canonical でも fullText)", () => {
    expect(
      formatLocation(anchor({ locationText: "スタバ · 千葉県" })),
    ).toBe("スタバ · 千葉県");
  });

  it("両方なし → 「場所未指定」", () => {
    expect(formatLocation(anchor())).toBe("場所未指定");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Type-level smoke: LocationDisplayParts は public export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("LocationDisplayParts type", () => {
  it("public 型として import 可能", () => {
    const p: LocationDisplayParts = { primary: "test", fullLabel: "test" };
    expect(p.primary).toBe("test");
  });
});
