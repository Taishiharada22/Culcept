/**
 * dayRepairSimulation — What-if / Draft Preview v0（pure・counterfactual re-simulation）。
 * 分類（eases/preserves/uncertain/ambiguous）/ 捏造なし / read-only / 仮説トーン を検証。
 */
import { describe, it, expect } from "vitest";
import { previewRepairSimulation, previewRepairSimulations } from "@/lib/plan/dayRehearsal/dayRepairSimulation";
import type { RehearsalInput, RehearsalStep, RehearsalTransitionInput } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";
import type { DayRepairCandidate, DayRepairKind } from "@/lib/plan/dayRehearsal/dayRepairCandidates";

const ev = (id: string): RehearsalStep["event"] => ({ id, timeBucket: "noon", durationMin: 60, durationAssumed: false, sensitive: false });
const tr = (over: Partial<RehearsalTransitionInput>): RehearsalTransitionInput => ({
  mode: "unknown", travelMin: 30, travelKnown: false, bufferStatus: "sufficient", slackMin: 60, shortfallMin: null, gapMin: 90, ...over,
});
const cand = (kind: DayRepairKind, targetStepIndex: number | null): DayRepairCandidate => ({
  kind, suggestion: "(test)", targetStepIndex, evidence: { basis: [], known: [], unknown: [], inferred: [] },
});

// insufficient + 短距離移動（friction は shortfall 由来・strain は低）→ buffer 除去で convergence が完全に和らぐ対象。
// （長距離移動だと strain_high も立ち、buffer 解消後も strain+friction で marker が残る＝localEased false という別の honest ケース）
const INSUFFICIENT = { bufferStatus: "insufficient" as const, slackMin: null, shortfallMin: 40, travelMin: 10 };

// 単一不足: step0 insufficient → 解消すると anyInsufficient false（outlook 改善）
const singleInsufficient = (): RehearsalInput => ({
  date: "2026-06-08", dayMood: "light", density: "balanced", baseEnergyLevel: null,
  steps: [
    { event: ev("a"), transitionAfter: tr(INSUFFICIENT) },
    { event: ev("b"), transitionAfter: null },
  ],
});
// 複数不足: step0/step1 insufficient → step0 解消しても step1 残る（outlook 据置）
const multiInsufficient = (): RehearsalInput => ({
  date: "2026-06-08", dayMood: "light", density: "balanced", baseEnergyLevel: null,
  steps: [
    { event: ev("a"), transitionAfter: tr(INSUFFICIENT) },
    { event: ev("b"), transitionAfter: tr(INSUFFICIENT) },
    { event: ev("c"), transitionAfter: null },
  ],
});
const anyInput = singleInsufficient; // 分類のみのテストで input は使われない

describe("previewRepairSimulation — 分類（不可・保全）", () => {
  it("SIM1. reduce_density（target null）→ ambiguous_target・simulatable=false・diff=null", () => {
    const r = previewRepairSimulation(anyInput(), cand("reduce_density", null));
    expect(r.status).toBe("ambiguous_target");
    expect(r.simulatable).toBe(false);
    expect(r.diff).toBeNull();
  });
  it("SIM2. confirm_uncertain → uncertain・simulatable=false・diff=null（未確定は捏造しない）", () => {
    const r = previewRepairSimulation(anyInput(), cand("confirm_uncertain", 0));
    expect(r.status).toBe("uncertain");
    expect(r.simulatable).toBe(false);
    expect(r.diff).toBeNull();
  });
  it("SIM3. protect_buffer → preserves・simulatable=true・diff=null（改善を捏造しない）", () => {
    const r = previewRepairSimulation(anyInput(), cand("protect_buffer", 0));
    expect(r.status).toBe("preserves");
    expect(r.simulatable).toBe(true);
    expect(r.diff).toBeNull();
  });
  it("SIM4. use_recovery_window → preserves・simulatable=true・diff=null", () => {
    const r = previewRepairSimulation(anyInput(), cand("use_recovery_window", 0));
    expect(r.status).toBe("preserves");
    expect(r.diff).toBeNull();
  });
});

