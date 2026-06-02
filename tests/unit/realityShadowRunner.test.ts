import { describe, it, expect } from "vitest";
import { runShadow, deriveImportance, type ShadowInput } from "@/lib/plan/reality/integration/shadow-runner";
import type { RealityInput } from "@/lib/plan/reality/integration/input-adapter";
import type { BestActionCandidate, CandidateMetrics } from "@/lib/plan/reality/best-action";
import type { ChangeSet } from "@/lib/plan/reality/change-set";
import type { SourceTrace } from "@/lib/plan/reality/source-trace";
import type { ReceptivityInput } from "@/lib/plan/reality/receptivity-gate";

const trace: SourceTrace = { kind: "seed", ref: "s1", reason: "目的", confidence: 0.8 };

function cs(id: string): ChangeSet {
  return { id, ops: [{ kind: "add", itemId: `${id}_a`, after: { itemId: `${id}_a`, startMin: 540, endMin: 600 } }], reason: "r", sourceTraces: [trace] };
}
function metrics(p: Partial<CandidateMetrics> = {}): CandidateMetrics {
  return { feasible: true, wholePartCoherent: true, recoveryProtected: true, deadlineSatisfied: true, goalAttainment: 0.8, rhythmFit: 0.7, slackHealth: 0.7, overpack: 0.1, contextSwitches: 1, instability: 0, correctionMisalignment: 0.1, ...p };
}
function cand(id: string, p: Partial<BestActionCandidate> = {}): BestActionCandidate {
  return { id, changeSet: cs(id), sourceTraces: [trace], metrics: metrics(), proposedDisposition: "confirm", ...p };
}
function realityInput(p: Partial<RealityInput> = {}): RealityInput {
  return { mode: "repair", dayNodes: [], anchors: {}, seedTraces: [], ...p };
}
function recep(p: Partial<ReceptivityInput> = {}): ReceptivityInput {
  return { stakes: "high", actionable: true, allowedActions: ["one_tap_confirm"], confidence: 0.8, sourceTraceStrength: 0.8, receptivity: 0.7, timeCritical: false, pushPermission: true, budget: { remaining: 5, recentDismissals: 0, trust: 0.9 }, ...p };
}
function shadow(p: Partial<ShadowInput> = {}): ShadowInput {
  return { input: realityInput(), candidates: [cand("plan")], intervened: true, conditionPresent: true, ...p };
}

describe("shadow-runner — pipeline (adapter→kernel→redacted summary)", () => {
  it("good candidate → best, no violations, delivery push", () => {
    const s = runShadow(shadow({ receptivity: recep() }));
    expect(s.mode).toBe("repair");
    expect(s.candidateCount).toBe(1);
    expect(s.bestRef).toBe("c0");
    expect(s.invariantViolations).toEqual([]);
    expect(s.deliveryMode).toBe("push");
  });

  it("Gate first: a high-score but gate-failing candidate is rejected (redacted ref + gate)", () => {
    const dangerous = cand("dangerous", { sourceTraces: [], metrics: metrics({ goalAttainment: 1 }) }); // traceability fail
    const safe = cand("safe", { metrics: metrics({ goalAttainment: 0.4 }) });
    const s = runShadow(shadow({ candidates: [dangerous, safe], receptivity: recep() }));
    expect(s.bestRef).toBe("c1"); // safe (index 1)
    expect(s.rejected).toEqual([{ ref: "c0", gates: ["traceability"] }]);
  });
});

describe("shadow-runner — redaction (no raw content)", () => {
  it("summary has only counts/enums/redacted ids — no raw id/title/location fields", () => {
    const s = runShadow(shadow({ candidates: [cand("super_secret_anchor_id")], receptivity: recep() }));
    // redacted ref, raw id not surfaced
    expect(s.bestRef).toBe("c0");
    expect(s.line).not.toContain("super_secret");
    expect(JSON.stringify(s)).not.toContain("super_secret");
    // ShadowSummary 型に title/location は無い
    expect(Object.keys(s).sort()).toEqual(["bestRef", "candidateCount", "deliveryMode", "invariantViolations", "line", "mode", "rejected"]);
  });

  it("line is counts/enums only", () => {
    expect(runShadow(shadow({ receptivity: recep() })).line).toMatch(/^mode=\w+ candidates=\d+ best=\S+ rejected=\d+ delivery=\S+ violations=\d+ risk=\w+$/);
  });
});

describe("shadow-runner — deriveImportance (structured signals only, NOT raw title)", () => {
  it("user-declared wins", () => {
    expect(deriveImportance({ rigidity: "soft", userDeclared: "critical" })).toBe("critical");
  });
  it("catastrophic ONLY from structured irreversibility (hardDeadline + reservation/payment/external)", () => {
    expect(deriveImportance({ rigidity: "hard", hardDeadline: true, reservation: true })).toBe("catastrophic");
    expect(deriveImportance({ rigidity: "hard", hardDeadline: true })).toBe("important"); // deadline alone ≠ catastrophic
  });
  it("hard or elevated structured flag → important; plain soft → normal", () => {
    expect(deriveImportance({ rigidity: "hard" })).toBe("important");
    expect(deriveImportance({ rigidity: "soft", involvesOthers: true })).toBe("important");
    expect(deriveImportance({ rigidity: "soft", cascadeRisk: true })).toBe("important");
    expect(deriveImportance({ rigidity: "soft" })).toBe("normal");
  });
  it("signature carries no raw-text field (structurally cannot infer from title)", () => {
    // StructuredImportanceSignals は title/body を持たない（型で raw 推測を禁止）
    const sig = { rigidity: "soft" as const };
    expect(deriveImportance(sig)).toBe("normal");
  });
});
