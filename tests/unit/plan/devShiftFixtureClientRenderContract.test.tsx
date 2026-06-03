import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// fixture host → ShiftImportModal → importShiftRosterAction の import chain が server-only を引く
vi.mock("server-only", () => ({}));
// client wrapper は useRouter を使う → renderToStaticMarkup 用に stub
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));

import { DevShiftFixtureClient } from "@/app/(culcept)/plan/dev-shift-fixture/DevShiftFixtureClient";
import type { ShiftReviewCell } from "@/lib/plan/shift/shiftReviewClassification";

const CELLS: ShiftReviewCell[] = [
  { day: 6, date: "2025-07-06", rawCode: "E-18", confidence: 1 }, // 勤務
  { day: 7, date: "2025-07-07", rawCode: "H", confidence: 1 }, // 公休
];

function render(saveEnabled: boolean) {
  return renderToStaticMarkup(
    <DevShiftFixtureClient
      year={2025}
      month={7}
      cells={CELLS}
      saveEnabled={saveEnabled}
    />
  );
}

describe("DevShiftFixtureClient — fixture host wrapper（E2a）", () => {
  it("fixture host + ShiftImportModal を mount、staging/dev 限定の警告を表示", () => {
    const html = render(false);
    expect(html).toContain('data-testid="dev-shift-fixture-host"');
    expect(html).toContain('data-testid="shift-import-modal"');
    expect(html).toContain("staging/dev 限定");
    expect(html).toContain("製品の取り込み入口ではありません");
    expect(html).toContain("2025年7月");
  });

  it("saveEnabled=false → 保存 CTA は dormant placeholder", () => {
    const html = render(false);
    expect(html).toContain("反映（次段で有効化）");
    expect(html).not.toContain("この内容で保存");
  });

  it("saveEnabled=true → 保存 CTA active（unresolved なし）", () => {
    const html = render(true);
    expect(html).toContain("この内容で保存");
  });
});
