/**
 * DayOutlookBanner render contract — 仮説トーン / warning 色禁止 / 断定語禁止 / unknown 非表示。
 * Day Rehearsal 初回 UI 露出の安全性を render で機械保証。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DayOutlookBanner } from "@/app/(culcept)/plan/components/DayOutlookBanner";
import type { DayRehearsal, ViabilityOutlook } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";

function rehearsalWith(outlook: ViabilityOutlook): DayRehearsal {
  return {
    viability: { outlook, breaksAtStepIndex: null, evidence: { basis: [], known: [], unknown: [], inferred: [] } },
  } as unknown as DayRehearsal;
}

describe("DayOutlookBanner — 仮説トーン / warning 色禁止 / unknown 非表示", () => {
  it("holds → ゆとり copy + data-outlook + slate + testid", () => {
    const html = renderToStaticMarkup(<DayOutlookBanner rehearsal={rehearsalWith("holds")} />);
    expect(html).toContain('data-outlook="holds"');
    expect(html).toContain("ゆとりがありそう");
    expect(html).toContain("slate");
    expect(html).toContain('data-testid="plan-day-outlook-banner"');
  });

  it("tight → 仮説トーン（〜かもしれません）", () => {
    const html = renderToStaticMarkup(<DayOutlookBanner rehearsal={rehearsalWith("tight")} />);
    expect(html).toContain('data-outlook="tight"');
    expect(html).toContain("かもしれません");
  });

  it("breaks → 余白が少なめ（断定しない）", () => {
    const html = renderToStaticMarkup(<DayOutlookBanner rehearsal={rehearsalWith("breaks")} />);
    expect(html).toContain('data-outlook="breaks"');
    expect(html).toContain("余白が少なめ");
    expect(html).toContain("かもしれません");
  });

  it("unknown → 何も出さない（過剰主張/ノイズ回避）", () => {
    expect(renderToStaticMarkup(<DayOutlookBanner rehearsal={rehearsalWith("unknown")} />)).toBe("");
  });

  it("null → 何も出さない", () => {
    expect(renderToStaticMarkup(<DayOutlookBanner rehearsal={null} />)).toBe("");
  });

  it("warning 色（amber/orange/red）を使わない（feasibility 色と分離）", () => {
    for (const o of ["holds", "tight", "breaks"] as const) {
      const html = renderToStaticMarkup(<DayOutlookBanner rehearsal={rehearsalWith(o)} />);
      expect(html).not.toContain("amber");
      expect(html).not.toContain("orange");
      expect(html).not.toContain("bg-red");
    }
  });

  it("断定・警告語（危険 / 疲れ / 壊れ）を含まない", () => {
    for (const o of ["holds", "tight", "breaks"] as const) {
      const html = renderToStaticMarkup(<DayOutlookBanner rehearsal={rehearsalWith(o)} />);
      expect(html).not.toContain("危険");
      expect(html).not.toContain("疲れ");
      expect(html).not.toContain("壊れ");
    }
  });
});
