import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaceShadowReportPanel } from "@/components/plan/PaceShadowReportPanel";
import type { PaceShadowActivationReport } from "@/lib/plan/mobility/paceShadowActivation";

const ranWithConcern: PaceShadowActivationReport = {
  ran: true,
  readinessOverall: "ready_for_activation",
  shadow: {
    changed: true,
    viabilityBefore: "holds",
    viabilityAfter: "tight",
    viabilityRegressed: true,
    peakStrainLevelBefore: "moderate",
    peakStrainLevelAfter: "high",
    convergenceCountBefore: 1,
    convergenceCountAfter: 4,
    markerExplosion: true,
    legDiffs: [],
    overChangeLegCount: 2,
    anyConcern: true,
  },
  concerns: { overPessimism: true, markerExplosion: true, diagnosticWorsening: true, overChange: true },
  anyConcern: true,
};
const ranClean: PaceShadowActivationReport = {
  ...ranWithConcern,
  shadow: { ...ranWithConcern.shadow!, viabilityRegressed: false, markerExplosion: false, overChangeLegCount: 0, anyConcern: false },
  concerns: { overPessimism: false, markerExplosion: false, diagnosticWorsening: false, overChange: false },
  anyConcern: false,
};
const notEnough: PaceShadowActivationReport = {
  ran: false,
  readinessOverall: "not_enough",
  shadow: null,
  concerns: { overPessimism: false, markerExplosion: false, diagnosticWorsening: false, overChange: false },
  anyConcern: false,
};

describe("PaceShadowReportPanel — dogfood debug report", () => {
  it("ran=true: readiness/懸念/viability/verdict を出す", () => {
    const html = renderToStaticMarkup(<PaceShadowReportPanel report={ranWithConcern} />);
    expect(html).toContain("readiness");
    expect(html).toContain("ready_for_activation");
    expect(html).toContain("過悲観");
    expect(html).toContain("marker爆発");
    expect(html).toContain("診断悪化");
    expect(html).toContain("過剰変化");
    expect(html).toContain("viability");
    expect(html).toContain("holds");
    expect(html).toContain("tight");
    expect(html).toContain("懸念あり");
  });
  it("★raw 数値（pace ratio / friction score）を出さない", () => {
    const html = renderToStaticMarkup(<PaceShadowReportPanel report={ranWithConcern} />);
    expect(html).not.toContain("medianRatio");
    expect(html).not.toContain("friction");
    expect(html).not.toContain("ratio");
  });
  it("★実反映していないことを明示", () => {
    const html = renderToStaticMarkup(<PaceShadowReportPanel report={ranWithConcern} />);
    expect(html).toContain("実反映なし");
  });
  it("懸念なし → verdict 懸念なし", () => {
    expect(renderToStaticMarkup(<PaceShadowReportPanel report={ranClean} />)).toContain("懸念なし");
  });
  it("★not_enough（sparse）→ 観測不足のみ・shadow 比較を出さない", () => {
    const html = renderToStaticMarkup(<PaceShadowReportPanel report={notEnough} />);
    expect(html).toContain("観測不足");
    expect(html).not.toContain("viability");
    expect(html).not.toContain("懸念あり");
  });
});
