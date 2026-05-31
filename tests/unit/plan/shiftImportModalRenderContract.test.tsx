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

describe("ShiftImportModal — B1b-2C-8-c-1 risk pass-through", () => {
  /** ShiftReviewGrid 内 detectDraftRisks が完全な月で発火しないよう、空欄なし 31 セルを作る */
  const VALID_CODES = ["H", "E", "N", "L", "G", "BD", "E-18", "HREQ"];
  const FULL_MONTH: ShiftReviewCell[] = Array.from({ length: 31 }, (_, i) => ({
    day: i + 1,
    date: `2025-07-${String(i + 1).padStart(2, "0")}`,
    rawCode: VALID_CODES[i % VALID_CODES.length],
    confidence: 1,
  }));

  it("既定（riskReviewEnabled 未指定）→ risk panel は出ない（既存挙動・dormant 維持）", () => {
    const html = render({ cells: FULL_MONTH });
    expect(html).not.toContain('data-testid="shift-review-risk-panel"');
  });

  it("riskReviewEnabled=true（完全月）→ panel なし（不要時は出さない）", () => {
    const html = render({ cells: FULL_MONTH, riskReviewEnabled: true });
    expect(html).not.toContain('data-testid="shift-review-risk-panel"');
  });

  it("riskReviewEnabled=true + missing day（hard）→ Grid 内 hard panel が出る（pass-through 確認）", () => {
    const missingDay = FULL_MONTH.filter((c) => c.day !== 5);
    const html = render({ cells: missingDay, riskReviewEnabled: true });
    expect(html).toContain('data-testid="shift-review-risk-panel"');
    expect(html).toContain('data-testid="shift-review-risk-hard"');
    expect(html).toContain('data-testid="shift-review-risk-missing_day"');
  });

  it("riskReviewEnabled=true + adjacent_duplicate（soft）→ soft panel・保存 block しない（pass-through 確認）", () => {
    const dup = FULL_MONTH.map((c) =>
      c.day === 4 || c.day === 5 ? { ...c, rawCode: "HREQ" } : c
    );
    const html = render({
      cells: dup,
      riskReviewEnabled: true,
      saveEnabled: true,
    });
    expect(html).toContain('data-testid="shift-review-risk-soft"');
    expect(html).toContain('data-testid="shift-review-risk-adjacent_duplicate"');
    // soft のみなら CTA は active
    expect(html).toContain("この内容で保存");
  });

  it("chunkBoundaries=[15]（完全月）→ chunk_boundary hint が出る（pass-through 確認）", () => {
    const html = render({
      cells: FULL_MONTH,
      riskReviewEnabled: true,
      chunkBoundaries: [15],
    });
    expect(html).toContain('data-testid="shift-review-risk-chunk_boundary"');
  });
});
