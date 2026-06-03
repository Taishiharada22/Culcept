import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ShiftReviewGrid,
  type ShiftReviewCell,
} from "@/app/(culcept)/plan/components/ShiftReviewGrid";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";
import type { ShiftSaveState } from "@/lib/plan/shift/shiftSaveController";

const CELLS: ShiftReviewCell[] = [
  { day: 1, date: "2025-07-01", rawCode: "N", confidence: 1 },
  { day: 2, date: "2025-07-02", rawCode: "G", confidence: 1 },
];
const CELLS_WITH_UNRESOLVED: ShiftReviewCell[] = [
  { day: 1, date: "2025-07-01", rawCode: "N", confidence: 1 },
  { day: 2, date: "2025-07-02", rawCode: "ZZ", confidence: 1 }, // unknown
];

const noop = () => {};

function render(over: {
  cells?: ShiftReviewCell[];
  saveEnabled?: boolean;
  saveState?: ShiftSaveState;
  onConfirm?: (cells: ShiftReviewCell[]) => void;
  onConfirmBlankRisk?: () => void;
  onCancel?: () => void;
} = {}) {
  const { cells = CELLS, ...rest } = over;
  return renderToStaticMarkup(
    <ShiftReviewGrid
      cells={cells}
      dictionary={HARADA_SPRIX_DICTIONARY}
      monthLabel="2025年7月"
      year={2025}
      month={7}
      {...rest}
    />
  );
}

describe("ShiftReviewGrid 保存 CTA（6D contract）", () => {
  it("saveEnabled 未指定 → dormant placeholder（保存導線は出ない）", () => {
    const html = render();
    expect(html).toContain("反映（次段で有効化）");
    expect(html).toMatch(/shift-review-save"[^>]*disabled/);
    expect(html).not.toContain("この内容で保存");
  });

  it("saveEnabled=false → dormant のまま（active CTA なし）", () => {
    const html = render({ saveEnabled: false, onConfirm: noop });
    expect(html).toContain("反映（次段で有効化）");
    expect(html).not.toContain("この内容で保存");
  });

  it("saveEnabled=true + idle → active 保存ボタン", () => {
    const html = render({ saveEnabled: true, onConfirm: noop });
    expect(html).toContain("この内容で保存");
    expect(html).not.toContain("反映（次段で有効化）");
  });

  it("unresolved があると保存ボタンは disabled（要確認あり）", () => {
    const html = render({
      cells: CELLS_WITH_UNRESOLVED,
      saveEnabled: true,
      onConfirm: noop,
    });
    expect(html).toContain("要確認あり");
    expect(html).toMatch(/shift-review-save"[^>]*disabled/);
  });

  it("saving → 保存中・disabled（二重 submit 防止の視覚）", () => {
    const html = render({
      saveEnabled: true,
      onConfirm: noop,
      saveState: { status: "saving" },
    });
    expect(html).toContain("保存中");
    expect(html).toMatch(/shift-review-save"[^>]*disabled/);
  });

  it("needs_blank_risk_confirmation → soft confirm bar を表示", () => {
    const html = render({
      saveEnabled: true,
      onConfirm: noop,
      onConfirmBlankRisk: noop,
      onCancel: noop,
      saveState: { status: "needs_blank_risk_confirmation", blankRiskDays: [1, 2] },
    });
    expect(html).toContain('data-testid="shift-review-blank-confirm"');
    expect(html).toContain("原稿と照合しましたか");
    expect(html).toContain("照合した・保存する");
  });

  it("conflict → safe message + 衝突日（手動印を壊さない可視化）", () => {
    const html = render({
      saveEnabled: true,
      onConfirm: noop,
      saveState: {
        status: "conflict",
        dates: ["2025-07-15"],
        message: "手動で設定した休みと重なる日があります。ご確認ください。",
      },
    });
    expect(html).toContain('data-testid="shift-review-save-conflict"');
    expect(html).toContain("2025-07-15");
    expect(html).toContain("手動で設定した休み");
  });

  it("success → 反映件数を表示", () => {
    const html = render({
      saveEnabled: true,
      onConfirm: noop,
      saveState: {
        status: "success",
        summary: {
          sourceId: "s",
          insertedAnchors: 3,
          deletedAnchors: 0,
          insertedIndicators: 2,
          deletedIndicators: 0,
          conflicts: [],
        },
      },
    });
    expect(html).toContain('data-testid="shift-review-save-success"');
    expect(html).toContain("反映しました");
    expect(html).toContain("3");
    expect(html).toContain("2");
  });
});
