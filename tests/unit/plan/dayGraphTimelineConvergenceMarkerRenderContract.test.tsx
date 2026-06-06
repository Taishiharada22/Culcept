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
import type { ConvergenceFactor } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";
import type { FeasibilityDisplayView } from "@/lib/plan/feasibility/feasibilityDisplayFormatter";

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

// ── WPM-2b: recovery marker render ──
describe("DayGraphTimeline recovery marker — render", () => {
  it("recoverySteps に該当 → recovery marker（一息つけそう・仮説トーン）", () => {
    const html = renderToStaticMarkup(
      <DayGraphTimeline result={movement} view="user_self" recoverySteps={new Set([0])} />,
    );
    expect(html).toContain('data-testid="day-graph-recovery-marker"');
    expect(html).toContain("一息つけそう");
  });

  it("recoverySteps なし → recovery marker は出ない", () => {
    const html = renderToStaticMarkup(<DayGraphTimeline result={movement} view="user_self" />);
    expect(html).not.toContain("day-graph-recovery-marker");
  });

  it("convergence と recovery 両方該当 → convergence 優先（recovery 出ない）", () => {
    const html = renderToStaticMarkup(
      <DayGraphTimeline result={movement} view="user_self" convergenceSteps={new Set([0])} recoverySteps={new Set([0])} />,
    );
    expect(html).toContain("day-graph-convergence-marker");
    expect(html).not.toContain("day-graph-recovery-marker");
  });

  it("recovery marker は成功色(green/emerald)/警告色/断定を含まない・slate 中立", () => {
    const html = renderToStaticMarkup(
      <DayGraphTimeline result={movement} view="user_self" recoverySteps={new Set([0])} />,
    );
    expect(html).not.toContain("green");
    expect(html).not.toContain("emerald");
    expect(html).not.toContain("amber");
    expect(html).toMatch(/day-graph-recovery-marker[\s\S]{0,200}text-slate-400|text-slate-400[\s\S]{0,200}day-graph-recovery-marker/);
  });

  it("sensitiveProximity の transition には recovery marker を出さない（redaction）", () => {
    const html = renderToStaticMarkup(
      <DayGraphTimeline result={sensitive} view="user_self" recoverySteps={new Set([0, 1, 2])} />,
    );
    expect(html).not.toContain("day-graph-recovery-marker");
  });
});

