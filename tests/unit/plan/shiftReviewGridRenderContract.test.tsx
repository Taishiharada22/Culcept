import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ShiftReviewGrid,
  type ShiftReviewCell,
} from "@/app/(culcept)/plan/components/ShiftReviewGrid";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";

// 全 cell kind + blank-risk を網羅する fixture（2025年7月）
const FIXTURE: ShiftReviewCell[] = [
  { day: 1, date: "2025-07-01", rawCode: "G", confidence: 0.95 }, // work
  { day: 2, date: "2025-07-02", rawCode: "H", confidence: 0.95 }, // off
  { day: 3, date: "2025-07-03", rawCode: "HREQ", confidence: 0.95 }, // candidate（day4 空に隣接）
  { day: 4, date: "2025-07-04", rawCode: "", confidence: 0.9 }, // empty
  { day: 5, date: "2025-07-05", rawCode: "ZZ", confidence: 0.9 }, // unresolved（day4 空に隣接）
  { day: 6, date: "2025-07-06", rawCode: "N", confidence: 0.5 }, // work・低信頼
  { day: 7, date: "2025-07-07", rawCode: "L", confidence: 0.95 }, // work
];

function render() {
  return renderToStaticMarkup(
    <ShiftReviewGrid
      cells={FIXTURE}
      dictionary={HARADA_SPRIX_DICTIONARY}
      monthLabel="2025年7月"
      year={2025}
      month={7}
    />
  );
}

describe("ShiftReviewGrid（カレンダー型 source-of-truth cell review）", () => {
  it("grid・曜日ヘッダ（日〜土）・7 セルを描画", () => {
    const html = render();
    expect(html).toContain('data-testid="shift-review-grid"');
    expect(html).toContain('data-testid="shift-review-weekday-header"');
    expect(html).toContain("日");
    expect(html).toContain("土");
    for (let d = 1; d <= 7; d += 1) {
      expect(html).toContain(`data-testid="shift-review-cell-${d}"`);
    }
  });

  it("各 cell kind を分類（work/off/candidate/empty/unresolved）", () => {
    const html = render();
    expect(html).toMatch(/shift-review-cell-1"[^>]*data-kind="work"/);
    expect(html).toMatch(/shift-review-cell-2"[^>]*data-kind="off"/);
    expect(html).toMatch(/shift-review-cell-3"[^>]*data-kind="candidate"/);
    expect(html).toMatch(/shift-review-cell-4"[^>]*data-kind="empty"/);
    expect(html).toMatch(/shift-review-cell-5"[^>]*data-kind="unresolved"/);
  });

  it("blank-risk を heuristic 強調（低信頼 + 空欄隣接）", () => {
    const html = render();
    expect(html).toMatch(/shift-review-cell-6"[^>]*data-blank-risk="true"/); // 低信頼
    expect(html).toMatch(/shift-review-cell-3"[^>]*data-blank-risk="true"/); // 空欄隣接
    expect(html).toMatch(/shift-review-cell-5"[^>]*data-blank-risk="true"/); // 空欄隣接
  });

  it("projection preview の件数（勤務3 / 休み1 / 候補1 / 要確認1）", () => {
    const html = render();
    expect(html).toContain('data-testid="shift-review-preview"');
    expect(html).toContain("勤務");
    expect(html).toMatch(/勤務 <b[^>]*>3<\/b>/);
    expect(html).toMatch(/休み <b[^>]*>1<\/b>/);
    expect(html).toMatch(/候補 <b[^>]*>1<\/b>/);
    expect(html).toMatch(/要確認 <b>1<\/b>/);
  });

  it("保存ボタンは disabled（DB は次段 gate）", () => {
    const html = render();
    expect(html).toMatch(/shift-review-save"[^>]*disabled/);
  });

  it("honest banner（強調が無くても全セル照合）を表示", () => {
    const html = render();
    expect(html).toContain('data-testid="shift-review-notice"');
    expect(html).toContain("強調が無くても");
  });

  it("初期表示では詳細 sheet は非表示（選択なし）", () => {
    const html = render();
    expect(html).not.toContain('data-testid="shift-review-sheet"');
  });
});
