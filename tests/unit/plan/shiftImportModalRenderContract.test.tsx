import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// importShiftRosterAction（"use server"）の import chain が server-only を引くため無効化
vi.mock("server-only", () => ({}));

import { ShiftImportModal } from "@/app/(culcept)/plan/components/ShiftImportModal";
import type { ShiftReviewCell } from "@/lib/plan/shift/shiftReviewClassification";
import {
  selectImportModalProps,
  type CellsLoadedShape,
} from "@/lib/plan/shift/devShiftDraftModalSelector";
import { HARADA_SPRIX_JULY_GEOMETRY } from "@/lib/plan/shift/shiftGridGeometry";
import type { AssistedRowSelection } from "@/lib/plan/shift/assistedRowSelection";

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
  /** ShiftReviewGrid 内 detectDraftRisks が完全な月で発火しないよう、空欄なし 31 セルを作る。
   *  A1B で confusable_code soft hint を追加したため、混同コード（E/E-18/H/HREQ/N）は含めず
   *  非混同の L/G/BD のみで「完全月＝risk ゼロ」を作る。 */
  const VALID_CODES = ["L", "G", "BD"];
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

describe("ShiftImportModal — S-geo-2C-2 geometry → 照合枠 pass-through", () => {
  const IMG = "blob:http://localhost/src";

  /** S-geo-2C-1 selector が geometry を作れる selection（2025-07 で HARADA 一致）。 */
  const SELECTION_VALID: AssistedRowSelection = {
    imageW: 1860,
    imageH: 846,
    headerBand: { top: 180, bottom: 226 },
    personRowBand: { top: 298, bottom: 350 },
    dayColumns: { firstDayCenterX: 300.75, lastDayCenterX: 1845.75 },
  };
  const cellsLoadedState = (
    selection: AssistedRowSelection | undefined
  ): CellsLoadedShape => ({
    kind: "cells_loaded",
    year: 2025,
    month: 7,
    cells: CELLS,
    imageObjectUrl: IMG,
    reviewOpen: true,
    selection,
  });
  /** ShiftDraftInApp と同じく selector 出力を Modal props にする（geometry 含む）。 */
  const selectedProps = (selection: AssistedRowSelection | undefined) =>
    selectImportModalProps(cellsLoadedState(selection), { saveEnabled: false })!;

  it("imageSrc + geometry → source-image-highlight が出る", () => {
    const html = render({ imageSrc: IMG, geometry: HARADA_SPRIX_JULY_GEOMETRY });
    expect(html).toContain('data-testid="source-image-highlight"');
  });

  it("imageSrc + geometry → 原稿全体は SourceImageHighlight に一本化（重複トグルは廃止）", () => {
    const html = render({ imageSrc: IMG, geometry: HARADA_SPRIX_JULY_GEOMETRY });
    expect(html).toContain('data-testid="source-image-highlight"');
    expect(html).not.toContain('data-testid="shift-review-source-section"');
    expect(html).not.toContain('data-testid="shift-review-source-toggle"');
  });

  it("geometry なし（imageSrc のみ）→ highlight 不在（原稿照合は geometry 必須に一本化）", () => {
    const html = render({ imageSrc: IMG });
    expect(html).not.toContain('data-testid="source-image-highlight"');
    expect(html).not.toContain('data-testid="shift-review-source-section"');
  });

  it("geometry のみ（imageSrc なし）→ highlight 不在（imageSrc と geometry 両方必須）", () => {
    const html = render({ geometry: HARADA_SPRIX_JULY_GEOMETRY });
    expect(html).not.toContain('data-testid="source-image-highlight"');
  });

  it("実 state（valid dayColumns）→ selector geometry → highlight が出る（wire end-to-end）", () => {
    const p = selectedProps(SELECTION_VALID);
    expect(p.geometry).toBeDefined();
    const html = renderToStaticMarkup(
      <ShiftImportModal {...p} onSuccess={() => {}} onClose={() => {}} />
    );
    expect(html).toContain('data-testid="source-image-highlight"');
  });

  it("実 state（dayColumns なし）→ selector geometry undefined → highlight 不在（fail-soft）", () => {
    const p = selectedProps(undefined);
    expect(p.geometry).toBeUndefined();
    const html = renderToStaticMarkup(
      <ShiftImportModal {...p} onSuccess={() => {}} onClose={() => {}} />
    );
    expect(html).not.toContain('data-testid="source-image-highlight"');
    // 原稿照合は geometry 必須に一本化（重複トグル廃止）
    expect(html).not.toContain('data-testid="shift-review-source-section"');
  });

  it("geometry present でも saveEnabled 既定 false は維持（dormant・geometry は保存に無関係）", () => {
    const html = render({ imageSrc: IMG, geometry: HARADA_SPRIX_JULY_GEOMETRY });
    expect(html).toContain("反映（次段で有効化）");
    expect(html).not.toContain("この内容で保存");
  });
});