describe("previewRepairSimulation — leave_earlier（counterfactual）", () => {
  it("SIM5. 単一不足を解消 → eases_conditionally・localEased・outlookEased（全体も改善）", () => {
    const r = previewRepairSimulation(singleInsufficient(), cand("leave_earlier", 0));
    expect(r.status).toBe("eases_conditionally");
    expect(r.simulatable).toBe(true);
    expect(r.diff).not.toBeNull();
    expect(r.diff!.localEased).toBe(true);
    expect(r.diff!.outlookEased).toBe(true); // 唯一の不足が消える → outlook 改善
  });
  it("SIM6. 複数不足のうち 1 つ解消 → localEased だが outlookEased=false（過剰主張しない）", () => {
    const r = previewRepairSimulation(multiInsufficient(), cand("leave_earlier", 0));
    expect(r.status).toBe("eases_conditionally");
    expect(r.diff!.localEased).toBe(true);
    expect(r.diff!.outlookEased).toBe(false); // 他に不足が残る → 1日全体は据置
    expect(r.summary).toContain("ほかにも"); // honest な但し書き
  });
  it("SIM7. factorsResolved に buffer_short を含む（解消されたのは buffer 不足）", () => {
    const r = previewRepairSimulation(singleInsufficient(), cand("leave_earlier", 0));
    expect(r.diff!.factorsResolved).toContain("buffer_short");
  });
  it("SIM8. HARD GATE: 余白不足でない step に leave_earlier（防御）→ uncertain（捏造しない）", () => {
    const r = previewRepairSimulation(singleInsufficient(), cand("leave_earlier", 1)); // step1 は transition なし
    expect(r.simulatable).toBe(false);
    expect(r.diff).toBeNull();
  });
});

describe("previewRepairSimulation — 安全性（捏造なし・read-only・仮説トーン）", () => {
  const allSummaries = (): string[] => [
    previewRepairSimulation(singleInsufficient(), cand("leave_earlier", 0)).summary,
    previewRepairSimulation(multiInsufficient(), cand("leave_earlier", 0)).summary,
    previewRepairSimulation(anyInput(), cand("protect_buffer", 0)).summary,
    previewRepairSimulation(anyInput(), cand("use_recovery_window", 0)).summary,
    previewRepairSimulation(anyInput(), cand("confirm_uncertain", 0)).summary,
    previewRepairSimulation(anyInput(), cand("reduce_density", null)).summary,
  ];

  it("SIM9. summary に生数値（数字）を含まない", () => {
    for (const s of allSummaries()) expect(s).not.toMatch(/\d/);
  });
  it("SIM10. summary に level 名 / outlook 名 / 内部語を含まない", () => {
    for (const s of allSummaries()) expect(s).not.toMatch(/low|moderate|high|holds|tight|breaks|score|slack|shortfall|buffer/i);
  });
  it("SIM11. summary に警告/断定/予測語を含まない（仮説トーン）", () => {
    for (const s of allSummaries()) {
      expect(s).not.toMatch(/危険|警告|失敗|疲れ|壊れ|最適化|予測|予想|推奨|必ず|絶対|診断|際どい/);
      expect(s).toMatch(/かもしれません|そうです|できません/); // 仮説 or 不可の honest トーン
    }
  });
  it("SIM12. read-only: 入力 RehearsalInput を変更しない（counterfactual は複製）", () => {
    const input = singleInsufficient();
    const snapshot = JSON.stringify(input);
    previewRepairSimulation(input, cand("leave_earlier", 0));
    expect(JSON.stringify(input)).toBe(snapshot); // 元 input 不変
    expect(input.steps[0]!.transitionAfter!.bufferStatus).toBe("insufficient"); // 置換が漏れていない
  });
  it("SIM13. 決定的（同入力→同結果）", () => {
    const a = previewRepairSimulation(singleInsufficient(), cand("leave_earlier", 0));
    const b = previewRepairSimulation(singleInsufficient(), cand("leave_earlier", 0));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("previewRepairSimulations — 一括", () => {
  it("SIM14. 順序保持・件数一致", () => {
    const cands = [cand("leave_earlier", 0), cand("protect_buffer", 0), cand("reduce_density", null)];
    const rs = previewRepairSimulations(singleInsufficient(), cands);
    expect(rs.length).toBe(3);
    expect(rs.map((r) => r.kind)).toEqual(["leave_earlier", "protect_buffer", "reduce_density"]);
  });
});
