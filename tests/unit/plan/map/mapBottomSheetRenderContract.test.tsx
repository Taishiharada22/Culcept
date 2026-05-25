/**
 * Phase 3-N Map impl sub-phase 9a-impl Step β — MapBottomSheet 再設計 render contract
 *
 * 検証範囲 (= Step β 8 段構造、 mock 整合):
 *   §1 sheet=null → 何も render しない
 *   §2 全 field 完全 → 8 段全 render (= handle / close / icon / time / title / image / location / meaning / CTA2)
 *   §3 optional 未指定 → location / meaningText section 非表示
 *   §4 category 5 種 → CATEGORY_CIRCLE_BG / TEXT / PLACEHOLDER_BG / MEANING_BG 各
 *   §5 image slot β: imageUrl なし → placeholder (= category 背景 + glyph)、 「画像なし」 文字なし
 *   §6 CTA: onOpenDetail callback / routeUrl 有/無 で 活性/disabled
 *   §7 a11y / 規約 24-extended
 *
 * 不変原則:
 *   - 絵文字 0 (= 全 SVG icon)
 *   - 命令形 / 評価形容詞 / 推奨語 なし
 *
 * 設計書:
 *   - components/plan/map/MapBottomSheet.tsx (Step β)
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

describe("MapBottomSheet Step β §1 sheet=null → empty markup", () => {
  it("§1.1 null 渡しで empty markup", () => {
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={null} onClose={() => {}} />);
    expect(markup).toBe("");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 全 field → 8 段構造
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapBottomSheet Step β §2 全 field → 8 段全 render", () => {
  const fullSheet = makeSheet({
    pinId: 'p1',
    category: 'cafe',
    timeRange: '09:00-11:00',
    title: 'カフェ作業',
    location: '甲府駅前カフェ',
    meaningText: '集中して整える時間',
  });

  it("§2.1 dialog role + aria-label", () => {
    const markup = renderToStaticMarkup(
      <MapBottomSheet
        sheet={fullSheet}
        onClose={() => {}}
        onOpenDetail={() => {}}
        routeUrl="https://example.com/route"
      />,
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="false"');
    expect(markup).toContain('aria-label="カフェ作業 の詳細"');
    expect(markup).toContain('data-testid="plan-map-bottom-sheet"');
  });

  it("§2.2 handle 表示 (= Step β 新規)", () => {
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={fullSheet} onClose={() => {}} />);
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-handle"');
  });

  it("§2.3 close button + a11y", () => {
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={fullSheet} onClose={() => {}} />);
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-close"');
    expect(markup).toContain('aria-label="詳細を閉じる"');
  });

  it("§2.4 row1 = 大 icon + time/title + image slot 全揃い", () => {
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={fullSheet} onClose={() => {}} />);
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-row1"');
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-icon"');
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-time-range"');
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-title"');
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-image-slot"');
    expect(markup).toContain('09:00-11:00');
    expect(markup).toContain('カフェ作業');
  });

  it("§2.5 location row", () => {
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={fullSheet} onClose={() => {}} />);
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-location"');
    expect(markup).toContain('甲府駅前カフェ');
    expect(markup).not.toContain('📍');
  });

  it("§2.6 meaning box (= tint 背景 + SparkleIcon、 ✨ 絵文字代替)", () => {
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={fullSheet} onClose={() => {}} />);
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-meaning"');
    expect(markup).toContain('集中して整える時間');
    // ✨ 絵文字なし、 SparkleIcon SVG で代替
    expect(markup).not.toContain('✨');
  });

  it("§2.7 CTA 2 つ (= 詳細を見る + ここへの経路)", () => {
    const markup = renderToStaticMarkup(
      <MapBottomSheet
        sheet={fullSheet}
        onClose={() => {}}
        onOpenDetail={() => {}}
        routeUrl="https://example.com/route"
      />,
    );
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-cta-row"');
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-detail-cta"');
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-route-cta"');
    expect(markup).toContain('詳細を見る');
    expect(markup).toContain('ここへの経路');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 optional 未指定 → section hide
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapBottomSheet Step β §3 optional 未指定 → section 非表示", () => {
  it("§3.1 location 未指定 → location section 非表示", () => {
    const sheet = makeSheet({ pinId: 'p1', title: 'タイトル', meaningText: '何かの時間' });
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={sheet} onClose={() => {}} />);
    expect(markup).not.toContain('data-testid="plan-map-bottom-sheet-location"');
  });

  it("§3.2 meaningText 未指定 → meaning box 非表示", () => {
    const sheet = makeSheet({ pinId: 'p1', title: 'タイトル', location: '場所' });
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={sheet} onClose={() => {}} />);
    expect(markup).not.toContain('data-testid="plan-map-bottom-sheet-meaning"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 category 5 種 → 各 styling
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapBottomSheet Step β §4 category 5 種 → CATEGORY_*_CLASS 適用", () => {
  const cases: Array<{
    category: MapSheetViewModel['category'];
    circleBg: string;
    timeText: string;
    placeholderBg: string;
  }> = [
    { category: 'cafe', circleBg: 'bg-indigo-500', timeText: 'text-indigo-600', placeholderBg: 'bg-indigo-50' },
    { category: 'meal', circleBg: 'bg-orange-500', timeText: 'text-orange-600', placeholderBg: 'bg-orange-50' },
    { category: 'work', circleBg: 'bg-blue-500', timeText: 'text-blue-600', placeholderBg: 'bg-blue-50' },
    { category: 'home', circleBg: 'bg-emerald-500', timeText: 'text-emerald-600', placeholderBg: 'bg-emerald-50' },
    { category: 'other', circleBg: 'bg-slate-500', timeText: 'text-slate-600', placeholderBg: 'bg-slate-50' },
  ];

  for (const c of cases) {
    it(`§4.${c.category} → circle ${c.circleBg} + time ${c.timeText} + placeholder ${c.placeholderBg}`, () => {
      const sheet = makeSheet({ pinId: 'p1', category: c.category });
      const markup = renderToStaticMarkup(<MapBottomSheet sheet={sheet} onClose={() => {}} />);
      expect(markup).toContain(c.circleBg);
      expect(markup).toContain(c.timeText);
      expect(markup).toContain(c.placeholderBg);
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 image slot β: imageUrl なし → placeholder、 「画像なし」 文字なし
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapBottomSheet Step β §5 image slot β (= placeholder 規約)", () => {
  it("§5.1 imageUrl undefined → image slot 残るが <img> なし (= placeholder)", () => {
    const sheet = makeSheet({ pinId: 'p1', category: 'cafe' });
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={sheet} onClose={() => {}} />);
    expect(markup).toContain('data-testid="plan-map-bottom-sheet-image-slot"');
    expect(markup).not.toContain('<img');
  });

  it("§5.2 「画像なし」 文字なし (= CEO β 規約)", () => {
    const sheet = makeSheet({ pinId: 'p1' });
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={sheet} onClose={() => {}} />);
    expect(markup).not.toContain('画像なし');
    expect(markup).not.toContain('No image');
    expect(markup).not.toContain('image not');
  });

  it("§5.3 imageUrl あり → <img> render (= 将来 truth ある時)", () => {
    const sheet = { ...makeSheet({ pinId: 'p1' }), imageUrl: 'https://example.com/img.jpg' } as MapSheetViewModel;
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={sheet} onClose={() => {}} />);
    expect(markup).toContain('<img');
    expect(markup).toContain('https://example.com/img.jpg');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6 CTA: callback / routeUrl で 活性/disabled
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapBottomSheet Step β §6 CTA (= 詳細 / 経路)", () => {
  it("§6.1 onOpenDetail なし → 詳細 button disabled", () => {
    const sheet = makeSheet({ pinId: 'p1' });
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={sheet} onClose={() => {}} />);
    // disabled 属性で確認
    expect(markup).toMatch(/data-testid="plan-map-bottom-sheet-detail-cta"[^>]*disabled/);
  });

  it("§6.2 onOpenDetail あり → 詳細 button 活性", () => {
    const sheet = makeSheet({ pinId: 'p1' });
    const markup = renderToStaticMarkup(
      <MapBottomSheet sheet={sheet} onClose={() => {}} onOpenDetail={() => {}} />,
    );
    // disabled なし
    const detailButtonMatch = markup.match(/<button[^>]*data-testid="plan-map-bottom-sheet-detail-cta"[^>]*>/);
    expect(detailButtonMatch).toBeTruthy();
    expect(detailButtonMatch?.[0]).not.toContain('disabled=""');
  });

  it("§6.3 routeUrl なし → 経路 button disabled (= <button> としてrender)", () => {
    const sheet = makeSheet({ pinId: 'p1' });
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={sheet} onClose={() => {}} />);
    // disabled 属性と data-testid 順不同 (= 両方含む button 要素)
    const routeButtonMatch = markup.match(/<button[^>]*data-testid="plan-map-bottom-sheet-route-cta"[^>]*>/);
    expect(routeButtonMatch).toBeTruthy();
    expect(routeButtonMatch?.[0]).toContain('disabled');
    expect(markup).toContain('aria-label="経路を開けません (場所が未解決)"');
  });

  it("§6.4 routeUrl あり → 経路 button は <a> で render (= 外部遷移)", () => {
    const sheet = makeSheet({ pinId: 'p1' });
    const markup = renderToStaticMarkup(
      <MapBottomSheet
        sheet={sheet}
        onClose={() => {}}
        routeUrl="https://www.google.com/maps/dir/?api=1&destination=35.6,139.7"
      />,
    );
    expect(markup).toMatch(/<a[^>]*data-testid="plan-map-bottom-sheet-route-cta"[^>]*>/);
    expect(markup).toContain('href="https://www.google.com/maps/dir/?api=1&amp;destination=35.6,139.7"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7 a11y / 規約 24-extended
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapBottomSheet 9b-6 §8 animation (= slide-up)", () => {
  const sheet = makeSheet({ pinId: 'p1', title: 'カフェ作業' });

  it("§8.1 初回 render: transform translateY(100%) (= initial state)", () => {
    // SSR / 初回 render では useEffect 未実行、 isVisible=false で translateY(100%)
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={sheet} onClose={() => {}} />);
    expect(markup).toContain('translateY(100%)');
  });

  it("§8.2 transition style (= 250ms cubic-bezier、 iOS-like easing)", () => {
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={sheet} onClose={() => {}} />);
    expect(markup).toContain('transition');
    expect(markup).toContain('transform 250ms');
    expect(markup).toContain('cubic-bezier(0.32, 0.72, 0, 1)');
  });
});

describe("MapBottomSheet Step β §7 規約 24-extended + 絵文字", () => {
  it("§7.1 focus-visible:border-slate-* のみ (= brand-color focus 禁止)", () => {
    const sheet = makeSheet({ pinId: 'p1' });
    const markup = renderToStaticMarkup(
      <MapBottomSheet
        sheet={sheet}
        onClose={() => {}}
        onOpenDetail={() => {}}
        routeUrl="https://example.com/r"
      />,
    );
    expect(markup).toContain('focus-visible:border-slate-300');
    expect(markup).not.toContain('focus-visible:border-indigo');
    expect(markup).not.toContain('focus-visible:ring-indigo');
    expect(markup).not.toContain('focus-visible:ring-blue');
  });

  it("§7.2 絵文字 0 (= 📍 / ✨ 全て SVG icon)", () => {
    const sheet = makeSheet({ pinId: 'p1', location: '場所', meaningText: '時間' });
    const markup = renderToStaticMarkup(<MapBottomSheet sheet={sheet} onClose={() => {}} />);
    expect(markup).not.toContain('📍');
    expect(markup).not.toContain('✨');
  });
});
