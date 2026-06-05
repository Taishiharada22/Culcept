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

  it("soft: blank_risk（低 conf 空欄）+ suspicious_shift → panel 控えめ + active", () => {
    // A3-D3: 空欄は「低 conf or 空欄隣接」のみ blank_risk。day10 を低 conf にして発火させる。
    const cells = cleanMonth().map((c) =>
      c.day === 10 ? { ...c, rawCode: "", confidence: 0.4 } : c
    );
    const html = render({ cells, riskReviewEnabled: true });
    expect(html).toContain('data-testid="shift-review-risk-blank_risk"');
    expect(html).toContain('data-testid="shift-review-risk-suspicious_shift"');
    expect(html).toContain("この内容で保存");
  });

  it("soft: 高 conf 孤立空欄（確実な休み）は panel が出ても blank_risk を出さない（A3-D3）", () => {
    // unknown(day3) で panel は出るが、高 conf 孤立空欄(day31)は blank_risk にしない（flood 回避）。
    const cells = cleanMonth().map((c) =>
      c.day === 3
        ? { ...c, rawCode: "ZZ" }
        : c.day === 31
          ? { ...c, rawCode: "", confidence: 1 }
          : c
    );
    const html = render({ cells, riskReviewEnabled: true });
    expect(html).toContain('data-testid="shift-review-risk-panel"');
    expect(html).not.toContain('data-testid="shift-review-risk-blank_risk"');
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

describe("ShiftReviewGrid — A2B-2 本人行 warning（行全体・rowLabel cross-check）", () => {
  // 完全月（非混同 L/G/BD）に rowLabel を付与。ownerLabel は辞書「原田 大志」。
  function monthWithRow(rowLabelFn: (i: number) => string | undefined): ShiftReviewCell[] {
    return Array.from({ length: 31 }, (_, i) => {
      const rl = rowLabelFn(i);
      return {
        day: i + 1,
        date: `2025-07-${String(i + 1).padStart(2, "0")}`,
        rawCode: VALID[i % VALID.length],
        confidence: 1,
        ...(rl ? { rowLabel: rl } : {}),
      };
    });
  }

  it("ownerLabel と representative 一致 → warning なし + 保存 active", () => {
    const html = render({ cells: monthWithRow(() => "原田 大志"), riskReviewEnabled: true });
    expect(html).not.toContain('data-testid="shift-review-rowlabel-warning"');
    expect(html).toContain("この内容で保存");
  });

  it("rowLabel mismatch → warning（mismatch）+ 保存は active（hard block しない）", () => {
    const html = render({ cells: monthWithRow(() => "佐藤 花子"), riskReviewEnabled: true });
    expect(html).toContain('data-testid="shift-review-rowlabel-warning"');
    expect(html).toContain('data-rowlabel-status="mismatch"');
    expect(html).toContain("抽出した行名が想定と異なる");
    expect(html).toContain("この内容で保存");
  });

  it("複数 rowLabel 混在（hasConflict）→ warning（conflict）+ 保存 active", () => {
    const html = render({
      cells: monthWithRow((i) => (i % 2 === 0 ? "原田大志" : "佐藤花子")),
      riskReviewEnabled: true,
    });
    expect(html).toContain('data-rowlabel-status="conflict"');
    expect(html).toContain("複数の行名が混在");
    expect(html).toContain("この内容で保存");
  });

  it("missing rowLabel → warning なし + 保存 active（hard block しない・非表示）", () => {
    const html = render({ cells: monthWithRow(() => undefined), riskReviewEnabled: true });
    expect(html).not.toContain('data-testid="shift-review-rowlabel-warning"');
    expect(html).toContain("この内容で保存");
  });

  it("rowLabel warning は always-on（riskReviewEnabled 未指定でも mismatch なら出る）", () => {
    const html = render({ cells: monthWithRow(() => "佐藤 花子") }); // riskReviewEnabled 未指定
    expect(html).toContain('data-testid="shift-review-rowlabel-warning"');
  });

  it("safe copy（error/誤/間違 不使用）+ banner に rowLabel 値を出さない", () => {
    const html = render({
      cells: monthWithRow(() => "佐藤花子SENTINEL_ROWLABEL"),
      riskReviewEnabled: true,
    });
    expect(html).not.toMatch(/error|wrong|failed|誤|失敗|間違/i);
    // banner は generic copy。rowLabel の値（人名）を画面に出さない。
    expect(html).not.toContain("SENTINEL_ROWLABEL");
  });
});
