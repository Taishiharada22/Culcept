/**
 * Phase 2-I: categoryIconMap.ts — pure helper tests
 *
 * 設計書: docs/alter-plan-phase2-i-category-icon-system-mini-design.md §9.1
 *
 * 検証範囲:
 *   - 8 LocationCategory への component mapping (CATEGORY_ICON_MAP completeness)
 *   - pickCategoryIcon の優先順位 (sensitive > category > undefined fallback)
 *   - sensitive anchor で必ず CategorySensitiveIcon (= privacy 優先)
 *   - 各 icon component が SVG element を render する (smoke)
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as React from "react";

import {
  CategoryHomeIcon,
  CategoryOfficeIcon,
  CategorySchoolIcon,
  CategoryCafeIcon,
  CategoryOutdoorIcon,
  CategoryPublicIcon,
  CategoryTransitIcon,
  CategoryUnknownIcon,
  CategorySensitiveIcon,
} from "@/components/ui/icons/category";
import {
  CATEGORY_ICON_MAP,
  SENSITIVE_CATEGORY_ICON,
  pickCategoryIcon,
} from "@/lib/plan/categoryIconMap";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CATEGORY_ICON_MAP", () => {
  it("8 LocationCategory 全てに component が mapping されている", () => {
    expect(CATEGORY_ICON_MAP.home).toBe(CategoryHomeIcon);
    expect(CATEGORY_ICON_MAP.office).toBe(CategoryOfficeIcon);
    expect(CATEGORY_ICON_MAP.school).toBe(CategorySchoolIcon);
    expect(CATEGORY_ICON_MAP.cafe).toBe(CategoryCafeIcon);
    expect(CATEGORY_ICON_MAP.outdoor).toBe(CategoryOutdoorIcon);
    expect(CATEGORY_ICON_MAP.public).toBe(CategoryPublicIcon);
    expect(CATEGORY_ICON_MAP.transit).toBe(CategoryTransitIcon);
    expect(CATEGORY_ICON_MAP.unknown).toBe(CategoryUnknownIcon);
  });

  it("SENSITIVE_CATEGORY_ICON は CategorySensitiveIcon", () => {
    expect(SENSITIVE_CATEGORY_ICON).toBe(CategorySensitiveIcon);
  });
});

describe("pickCategoryIcon", () => {
  describe("LocationCategory mapping (= 8 値)", () => {
    it("home → CategoryHomeIcon", () => {
      expect(pickCategoryIcon({ category: "home" })).toBe(CategoryHomeIcon);
    });
    it("office → CategoryOfficeIcon", () => {
      expect(pickCategoryIcon({ category: "office" })).toBe(CategoryOfficeIcon);
    });
    it("school → CategorySchoolIcon", () => {
      expect(pickCategoryIcon({ category: "school" })).toBe(CategorySchoolIcon);
    });
    it("cafe → CategoryCafeIcon", () => {
      expect(pickCategoryIcon({ category: "cafe" })).toBe(CategoryCafeIcon);
    });
    it("outdoor → CategoryOutdoorIcon", () => {
      expect(pickCategoryIcon({ category: "outdoor" })).toBe(CategoryOutdoorIcon);
    });
    it("public → CategoryPublicIcon", () => {
      expect(pickCategoryIcon({ category: "public" })).toBe(CategoryPublicIcon);
    });
    it("transit → CategoryTransitIcon", () => {
      expect(pickCategoryIcon({ category: "transit" })).toBe(CategoryTransitIcon);
    });
    it("unknown → CategoryUnknownIcon", () => {
      expect(pickCategoryIcon({ category: "unknown" })).toBe(CategoryUnknownIcon);
    });
  });

  describe("sensitive 優先 (= privacy 配慮)", () => {
    it("sensitive=true のみ → CategorySensitiveIcon", () => {
      expect(pickCategoryIcon({ sensitive: true })).toBe(CategorySensitiveIcon);
    });

    it("sensitive=true + category=cafe → CategorySensitiveIcon (= category 無視)", () => {
      expect(
        pickCategoryIcon({ category: "cafe", sensitive: true }),
      ).toBe(CategorySensitiveIcon);
    });

    it("sensitive=true + category=home → CategorySensitiveIcon", () => {
      expect(
        pickCategoryIcon({ category: "home", sensitive: true }),
      ).toBe(CategorySensitiveIcon);
    });

    it("sensitive=false → category 通り", () => {
      expect(pickCategoryIcon({ category: "cafe", sensitive: false })).toBe(
        CategoryCafeIcon,
      );
    });
  });

  describe("undefined / fallback", () => {
    it("category undefined + sensitive undefined → CategoryUnknownIcon (= fallback)", () => {
      expect(pickCategoryIcon({})).toBe(CategoryUnknownIcon);
    });

    it("category undefined + sensitive=true → CategorySensitiveIcon (= sensitive 優先)", () => {
      expect(pickCategoryIcon({ sensitive: true })).toBe(CategorySensitiveIcon);
    });
  });

  describe('"none" (LocationGroupKey、 MapTab CategoryGrid 用)', () => {
    it('category="none" → CategoryUnknownIcon (= 「場所なし」 を unknown と同視)', () => {
      expect(pickCategoryIcon({ category: "none" })).toBe(CategoryUnknownIcon);
    });

    it('category="none" + sensitive=true → CategorySensitiveIcon (= sensitive 優先)', () => {
      expect(pickCategoryIcon({ category: "none", sensitive: true })).toBe(
        CategorySensitiveIcon,
      );
    });
  });

  describe("defensive: helper は必ず component を返す (undefined を返さない)", () => {
    it.each(["home", "office", "school", "cafe", "outdoor", "public", "transit", "unknown", "none"] as const)(
      'category="%s" → 必ず component (= undefined ではない)',
      (cat) => {
        const Icon = pickCategoryIcon({ category: cat });
        expect(Icon).toBeDefined();
        expect(typeof Icon).toBe("function");
      },
    );

    it("sensitive=true + 任意 category → 必ず component", () => {
      const Icon = pickCategoryIcon({ category: "none", sensitive: true });
      expect(Icon).toBeDefined();
      expect(typeof Icon).toBe("function");
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Icon component の render smoke
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Category icon components — render smoke", () => {
  const allIcons = [
    { name: "Home", Comp: CategoryHomeIcon },
    { name: "Office", Comp: CategoryOfficeIcon },
    { name: "School", Comp: CategorySchoolIcon },
    { name: "Cafe", Comp: CategoryCafeIcon },
    { name: "Outdoor", Comp: CategoryOutdoorIcon },
    { name: "Public", Comp: CategoryPublicIcon },
    { name: "Transit", Comp: CategoryTransitIcon },
    { name: "Unknown", Comp: CategoryUnknownIcon },
    { name: "Sensitive", Comp: CategorySensitiveIcon },
  ];

  it.each(allIcons)("Category$name → SVG render (default size 24, currentColor)", ({ Comp }) => {
    const html = renderToStaticMarkup(React.createElement(Comp));
    expect(html).toContain("<svg");
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('stroke-width="1.5"');
    expect(html).toContain('width="24"');
    expect(html).toContain('height="24"');
    expect(html).toContain('viewBox="0 0 24 24"');
  });

  it("size prop で width/height 変化", () => {
    const html = renderToStaticMarkup(React.createElement(CategoryHomeIcon, { size: 16 }));
    expect(html).toContain('width="16"');
    expect(html).toContain('height="16"');
  });

  it("title prop → <title> 要素を含む (= hover tooltip)", () => {
    const html = renderToStaticMarkup(
      React.createElement(CategoryHomeIcon, { title: "自分の聖域" }),
    );
    expect(html).toContain("<title>自分の聖域</title>");
  });

  it("title prop あり → role=img + aria-label undefined (= interactive)", () => {
    const html = renderToStaticMarkup(
      React.createElement(CategoryHomeIcon, { title: "自分の聖域" }),
    );
    expect(html).toContain('role="img"');
    expect(html).not.toContain('aria-hidden="true"');
  });

  it("ariaLabel prop → aria-label に反映", () => {
    const html = renderToStaticMarkup(
      React.createElement(CategoryCafeIcon, { ariaLabel: "カフェ" }),
    );
    expect(html).toContain('aria-label="カフェ"');
    expect(html).toContain('role="img"');
  });

  it("title / ariaLabel なし → aria-hidden=true (= decorative)", () => {
    const html = renderToStaticMarkup(React.createElement(CategoryHomeIcon));
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
  });

  it("className prop が SVG に渡る", () => {
    const html = renderToStaticMarkup(
      React.createElement(CategoryHomeIcon, { className: "w-5 h-5 text-indigo-500" }),
    );
    expect(html).toContain('class="w-5 h-5 text-indigo-500"');
  });

  it("Sensitive icon は内容露出しない抽象 shape (= privacy)", () => {
    const html = renderToStaticMarkup(React.createElement(CategorySensitiveIcon));
    // shield outline path が含まれる、 detail 露出なし
    expect(html).toContain("<path");
    // medical / lock / 警告色 を示唆する記号なし
    expect(html).not.toContain("amber");
    expect(html).not.toContain("red");
    expect(html).not.toContain("warning");
  });
});
