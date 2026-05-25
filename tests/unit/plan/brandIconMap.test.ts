/**
 * Phase 2-I 拡張: brandIconMap.ts — pure helper tests
 *
 * 検証範囲:
 *   - 20 brand keyword → 正しい component 選択
 *   - 略称 / 英語名 / 漢字 すべて keyword match
 *   - 該当なし → null
 *   - sensitive (= 呼出側) は本 helper を bypass する設計、 ここでは brand-only test
 *   - render smoke (= 各 brand icon が <svg> を返し、 brand color を含む)
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as React from "react";

import { pickBrandIcon, BRAND_ICON_KEYWORDS } from "@/lib/plan/brandIconMap";
import {
  BrandStarbucksIcon,
  BrandDoutorIcon,
  BrandTullysIcon,
  BrandKomedaIcon,
  BrandMcDonaldsIcon,
  BrandMosBurgerIcon,
  BrandKfcIcon,
  BrandSubwayIcon,
  BrandYoshinoyaIcon,
  BrandSukiyaIcon,
  BrandMatsuyaIcon,
  BrandSevenElevenIcon,
  BrandLawsonIcon,
  BrandFamilyMartIcon,
  BrandStationIcon,
  BrandAirportIcon,
  BrandHospitalIcon,
  BrandSalonIcon,
  BrandBankIcon,
  BrandDepartmentStoreIcon,
} from "@/components/ui/icons/brand";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("BRAND_ICON_KEYWORDS", () => {
  it("20 brand entries are registered", () => {
    expect(BRAND_ICON_KEYWORDS).toHaveLength(20);
  });

  it("each entry has brand / keywords / icon / displayName", () => {
    for (const entry of BRAND_ICON_KEYWORDS) {
      expect(entry.brand).toBeTruthy();
      expect(entry.keywords.length).toBeGreaterThan(0);
      expect(entry.icon).toBeDefined();
      expect(entry.displayName).toBeTruthy();
    }
  });
});

describe("pickBrandIcon — keyword matching", () => {
  it.each([
    ["スターバックス 成田空港店", "starbucks", BrandStarbucksIcon, "スターバックス"],
    ["スタバ 渋谷", "starbucks", BrandStarbucksIcon, "スターバックス"],
    ["Starbucks Shibuya", "starbucks", BrandStarbucksIcon, "スターバックス"],
    ["ドトール 新宿", "doutor", BrandDoutorIcon, "ドトール"],
    ["タリーズ 銀座", "tullys", BrandTullysIcon, "タリーズ"],
    ["コメダ珈琲店 名古屋本店", "komeda", BrandKomedaIcon, "コメダ珈琲店"],
    ["マクドナルド 池袋", "mcdonalds", BrandMcDonaldsIcon, "マクドナルド"],
    ["マック 渋谷店", "mcdonalds", BrandMcDonaldsIcon, "マクドナルド"],
    ["モスバーガー 高円寺", "mosburger", BrandMosBurgerIcon, "モスバーガー"],
    ["ケンタッキー 上野", "kfc", BrandKfcIcon, "ケンタッキー"],
    ["KFC Shinjuku", "kfc", BrandKfcIcon, "ケンタッキー"],
    ["サブウェイ 渋谷", "subway", BrandSubwayIcon, "サブウェイ"],
    ["吉野家 池袋東口店", "yoshinoya", BrandYoshinoyaIcon, "吉野家"],
    ["すき家 新宿三丁目", "sukiya", BrandSukiyaIcon, "すき家"],
    ["松屋 渋谷道玄坂", "matsuya", BrandMatsuyaIcon, "松屋"],
    ["セブンイレブン 渋谷店", "seven_eleven", BrandSevenElevenIcon, "セブンイレブン"],
    ["ローソン 新宿南口", "lawson", BrandLawsonIcon, "ローソン"],
    ["ファミリーマート 渋谷", "family_mart", BrandFamilyMartIcon, "ファミリーマート"],
    ["ファミマ 池袋", "family_mart", BrandFamilyMartIcon, "ファミリーマート"],
    ["新宿駅 南口", "station", BrandStationIcon, "駅"],
    ["成田空港 第1ターミナル", "airport", BrandAirportIcon, "空港"],
    ["渋谷歯科クリニック", "hospital", BrandHospitalIcon, "病院・クリニック"],
    ["田中歯科医院", "hospital", BrandHospitalIcon, "病院・クリニック"],
    ["美容院 リコ", "salon", BrandSalonIcon, "美容院"],
    ["ヘアサロン Take Two", "salon", BrandSalonIcon, "美容院"],
    ["三井住友銀行 渋谷支店", "bank", BrandBankIcon, "銀行"],
    ["伊勢丹 新宿", "department_store", BrandDepartmentStoreIcon, "百貨店"],
    ["高島屋 日本橋", "department_store", BrandDepartmentStoreIcon, "百貨店"],
  ])(
    'locationText="%s" → %s',
    (locationText, expectedBrand, expectedIcon, expectedDisplayName) => {
      const r = pickBrandIcon(locationText);
      expect(r).not.toBeNull();
      expect(r!.brand).toBe(expectedBrand);
      expect(r!.icon).toBe(expectedIcon);
      expect(r!.displayName).toBe(expectedDisplayName);
    },
  );
});

describe("pickBrandIcon — null cases (= category fallback)", () => {
  it.each([
    null,
    undefined,
    "",
    "   ",
    "近所のカフェ", // generic、 brand keyword なし
    "自宅",
    "渋谷",
    "本屋", // brand list に "本屋" なし
    "公園",
  ])("locationText=%s → null", (locationText) => {
    expect(pickBrandIcon(locationText as string | null | undefined)).toBeNull();
  });
});

describe("pickBrandIcon — pure / immutability", () => {
  it("deterministic: 同入力で同出力", () => {
    const r1 = pickBrandIcon("スタバ 渋谷");
    const r2 = pickBrandIcon("スタバ 渋谷");
    expect(r1?.brand).toBe(r2?.brand);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Brand icon component の render smoke
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Brand icon components — render smoke", () => {
  const allBrands = [
    { name: "Starbucks", Comp: BrandStarbucksIcon, color: "#006241" },
    { name: "Doutor", Comp: BrandDoutorIcon, color: "#fcd116" },
    { name: "Tullys", Comp: BrandTullysIcon, color: "#b81f29" },
    { name: "Komeda", Comp: BrandKomedaIcon, color: "#c4a484" },
    { name: "McDonalds", Comp: BrandMcDonaldsIcon, color: "#da291c" },
    { name: "MosBurger", Comp: BrandMosBurgerIcon, color: "#2a8d3e" },
    { name: "Kfc", Comp: BrandKfcIcon, color: "#e4002b" },
    { name: "Subway", Comp: BrandSubwayIcon, color: "#008c15" },
    { name: "Yoshinoya", Comp: BrandYoshinoyaIcon, color: "#f57c1f" },
    { name: "Sukiya", Comp: BrandSukiyaIcon, color: "#c8102e" },
    { name: "Matsuya", Comp: BrandMatsuyaIcon, color: "#f5d514" },
    { name: "SevenEleven", Comp: BrandSevenElevenIcon, color: "#ee7521" },
    { name: "Lawson", Comp: BrandLawsonIcon, color: "#0067b3" },
    { name: "FamilyMart", Comp: BrandFamilyMartIcon, color: "#009f4d" },
    { name: "Station", Comp: BrandStationIcon, color: "#1e3a8a" },
    { name: "Airport", Comp: BrandAirportIcon, color: "#0284c7" },
    { name: "Hospital", Comp: BrandHospitalIcon, color: "#dc2626" },
    { name: "Salon", Comp: BrandSalonIcon, color: "#ec4899" },
    { name: "Bank", Comp: BrandBankIcon, color: "#059669" },
    { name: "DepartmentStore", Comp: BrandDepartmentStoreIcon, color: "#e11d48" },
  ];

  it.each(allBrands)(
    "Brand$name → SVG render with brand color %s",
    ({ Comp, color }) => {
      const html = renderToStaticMarkup(React.createElement(Comp));
      expect(html).toContain("<svg");
      expect(html).toContain('viewBox="0 0 24 24"');
      expect(html.toLowerCase()).toContain(color.toLowerCase());
    },
  );

  it("title prop → <title> + role=img", () => {
    const html = renderToStaticMarkup(
      React.createElement(BrandStarbucksIcon, { title: "スターバックス" }),
    );
    expect(html).toContain("<title>スターバックス</title>");
    expect(html).toContain('role="img"');
  });

  it("decorative (no title / aria) → aria-hidden", () => {
    const html = renderToStaticMarkup(React.createElement(BrandStarbucksIcon));
    expect(html).toContain('aria-hidden="true"');
  });

  it("size prop", () => {
    const html = renderToStaticMarkup(
      React.createElement(BrandStarbucksIcon, { size: 16 }),
    );
    expect(html).toContain('width="16"');
    expect(html).toContain('height="16"');
  });
});