describe("DayGraphTimeline recovery marker — 構造 invariants", () => {
  const content = readFileSync("app/(culcept)/plan/components/DayGraphTimeline.tsx", "utf-8");
  it("recovery は convergence と排他（!convergenceSteps）+ sensitiveProximity redaction", () => {
    const idx = content.indexOf("RecoveryMarkerLine transitionIndex");
    const region = content.slice(Math.max(0, idx - 400), idx + 100);
    expect(region).toMatch(/!\s*\(props\.convergenceSteps\?\.has\(transitionIndex\)/);
    expect(region).toMatch(/!\s*transitionView\.sensitiveProximity/);
  });
  it("RecoveryMarkerLine は成功色/警告色を持たない（slate のみ）", () => {
    const idx = content.indexOf("function RecoveryMarkerLine");
    const region = content.slice(idx, idx + 800);
    expect(region).not.toMatch(/green|emerald|amber|orange|bg-red/);
    expect(region).toContain("text-slate-400");
  });
});

// ── per-marker「なぜ?」: convergence why（既存 transition disclosure expanded に piggyback） ──
const FV_SLACK: FeasibilityDisplayView = {
  transitionIndex: 0,
  displayText: "余白 30 分",
  variant: "slack",
  tier: "tier_2_movement_aux",
};
const fvAt = (i: number): FeasibilityDisplayView => ({ ...FV_SLACK, transitionIndex: i });
const factorsMap = (entries: readonly number[]): ReadonlyMap<number, readonly ConvergenceFactor[]> =>
  new Map(entries.map((i) => [i, ["buffer_short", "strain_high"] as readonly ConvergenceFactor[]]));

describe("DayGraphTimeline convergence「なぜ?」(per-marker・expanded piggyback) — render", () => {
  it("expanded + factors → why 行が出る（質的 synthesis・default は閉なので expanded 必須）", () => {
    const html = renderToStaticMarkup(
      <DayGraphTimeline
        result={movement}
        view="user_self"
        convergenceSteps={new Set([0])}
        convergenceFactorsByTransitionIndex={factorsMap([0])}
        feasibilityDisplayByTransitionIndex={new Map([[0, FV_SLACK]])}
        expandedTransitionIndices={new Set([0])}
        onToggleFeasibilityDisclosure={() => {}}
      />,
    );
    expect(html).toContain('data-testid="day-graph-convergence-why"');
    expect(html).toContain("ここは移動の余白が少なめで、予定が立て込んでいそうです。");
  });

  it("default closed（expanded でない）→ why 行は出ない（marker 行は出る）", () => {
    const html = renderToStaticMarkup(
      <DayGraphTimeline
        result={movement}
        view="user_self"
        convergenceSteps={new Set([0])}
        convergenceFactorsByTransitionIndex={factorsMap([0])}
        feasibilityDisplayByTransitionIndex={new Map([[0, FV_SLACK]])}
        expandedTransitionIndices={new Set()}
        onToggleFeasibilityDisclosure={() => {}}
      />,
    );
    expect(html).not.toContain("day-graph-convergence-why");
    expect(html).toContain("day-graph-convergence-marker"); // marker 行は不変
  });

  it("factors なし → why 行は出ない（marker 行は不変）", () => {
    const html = renderToStaticMarkup(
      <DayGraphTimeline
        result={movement}
        view="user_self"
        convergenceSteps={new Set([0])}
        feasibilityDisplayByTransitionIndex={new Map([[0, FV_SLACK]])}
        expandedTransitionIndices={new Set([0])}
        onToggleFeasibilityDisclosure={() => {}}
      />,
    );
    expect(html).not.toContain("day-graph-convergence-why");
    expect(html).toContain("day-graph-convergence-marker");
  });

  it("disclosure 機構なし（feasibility/expanded prop なし）→ why 行は出ない（新 tap target を作らない）", () => {
    const html = renderToStaticMarkup(
      <DayGraphTimeline
        result={movement}
        view="user_self"
        convergenceSteps={new Set([0])}
        convergenceFactorsByTransitionIndex={factorsMap([0])}
      />,
    );
    expect(html).not.toContain("day-graph-convergence-why");
  });

  it("sensitiveProximity → why 行を出さない（redaction）", () => {
    const html = renderToStaticMarkup(
      <DayGraphTimeline
        result={sensitive}
        view="user_self"
        convergenceSteps={new Set([0, 1, 2])}
        convergenceFactorsByTransitionIndex={factorsMap([0, 1, 2])}
        feasibilityDisplayByTransitionIndex={new Map([[0, fvAt(0)], [1, fvAt(1)], [2, fvAt(2)]])}
        expandedTransitionIndices={new Set([0, 1, 2])}
        onToggleFeasibilityDisclosure={() => {}}
      />,
    );
    expect(html).not.toContain("day-graph-convergence-why");
  });

  it("why 行は slate 中立・警告/成功色・断定語を含まない", () => {
    const html = renderToStaticMarkup(
      <DayGraphTimeline
        result={movement}
        view="user_self"
        convergenceSteps={new Set([0])}
        convergenceFactorsByTransitionIndex={new Map([[0, ["buffer_short", "strain_high", "friction_high"] as readonly ConvergenceFactor[]]])}
        feasibilityDisplayByTransitionIndex={new Map([[0, FV_SLACK]])}
        expandedTransitionIndices={new Set([0])}
        onToggleFeasibilityDisclosure={() => {}}
      />,
    );
    expect(html).toMatch(/day-graph-convergence-why[\s\S]{0,200}text-slate-400|text-slate-400[\s\S]{0,200}day-graph-convergence-why/);
    expect(html).not.toContain("amber");
    expect(html).not.toContain("orange");
    expect(html).not.toContain("green");
    expect(html).not.toContain("emerald");
    expect(html).not.toContain("危険");
    expect(html).not.toContain("疲れ");
    expect(html).not.toContain("壊れ");
  });
});

describe("DayGraphTimeline convergence「なぜ?」— 構造 invariants", () => {
  const content = readFileSync("app/(culcept)/plan/components/DayGraphTimeline.tsx", "utf-8");
  it("why 行は canDisclose && isExpanded 条件（既存 disclosure に piggyback・新 state なし）", () => {
    expect(content).toMatch(/canDisclose && isExpanded && convergenceWhy/);
  });
  it("why 行は sensitiveProximity redaction を持つ", () => {
    const idx = content.indexOf("convergenceWhy !== \"\"");
    const region = content.slice(idx, idx + 200);
    expect(region).toMatch(/!\s*transitionView\.sensitiveProximity/);
  });
  it("ConvergenceWhyLine は警告色を持たない（slate のみ）", () => {
    const idx = content.indexOf("function ConvergenceWhyLine");
    // 次 interface まで（隣接 component のコメント色名を拾わない window）
    const end = content.indexOf("interface RecoveryMarkerLineProps", idx);
    const region = content.slice(idx, end > idx ? end : idx + 600);
    expect(region).not.toMatch(/amber|orange|green|emerald|bg-red|text-red/);
    expect(region).toContain("text-slate-400");
  });
});
