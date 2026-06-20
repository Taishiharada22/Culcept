/**
 * SR A4-3 — ShiftReviewGrid への source-mismatch 配線 contract（grid レベル）
 *
 * 注: source-mismatch は非同期 canvas hook 由来。vitest=node 環境（renderToStaticMarkup・effect 非実行）では
 *   常に dormant。よって本 test は「配線が dormant 安全 / 保存を block しない / 過剰着色しない」を固定する
 *   （positive banner は SourceMismatchWarning render contract で固定済）。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ShiftReviewGrid,
  type ShiftReviewCell,
} from "@/app/(culcept)/plan/components/ShiftReviewGrid";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";

const CELLS: ShiftReviewCell[] = [
  { day: 1, date: "2025-07-01", rawCode: "N", confidence: 1 },
  { day: 2, date: "2025-07-02", rawCode: "G", confidence: 1 },
];

function render(over: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <ShiftReviewGrid
      cells={CELLS}
      dictionary={HARADA_SPRIX_DICTIONARY}
      monthLabel="2025年7月"
      year={2025}
      month={7}
      {...over}
    />
  );
}

describe("ShiftReviewGrid source-mismatch 配線（dormant 安全）", () => {
  it("dormant → source-mismatch warning banner は出ない", () => {
    expect(render()).not.toContain('data-testid="shift-review-source-mismatch-warning"');
  });

  it("dormant → 全 cell が data-source-mismatch=false（過剰 amber なし）", () => {
    const html = render();
    expect(html).toContain('data-source-mismatch="false"');
    expect(html).not.toContain('data-source-mismatch="true"');
  });

  it("source-mismatch 配線は保存 CTA を block しない（saveEnabled=true → active）", () => {
    const html = render({ saveEnabled: true, onConfirm: () => {} });
    expect(html).toContain("この内容で保存");
    expect(html).not.toMatch(/shift-review-save"[^>]*disabled/);
  });
});
