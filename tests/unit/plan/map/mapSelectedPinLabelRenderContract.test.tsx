/**
 * Phase 3-N Map impl sub-phase 9b-1 — MapSelectedPinLabel render contract
 *
 * 検証範囲 (= 9b-1 carry、 selected title overlay):
 *   §1 sheet=null → null render
 *   §2 sheet あり → time + title + 白カード border 全 render
 *   §3 category 5 種 → time color + border color 各
 *   §4 a11y (= role status + aria-label + pointer-events-none)
 *
 * 設計書:
 *   - components/plan/map/MapSelectedPinLabel.tsx
 *   - docs/alter-plan-map-redesign-9b-readiness.md
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MapSelectedPinLabel } from "@/components/plan/map/MapSelectedPinLabel";
import type { MapSheetViewModel } from "@/lib/plan/map/types";

function makeSheet(overrides: Partial<MapSheetViewModel> & { pinId: string }): MapSheetViewModel {
  return {
    pinId: overrides.pinId,
    category: overrides.category ?? 'cafe',
    timeRange: overrides.timeRange ?? '09:00-11:00',
    title: overrides.title ?? 'タイトル',
    ...(overrides.location !== undefined ? { location: overrides.location } : {}),
    ...(overrides.meaningText !== undefined ? { meaningText: overrides.meaningText } : {}),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapSelectedPinLabel §1 sheet=null → empty", () => {
  it("§1.1 null 渡しで empty markup", () => {
    const markup = renderToStaticMarkup(<MapSelectedPinLabel sheet={null} />);
    expect(markup).toBe("");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapSelectedPinLabel §2 sheet あり → time + title overlay", () => {
  const sheet = makeSheet({
    pinId: 'p1',
    category: 'cafe',
    timeRange: '09:00-11:00',
    title: 'カフェ作業',
  });

  it("§2.1 root container + testid + 配置 class", () => {
    const markup = renderToStaticMarkup(<MapSelectedPinLabel sheet={sheet} />);
    expect(markup).toContain('data-testid="plan-map-selected-pin-label"');
    // absolute + top + 中央寄せ
    expect(markup).toContain('absolute');
    expect(markup).toContain('top-3');
    expect(markup).toContain('-translate-x-1/2');
    // pointer-events-none (= 操作邪魔しない)
    expect(markup).toContain('pointer-events-none');
  });

  it("§2.2 time line + tabular-nums", () => {
    const markup = renderToStaticMarkup(<MapSelectedPinLabel sheet={sheet} />);
    expect(markup).toContain('data-testid="plan-map-selected-pin-label-time"');
    expect(markup).toContain('09:00-11:00');
    expect(markup).toContain('tabular-nums');
  });

  it("§2.3 title line + font-bold + truncate", () => {
    const markup = renderToStaticMarkup(<MapSelectedPinLabel sheet={sheet} />);
    expect(markup).toContain('data-testid="plan-map-selected-pin-label-title"');
    expect(markup).toContain('カフェ作業');
    expect(markup).toContain('font-bold');
    expect(markup).toContain('truncate');
  });

  it("§2.4 z-20 (= 上層、 sheet 上端より上の overlay)", () => {
    const markup = renderToStaticMarkup(<MapSelectedPinLabel sheet={sheet} />);
    expect(markup).toContain('z-20');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapSelectedPinLabel §3 category 5 種 → time color + border color", () => {
  const cases: Array<{
    category: MapSheetViewModel['category'];
    timeColor: string;
    borderColor: string;
  }> = [
    { category: 'cafe', timeColor: 'text-indigo-600', borderColor: 'border-indigo-200' },
    { category: 'meal', timeColor: 'text-orange-600', borderColor: 'border-orange-200' },
    { category: 'work', timeColor: 'text-blue-600', borderColor: 'border-blue-200' },
    { category: 'home', timeColor: 'text-emerald-600', borderColor: 'border-emerald-200' },
    { category: 'other', timeColor: 'text-slate-600', borderColor: 'border-slate-200' },
  ];

  for (const c of cases) {
    it(`§3.${c.category} → time ${c.timeColor} + border ${c.borderColor}`, () => {
      const sheet = makeSheet({ pinId: 'p', category: c.category });
      const markup = renderToStaticMarkup(<MapSelectedPinLabel sheet={sheet} />);
      expect(markup).toContain(c.timeColor);
      expect(markup).toContain(c.borderColor);
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapSelectedPinLabel §4 a11y", () => {
  it("§4.1 role=status + aria-label「選択中: {title}」", () => {
    const sheet = makeSheet({ pinId: 'p', title: 'カフェ作業' });
    const markup = renderToStaticMarkup(<MapSelectedPinLabel sheet={sheet} />);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="選択中: カフェ作業"');
  });

  it("§4.2 絵文字 0 (= 純 text)", () => {
    const sheet = makeSheet({ pinId: 'p', title: 'カフェ作業' });
    const markup = renderToStaticMarkup(<MapSelectedPinLabel sheet={sheet} />);
    expect(markup).not.toContain('📍');
    expect(markup).not.toContain('✨');
    expect(markup).not.toContain('☕');
  });
});
