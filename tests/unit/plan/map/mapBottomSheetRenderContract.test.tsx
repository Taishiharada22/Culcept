/**
 * Phase 3-N Map impl sub-phase 9a-impl — MapBottomSheet render contract
 *
 * 検証範囲 (= 9a first-pass、 GPT 補正 「強すぎない first-pass」 + 「機能優先」):
 *   §1 sheet=null → 何も render しない (= 親側で条件分岐不要)
 *   §2 全 field 完全 → 4 段構造 全 render (= dialog / close / icon / time / title / location / meaning)
 *   §3 optional 未指定 → location / meaningText section 非表示
 *   §4 category 5 種 → CATEGORY_CIRCLE_BG_CLASS 適用
 *   §5 a11y (= role dialog / aria-label / aria-modal false / close button label)
 *
 * 不変原則:
 *   - imageUrl は型側で常に undefined (= 9a-pre adapter で保証)、 本 component で表示しない
 *   - 命令形 / 評価形容詞なし (= 中立文体、 機能ラベル 「閉じる」 のみ)
 *   - 規約 24-extended: focus-visible:border-slate-300 (= brand-color 禁止)
 *
 * 設計書:
 *   - components/plan/map/MapBottomSheet.tsx
 *   - lib/plan/map/types.ts (= MapSheetViewModel)
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MapBottomSheet } from "@/components/plan/map/MapBottomSheet";
import type { MapSheetViewModel } from "@/lib/plan/map/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeSheet(overrides: Partial<MapSheetViewModel> & { pinId: string }): MapSheetViewModel {
  return {
    pinId: overrides.pinId,
    category: overrides.category ?? 'cafe',
    timeRange: overrides.timeRange ?? '09:00-11:00',
    title: overrides.title ?? 'タイトル',
    ...(overrides.location !== undefined ? { location: overrides.location } : {}),
    ...(overrides.meaningText !== undefined ? { meaningText: overrides.meaningText } : {}),
    ...(overrides.imageUrl !== undefined ? { imageUrl: overrides.imageUrl } : {}),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 null → empty
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapBottomSheet §1 sheet=null → 何も render しない", () => {
  it("§1.1 null 渡しで empty markup", () => {
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={null} onClose={() => {}} />);
    expect(markup).toBe("");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 完全 field → 4 段構造
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapBottomSheet §2 全 field → 4 段全 render", () => {
  const fullSheet = makeSheet({
    pinId: 'p1',
    category: 'cafe',
    timeRange: '09:00-11:00',
    title: 'カフェ作業',
    location: '甲府駅前カフェ',
    meaningText: '集中して整える時間',
  });

  it("§2.1 dialog role + aria-label + testid 全 render", () => {
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={fullSheet} onClose={() => {}} />);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="false"');
    expect(markup).toContain('aria-label="カフェ作業 の詳細"');
    expect(markup).toContain('data-testid="plan-map-bottom-sheet"');
  });

  it("§2.2 close button (= ✕) と a11y label", () => {
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={fullSheet} onClose={() => {}} />);
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-close"');
    expect(markup).toContain('aria-label="詳細を閉じる"');
  });

  it("§2.3 category 大 icon (= circle bg)", () => {
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={fullSheet} onClose={() => {}} />);
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-icon"');
    expect(markup).toContain('bg-indigo-500'); // cafe color
  });

  it("§2.4 timeRange (= category color text)", () => {
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={fullSheet} onClose={() => {}} />);
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-time-range"');
    expect(markup).toContain('09:00-11:00');
    expect(markup).toContain('text-indigo-600'); // cafe color
  });

  it("§2.5 title (= 太字 黒)", () => {
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={fullSheet} onClose={() => {}} />);
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-title"');
    expect(markup).toContain('カフェ作業');
    expect(markup).toContain('font-bold');
  });

  it("§2.6 location section + LocationPinIcon (= 絵文字 0)", () => {
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={fullSheet} onClose={() => {}} />);
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-location"');
    expect(markup).toContain('甲府駅前カフェ');
    // 📍 絵文字を使わず SVG icon (= spec §9 絵文字禁止)
    expect(markup).not.toContain('📍');
  });

  it("§2.7 meaningText section + ✨ marker", () => {
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={fullSheet} onClose={() => {}} />);
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-meaning"');
    expect(markup).toContain('集中して整える時間');
    expect(markup).toContain('✨');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 optional 未指定 → 対応 section 非表示
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapBottomSheet §3 optional 未指定 → 対応 section 非表示", () => {
  it("§3.1 location 未指定 → location section 非表示", () => {
    const sheet = makeSheet({ pinId: 'p1', title: 'タイトル', meaningText: '何かの時間' });
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={sheet} onClose={() => {}} />);
    expect(markup).not.toContain('data-testid="plan-map-bottom-sheet-location"');
  });

  it("§3.2 meaningText 未指定 → meaning section 非表示", () => {
    const sheet = makeSheet({ pinId: 'p1', title: 'タイトル', location: '場所' });
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={sheet} onClose={() => {}} />);
    expect(markup).not.toContain('data-testid="plan-map-bottom-sheet-meaning"');
    expect(markup).not.toContain('✨');
  });

  it("§3.3 imageUrl 渡しても image render しない (= 9a-pre adapter で undefined 保証だが、 念のため)", () => {
    // 型外 inject (= 万一渡された場合の防御)
    const sheet = { ...makeSheet({ pinId: 'p1' }), imageUrl: 'http://example.com/img.jpg' } as MapSheetViewModel;
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={sheet} onClose={() => {}} />);
    expect(markup).not.toContain('img');
    expect(markup).not.toContain('http://example.com');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 category 5 種 → 各 color
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapBottomSheet §4 category 5 種 → 各 CATEGORY_CIRCLE_BG_CLASS", () => {
  const cases: Array<{
    category: MapSheetViewModel['category'];
    bg: string;
    timeText: string;
  }> = [
    { category: 'cafe', bg: 'bg-indigo-500', timeText: 'text-indigo-600' },
    { category: 'meal', bg: 'bg-orange-500', timeText: 'text-orange-600' },
    { category: 'work', bg: 'bg-blue-500', timeText: 'text-blue-600' },
    { category: 'home', bg: 'bg-emerald-500', timeText: 'text-emerald-600' },
    { category: 'other', bg: 'bg-slate-500', timeText: 'text-slate-600' },
  ];

  for (const c of cases) {
    it(`§4.${c.category} → ${c.bg} + ${c.timeText}`, () => {
      const sheet = makeSheet({ pinId: 'p1', category: c.category });
      const markup = renderToStaticMarkup(<MapBottomSheet sheet={sheet} onClose={() => {}} />);
      expect(markup).toContain(c.bg);
      expect(markup).toContain(c.timeText);
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 規約 24-extended: focus-visible:border-slate-300
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapBottomSheet §5 規約 24-extended", () => {
  it("§5.1 close button に focus-visible:border-slate-300 (= brand-color focus 禁止)", () => {
    const sheet = makeSheet({ pinId: 'p1' });
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={sheet} onClose={() => {}} />);
    expect(markup).toContain('focus-visible:border-slate-300');
    // brand-color indigo/blue を focus に使っていないこと
    expect(markup).not.toContain('focus-visible:border-indigo');
    expect(markup).not.toContain('focus-visible:ring-indigo');
  });
});
