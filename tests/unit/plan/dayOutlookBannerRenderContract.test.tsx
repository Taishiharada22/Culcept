/**
 * DayOutlookBanner render contract — 仮説トーン / warning 色禁止 / 断定語禁止 / unknown 非表示
 * + Evidence「なぜ?」disclosure（read-only details・default 閉・観測/推定/未確定・生数字/警告/診断なし）。
 * Day Rehearsal UI 露出の安全性を render で機械保証。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DayOutlookBanner } from "@/app/(culcept)/plan/components/DayOutlookBanner";
import type { DayRehearsal, ViabilityOutlook } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";
import type { DayRepairCandidate, DayRepairKind } from "@/lib/plan/dayRehearsal/dayRepairCandidates";

const EV = { basis: [], known: [], unknown: [], inferred: [] };
const EST = { level: "low" as const, score: 0, evidence: EV };

/** 完全形 fixture（explainDayOutlook が steps/density/convergencePoints を読むため）。 */
function rehearsalWith(outlook: ViabilityOutlook, over: Partial<DayRehearsal> = {}): DayRehearsal {
  return {
    date: "2026-06-07",
    density: "balanced",
    viability: { outlook, breaksAtStepIndex: null, evidence: EV },
    steps: [],
    peakStrain: EST,
    recoveryWindows: [],
    convergencePoints: [],
    coverage: { transitionsTotal: 0, travelKnown: 0, travelUnknown: 0, eventsAssumedDuration: 0 },
    ...over,
  };
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

describe("DayOutlookBanner — Evidence「なぜ?」disclosure", () => {
  it("なぜ? disclosure を含む（native details + summary + testid）", () => {
    const html = renderToStaticMarkup(<DayOutlookBanner rehearsal={rehearsalWith("tight")} />);
    expect(html).toContain('data-testid="plan-day-outlook-why"');
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("なぜ?");
  });

  it("default 閉（details に open 属性なし）", () => {
    const html = renderToStaticMarkup(<DayOutlookBanner rehearsal={rehearsalWith("tight")} />);
    expect(html).not.toMatch(/<details\b[^>]*\bopen\b/);
  });

  it("観測行『この予定の並び』を常に含む（観測フレーム）", () => {
    const html = renderToStaticMarkup(<DayOutlookBanner rehearsal={rehearsalWith("holds")} />);
    expect(html).toContain("この見通しは、");
    expect(html).toContain("この予定の並び");
    expect(html).toContain("から見ています");
  });

  it("packed → 観測『予定の密度』を展開に含む", () => {
    const html = renderToStaticMarkup(<DayOutlookBanner rehearsal={rehearsalWith("tight", { density: "packed" })} />);
    expect(html).toContain("予定の密度");
  });

  it("convergence → 推定『重なりやすさ』を含む", () => {
    const html = renderToStaticMarkup(<DayOutlookBanner rehearsal={rehearsalWith("breaks", { convergencePoints: [0] })} />);
    expect(html).toContain("重なりやすさ");
    expect(html).toContain("推定");
  });

  it("recoveryStepCount>0 → 推定『一息つけそうな区間』を含む", () => {
    const html = renderToStaticMarkup(<DayOutlookBanner rehearsal={rehearsalWith("holds")} recoveryStepCount={2} />);
    expect(html).toContain("一息つけそうな区間");
  });

  it("disclosure も warning 色 / 断定・警告・診断語を含まない", () => {
    const html = renderToStaticMarkup(
      <DayOutlookBanner rehearsal={rehearsalWith("breaks", { density: "packed", convergencePoints: [0] })} recoveryStepCount={1} />,
    );
    for (const w of ["amber", "orange", "bg-red", "危険", "警告", "失敗", "疲れ", "壊れ", "診断", "最適化", "予測", "予想"]) {
      expect(html).not.toContain(w);
    }
  });
});

describe("DayOutlookBanner — Repair「どうするとよさそう？」disclosure", () => {
  const rc = (kind: DayRepairKind, suggestion: string): DayRepairCandidate => ({ kind, suggestion, targetStepIndex: null, evidence: EV });

  it("候補あり → native details + summary「どうするとよさそう？」+ suggestion 行", () => {
    const html = renderToStaticMarkup(
      <DayOutlookBanner rehearsal={rehearsalWith("tight")} repairCandidates={[rc("leave_earlier", "この移動の前後は、出発を少し早める余地があるかもしれません")]} />,
    );
    expect(html).toContain('data-testid="plan-day-outlook-repair"');
    expect(html).toContain("どうするとよさそう？");
    expect(html).toContain("この移動の前後は、出発を少し早める余地があるかもしれません");
  });

  it("候補 0 件 → disclosure を出さない", () => {
    const html = renderToStaticMarkup(<DayOutlookBanner rehearsal={rehearsalWith("tight")} repairCandidates={[]} />);
    expect(html).not.toContain("plan-day-outlook-repair");
    expect(html).not.toContain("どうするとよさそう？");
  });

  it("repairCandidates prop なし → disclosure を出さない", () => {
    const html = renderToStaticMarkup(<DayOutlookBanner rehearsal={rehearsalWith("tight")} />);
    expect(html).not.toContain("plan-day-outlook-repair");
  });

  it("default 閉（details に open 属性なし）", () => {
    const html = renderToStaticMarkup(<DayOutlookBanner rehearsal={rehearsalWith("tight")} repairCandidates={[rc("leave_earlier", "s")]} />);
    expect(html).not.toMatch(/<details\b[^>]*\bopen\b/);
  });

  it("read-only: 実行 UI（button/input/適用/保存/チェック）を置かない", () => {
    const html = renderToStaticMarkup(
      <DayOutlookBanner rehearsal={rehearsalWith("breaks")} repairCandidates={[rc("leave_earlier", "この移動の前後は、出発を少し早める余地があるかもしれません"), rc("protect_buffer", "この前後は余白を守ると、予定が重なりにくそうです")]} />,
    );
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("適用");
    expect(html).not.toContain("保存");
    expect(html).not.toContain("type=\"checkbox\"");
  });

  it("repair 候補に禁止語・警告色を含まない", () => {
    const html = renderToStaticMarkup(
      <DayOutlookBanner rehearsal={rehearsalWith("breaks")} repairCandidates={[rc("leave_earlier", "この移動の前後は、出発を少し早める余地があるかもしれません"), rc("reduce_density", "予定が立て込む区間を少し軽くできると、ゆとりが生まれそうです")]} />,
    );
    for (const w of ["amber", "orange", "bg-red", "危険", "警告", "失敗", "疲れ", "壊れ", "絶対", "すべき"]) {
      expect(html).not.toContain(w);
    }
  });

  it("「なぜ?」と「どうするとよさそう？」が共存（既存 disclosure 非破壊）", () => {
    const html = renderToStaticMarkup(
      <DayOutlookBanner rehearsal={rehearsalWith("tight")} repairCandidates={[rc("leave_earlier", "この移動の前後は、出発を少し早める余地があるかもしれません")]} />,
    );
    expect(html).toContain('data-testid="plan-day-outlook-why"'); // なぜ? 健在
    expect(html).toContain('data-testid="plan-day-outlook-repair"'); // どうする? 追加
  });
});

// ── What-if v0 UI: 候補文の下の「試すと…」simulation 1 行 ──
describe("DayOutlookBanner — What-if v0 simulation line", () => {
  const rc = (kind: DayRepairKind, suggestion: string): DayRepairCandidate => ({ kind, suggestion, targetStepIndex: 0, evidence: EV });
  const LE = rc("leave_earlier", "この移動の前後は、出発を少し早める余地があるかもしれません");
  const PB = rc("protect_buffer", "この前後は余白を守ると、予定が重なりにくそうです");
  const SIM_LE = "試すと、この移動が和らいで、その日全体も少しゆとりが出そうです";

  it("WIF1. leave_earlier に sim 行が供給 → 候補文の下に「試すと…」が出る", () => {
    const html = renderToStaticMarkup(
      <DayOutlookBanner rehearsal={rehearsalWith("breaks")} repairCandidates={[LE]} simulationLineByKind={new Map([["leave_earlier", SIM_LE]])} />,
    );
    expect(html).toContain('data-testid="plan-day-outlook-sim"');
    expect(html).toContain(SIM_LE);
  });

  it("WIF2. simulationLineByKind なし → sim 行は出ない（既存挙動不変）", () => {
    const html = renderToStaticMarkup(<DayOutlookBanner rehearsal={rehearsalWith("breaks")} repairCandidates={[LE]} />);
    expect(html).not.toContain("plan-day-outlook-sim");
  });

  it("WIF3. map に該当 kind が無い候補には sim 行を出さない（leave_earlier のみ）", () => {
    const html = renderToStaticMarkup(
      <DayOutlookBanner rehearsal={rehearsalWith("breaks")} repairCandidates={[LE, PB]} simulationLineByKind={new Map([["leave_earlier", SIM_LE]])} />,
    );
    // sim 行は 1 つだけ（leave_earlier のみ）
    expect((html.match(/plan-day-outlook-sim/g) ?? []).length).toBe(1);
    expect(html).toContain('data-sim-kind="leave_earlier"');
    expect(html).not.toContain('data-sim-kind="protect_buffer"');
  });

  it("WIF4. read-only: sim 行は span（button/input/適用/保存なし）", () => {
    const html = renderToStaticMarkup(
      <DayOutlookBanner rehearsal={rehearsalWith("breaks")} repairCandidates={[LE]} simulationLineByKind={new Map([["leave_earlier", SIM_LE]])} />,
    );
    expect(html).toContain('data-testid="plan-day-outlook-sim"');
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("適用");
    expect(html).not.toContain("保存");
  });

  it("WIF5. sim 行は slate 中立・警告色/禁止語なし", () => {
    const html = renderToStaticMarkup(
      <DayOutlookBanner rehearsal={rehearsalWith("breaks")} repairCandidates={[LE]} simulationLineByKind={new Map([["leave_earlier", SIM_LE]])} />,
    );
    expect(html).toMatch(/plan-day-outlook-sim[\s\S]{0,160}text-slate-400/);
    for (const w of ["amber", "orange", "bg-red", "危険", "警告", "改善します", "解決します", "最適化"]) {
      expect(html).not.toContain(w);
    }
  });

  it("WIF6. 候補 0 件 → repair disclosure ごと出ない（sim 行も当然なし）", () => {
    const html = renderToStaticMarkup(
      <DayOutlookBanner rehearsal={rehearsalWith("breaks")} repairCandidates={[]} simulationLineByKind={new Map([["leave_earlier", SIM_LE]])} />,
    );
    expect(html).not.toContain("plan-day-outlook-repair");
    expect(html).not.toContain("plan-day-outlook-sim");
  });
});
