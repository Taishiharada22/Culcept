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
import {
  MapSelectedPinLabel,
  calculateLabelPosition,
  type PinScreenPosition,
} from "@/components/plan/map/MapSelectedPinLabel";
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 9b-2 spatial binding: pin 真上寄り + Y clamp + 左右 clamp
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapSelectedPinLabel §5 9b-2 spatial binding (= calculateLabelPosition)", () => {
  it("§5.1 pin 上部 (= Y 小) → label 真上 ideal (= idealTop 採用)", () => {
    // pin at (200, 200) in 400x800 map, sheet visible
    const pos: PinScreenPosition = {
      x: 200, y: 200, mapWidth: 400, mapHeight: 800, sheetVisible: true,
    };
    const result = calculateLabelPosition(pos);
    // idealTop = 200 - 80(pin) - 56(label) - 8(gap) = 56
    expect(result.top).toBe(56);
    // x = 200 - 110(label half) = 90、 clamp range [12, 400-220-12=168] → 90 OK
    expect(result.left).toBe(90);
  });

  it("§5.2 pin 下部 (= Y 大、 sheet と被る) → sheet 上端 clamp", () => {
    // pin at (200, 700), sheet visible
    const pos: PinScreenPosition = {
      x: 200, y: 700, mapWidth: 400, mapHeight: 800, sheetVisible: true,
    };
    const result = calculateLabelPosition(pos);
    // idealTop = 700 - 80 - 56 - 8 = 556
    // sheetTopY = 800 - 320 = 480
    // sheetClampTop = 480 - 56 - 8 = 416
    // ideal (556) > sheetClampTop (416) → sheetClampTop 採用
    expect(result.top).toBe(416);
  });

  it("§5.3 pin が画面左端 → label 左端 clamp (= TOP_PADDING=12)", () => {
    const pos: PinScreenPosition = {
      x: 30, y: 200, mapWidth: 400, mapHeight: 800, sheetVisible: false,
    };
    const result = calculateLabelPosition(pos);
    // idealLeft = 30 - 110 = -80 → minLeft 12 で clamp
    expect(result.left).toBe(12);
  });

  it("§5.4 pin が画面右端 → label 右端 clamp", () => {
    const pos: PinScreenPosition = {
      x: 380, y: 200, mapWidth: 400, mapHeight: 800, sheetVisible: false,
    };
    const result = calculateLabelPosition(pos);
    // idealLeft = 380 - 110 = 270
    // maxLeft = 400 - 220 - 12 = 168
    // 270 > 168 → 168 clamp
    expect(result.left).toBe(168);
  });

  it("§5.5 pin 真上が画面上端を超える (= ideal < 12) → TOP_PADDING で停止", () => {
    // pin at (200, 100), sheet not visible
    const pos: PinScreenPosition = {
      x: 200, y: 100, mapWidth: 400, mapHeight: 800, sheetVisible: false,
    };
    const result = calculateLabelPosition(pos);
    // idealTop = 100 - 80 - 56 - 8 = -44 → TOP_PADDING 12 で stop
    expect(result.top).toBe(12);
  });

  it("§5.6 sheet not visible + pin 下部 → ideal そのまま (= clamp なし)", () => {
    const pos: PinScreenPosition = {
      x: 200, y: 700, mapWidth: 400, mapHeight: 800, sheetVisible: false,
    };
    const result = calculateLabelPosition(pos);
    // sheet not visible → clamp 適用なし、 idealTop = 700 - 80 - 56 - 8 = 556
    expect(result.top).toBe(556);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6 pinPosition prop による 動的 position 適用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapSelectedPinLabel §6 pinPosition prop", () => {
  const sheet = makeSheet({ pinId: 'p1', timeRange: '09:00-10:00', title: 'カフェ' });

  it("§6.1 pinPosition undefined → top-3 left-1/2 fallback (= 旧 top-center)", () => {
    const markup = renderToStaticMarkup(<MapSelectedPinLabel sheet={sheet} />);
    expect(markup).toContain('top-3');
    expect(markup).toContain('left-1/2');
    expect(markup).toContain('-translate-x-1/2');
    // dynamic style なし
    expect(markup).not.toContain('style=');
  });

  it("§6.2 pinPosition null → top-center fallback", () => {
    const markup = renderToStaticMarkup(
      <MapSelectedPinLabel sheet={sheet} pinPosition={null} />,
    );
    expect(markup).toContain('top-3');
    expect(markup).not.toContain('style=');
  });

  it("§6.3 pinPosition set → 動的 style 適用 (= left + top px)", () => {
    const pos: PinScreenPosition = {
      x: 200, y: 300, mapWidth: 400, mapHeight: 800, sheetVisible: true,
    };
    const markup = renderToStaticMarkup(
      <MapSelectedPinLabel sheet={sheet} pinPosition={pos} />,
    );
    expect(markup).toContain('style=');
    expect(markup).toContain('left:');
    expect(markup).toContain('top:');
    // top-3 fallback class なし (= dynamic 適用)
    expect(markup).not.toContain('left-1/2');
    expect(markup).not.toContain('-translate-x-1/2');
  });
});
