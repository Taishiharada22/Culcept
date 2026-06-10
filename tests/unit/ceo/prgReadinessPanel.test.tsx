import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PrgReadinessReportView, PhaseBGateView } from "@/app/(culcept)/ceo/PrgReadinessPanel";
import type { PrgReadinessReport } from "@/lib/plan/mobility/prgReadinessEvaluator";
import type { PhaseBReadinessProgress } from "@/lib/plan/mobility/phaseBReadinessProgress";

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

// ── B-0: Phase B data gate 進捗（read-only・達成/未達のみ・raw 値なし） ──
describe("PhaseBGateView — operator 表示・read-only・raw 値なし", () => {
  const PROGRESS: PhaseBReadinessProgress = {
    checks: [
      { key: "observation_days", met: false },
      { key: "consecutive_pairs", met: false },
      { key: "daily_density", met: true },
      { key: "reason_count", met: false },
    ],
    overall: "accumulating",
    totals: { observationDays: 1, consecutivePairs: 0, medianPerDay: 3, totalObservations: 3, reasonCount: 0, tiredCount: 0 },
  };
  const READY: PhaseBReadinessProgress = {
    ...PROGRESS,
    checks: PROGRESS.checks.map((c) => ({ ...c, met: true })),
    overall: "design_review_ready",
  };

  function renderB(p: PhaseBReadinessProgress): string {
    return renderToStaticMarkup(<PhaseBGateView progress={p} />);
  }

  it("★4 check が達成/未達 badge で並ぶ + DB read 別 status + 総合判定", () => {
    const html = renderB(PROGRESS);
    expect(html).toContain('data-testid="phase-b-gate"');
    for (const label of ["観測日数", "連続観測日ペア", "一日あたりの観測密度", "理由の記録（A0）"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("未達");
    expect(html).toContain("達成");
    expect(html).toContain('data-testid="phase-b-db-read"'); // ★構造的な別 status
    expect(html).toContain("承認待ち");
    expect(html).toContain('data-overall="accumulating"');
    expect(html).toContain("まだ蓄積中");
  });
  it("★全充足 → design review 可能", () => {
    const html = renderB(READY);
    expect(html).toContain('data-overall="design_review_ready"');
    expect(html).toContain("design review 可能");
  });
  it("★raw count（totals の 1/3 等の生数値）を描画しない・button なし", () => {
    const html = renderB(PROGRESS);
    // タグ/class 以外のテキストに数字が出ない（識別子 A0/Phase B を除き、達成/未達と次アクションのみ）
    const text = html.replace(/<[^>]+>/g, "").replace(/A0|Phase B/g, "");
    expect(text).not.toMatch(/[0-9]/);
    expect(html).not.toContain("<button");
  });
  it("★Phase B 実装に見えない（実行/適用/開始ボタンや断定がない）", () => {
    const html = renderB(READY);
    for (const w of ["実行", "適用", "開始する", "危険", "失敗"]) expect(html).not.toContain(w);
    expect(html).toContain("判断（CEO）"); // 次アクションは CEO 判断へ誘導するだけ
  });
});
