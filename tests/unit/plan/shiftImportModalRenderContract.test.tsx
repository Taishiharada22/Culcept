import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// importShiftRosterAction（"use server"）の import chain が server-only を引くため無効化
vi.mock("server-only", () => ({}));

import { ShiftImportModal } from "@/app/(culcept)/plan/components/ShiftImportModal";
import type { ShiftReviewCell } from "@/lib/plan/shift/shiftReviewClassification";

const CELLS: ShiftReviewCell[] = [
  { day: 1, date: "2025-07-01", rawCode: "N", confidence: 1 }, // 夜勤
  { day: 2, date: "2025-07-02", rawCode: "H", confidence: 1 }, // 公休
];

function render(
  over: Partial<React.ComponentProps<typeof ShiftImportModal>> = {}
) {
  return renderToStaticMarkup(
    <ShiftImportModal
      open
      year={2025}
      month={7}
      cells={CELLS}
      onSuccess={() => {}}
      onClose={() => {}}
      {...over}
    />
  );
}

describe("ShiftImportModal — E1 shell", () => {
  it("open=false → 何も描画しない（null）", () => {
    const html = renderToStaticMarkup(
      <ShiftImportModal
        open={false}
        year={2025}
        month={7}
        cells={CELLS}
        onSuccess={() => {}}
        onClose={() => {}}
      />
    );
    expect(html).toBe("");
  });

  it("open=true → modal + ShiftReviewGrid + 月ラベルを描画", () => {
    const html = render();
    expect(html).toContain('data-testid="shift-import-modal"');
    expect(html).toContain('data-testid="shift-review-grid"');
    expect(html).toContain('data-testid="shift-import-modal-close"');
    expect(html).toContain("2025年7月");
  });

  it("saveEnabled 未指定（既定 false）→ 保存 CTA は dormant placeholder", () => {
    const html = render();
    expect(html).toContain("反映（次段で有効化）");
    expect(html).not.toContain("この内容で保存");
  });

  it("saveEnabled=true → 保存 CTA が active（unresolved なし）", () => {
    const html = render({ saveEnabled: true });
    expect(html).toContain("この内容で保存");
    expect(html).not.toContain("反映（次段で有効化）");
  });
});
