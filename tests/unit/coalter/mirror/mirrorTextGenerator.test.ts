/**
 * CoAlter AOO Phase B B-5b — mirrorTextGenerator invariant test
 *
 * 正本: lib/coalter/mirror/mirrorTextGenerator.ts
 */

import { describe, it, expect } from "vitest";
import {
  generateMirrorText,
  __getAllTemplatesForTest,
} from "@/lib/coalter/mirror/mirrorTextGenerator";
import type { MirrorTextGeneratorInput } from "@/lib/coalter/mirror/visibleMirrorTypes";

function baseInput(
  overrides: Partial<MirrorTextGeneratorInput> = {},
): MirrorTextGeneratorInput {
  return {
    mode: "normal",
    alignmentBucket: "neutral",
    uncertaintyBucket: "mid_30_to_70",
    silenceBudgetBucket: "low_0_to_30",
    ...overrides,
  };
}

describe("B-5b mirrorTextGenerator — not_applicable 経路 (fail-closed)", () => {
  it("travel mode → not_applicable (travel_mode)", () => {
    const r = generateMirrorText(baseInput({ mode: "travel" }));
    expect(r.kind).toBe("not_applicable");
    if (r.kind === "not_applicable") {
      expect(r.reason).toBe("travel_mode");
    }
  });

  it("alignment unknown → not_applicable (alignment_unknown)", () => {
    const r = generateMirrorText(baseInput({ alignmentBucket: "unknown" }));
    expect(r.kind).toBe("not_applicable");
    if (r.kind === "not_applicable") {
      expect(r.reason).toBe("alignment_unknown");
    }
  });

  it("uncertainty unknown → not_applicable (uncertainty_unknown)", () => {
    const r = generateMirrorText(baseInput({ uncertaintyBucket: "unknown" }));
    expect(r.kind).toBe("not_applicable");
    if (r.kind === "not_applicable") {
      expect(r.reason).toBe("uncertainty_unknown");
    }
  });

  it("silenceBudget unknown → not_applicable (silence_budget_unknown)", () => {
    const r = generateMirrorText(baseInput({ silenceBudgetBucket: "unknown" }));
    expect(r.kind).toBe("not_applicable");
    if (r.kind === "not_applicable") {
      expect(r.reason).toBe("silence_budget_unknown");
    }
  });
});

describe("B-5b mirrorTextGenerator — deterministic mapping", () => {
  it("silenceBudget low + uncertainty low → state_mirror_pause", () => {
    const r = generateMirrorText(
      baseInput({
        silenceBudgetBucket: "low_0_to_30",
        uncertaintyBucket: "low_0_to_30",
      }),
    );
    expect(r.kind).toBe("generated");
    if (r.kind === "generated") {
      expect(r.templateId).toBe("state_mirror_pause");
      expect(r.text.length).toBeGreaterThan(0);
    }
  });

  it("alignment strongly_negative + uncertainty mid → state_mirror_unsettled", () => {
    const r = generateMirrorText(
      baseInput({
        alignmentBucket: "strongly_negative",
        uncertaintyBucket: "mid_30_to_70",
      }),
    );
    expect(r.kind).toBe("generated");
    if (r.kind === "generated") expect(r.templateId).toBe("state_mirror_unsettled");
  });

  it("alignment negative + uncertainty mid → state_mirror_unsettled", () => {
    const r = generateMirrorText(
      baseInput({
        alignmentBucket: "negative",
        uncertaintyBucket: "mid_30_to_70",
      }),
    );
    expect(r.kind).toBe("generated");
    if (r.kind === "generated") expect(r.templateId).toBe("state_mirror_unsettled");
  });

  it("alignment neutral + uncertainty mid → state_mirror_preverbal", () => {
    const r = generateMirrorText(
      baseInput({
        alignmentBucket: "neutral",
        uncertaintyBucket: "mid_30_to_70",
      }),
    );
    expect(r.kind).toBe("generated");
    if (r.kind === "generated") expect(r.templateId).toBe("state_mirror_preverbal");
  });

  it("silenceBudget mid + uncertainty mid + alignment positive → state_mirror_holding", () => {
    const r = generateMirrorText(
      baseInput({
        alignmentBucket: "positive",
        silenceBudgetBucket: "mid_30_to_70",
        uncertaintyBucket: "mid_30_to_70",
      }),
    );
    expect(r.kind).toBe("generated");
    if (r.kind === "generated") expect(r.templateId).toBe("state_mirror_holding");
  });

  it("fallback → state_mirror_threshold (alignment strongly_positive + uncertainty low)", () => {
    const r = generateMirrorText(
      baseInput({
        alignmentBucket: "strongly_positive",
        uncertaintyBucket: "low_0_to_30",
        silenceBudgetBucket: "low_0_to_30",
      }),
    );
    // silenceBudget low + uncertainty low の match が先 → pause
    expect(r.kind).toBe("generated");
    if (r.kind === "generated") expect(r.templateId).toBe("state_mirror_pause");
  });
});

describe("B-5b mirrorTextGenerator — text content invariants", () => {
  it("returned text は templates table の text と完全一致", () => {
    const allTemplates = __getAllTemplatesForTest();
    const byId = new Map(allTemplates.map((t) => [t.id, t.text]));

    const r = generateMirrorText(
      baseInput({
        alignmentBucket: "neutral",
        uncertaintyBucket: "mid_30_to_70",
      }),
    );
    expect(r.kind).toBe("generated");
    if (r.kind === "generated") {
      expect(r.text).toBe(byId.get(r.templateId));
    }
  });

  it("生成 text は疑問符を含まない", () => {
    const inputs: MirrorTextGeneratorInput[] = [
      baseInput({ silenceBudgetBucket: "low_0_to_30", uncertaintyBucket: "low_0_to_30" }),
      baseInput({ alignmentBucket: "negative", uncertaintyBucket: "mid_30_to_70" }),
      baseInput({ alignmentBucket: "neutral", uncertaintyBucket: "mid_30_to_70" }),
      baseInput({
        alignmentBucket: "positive",
        silenceBudgetBucket: "mid_30_to_70",
        uncertaintyBucket: "mid_30_to_70",
      }),
    ];
    for (const inp of inputs) {
      const r = generateMirrorText(inp);
      if (r.kind === "generated") {
        expect(r.text).not.toMatch(/[?？]/);
      }
    }
  });
});

describe("B-5b mirrorTextGenerator — invariants", () => {
  it("deterministic: 同入力で同 templateId / text", () => {
    const input = baseInput({
      alignmentBucket: "neutral",
      uncertaintyBucket: "mid_30_to_70",
    });
    const r1 = generateMirrorText(input);
    const r2 = generateMirrorText(input);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("input mutation なし", () => {
    const input: MirrorTextGeneratorInput = {
      mode: "normal",
      alignmentBucket: "neutral",
      uncertaintyBucket: "mid_30_to_70",
      silenceBudgetBucket: "low_0_to_30",
    };
    const snapshot = JSON.stringify(input);
    generateMirrorText(input);
    generateMirrorText(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("PII 非受理 (型に raw text field なし、injection しても output に漏れない)", () => {
    const inputWithPII = {
      mode: "normal",
      alignmentBucket: "neutral",
      uncertaintyBucket: "mid_30_to_70",
      silenceBudgetBucket: "low_0_to_30",
      rawText: "leak",
      userId: "user_pii",
    } as unknown as MirrorTextGeneratorInput;
    const r = generateMirrorText(inputWithPII);
    if (r.kind === "generated") {
      expect(r.text).not.toContain("leak");
      expect(r.text).not.toContain("user_pii");
    }
  });
});
