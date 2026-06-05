/**
 * SR B1b-2B — ShiftReviewGrid risk hint 表示接続の render contract
 *
 * - riskReviewEnabled=false（既定）→ dormant（既存挙動・risk panel 出ない）
 * - hard risk（missing/duplicate/unknown）→ panel 強調 + 保存ボタン block（要確認あり）
 * - soft risk（adjacent dup / blank）→ panel 控えめ + 保存ボタンは active（block しない）
 * - safe copy（error/wrong/failed/誤 を含まない）
 *
 * risk 計算は shiftDraftRiskModel に委譲（Grid は表示器）。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ShiftReviewGrid,
  type ShiftReviewCell,
} from "@/app/(culcept)/plan/components/ShiftReviewGrid";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";

// A1B: confusable_code soft hint 追加に伴い、「完全な月」基準は非混同 L/G/BD のみで作る
// （E/E-18/H/HREQ/N は confusable のため clean fixture に含めない）。
const VALID = ["L", "G", "BD"];
// 連続同一なし・全て有効・confidence 1 の完全な 7月（31日）
function cleanMonth(): ShiftReviewCell[] {
  return Array.from({ length: 31 }, (_, i) => ({
    day: i + 1,
    date: `2025-07-${String(i + 1).padStart(2, "0")}`,
    rawCode: VALID[i % VALID.length],
    confidence: 1,
  }));
}
const noop = () => {};

function render(over: {
  cells?: ShiftReviewCell[];
  riskReviewEnabled?: boolean;
  saveEnabled?: boolean;
} = {}) {
  const { cells = cleanMonth(), riskReviewEnabled, saveEnabled = true } = over;
  return renderToStaticMarkup(
    <ShiftReviewGrid
      cells={cells}
      dictionary={HARADA_SPRIX_DICTIONARY}
      monthLabel="2025年7月"
      year={2025}
      month={7}
      saveEnabled={saveEnabled}
      onConfirm={noop}
      riskReviewEnabled={riskReviewEnabled}
    />
  );
}

describe("ShiftReviewGrid risk 表示（B1b-2B）", () => {
  it("riskReviewEnabled 未指定 → dormant（risk panel 出ない・既存挙動）", () => {
    const cells = cleanMonth().filter((c) => c.day !== 5); // 欠落あり
    const html = render({ cells }); // riskReviewEnabled 未指定
    expect(html).not.toContain('data-testid="shift-review-risk-panel"');
    expect(html).toContain("この内容で保存"); // block されない
  });

  it("enabled + 完全な月 → risk panel なし・保存 active", () => {
    const html = render({ riskReviewEnabled: true });
    expect(html).not.toContain('data-testid="shift-review-risk-panel"');
    expect(html).toContain("この内容で保存");
  });

  it("hard: missing_day → panel 強調 + 保存 block（要確認あり）", () => {
    const cells = cleanMonth().filter((c) => c.day !== 5);
    const html = render({ cells, riskReviewEnabled: true });
    expect(html).toContain('data-testid="shift-review-risk-panel"');
    expect(html).toContain('data-testid="shift-review-risk-hard"');
    expect(html).toContain('data-testid="shift-review-risk-missing_day"');
    expect(html).toContain("要確認あり");
    expect(html).toMatch(/shift-review-save"[^>]*disabled/);
  });

  it("hard: unknown_code → 保存 block", () => {
    const cells = cleanMonth().map((c) => (c.day === 3 ? { ...c, rawCode: "ZZ" } : c));
    const html = render({ cells, riskReviewEnabled: true });
    expect(html).toContain('data-testid="shift-review-risk-unknown_code"');
    expect(html).toMatch(/shift-review-save"[^>]*disabled/);
  });

  it("soft: adjacent_duplicate → panel 控えめ + 保存は active（block しない）", () => {
    const cells = cleanMonth().map((c) =>
      c.day === 4 || c.day === 5 ? { ...c, rawCode: "HREQ" } : c
    );
    const html = render({ cells, riskReviewEnabled: true });
    expect(html).toContain('data-testid="shift-review-risk-soft"');
    expect(html).toContain('data-testid="shift-review-risk-adjacent_duplicate"');
    expect(html).toContain("この内容で保存"); // soft のみ → block しない
    expect(html).not.toContain('data-testid="shift-review-risk-hard"');
  });

  it("soft: blank_risk + suspicious_shift → panel 控えめ + active", () => {
    const cells = cleanMonth().map((c) => (c.day === 10 ? { ...c, rawCode: "" } : c));
    const html = render({ cells, riskReviewEnabled: true });
    expect(html).toContain('data-testid="shift-review-risk-blank_risk"');
    expect(html).toContain('data-testid="shift-review-risk-suspicious_shift"');
    expect(html).toContain("この内容で保存");
  });

  it("safe copy（error/wrong/failed/誤/失敗/間違 を含まない）", () => {
    const cells = cleanMonth()
      .filter((c) => c.day !== 5)
      .map((c) => (c.day === 3 ? { ...c, rawCode: "ZZ" } : c.day === 10 ? { ...c, rawCode: "" } : c));
    const html = render({ cells, riskReviewEnabled: true });
    const panel = html.slice(html.indexOf('data-testid="shift-review-risk-panel"'));
    expect(panel).toMatch(/原稿と照合/);
    expect(html).not.toMatch(/error|wrong|failed|誤|失敗|間違/i);
  });
});

describe("ShiftReviewGrid risk 表示 — confusable_code（A1B・似た形で紛らわしい）", () => {
  it("似たコード（E）→ soft の confusable_code hint が panel に出る", () => {
    const cells = cleanMonth().map((c) =>
      c.day === 4 ? { ...c, rawCode: "E", confidence: 1 } : c
    );
    const html = render({ cells, riskReviewEnabled: true });
    expect(html).toContain('data-testid="shift-review-risk-panel"');
    expect(html).toContain('data-testid="shift-review-risk-soft"');
    expect(html).toContain('data-testid="shift-review-risk-confusable_code"');
  });

  it("confusable は **高 confidence でも** 要確認として出る + 保存は active（hard block しない）", () => {
    const cells = cleanMonth().map((c) =>
      c.day === 4 ? { ...c, rawCode: "E", confidence: 1 } : c
    );
    const html = render({ cells, riskReviewEnabled: true });
    expect(html).toContain('data-testid="shift-review-risk-confusable_code"');
    expect(html).toContain("この内容で保存"); // soft のみ → 保存を止めない
    expect(html).not.toContain('data-testid="shift-review-risk-hard"');
  });

  it("confusable 文言は安全（似た形で紛らわしい・error/誤/間違 を含まない）", () => {
    const cells = cleanMonth().map((c) => (c.day === 4 ? { ...c, rawCode: "E" } : c));
    const html = render({ cells, riskReviewEnabled: true });
    expect(html).toContain("紛らわしい");
    expect(html).not.toMatch(/error|wrong|failed|誤|失敗|間違/i);
  });

  it("非 confusable（L/G/BD）のみ → confusable_code panel なし", () => {
    const html = render({ riskReviewEnabled: true });
    expect(html).not.toContain('data-testid="shift-review-risk-confusable_code"');
  });
});
