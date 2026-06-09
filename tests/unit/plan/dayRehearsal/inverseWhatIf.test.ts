import { describe, it, expect } from "vitest";
import {
  buildCounterfactualInput,
  previewInverseProtection,
  inverseProtectionReasonLine,
  DAY_REHEARSAL_INVERSE_ENABLED,
  type InverseWhatIfResult,
} from "@/lib/plan/dayRehearsal/inverseWhatIf";
import type {
  RehearsalInput,
  RehearsalStep,
  RehearsalEventInput,
  RehearsalTransitionInput,
} from "@/lib/plan/dayRehearsal/dayRehearsalTypes";

function ev(id: string, over: Partial<RehearsalEventInput> = {}): RehearsalEventInput {
  return { id, timeBucket: "morning", durationMin: 60, durationAssumed: false, sensitive: false, ...over };
}
function trans(over: Partial<RehearsalTransitionInput> = {}): RehearsalTransitionInput {
  return { mode: "walk", travelMin: 10, travelKnown: true, bufferStatus: "sufficient", slackMin: 60, shortfallMin: null, gapMin: 60, ...over };
}
function mkInput(steps: RehearsalStep[], over: Partial<RehearsalInput> = {}): RehearsalInput {
  return { date: "2026-06-09", dayMood: "light", density: "balanced", baseEnergyLevel: null, steps, ...over };
}
// ★FIXTURE_A: transition0 = sufficient buffer + recovery window（slack60）→ base outlook holds・recoveryWindows=[0]
const FIXTURE_A = mkInput([
  { event: ev("a"), transitionAfter: trans({ bufferStatus: "sufficient", slackMin: 60, gapMin: 60 }) },
  { event: ev("b"), transitionAfter: null },
]);
// ★FIXTURE_B: transition0 = not_applicable（守る余白なし）
const FIXTURE_B = mkInput([
  { event: ev("a"), transitionAfter: trans({ bufferStatus: "not_applicable", slackMin: null, gapMin: null }) },
  { event: ev("b"), transitionAfter: null },
]);
// ★FIXTURE_C: 小さい recovery（slack30・短い予定）→ recovery 削除で window は失うが strain level は動かない＝1 信号のみ
const FIXTURE_C = mkInput([
  { event: ev("a", { durationMin: 30 }), transitionAfter: trans({ bufferStatus: "sufficient", slackMin: 30, gapMin: 30, travelMin: 5 }) },
  { event: ev("b", { durationMin: 30 }), transitionAfter: null },
]);

describe("flag / gate", () => {
  it("★default OFF（production hard block）", () => {
    expect(DAY_REHEARSAL_INVERSE_ENABLED).toBe(false);
  });
});

describe("buildCounterfactualInput — typed scenario・immutable・数値捏造なし", () => {
  it("★without_protect_buffer: sufficient → insufficient（slack/shortfall=null）・原入力は不変", () => {
    const snapshot = JSON.parse(JSON.stringify(FIXTURE_A));
    const cf = buildCounterfactualInput(FIXTURE_A, { kind: "without_protect_buffer", targetStepIndex: 0 })!;
    expect(cf.steps[0]!.transitionAfter!.bufferStatus).toBe("insufficient");
    expect(cf.steps[0]!.transitionAfter!.slackMin).toBeNull();
    expect(cf.steps[0]!.transitionAfter!.shortfallMin).toBeNull();
    expect(FIXTURE_A).toEqual(snapshot); // ★原入力を mutate しない
  });
  it("★without_recovery_window: slack/gap → null（消費）・bufferStatus は維持", () => {
    const cf = buildCounterfactualInput(FIXTURE_A, { kind: "without_recovery_window", targetStepIndex: 0 })!;
    expect(cf.steps[0]!.transitionAfter!.slackMin).toBeNull();
    expect(cf.steps[0]!.transitionAfter!.gapMin).toBeNull();
    expect(cf.steps[0]!.transitionAfter!.bufferStatus).toBe("sufficient");
  });
  it("★守る余白なし(not_applicable)/leave_earlier/lightening → null（沈黙）", () => {
    expect(buildCounterfactualInput(FIXTURE_B, { kind: "without_protect_buffer", targetStepIndex: 0 })).toBeNull();
    expect(buildCounterfactualInput(FIXTURE_A, { kind: "without_leave_earlier", targetStepIndex: 0 })).toBeNull();
    expect(buildCounterfactualInput(FIXTURE_A, { kind: "without_lightening", targetStepIndex: 0 })).toBeNull();
  });
});

describe("previewInverseProtection — coherence gate・悪化を作りに行かない", () => {
  it("★守る buffer が load-bearing → protect_matters（≥2 整合悪化）+ magnitude", () => {
    const r = previewInverseProtection(FIXTURE_A, { kind: "without_protect_buffer", targetStepIndex: 0 });
    expect(r.status).toBe("protect_matters");
    expect(r.coherentSignals).toBeGreaterThanOrEqual(2);
    expect(r.magnitude).toBeTruthy();
  });
  it("★小さい recovery を削っても整合悪化が弱い(1 信号) → resilient（沈黙）", () => {
    const r = previewInverseProtection(FIXTURE_C, { kind: "without_recovery_window", targetStepIndex: 0 });
    expect(r.status).toBe("resilient");
    expect(r.coherentSignals).toBeLessThan(2);
    expect(r.magnitude).toBeNull();
  });
  it("★対象不適 → insufficient（沈黙）", () => {
    expect(previewInverseProtection(FIXTURE_B, { kind: "without_protect_buffer", targetStepIndex: 0 }).status).toBe("insufficient");
    expect(previewInverseProtection(FIXTURE_A, { kind: "without_leave_earlier", targetStepIndex: 0 }).status).toBe("insufficient");
    expect(previewInverseProtection(FIXTURE_B, { kind: "without_recovery_window", targetStepIndex: 0 }).status).toBe("insufficient");
  });
  it("★原入力を mutate しない", () => {
    const snapshot = JSON.parse(JSON.stringify(FIXTURE_A));
    previewInverseProtection(FIXTURE_A, { kind: "without_protect_buffer", targetStepIndex: 0 });
    expect(FIXTURE_A).toEqual(snapshot);
  });
});

describe("inverseProtectionReasonLine — 守る意味の説明・数字なし・断定なし", () => {
  it("★protect_matters のみ 1 行・「悪化/失敗/壊れる/危険」「数字/%」を含まない", () => {
    const r = previewInverseProtection(FIXTURE_A, { kind: "without_protect_buffer", targetStepIndex: 0 });
    const line = inverseProtectionReasonLine(r)!;
    expect(line).toContain("守る余白" === line ? "" : "余白");
    expect(line).toMatch(/そうです|かもしれません/); // hedge
    expect(line).not.toMatch(/[0-9%]/); // ★数字・% なし
    for (const w of ["悪化", "失敗", "壊れ", "危険", "遅れ"]) expect(line).not.toContain(w);
  });
  it("★resilient / insufficient → null（沈黙）", () => {
    const resilient: InverseWhatIfResult = { scenario: { kind: "without_recovery_window", targetStepIndex: 0 }, status: "resilient", magnitude: null, coherentSignals: 1, evidence: { basis: [], known: [], unknown: [], inferred: [] } };
    expect(inverseProtectionReasonLine(resilient)).toBeNull();
  });
});
