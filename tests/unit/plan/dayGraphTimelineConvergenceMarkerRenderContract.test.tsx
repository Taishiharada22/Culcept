/**
 * DayGraphTimeline — Day Rehearsal WPM-1 convergence marker render contract。
 * 詰まり marker の 表示/非表示 / redaction / 仮説トーン / 警告色禁止 を render + 構造 grep で機械保証。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { DayGraphTimeline } from "@/app/(culcept)/plan/components/DayGraphTimeline";
import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import { MOVEMENT_DAY_ANCHORS, SENSITIVE_DAY_ANCHORS } from "@/tests/fixtures/dayGraph";

const DATE = "2026-05-22";
const movement = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
const sensitive = buildDayGraph({ anchors: SENSITIVE_DAY_ANCHORS, date: DATE });

describe("DayGraphTimeline convergence marker — render", () => {
  it("convergenceSteps に該当 → marker 行が出る（仮説トーン copy）", () => {
    const html = renderToStaticMarkup(
      <DayGraphTimeline result={movement} view="user_self" convergenceSteps={new Set([0])} />,
    );
    expect(html).toContain('data-testid="day-graph-convergence-marker"');
    expect(html).toContain("予定が重なりやすいかもしれません");
    expect(html).toContain("かもしれません"); // 仮説トーン
  });

  it("convergenceSteps prop なし → marker は出ない", () => {
    const html = renderToStaticMarkup(<DayGraphTimeline result={movement} view="user_self" />);
    expect(html).not.toContain("day-graph-convergence-marker");
  });

  it("空 Set → marker は出ない", () => {
    const html = renderToStaticMarkup(
      <DayGraphTimeline result={movement} view="user_self" convergenceSteps={new Set()} />,
    );
    expect(html).not.toContain("day-graph-convergence-marker");
  });

  it("marker は slate 中立・警告色（amber/orange）/ 断定語を含まない", () => {
    const html = renderToStaticMarkup(
      <DayGraphTimeline result={movement} view="user_self" convergenceSteps={new Set([0])} />,
    );
    // marker 要素は text-slate-400（FeasibilityDisclosureLine と同階調）
    expect(html).toMatch(/day-graph-convergence-marker[\s\S]{0,200}text-slate-400|text-slate-400[\s\S]{0,200}day-graph-convergence-marker/);
    expect(html).not.toContain("amber");
    expect(html).not.toContain("orange");
    expect(html).not.toContain("危険");
    expect(html).not.toContain("疲れ");
    expect(html).not.toContain("壊れ");
  });

  it("sensitiveProximity の transition には marker を出さない（redaction）", () => {
    // SENSITIVE fixture の transition は sensitiveProximity=true → convergenceSteps 該当でも非出力
    const html = renderToStaticMarkup(
      <DayGraphTimeline result={sensitive} view="user_self" convergenceSteps={new Set([0, 1, 2])} />,
    );
    expect(html).not.toContain("day-graph-convergence-marker");
  });
});

describe("DayGraphTimeline convergence marker — 構造 invariants", () => {
  const content = readFileSync("app/(culcept)/plan/components/DayGraphTimeline.tsx", "utf-8");

  it("redaction: sensitiveProximity の transition は marker を出さない条件がある", () => {
    expect(content).toMatch(/!\s*transitionView\.sensitiveProximity/);
  });

  it("marker は convergenceSteps.has(transitionIndex) 条件付き", () => {
    expect(content).toMatch(/convergenceSteps\?\.has\(transitionIndex\)/);
  });

  it("ConvergenceMarkerLine は警告色を持たない（slate のみ）", () => {
    // marker component 周辺に amber/orange/red 系がない
    const idx = content.indexOf("function ConvergenceMarkerLine");
    const region = content.slice(idx, idx + 800);
    expect(region).not.toMatch(/amber|orange|bg-red|text-red/);
    expect(region).toContain("text-slate-400");
  });
});
