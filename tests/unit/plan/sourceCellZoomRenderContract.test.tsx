/**
 * SR S-geo-3-1 — SourceCellZoom render contract（static / no jsdom）
 *
 * 不変条件（CEO 7 点）:
 *   1. imageSrc / geometry / day が揃うと zoom section が出る
 *   2. blankDays を使った sourceColumnForDay の列を参照する（packing 補正）
 *   3. imageSrc が無いと非表示
 *   4. geometry が無いと非表示
 *   5. day が無い（null）と非表示
 *   6. canvas / base64 / dataURI を使わない
 *   7. VLM/DB/save に触れない（純 presentational・副作用なし）
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { SourceCellZoom } from "@/app/(culcept)/plan/components/SourceCellZoom";
import {
  HARADA_SPRIX_JULY_GEOMETRY,
  sourceColumnForDay,
  type ShiftGridGeometry,
} from "@/lib/plan/shift/shiftGridGeometry";

const GEO: ShiftGridGeometry = HARADA_SPRIX_JULY_GEOMETRY;
const IMG = "blob:http://localhost/src";

function render(over: Partial<React.ComponentProps<typeof SourceCellZoom>> = {}) {
  return renderToStaticMarkup(
    <SourceCellZoom imageSrc={IMG} geometry={GEO} day={10} {...over} />
  );
}

describe("SourceCellZoom — 表示条件", () => {
  it("imageSrc + geometry + day → zoom section + 太枠 + 文言が出る", () => {
    const html = render();
    expect(html).toContain('data-testid="source-cell-zoom"');
    expect(html).toContain('data-testid="source-cell-zoom-frame"');
    expect(html).toContain("原稿の該当セル（拡大）");
    // 原画像 src はそのまま img に入る
    expect(html).toMatch(/src="blob:http:\/\/localhost\/src"/);
  });

  it("imageSrc が無いと非表示（空文字）", () => {
    expect(render({ imageSrc: undefined })).toBe("");
  });

  it("geometry が無いと非表示（空文字）", () => {
    expect(render({ geometry: undefined })).toBe("");
  });

  it("day が null だと非表示（空文字）", () => {
    expect(render({ day: null })).toBe("");
  });
});

describe("SourceCellZoom — packing 補正（blankDays → sourceColumnForDay）", () => {
  it("blankDays なし → data-source-col は day と一致（恒等）", () => {
    const html = render({ day: 10, blankDays: [] });
    expect(html).toContain('data-source-col="10"');
    expect(sourceColumnForDay(10, [])).toBe(10);
  });

  it("blankDays=[3] → day=10 は 1 列詰めて col=9 を参照（空をスキップ）", () => {
    const html = render({ day: 10, blankDays: [3] });
    expect(html).toContain('data-source-col="9"');
    expect(html).toContain('data-source-day="10"');
    expect(sourceColumnForDay(10, [3])).toBe(9);
  });

  it("blankDays の有無で参照列が変わる（恒等でない）", () => {
    const withBlank = render({ day: 14, blankDays: [3, 9] }); // 14 - 2 = 12
    const noBlank = render({ day: 14, blankDays: [] }); // 14
    expect(withBlank).toContain('data-source-col="12"');
    expect(noBlank).toContain('data-source-col="14"');
  });
});

describe("SourceCellZoom — 安全性（canvas/base64/dataURI/raw 非使用）", () => {
  it("canvas を使わない", () => {
    expect(render()).not.toContain("<canvas");
  });

  it("data:image / base64 / dataURI を内部に作らない（src は blob: のみ）", () => {
    const html = render();
    expect(html).not.toMatch(/data:image\/[a-z]+;base64,/i);
    expect(html).not.toMatch(/[A-Za-z0-9+/]{200,}=*/); // 巨大 base64 塊なし
  });

  it("CSS crop+zoom のみ（img の幅は imageWidth*zoom で拡大・maxWidth:none）", () => {
    const html = render();
    // 拡大表示のため img は元画像幅を超える（max-width:none で上限解除）
    expect(html).toMatch(/max-width:\s*none/i);
  });

  it("user-facing copy に error / 失敗 等を含まない", () => {
    expect(render()).not.toMatch(/error|wrong|failed|誤|失敗|間違/i);
  });
});
