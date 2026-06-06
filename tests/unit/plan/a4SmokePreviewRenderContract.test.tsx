/**
 * SR A4 visual smoke V-1 — DevA4SmokeClient の dormant render contract（node・effect 非実行）
 *
 * node 環境では canvas 効果が走らず imageSrc 未生成 → ShiftReviewGrid は dormant。
 * よって本 test は「route 構造が描画される / saveEnabled=false / dormant では banner なし」を固定する。
 * positive な warning 発火は V-2 Playwright（別 GO）。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { DevA4SmokeClient } from "@/app/(culcept)/plan/dev-a4-smoke/DevA4SmokeClient";

describe("DevA4SmokeClient dormant render contract", () => {
  const html = renderToStaticMarkup(<DevA4SmokeClient />);

  it("preview 構造が描画される（heading + ShiftReviewGrid）", () => {
    expect(html).toContain('data-testid="a4-smoke-preview"');
    expect(html).toContain('data-testid="shift-review-grid"');
  });

  it("saveEnabled=false → 保存導線は dormant placeholder（active 保存なし）", () => {
    expect(html).toContain("反映（次段で有効化）");
    expect(html).not.toContain("この内容で保存");
  });

  it("dormant（imageSrc 未生成）→ source-mismatch banner は出ない", () => {
    expect(html).not.toContain('data-testid="shift-review-source-mismatch-warning"');
  });
});
