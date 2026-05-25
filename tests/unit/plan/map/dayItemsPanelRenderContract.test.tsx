/**
 * Phase 3-N Map impl sub-phase 9a-impl Step δ — DayItemsPanel render contract
 *
 * 検証範囲 (= Step δ 左下リスト/凡例 hybrid):
 *   §1 items empty → null (= 何も render しない)
 *   §2 items あり → list + 各 row + chevron 全 render
 *   §3 category 5 種 → 各 表示名 + bg class
 *   §4 selected row 強調 (= aria-current + bg)
 *   §5 a11y (= ul/li 構造、 button aria-label、 chevron aria-label)
 *   §6 規約 24-extended + 絵文字
 *
 * 設計書:
 *   - components/plan/map/DayItemsPanel.tsx
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DayItemsPanel,
  type DayItem,
} from "@/components/plan/map/DayItemsPanel";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DayItemsPanel §1 items empty → null", () => {
  it("§1.1 items=[] で empty markup", () => {
    const markup = renderToStaticMarkup(
      <DayItemsPanel items={[]} selectedId={null} onItemTap={() => {}} />,
    );
    expect(markup).toBe("");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DayItemsPanel §2 items あり → 全 render", () => {
  const items: DayItem[] = [
    { anchorId: 'a1', category: 'cafe' },
    { anchorId: 'a2', category: 'meal' },
    { anchorId: 'a3', category: 'work' },
    { anchorId: 'a4', category: 'home' },
  ];

  it("§2.1 panel container + list + toggle 全 testid", () => {
    const markup = renderToStaticMarkup(
      <DayItemsPanel items={items} selectedId={null} onItemTap={() => {}} />,
    );
    expect(markup).toContain('data-testid="plan-map-day-items-panel"');
    expect(markup).toContain('data-testid="plan-map-day-items-list"');
    expect(markup).toContain('data-testid="plan-map-day-items-toggle"');
  });

  it("§2.2 各 anchor の row testid 含む", () => {
    const markup = renderToStaticMarkup(
      <DayItemsPanel items={items} selectedId={null} onItemTap={() => {}} />,
    );
    expect(markup).toContain('data-testid="plan-map-day-items-row-a1"');
    expect(markup).toContain('data-testid="plan-map-day-items-row-a2"');
    expect(markup).toContain('data-testid="plan-map-day-items-row-a3"');
    expect(markup).toContain('data-testid="plan-map-day-items-row-a4"');
  });

  it("§2.3 各 category 表示名 (= カフェ / ランチ / オフィス / 帰宅) 表示", () => {
    const markup = renderToStaticMarkup(
      <DayItemsPanel items={items} selectedId={null} onItemTap={() => {}} />,
    );
    expect(markup).toContain('カフェ');
    expect(markup).toContain('ランチ');
    expect(markup).toContain('オフィス');
    expect(markup).toContain('帰宅');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DayItemsPanel §3 category 5 種 → 各 bg class", () => {
  const cases: Array<{ category: DayItem['category']; bg: string; displayName: string }> = [
    { category: 'cafe', bg: 'bg-indigo-500', displayName: 'カフェ' },
    { category: 'meal', bg: 'bg-orange-500', displayName: 'ランチ' },
    { category: 'work', bg: 'bg-blue-500', displayName: 'オフィス' },
    { category: 'home', bg: 'bg-emerald-500', displayName: '帰宅' },
    { category: 'other', bg: 'bg-slate-500', displayName: 'その他' },
  ];

  for (const c of cases) {
    it(`§3.${c.category} → bg ${c.bg} + displayName "${c.displayName}"`, () => {
      const items: DayItem[] = [{ anchorId: 'p', category: c.category }];
      const markup = renderToStaticMarkup(
        <DayItemsPanel items={items} selectedId={null} onItemTap={() => {}} />,
      );
      expect(markup).toContain(c.bg);
      expect(markup).toContain(c.displayName);
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DayItemsPanel §4 selected row 強調", () => {
  const items: DayItem[] = [
    { anchorId: 'a1', category: 'cafe' },
    { anchorId: 'a2', category: 'meal' },
  ];

  it("§4.1 selectedId='a1' → a1 row に aria-current=true", () => {
    const markup = renderToStaticMarkup(
      <DayItemsPanel items={items} selectedId="a1" onItemTap={() => {}} />,
    );
    expect(markup).toMatch(/data-testid="plan-map-day-items-row-a1"[^>]*aria-current="true"|aria-current="true"[^>]*data-testid="plan-map-day-items-row-a1"/);
  });

  it("§4.2 selectedId='a1' → a2 row に aria-current なし", () => {
    const markup = renderToStaticMarkup(
      <DayItemsPanel items={items} selectedId="a1" onItemTap={() => {}} />,
    );
    // a2 row には aria-current=true がない
    const a2Match = markup.match(/<button[^>]*data-testid="plan-map-day-items-row-a2"[^>]*>/);
    expect(a2Match).toBeTruthy();
    expect(a2Match?.[0]).not.toContain('aria-current="true"');
  });

  it("§4.3 selectedId='a1' → a1 row に bg-slate-100 + font-semibold", () => {
    const markup = renderToStaticMarkup(
      <DayItemsPanel items={items} selectedId="a1" onItemTap={() => {}} />,
    );
    // a1 row class 内に強調
    const a1Match = markup.match(/<button[^>]*data-testid="plan-map-day-items-row-a1"[^>]*>/);
    expect(a1Match).toBeTruthy();
    expect(a1Match?.[0]).toContain('bg-slate-100');
    expect(a1Match?.[0]).toContain('font-semibold');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DayItemsPanel §5 a11y", () => {
  it("§5.1 ul / li 構造", () => {
    const items: DayItem[] = [{ anchorId: 'p', category: 'cafe' }];
    const markup = renderToStaticMarkup(
      <DayItemsPanel items={items} selectedId={null} onItemTap={() => {}} />,
    );
    expect(markup).toContain('<ul');
    expect(markup).toContain('<li');
  });

  it("§5.2 row button aria-label に「{表示名} の予定を選択」", () => {
    const items: DayItem[] = [{ anchorId: 'p', category: 'cafe' }];
    const markup = renderToStaticMarkup(
      <DayItemsPanel items={items} selectedId={null} onItemTap={() => {}} />,
    );
    expect(markup).toContain('aria-label="カフェ の予定を選択"');
  });

  it("§5.3 chevron button aria-label", () => {
    const items: DayItem[] = [{ anchorId: 'p', category: 'cafe' }];
    const markup = renderToStaticMarkup(
      <DayItemsPanel items={items} selectedId={null} onItemTap={() => {}} />,
    );
    // default = !collapsed = 折りたたむ button
    expect(markup).toContain('aria-label="当日リストを折りたたむ"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DayItemsPanel §6 規約 24-extended + 絵文字", () => {
  it("§6.1 focus-visible:border-slate-300 (= brand-color 禁止)", () => {
    const items: DayItem[] = [{ anchorId: 'p', category: 'cafe' }];
    const markup = renderToStaticMarkup(
      <DayItemsPanel items={items} selectedId={null} onItemTap={() => {}} />,
    );
    expect(markup).toContain('focus-visible:border-slate-300');
    expect(markup).not.toContain('focus-visible:border-indigo');
    expect(markup).not.toContain('focus-visible:ring-indigo');
  });

  it("§6.2 絵文字 0 (= 全 SVG)", () => {
    const items: DayItem[] = [
      { anchorId: 'a1', category: 'cafe' },
      { anchorId: 'a2', category: 'meal' },
      { anchorId: 'a3', category: 'work' },
      { anchorId: 'a4', category: 'home' },
    ];
    const markup = renderToStaticMarkup(
      <DayItemsPanel items={items} selectedId={null} onItemTap={() => {}} />,
    );
    expect(markup).not.toContain('📍');
    expect(markup).not.toContain('✨');
    expect(markup).not.toContain('☕');
    expect(markup).not.toContain('🍴');
    expect(markup).not.toContain('💼');
    expect(markup).not.toContain('🏠');
  });
});
