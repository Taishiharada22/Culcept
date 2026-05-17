/**
 * CoAlter AOO Phase B B-5b — visibleMirrorEvaluator invariant test
 *
 * 正本: lib/coalter/mirror/visibleMirrorEvaluator.ts
 *
 * 4-gate orchestration を test (sleep / cap / generator / verification)。
 */

import { describe, it, expect } from "vitest";
import { evaluateVisibleMirror } from "@/lib/coalter/mirror/visibleMirrorEvaluator";
import type {
  MirrorDecision,
  MirrorDecisionInput,
} from "@/lib/coalter/mirror/types";

// =============================================================================
// Builders (test fixture)
// =============================================================================

function happyEngineInput(): MirrorDecisionInput {
  return {
    modeContext: {
      status: "known",
      mode: "normal",
      source: "presence_state",
      canProceedToMirrorDecision: true,
    },
    alignment: {
      status: "known",
      bucket: "neutral",
      raw: 0.0,
      canProceedToMirrorDecision: true,
    },
    uncertainty: {
      status: "known",
      bucket: "mid_30_to_70",
      raw: 0.5,
      canProceedToMirrorDecision: true,
    },
    silenceBudget: {
      status: "known",
      bucket: "low_0_to_30",
      raw: 0.1,
      canProceedToMirrorDecision: true,
    },
    patternCategory: {
      status: "known",
      bucket: "null_pattern",
      canProceedToMirrorDecision: true,
    },
    observationNovelty: 1.0,
    conversationPhase: "in_progress",
    timeSinceLastSpeakTurns: 100,
    ruptureFlag: false,
    userOverrideSleep: false,
  };
}

function mirrorCandidate(ervScore: number = 0.9): MirrorDecision {
  return { type: "MIRROR_CANDIDATE", reason: "speak_passed", ervScore };
}

function staySilent(reason = "observe_gate_unknown_modeContext" as const): MirrorDecision {
  return { type: "STAY_SILENT", reason };
}

// =============================================================================
// Tests
// =============================================================================

describe("B-5b visibleMirrorEvaluator — Gate 1: decision check", () => {
  it("STAY_SILENT → absent (decision_stay_silent)", () => {
    const r = evaluateVisibleMirror({
      decision: staySilent(),
      engineInput: happyEngineInput(),
      sleepOn: false,
      visibleCapReached: false,
      recentlyEmittedTemplateIds: [],
    });
    expect(r.kind).toBe("absent");
    if (r.kind === "absent") expect(r.reason).toBe("decision_stay_silent");
  });
});

describe("B-5b visibleMirrorEvaluator — Gate 2: sleep check (decision_check 後)", () => {
  it("MIRROR_CANDIDATE + sleepOn → absent (sleep_on)", () => {
    const r = evaluateVisibleMirror({
      decision: mirrorCandidate(),
      engineInput: happyEngineInput(),
      sleepOn: true,
      visibleCapReached: false,
      recentlyEmittedTemplateIds: [],
    });
    expect(r.kind).toBe("absent");
    if (r.kind === "absent") expect(r.reason).toBe("sleep_on");
  });

  it("sleepOn は STAY_SILENT より後 (Gate 1 が優先)", () => {
    const r = evaluateVisibleMirror({
      decision: staySilent(),
      engineInput: happyEngineInput(),
      sleepOn: true,
      visibleCapReached: false,
      recentlyEmittedTemplateIds: [],
    });
    if (r.kind === "absent") expect(r.reason).toBe("decision_stay_silent");
  });
});

describe("B-5b visibleMirrorEvaluator — Gate 3: cap check", () => {
  it("MIRROR_CANDIDATE + cap reached → absent (visible_cap_reached)", () => {
    const r = evaluateVisibleMirror({
      decision: mirrorCandidate(),
      engineInput: happyEngineInput(),
      sleepOn: false,
      visibleCapReached: true,
      recentlyEmittedTemplateIds: [],
    });
    expect(r.kind).toBe("absent");
    if (r.kind === "absent") expect(r.reason).toBe("visible_cap_reached");
  });

  it("sleep ON + cap reached → sleep_on (gate 2 が優先)", () => {
    const r = evaluateVisibleMirror({
      decision: mirrorCandidate(),
      engineInput: happyEngineInput(),
      sleepOn: true,
      visibleCapReached: true,
      recentlyEmittedTemplateIds: [],
    });
    if (r.kind === "absent") expect(r.reason).toBe("sleep_on");
  });
});

describe("B-5b visibleMirrorEvaluator — Gate 4: text generation", () => {
  it("travel mode → text_not_generated (generator not_applicable)", () => {
    const input = happyEngineInput();
    const r = evaluateVisibleMirror({
      decision: mirrorCandidate(),
      engineInput: {
        ...input,
        modeContext: {
          status: "known",
          mode: "travel",
          source: "presence_state",
          canProceedToMirrorDecision: true,
        },
      },
      sleepOn: false,
      visibleCapReached: false,
      recentlyEmittedTemplateIds: [],
    });
    expect(r.kind).toBe("absent");
    if (r.kind === "absent") expect(r.reason).toBe("text_not_generated");
  });
});

describe("B-5b visibleMirrorEvaluator — Gate 5: verification", () => {
  it("同 templateId が recentlyEmitted → verification_failed (duplicate_in_session)", () => {
    const r = evaluateVisibleMirror({
      decision: mirrorCandidate(),
      engineInput: happyEngineInput(),
      sleepOn: false,
      visibleCapReached: false,
      recentlyEmittedTemplateIds: ["state_mirror_preverbal"], // happy input → preverbal
    });
    expect(r.kind).toBe("absent");
    if (r.kind === "absent") {
      expect(r.reason).toBe("verification_failed");
      expect(r.verificationFailReason).toBe("duplicate_in_session");
    }
  });
});

describe("B-5b visibleMirrorEvaluator — visible (all gates pass)", () => {
  it("happy path → visible (text + templateId)", () => {
    const r = evaluateVisibleMirror({
      decision: mirrorCandidate(),
      engineInput: happyEngineInput(),
      sleepOn: false,
      visibleCapReached: false,
      recentlyEmittedTemplateIds: [],
    });
    expect(r.kind).toBe("visible");
    if (r.kind === "visible") {
      expect(r.text.length).toBeGreaterThan(0);
      expect(r.templateId).toBe("state_mirror_preverbal");
      // hedged form, no question/imperative/suggestion (verification を通った text)
      expect(r.text).not.toMatch(/[?？]/);
    }
  });
});

describe("B-5b visibleMirrorEvaluator — invariants", () => {
  it("deterministic", () => {
    const input = {
      decision: mirrorCandidate(),
      engineInput: happyEngineInput(),
      sleepOn: false,
      visibleCapReached: false,
      recentlyEmittedTemplateIds: [],
    } as const;
    const r1 = evaluateVisibleMirror(input);
    const r2 = evaluateVisibleMirror(input);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("input mutation なし", () => {
    const input = {
      decision: mirrorCandidate(),
      engineInput: happyEngineInput(),
      sleepOn: false,
      visibleCapReached: false,
      recentlyEmittedTemplateIds: ["state_mirror_pause"] as ReadonlyArray<"state_mirror_pause">,
    };
    const snapshot = JSON.stringify(input);
    evaluateVisibleMirror(input);
    evaluateVisibleMirror(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
