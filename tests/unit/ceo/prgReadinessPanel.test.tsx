import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PrgReadinessReportView } from "@/app/(culcept)/ceo/PrgReadinessPanel";
import type { PrgReadinessReport } from "@/lib/plan/mobility/prgReadinessEvaluator";

const REPORT: PrgReadinessReport = {
  axes: [
    { axis: "context", flagOn: true, dataReady: true, stable: null, observed: 0, state: "dogfooding" },
    { axis: "place_affinity", flagOn: true, dataReady: true, stable: true, observed: 42, state: "activation_candidate" },
    { axis: "movement_tolerance", flagOn: true, dataReady: false, stable: null, observed: 3, state: "accumulating" },
    { axis: "energy_rhythm", flagOn: true, dataReady: true, stable: false, observed: 99, state: "needs_attention" },
    { axis: "personal_pace", flagOn: false, dataReady: false, stable: null, observed: 7, state: "dormant" },
  ],
  counts: { dormant: 1, accumulating: 1, dogfooding: 1, needs_attention: 1, activation_candidate: 1 },
};

function render(report: PrgReadinessReport): string {
  return renderToStaticMarkup(<PrgReadinessReportView report={report} />);
}

describe("PrgReadinessReportView — operator 表示・read-only・raw 値なし", () => {
  it("★全 5 軸を行表示（axis label + state label）", () => {
    const html = render(REPORT);
    expect(html).toContain('data-testid="prg-readiness-report"');
    for (const label of ["今日の文脈（A2）", "場所の相性", "移動耐性", "活動リズム", "あなたのペース"]) {
      expect(html).toContain(label);
    }
    for (const label of ["観測中", "活性化候補", "蓄積中", "要確認", "休止"]) {
      expect(html).toContain(label);
    }
  });
  it("★state を data-state で持つ（5 状態）", () => {
    const html = render(REPORT);
    for (const s of ["dogfooding", "activation_candidate", "accumulating", "needs_attention", "dormant"]) {
      expect(html).toContain(`data-state="${s}"`);
    }
  });
  it("★raw 値（observed の生数値 42/99/7 等）を出さない", () => {
    const html = render(REPORT);
    expect(html).not.toContain("42");
    expect(html).not.toContain("99");
    // observed/score/confidence 等の内部値が文中に出ない
    expect(html).not.toMatch(/observed|confidence|score|ratio/i);
  });
  it("★警告/断定/人格語を含まない（operator 観測トーン）", () => {
    const html = render(REPORT);
    for (const w of ["危険", "bg-red", "朝型", "夜型", "性格", "タイプです"]) {
      expect(html).not.toContain(w);
    }
  });
});
