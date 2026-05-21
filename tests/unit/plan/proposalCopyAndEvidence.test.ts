/**
 * Phase 3-J-1b: Self-Evidence + Copy + Evidence Tiered + Linguistic Mirror + No-AI-Subject Lint
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-1b / §10.4 Smoke 38-39 / §10.5 Smoke 48-49
 *
 * 検証対象:
 *   - selfEvidenceRecord: evidenceCountOf for 4 observation kinds
 *   - proposalCopy: 12 template + render + placeholder substitution
 *   - evidenceTieredCopy: classifyEvidenceTier 4 branches + copyPrefixForTier
 *   - linguisticMirror: pickMirroredToken 各 path
 *   - noAiSubjectLint: violation detection + assert + ALL 12 copy templates PASS
 *
 * 不変原則 (= 本 test で機械的に強制):
 *   - Invariant 18 Reflection-triggering copy
 *   - Invariant 29 Past-Self Voice
 *   - Invariant 34 No-AI-Subject Copy
 */

import { describe, it, expect } from "vitest";

import {
  evidenceCountOf,
  type DayPatternObservation,
  type LivedGeographyObservation,
  type PatternRepeatObservation,
  type UnconfirmedPlaceObservation,
} from "@/lib/plan/proposal/selfEvidenceRecord";
import {
  PROPOSAL_COPY_TABLE,
  getProposalCopyTemplate,
  renderCopyTemplate,
  renderProposalCopy,
  type ProposalCopyKey,
} from "@/lib/plan/proposal/copy/proposalCopy";
import {
  classifyEvidenceTier,
  copyPrefixForTier,
  type EvidenceTier,
} from "@/lib/plan/proposal/copy/evidenceTieredCopy";
import { pickMirroredToken } from "@/lib/plan/proposal/copy/linguisticMirror";
import {
  assertNoAiSubject,
  detectAiSubjectViolations,
} from "@/lib/plan/proposal/copy/noAiSubjectLint";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test fixture: ExternalAnchor builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildAnchor(title: string, overrides: Partial<ExternalAnchor> = {}): ExternalAnchor {
  return {
    id: `anchor_${title.replace(/\s/g, "_")}`,
    userId: "user_test",
    title,
    startTime: "10:00",
    rigidity: "soft",
    sourceId: "src_test",
    confirmedAt: "2026-05-21T00:00:00.000Z",
    anchorKind: "one_off",
    date: "2026-05-22",
    ...overrides,
  } as ExternalAnchor;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// selfEvidenceRecord: evidenceCountOf
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("selfEvidenceRecord.evidenceCountOf", () => {
  it("pattern_repeat returns repetitionCount", () => {
    const obs: PatternRepeatObservation = {
      kind: "pattern_repeat",
      repetitionCount: 4,
      weekWindow: 4,
      matchingFeature: "monday_morning_cafe",
    };
    expect(evidenceCountOf(obs)).toBe(4);
  });

  it("lived_geography returns sampleCount", () => {
    const obs: LivedGeographyObservation = {
      kind: "lived_geography",
      sampleCount: 7,
      maxDistanceKm: 5.2,
      centroidLat: 35.69,
      centroidLng: 139.7,
    };
    expect(evidenceCountOf(obs)).toBe(7);
  });

  it("day_pattern returns observedDays", () => {
    const obs: DayPatternObservation = {
      kind: "day_pattern",
      weekday: "Mon",
      observedDays: 3,
    };
    expect(evidenceCountOf(obs)).toBe(3);
  });

  it("unconfirmed_place returns 1", () => {
    const obs: UnconfirmedPlaceObservation = {
      kind: "unconfirmed_place",
      anchorId: "anchor_xyz",
      suggestedLocation: "新宿",
    };
    expect(evidenceCountOf(obs)).toBe(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// proposalCopy: 12 template + render
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PROPOSAL_COPY_TABLE — 12 templates (= 4 reason × 3 direction)", () => {
  it("has exactly 12 entries", () => {
    expect(Object.keys(PROPOSAL_COPY_TABLE)).toHaveLength(12);
  });

  it("all 12 entries have non-empty headline", () => {
    for (const key of Object.keys(PROPOSAL_COPY_TABLE) as ProposalCopyKey[]) {
      const template = PROPOSAL_COPY_TABLE[key];
      expect(template.headline.length).toBeGreaterThan(0);
    }
  });

  it("intentional_break_observed entries have no subtext (= 観測文、 補助なし)", () => {
    expect(PROPOSAL_COPY_TABLE["pattern_repeat__intentional_break_observed"].subtext).toBeUndefined();
    expect(PROPOSAL_COPY_TABLE["lived_geography_centroid__intentional_break_observed"].subtext).toBeUndefined();
    expect(PROPOSAL_COPY_TABLE["day_pattern__intentional_break_observed"].subtext).toBeUndefined();
    expect(PROPOSAL_COPY_TABLE["unconfirmed_place_hint__intentional_break_observed"].subtext).toBeUndefined();
  });
});

describe("getProposalCopyTemplate", () => {
  it("returns template for known key", () => {
    const t = getProposalCopyTemplate("pattern_repeat", "continue_pattern");
    expect(t).not.toBeNull();
    expect(t?.headline).toContain("時間ですか?");
  });

  it("returns the same instance for repeated calls", () => {
    const t1 = getProposalCopyTemplate("pattern_repeat", "continue_pattern");
    const t2 = getProposalCopyTemplate("pattern_repeat", "continue_pattern");
    expect(t1).toBe(t2);
  });
});

describe("renderCopyTemplate", () => {
  it("substitutes {title} placeholder", () => {
    const out = renderCopyTemplate("{title} の時間ですか?", { title: "カフェ" });
    expect(out).toBe("カフェ の時間ですか?");
  });

  it("substitutes multiple placeholders", () => {
    const out = renderCopyTemplate("{a} と {b}", { a: "x", b: "y" });
    expect(out).toBe("x と y");
  });

  it("leaves undefined placeholder as-is (= defensive)", () => {
    const out = renderCopyTemplate("{unknown} placeholder", {});
    expect(out).toBe("{unknown} placeholder");
  });

  it("does not mutate input variables", () => {
    const vars = { title: "x" };
    renderCopyTemplate("{title}", vars);
    expect(vars).toEqual({ title: "x" });
  });
});

describe("renderProposalCopy", () => {
  it("returns headline + subtext", () => {
    const template = PROPOSAL_COPY_TABLE["pattern_repeat__continue_pattern"];
    const out = renderProposalCopy(template, { title: "カフェ" });
    expect(out.headline).toBe("カフェ の時間ですか?");
    expect(out.subtext).toBe("いつもの流れです");
  });

  it("returns subtext=null when template has no subtext", () => {
    const template = PROPOSAL_COPY_TABLE["pattern_repeat__intentional_break_observed"];
    const out = renderProposalCopy(template, { title: "ジム" });
    expect(out.headline).toBe("ジム が最近 空いていますね");
    expect(out.subtext).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// evidenceTieredCopy: 4 branch
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyEvidenceTier", () => {
  it("repetitionCount < 3 → silent", () => {
    expect(classifyEvidenceTier({ repetitionCount: 0, recentDeviationCount: 0 })).toBe("silent");
    expect(classifyEvidenceTier({ repetitionCount: 1, recentDeviationCount: 0 })).toBe("silent");
    expect(classifyEvidenceTier({ repetitionCount: 2, recentDeviationCount: 0 })).toBe("silent");
  });

  it("repetitionCount 3-4 + 乖離なし → observation", () => {
    expect(classifyEvidenceTier({ repetitionCount: 3, recentDeviationCount: 0 })).toBe("observation");
    expect(classifyEvidenceTier({ repetitionCount: 4, recentDeviationCount: 0 })).toBe("observation");
  });

  it("repetitionCount >= 5 + 乖離なし → confident", () => {
    expect(classifyEvidenceTier({ repetitionCount: 5, recentDeviationCount: 0 })).toBe("confident");
    expect(classifyEvidenceTier({ repetitionCount: 10, recentDeviationCount: 0 })).toBe("confident");
  });

  it("repetitionCount >= 3 + 乖離 1+ → hedge", () => {
    expect(classifyEvidenceTier({ repetitionCount: 3, recentDeviationCount: 1 })).toBe("hedge");
    expect(classifyEvidenceTier({ repetitionCount: 5, recentDeviationCount: 1 })).toBe("hedge");
    expect(classifyEvidenceTier({ repetitionCount: 10, recentDeviationCount: 2 })).toBe("hedge");
  });

  it("repetitionCount < 3 wins over deviation (= silent優先)", () => {
    expect(classifyEvidenceTier({ repetitionCount: 2, recentDeviationCount: 5 })).toBe("silent");
  });
});

describe("copyPrefixForTier", () => {
  it("returns expected prefix for each tier", () => {
    expect(copyPrefixForTier("confident")).toBe("先週も ");
    expect(copyPrefixForTier("observation")).toBe("最近よく ");
    expect(copyPrefixForTier("hedge")).toBe("もしかすると、 ");
    expect(copyPrefixForTier("silent")).toBe("");
  });

  it("all 4 tiers covered (= exhaustive)", () => {
    const tiers: EvidenceTier[] = ["confident", "observation", "hedge", "silent"];
    tiers.forEach((t) => {
      expect(typeof copyPrefixForTier(t)).toBe("string");
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// linguisticMirror.pickMirroredToken
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("pickMirroredToken", () => {
  it("returns user's most-used token", () => {
    const anchors = [
      buildAnchor("ジム"),
      buildAnchor("ジム行く"),
      buildAnchor("ジム朝"),
    ];
    const out = pickMirroredToken({
      anchors,
      candidateTokens: ["ジム", "運動", "エクササイズ"],
    });
    expect(out).toBe("ジム");
  });

  it("mirrors English when user uses English titles", () => {
    const anchors = [
      buildAnchor("gym"),
      buildAnchor("workout"),
      buildAnchor("early gym"),
    ];
    const out = pickMirroredToken({
      anchors,
      candidateTokens: ["gym", "ジム", "workout"],
    });
    expect(out).toBe("gym");
  });

  it("returns first candidate when no titles match (= silent fallback)", () => {
    const anchors = [buildAnchor("カフェ"), buildAnchor("ランチ")];
    const out = pickMirroredToken({
      anchors,
      candidateTokens: ["ジム", "運動"],
    });
    expect(out).toBe("ジム");
  });

  it("returns first candidate when anchors empty", () => {
    const out = pickMirroredToken({
      anchors: [],
      candidateTokens: ["a", "b"],
    });
    expect(out).toBe("a");
  });

  it("returns empty string when candidateTokens empty", () => {
    const out = pickMirroredToken({
      anchors: [buildAnchor("test")],
      candidateTokens: [],
    });
    expect(out).toBe("");
  });

  it("stable sort: ties resolved by candidate order", () => {
    const anchors = [buildAnchor("a"), buildAnchor("b")];
    const out = pickMirroredToken({
      anchors,
      candidateTokens: ["a", "b"],
    });
    // a と b は同 count = 1、 candidate 順で a が先
    expect(out).toBe("a");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// noAiSubjectLint: violations + valid copies
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectAiSubjectViolations — VIOLATION cases", () => {
  it("detects Alter as 主語 (= 「Alter は」)", () => {
    const v = detectAiSubjectViolations("Alter は 9:45 出発をおすすめします");
    expect(v.length).toBeGreaterThanOrEqual(1);
    expect(v[0]!.reason).toMatch(/Alter/);
  });

  it("detects Alter が", () => {
    const v = detectAiSubjectViolations("Alter が提案します");
    expect(v.length).toBeGreaterThanOrEqual(1);
  });

  it("detects 私 [は|が|を]", () => {
    expect(detectAiSubjectViolations("私はあなたを心配しています").length).toBeGreaterThanOrEqual(1);
    expect(detectAiSubjectViolations("私が提案します").length).toBeGreaterThanOrEqual(1);
    expect(detectAiSubjectViolations("私を信じてください").length).toBeGreaterThanOrEqual(1);
  });

  it("detects English I [verb]", () => {
    expect(detectAiSubjectViolations("I suggest 9:45 departure").length).toBeGreaterThanOrEqual(1);
    expect(detectAiSubjectViolations("I think you should").length).toBeGreaterThanOrEqual(1);
    expect(detectAiSubjectViolations("I recommend this").length).toBeGreaterThanOrEqual(1);
  });

  it("detects English my / me", () => {
    expect(detectAiSubjectViolations("It's my suggestion").length).toBeGreaterThanOrEqual(1);
    expect(detectAiSubjectViolations("Tell me more").length).toBeGreaterThanOrEqual(1);
  });
});

describe("detectAiSubjectViolations — VALID cases (= no violations)", () => {
  it("permits Alter as 修飾子 (= 「Alter Plan」 / 「Alter Settings」)", () => {
    expect(detectAiSubjectViolations("Alter Plan")).toEqual([]);
    expect(detectAiSubjectViolations("Alter Settings")).toEqual([]);
    expect(detectAiSubjectViolations("Alter からの提案")).toEqual([]);
  });

  it("permits user 主語 (= 「あなたは / いつもの」)", () => {
    expect(detectAiSubjectViolations("あなたは先週もこの時間にカフェにいました")).toEqual([]);
    expect(detectAiSubjectViolations("いつもの場所にしますか?")).toEqual([]);
  });

  it("permits 無人称 (= 「9:45 出発が安全な時間です」)", () => {
    expect(detectAiSubjectViolations("9:45 出発が安全な時間です")).toEqual([]);
    expect(detectAiSubjectViolations("最近 月曜のジムが空いていますね")).toEqual([]);
  });

  it("permits 私たち / 私立 (= 一人称ではない compound)", () => {
    // 「私たち」 は 私[はがを] にマッチしないので OK
    expect(detectAiSubjectViolations("私たちの記録")).toEqual([]);
  });

  it("permits English If / Iceland (= boundary check)", () => {
    expect(detectAiSubjectViolations("If you want")).toEqual([]);
    expect(detectAiSubjectViolations("Iceland is cold")).toEqual([]);
  });
});

describe("assertNoAiSubject", () => {
  it("throws on violation", () => {
    expect(() => assertNoAiSubject("Alter は提案します")).toThrow(/No-AI-Subject Lint/);
  });

  it("does not throw on valid copy", () => {
    expect(() => assertNoAiSubject("いつもの場所にしますか?")).not.toThrow();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRITICAL: 全 12 PROPOSAL_COPY_TABLE entries が No-AI-Subject lint を通過
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PROPOSAL_COPY_TABLE — No-AI-Subject 全件 PASS (= 機械的強制)", () => {
  for (const key of Object.keys(PROPOSAL_COPY_TABLE) as ProposalCopyKey[]) {
    it(`headline "${key}" passes No-AI-Subject lint`, () => {
      const template = PROPOSAL_COPY_TABLE[key];
      expect(() => assertNoAiSubject(template.headline)).not.toThrow();
    });

    it(`subtext "${key}" passes No-AI-Subject lint (if present)`, () => {
      const template = PROPOSAL_COPY_TABLE[key];
      if (template.subtext) {
        expect(() => assertNoAiSubject(template.subtext)).not.toThrow();
      }
    });
  }
});
