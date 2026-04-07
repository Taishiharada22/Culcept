import { describe, it, expect } from "vitest";
import {
  type CounterfactualPerspective,
  type CounterfactualBlockReason,
  type OtherPartyContext,
  type CounterfactualPartsContext,
  type InternalCandidate,
  type CounterfactualShiftDirection,
  type IntegrationDecision,
  type IntegrationResult,
  PERSPECTIVE_LABELS,
  PART_EXTERNAL_LABELS,
  COUNTERFACTUAL_FRAMING,
  ABSOLUTE_PROHIBITIONS,
  OTHER_PARTY_CONFIDENCE_CAP,
  ALTERNATIVE_PART_CONFIDENCE_CAP,
  OTHER_PARTY_MIN_BEHAVIORS,
  ALTERNATIVE_PART_MIN_SIGNALS,
  CANDIDATE_TEXT_MAX_LENGTH,
  SHIFT_DIRECTION_TABLE,
  isCounterfactualAllowed,
  buildCounterfactualGateAnalytics,
  resolveShiftDirection,
  validateCandidateSafety,
  buildShadowAnalytics,
  buildCandidatePrompt,
  applyHedgeWrapper,
  computeIntegrationDecision,
  buildCounterfactualPromptBlock,
  validateIntegratedOutput,
  type IntegratedOutputViolationType,
} from "@/lib/stargazer/counterfactualSimulation";

// ── helpers ──

/** alternative_part ゲートが通る最小条件 */
function allowedAlternativePart() {
  return isCounterfactualAllowed(
    4, 3, false, false, "alternative_part", null,
    false, false, false,
    { dominantPart: "protective", signalCount: 3 },
  );
}

/** 十分な evidence を持つ OtherPartyContext */
function makeOtherPartyCtx(overrides: Partial<OtherPartyContext> = {}): OtherPartyContext {
  return {
    role: "上司",
    observedBehaviors: ["机を叩いた", "会議で名指しで批判した", "翌日普通に話しかけてきた"],
    relationalTemperature: 0.3,
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-1: 視点定義（既存テスト維持）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-1: CounterfactualPerspective", () => {
  it("2種の視点にラベルが定義されている", () => {
    expect(PERSPECTIVE_LABELS.other_party).toBe("相手の見え方候補");
    expect(PERSPECTIVE_LABELS.alternative_part).toBe("別パートの反応候補");
  });

  it("PERSPECTIVE_LABELS のキーは CounterfactualPerspective と一致する", () => {
    const keys = Object.keys(PERSPECTIVE_LABELS) as CounterfactualPerspective[];
    expect(keys).toContain("other_party");
    expect(keys).toContain("alternative_part");
    expect(keys).toHaveLength(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-1: Parts 外部ラベル（既存テスト維持）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-1: PART_EXTERNAL_LABELS", () => {
  it("3パートに外部表現が定義されている", () => {
    expect(PART_EXTERNAL_LABELS.protective).toBe("慎重な見方");
    expect(PART_EXTERNAL_LABELS.vulnerable).toBe("素の反応");
    expect(PART_EXTERNAL_LABELS.reactive).toBe("とっさの反応");
  });

  it("外部ラベルに parts 言語（心理学用語）が含まれていない", () => {
    const values = Object.values(PART_EXTERNAL_LABELS);
    const psychTerms = ["パート", "防衛", "脆弱", "反応性", "IFS", "exile", "プロテクター"];
    for (const label of values) {
      for (const term of psychTerms) {
        expect(label).not.toContain(term);
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-1: 制約定数（既存テスト維持）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-1: 制約定数", () => {
  it("other_party の confidence 上限は 0.5", () => {
    expect(OTHER_PARTY_CONFIDENCE_CAP).toBe(0.5);
  });

  it("alternative_part の confidence 上限は 0.8", () => {
    expect(ALTERNATIVE_PART_CONFIDENCE_CAP).toBe(0.8);
  });

  it("other_party の最小 behaviors 数は 2", () => {
    expect(OTHER_PARTY_MIN_BEHAVIORS).toBe(2);
  });

  it("other_party の confidence cap < alternative_part の confidence cap", () => {
    expect(OTHER_PARTY_CONFIDENCE_CAP).toBeLessThan(ALTERNATIVE_PART_CONFIDENCE_CAP);
  });

  it("alternative_part の最小 signals 数は 2", () => {
    expect(ALTERNATIVE_PART_MIN_SIGNALS).toBe(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-1: フレーミング制約（既存テスト維持）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-1: COUNTERFACTUAL_FRAMING", () => {
  it("other_party プレフィックスは全て hedge を含む", () => {
    for (const prefix of COUNTERFACTUAL_FRAMING.otherPartyPrefixes) {
      const hasHedge = COUNTERFACTUAL_FRAMING.requiredHedges.some(h => prefix.includes(h))
        || prefix.includes("かもしれない") || prefix.includes("可能性");
      expect(hasHedge).toBe(true);
    }
  });

  it("alternative_part プレフィックスに parts 言語が含まれていない", () => {
    const psychTerms = ["パート", "防衛", "脆弱", "反応性", "IFS", "内的家族"];
    for (const prefix of COUNTERFACTUAL_FRAMING.alternativePartPrefixes) {
      for (const term of psychTerms) {
        expect(prefix).not.toContain(term);
      }
    }
  });

  it("禁止表現に断定的な表現が含まれている", () => {
    expect(COUNTERFACTUAL_FRAMING.prohibitedPhrases).toContain("確実に");
    expect(COUNTERFACTUAL_FRAMING.prohibitedPhrases).toContain("相手はこう思っている");
    expect(COUNTERFACTUAL_FRAMING.prohibitedPhrases).toContain("本当は");
    expect(COUNTERFACTUAL_FRAMING.prohibitedPhrases).toContain("あなたの本心は");
  });

  it("hedge 表現に「こう読める余地」が含まれている", () => {
    expect(COUNTERFACTUAL_FRAMING.requiredHedges).toContain("こう読める余地");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-1: 絶対禁止条件（既存テスト維持）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-1: ABSOLUTE_PROHIBITIONS", () => {
  it("abuse context は絶対禁止", () => {
    expect(ABSOLUTE_PROHIBITIONS.abuseContext).toBe(true);
  });

  it("exile proximity は絶対禁止", () => {
    expect(ABSOLUTE_PROHIBITIONS.exileProximity).toBe(true);
  });

  it("ユーザー拒否は絶対禁止", () => {
    expect(ABSOLUTE_PROHIBITIONS.userRejection).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-2: alternative_part ゲート本実装
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-2: alternative_part gate", () => {
  // ── 正常系: 全条件クリアで allowed ──

  it("Phase 4 + Trust 3 + 安全 + Parts充足 で allowed", () => {
    const r = allowedAlternativePart();
    expect(r.allowed).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.allBlockReasons).toHaveLength(0);
  });

  it("Phase 5 + Trust 4 でも allowed", () => {
    const r = isCounterfactualAllowed(
      5, 4, false, false, "alternative_part", null,
      false, false, false,
      { dominantPart: "reactive", signalCount: 5 },
    );
    expect(r.allowed).toBe(true);
  });

  it("balanced dominant でも allowed（unclear のみブロック）", () => {
    const r = isCounterfactualAllowed(
      4, 3, false, false, "alternative_part", null,
      false, false, false,
      { dominantPart: "balanced", signalCount: 3 },
    );
    expect(r.allowed).toBe(true);
  });

  // ── Phase 条件 ──

  it("Phase 3 ではブロック（counterfactualAccess = false）", () => {
    const r = isCounterfactualAllowed(
      3, 3, false, false, "alternative_part", null,
      false, false, false,
      { dominantPart: "protective", signalCount: 3 },
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_phase");
  });

  it("Phase 0 ではブロック", () => {
    const r = isCounterfactualAllowed(
      0, 3, false, false, "alternative_part", null,
      false, false, false,
      { dominantPart: "protective", signalCount: 3 },
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_phase");
  });

  // ── Trust 条件 ──

  it("Trust 2 ではブロック（Trust < 3）", () => {
    const r = isCounterfactualAllowed(
      4, 2, false, false, "alternative_part", null,
      false, false, false,
      { dominantPart: "protective", signalCount: 3 },
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_trust");
  });

  // ── Trust × Phase 交差: 両方必要 ──

  it("Phase OK + Trust NG → ブロック", () => {
    const r = isCounterfactualAllowed(
      4, 1, false, false, "alternative_part", null,
      false, false, false,
      { dominantPart: "protective", signalCount: 3 },
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_trust");
    expect(r.allBlockReasons).not.toContain("blocked_by_phase");
  });

  it("Phase NG + Trust OK → ブロック", () => {
    const r = isCounterfactualAllowed(
      2, 4, false, false, "alternative_part", null,
      false, false, false,
      { dominantPart: "protective", signalCount: 3 },
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_phase");
    expect(r.allBlockReasons).not.toContain("blocked_by_trust");
  });

  it("Phase NG + Trust NG → 両方 allBlockReasons に含まれる", () => {
    const r = isCounterfactualAllowed(
      1, 1, false, false, "alternative_part", null,
      false, false, false,
      { dominantPart: "protective", signalCount: 3 },
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_phase");
    expect(r.allBlockReasons).toContain("blocked_by_trust");
  });

  // ── 安全条件 ──

  it("dignity risk でブロック", () => {
    const r = isCounterfactualAllowed(
      4, 3, true, false, "alternative_part", null,
      false, false, false,
      { dominantPart: "protective", signalCount: 3 },
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_dignity");
  });

  it("rupture active でブロック", () => {
    const r = isCounterfactualAllowed(
      4, 3, false, true, "alternative_part", null,
      false, false, false,
      { dominantPart: "protective", signalCount: 3 },
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_rupture");
  });

  // ── 絶対禁止 ──

  it("abuse context でブロック（最高優先 reason）", () => {
    const r = isCounterfactualAllowed(
      4, 3, false, false, "alternative_part", null,
      true, false, false,
      { dominantPart: "protective", signalCount: 3 },
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("blocked_by_abuse_context");
  });

  it("exile proximity でブロック", () => {
    const r = isCounterfactualAllowed(
      4, 3, false, false, "alternative_part", null,
      false, true, false,
      { dominantPart: "protective", signalCount: 3 },
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_exile_proximity");
  });

  it("user rejection でブロック", () => {
    const r = isCounterfactualAllowed(
      4, 3, false, false, "alternative_part", null,
      false, false, true,
      { dominantPart: "protective", signalCount: 3 },
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_user_rejection");
  });

  // ── Parts 証拠条件 ──

  it("dominant = unclear でブロック", () => {
    const r = isCounterfactualAllowed(
      4, 3, false, false, "alternative_part", null,
      false, false, false,
      { dominantPart: "unclear", signalCount: 3 },
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_parts_unclear");
  });

  it("signalCount < 2 でブロック", () => {
    const r = isCounterfactualAllowed(
      4, 3, false, false, "alternative_part", null,
      false, false, false,
      { dominantPart: "protective", signalCount: 1 },
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_parts_low_signals");
  });

  it("partsContext が null → parts_unclear でブロック", () => {
    const r = isCounterfactualAllowed(
      4, 3, false, false, "alternative_part", null,
      false, false, false,
      null,
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_parts_unclear");
  });

  // ── 複数理由の同時検出 ──

  it("複数条件違反時に allBlockReasons に全理由が含まれる", () => {
    const r = isCounterfactualAllowed(
      2, 1, true, true, "alternative_part", null,
      true, true, false,
      { dominantPart: "unclear", signalCount: 0 },
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_abuse_context");
    expect(r.allBlockReasons).toContain("blocked_by_exile_proximity");
    expect(r.allBlockReasons).toContain("blocked_by_dignity");
    expect(r.allBlockReasons).toContain("blocked_by_rupture");
    expect(r.allBlockReasons).toContain("blocked_by_phase");
    expect(r.allBlockReasons).toContain("blocked_by_trust");
    expect(r.allBlockReasons).toContain("blocked_by_parts_unclear");
    expect(r.allBlockReasons).toContain("blocked_by_parts_low_signals");
    // reason は最高優先度
    expect(r.reason).toBe("blocked_by_abuse_context");
  });

  // ── reason の優先順位 ──

  it("reason は最高優先度のブロック理由を返す", () => {
    // abuse > dignity > phase
    const r = isCounterfactualAllowed(
      2, 3, true, false, "alternative_part", null,
      true, false, false,
      { dominantPart: "protective", signalCount: 3 },
    );
    expect(r.reason).toBe("blocked_by_abuse_context");
  });

  it("絶対禁止なし + dignity あり → reason は blocked_by_dignity", () => {
    const r = isCounterfactualAllowed(
      2, 3, true, false, "alternative_part", null,
      false, false, false,
      { dominantPart: "protective", signalCount: 3 },
    );
    expect(r.reason).toBe("blocked_by_dignity");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-2: other_party ゲート（明示封印）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-2: other_party gate (sealed)", () => {
  it("全条件クリアでも blocked_by_not_implemented", () => {
    const ctx = makeOtherPartyCtx();
    const r = isCounterfactualAllowed(
      5, 4, false, false, "other_party", ctx,
      false, false, false,
      { dominantPart: "protective", signalCount: 5 },
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_not_implemented");
  });

  it("evidence 不足時は low_evidence + not_implemented の両方", () => {
    const ctx = makeOtherPartyCtx({ observedBehaviors: ["一つだけ"] });
    const r = isCounterfactualAllowed(
      4, 3, false, false, "other_party", ctx,
      false, false, false,
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_low_evidence");
    expect(r.allBlockReasons).toContain("blocked_by_not_implemented");
  });

  it("otherPartyContext が null → low_evidence + not_implemented", () => {
    const r = isCounterfactualAllowed(
      4, 3, false, false, "other_party", null,
      false, false, false,
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_low_evidence");
    expect(r.allBlockReasons).toContain("blocked_by_not_implemented");
  });

  it("Phase 不足 + other_party → phase + not_implemented の両方", () => {
    const ctx = makeOtherPartyCtx();
    const r = isCounterfactualAllowed(
      2, 3, false, false, "other_party", ctx,
      false, false, false,
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).toContain("blocked_by_phase");
    expect(r.allBlockReasons).toContain("blocked_by_not_implemented");
    // reason は phase が先（優先順位が higher）
    expect(r.reason).toBe("blocked_by_phase");
  });

  it("observedBehaviors 2件以上でも not_implemented でブロック", () => {
    const ctx = makeOtherPartyCtx({ observedBehaviors: ["行動A", "行動B"] });
    const r = isCounterfactualAllowed(
      4, 3, false, false, "other_party", ctx,
      false, false, false,
    );
    expect(r.allowed).toBe(false);
    expect(r.allBlockReasons).not.toContain("blocked_by_low_evidence");
    expect(r.allBlockReasons).toContain("blocked_by_not_implemented");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-2: ゲート Analytics（allBlockReasons 対応）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-2: buildCounterfactualGateAnalytics", () => {
  it("ゲート結果 + 入力情報を記録する", () => {
    const gateResult = { allowed: false as const, reason: "blocked_by_phase" as const, allBlockReasons: ["blocked_by_phase" as const] };
    const analytics = buildCounterfactualGateAnalytics(gateResult, "alternative_part", 2, 3);
    expect(analytics.gateResult.allowed).toBe(false);
    expect(analytics.gateResult.reason).toBe("blocked_by_phase");
    expect(analytics.gateResult.allBlockReasons).toHaveLength(1);
    expect(analytics.requestedPerspective).toBe("alternative_part");
    expect(analytics.phase).toBe(2);
    expect(analytics.trustLevel).toBe(3);
  });

  it("allowed = true の場合は allBlockReasons が空", () => {
    const gateResult = { allowed: true as const, reason: null, allBlockReasons: [] as CounterfactualBlockReason[] };
    const analytics = buildCounterfactualGateAnalytics(gateResult, "alternative_part", 4, 3);
    expect(analytics.gateResult.allowed).toBe(true);
    expect(analytics.gateResult.allBlockReasons).toHaveLength(0);
  });

  it("perspective が null でも記録できる", () => {
    const gateResult = { allowed: false as const, reason: "blocked_by_phase" as const, allBlockReasons: ["blocked_by_phase" as const] };
    const analytics = buildCounterfactualGateAnalytics(gateResult, null, 1, 2);
    expect(analytics.requestedPerspective).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-3 前半: Shift Direction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-3: SHIFT_DIRECTION_TABLE", () => {
  it("3方向のみ定義されている", () => {
    expect(SHIFT_DIRECTION_TABLE).toHaveLength(3);
  });

  it("protective → less_guarded", () => {
    const entry = SHIFT_DIRECTION_TABLE.find(e => e.fromPart === "protective");
    expect(entry).toBeDefined();
    expect(entry!.direction).toBe("less_guarded");
  });

  it("reactive → more_composed", () => {
    const entry = SHIFT_DIRECTION_TABLE.find(e => e.fromPart === "reactive");
    expect(entry).toBeDefined();
    expect(entry!.direction).toBe("more_composed");
  });

  it("vulnerable → more_boundaried", () => {
    const entry = SHIFT_DIRECTION_TABLE.find(e => e.fromPart === "vulnerable");
    expect(entry).toBeDefined();
    expect(entry!.direction).toBe("more_boundaried");
  });

  it("各エントリに promptQuestion がある", () => {
    for (const entry of SHIFT_DIRECTION_TABLE) {
      expect(entry.promptQuestion.length).toBeGreaterThan(0);
    }
  });
});

describe("P4-3: resolveShiftDirection", () => {
  it("protective dominant → less_guarded", () => {
    const shift = resolveShiftDirection("protective", null);
    expect(shift).not.toBeNull();
    expect(shift!.direction).toBe("less_guarded");
  });

  it("reactive dominant → more_composed", () => {
    const shift = resolveShiftDirection("reactive", null);
    expect(shift).not.toBeNull();
    expect(shift!.direction).toBe("more_composed");
  });

  it("vulnerable dominant → more_boundaried", () => {
    const shift = resolveShiftDirection("vulnerable", null);
    expect(shift).not.toBeNull();
    expect(shift!.direction).toBe("more_boundaried");
  });

  it("balanced + sourcePart 指定 → そのパートの shift", () => {
    const shift = resolveShiftDirection("balanced", "reactive");
    expect(shift).not.toBeNull();
    expect(shift!.direction).toBe("more_composed");
  });

  it("balanced + sourcePart なし → null", () => {
    const shift = resolveShiftDirection("balanced", null);
    expect(shift).toBeNull();
  });

  it("unclear → null（ゲートでブロック済みだが防御的に）", () => {
    const shift = resolveShiftDirection("unclear", null);
    expect(shift).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-3 前半: validateCandidateSafety
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-3: validateCandidateSafety", () => {
  it("安全な候補 → safe = true, violations 空", () => {
    const r = validateCandidateSafety("別の角度では、少し気持ちが軽くなる可能性もある");
    expect(r.safe).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  // ── 禁止表現 ──

  it("「確実に」→ prohibited_phrase", () => {
    const r = validateCandidateSafety("確実にそう思っているはず");
    expect(r.safe).toBe(false);
    expect(r.violations.some(v => v.type === "prohibited_phrase" && v.detail === "確実に")).toBe(true);
  });

  it("「本当は」→ prohibited_phrase", () => {
    const r = validateCandidateSafety("本当はこう感じている");
    expect(r.safe).toBe(false);
    expect(r.violations.some(v => v.type === "prohibited_phrase" && v.detail === "本当は")).toBe(true);
  });

  it("「相手はこう思っている」→ prohibited_phrase", () => {
    const r = validateCandidateSafety("相手はこう思っている可能性が高い");
    expect(r.safe).toBe(false);
    expect(r.violations.some(v => v.type === "prohibited_phrase")).toBe(true);
  });

  // ── Exile 接触語 ──

  it("「核心」→ exile_language", () => {
    const r = validateCandidateSafety("問題の核心はここにある");
    expect(r.safe).toBe(false);
    expect(r.violations.some(v => v.type === "exile_language" && v.detail === "核心")).toBe(true);
  });

  it("「トラウマ」→ exile_language", () => {
    const r = validateCandidateSafety("過去のトラウマが影響しているかもしれない");
    expect(r.safe).toBe(false);
    expect(r.violations.some(v => v.type === "exile_language")).toBe(true);
  });

  it("「本当の自分」→ exile_language", () => {
    const r = validateCandidateSafety("本当の自分を出せたらいいのに");
    expect(r.safe).toBe(false);
    expect(r.violations.some(v => v.type === "exile_language" && v.detail === "本当の自分")).toBe(true);
  });

  // ── 心理学ラベル露出 ──

  it("「パート」→ psych_label_exposed", () => {
    const r = validateCandidateSafety("あなたの防衛パートがそう反応している");
    expect(r.safe).toBe(false);
    expect(r.violations.some(v => v.type === "psych_label_exposed" && v.detail === "パート")).toBe(true);
  });

  it("「IFS」→ psych_label_exposed", () => {
    const r = validateCandidateSafety("IFSの観点から見ると");
    expect(r.safe).toBe(false);
    expect(r.violations.some(v => v.type === "psych_label_exposed" && v.detail === "IFS")).toBe(true);
  });

  it("「プロテクター」→ psych_label_exposed", () => {
    const r = validateCandidateSafety("プロテクターが活性化している");
    expect(r.safe).toBe(false);
    expect(r.violations.some(v => v.type === "psych_label_exposed")).toBe(true);
  });

  // ── 長さ上限 ──

  it("200文字超 → too_long", () => {
    const longText = "あ".repeat(CANDIDATE_TEXT_MAX_LENGTH + 1);
    const r = validateCandidateSafety(longText);
    expect(r.safe).toBe(false);
    expect(r.violations.some(v => v.type === "too_long")).toBe(true);
  });

  it("200文字ちょうど → safe（上限以内）", () => {
    const text = "あ".repeat(CANDIDATE_TEXT_MAX_LENGTH);
    const r = validateCandidateSafety(text);
    // 禁止語に引っかからなければ safe
    expect(r.violations.filter(v => v.type === "too_long")).toHaveLength(0);
  });

  // ── 複数違反の同時検出 ──

  it("複数の violation が同時に検出される", () => {
    const r = validateCandidateSafety("確実に、あなたのパートの核心はトラウマにある");
    expect(r.safe).toBe(false);
    expect(r.violations.length).toBeGreaterThanOrEqual(3);
    const types = r.violations.map(v => v.type);
    expect(types).toContain("prohibited_phrase");
    expect(types).toContain("exile_language");
    expect(types).toContain("psych_label_exposed");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-3 前半: buildShadowAnalytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-3: buildShadowAnalytics", () => {
  const gateAllowed = { allowed: true as const, reason: null, allBlockReasons: [] as CounterfactualBlockReason[] };

  it("safe な候補の本文は保持される", () => {
    const candidate: InternalCandidate = {
      perspective: "alternative_part",
      sourcePart: "protective",
      direction: "less_guarded",
      candidateText: "少し警戒を緩めたら、安心できる余地があるかもしれない",
      confidence: 0.6,
      safeForIntegration: true,
      safetyViolations: [],
    };
    const analytics = buildShadowAnalytics(gateAllowed, candidate, 450);
    expect(analytics.generated).toBe(true);
    expect(analytics.candidate!.candidateTextOrRedacted).toBe(candidate.candidateText);
    expect(analytics.generationLatencyMs).toBe(450);
  });

  it("unsafe な候補の本文は [REDACTED] に置換される", () => {
    const candidate: InternalCandidate = {
      perspective: "alternative_part",
      sourcePart: "reactive",
      direction: "more_composed",
      candidateText: "確実にあなたはこう感じている",
      confidence: 0.4,
      safeForIntegration: false,
      safetyViolations: [{ type: "prohibited_phrase", detail: "確実に" }],
    };
    const analytics = buildShadowAnalytics(gateAllowed, candidate, 300);
    expect(analytics.candidate!.candidateTextOrRedacted).toBe("[REDACTED]");
    expect(analytics.candidate!.safeForIntegration).toBe(false);
    expect(analytics.candidate!.violations).toHaveLength(1);
  });

  it("候補なし（ゲートブロック）の場合は generated = false", () => {
    const gateBlocked = { allowed: false as const, reason: "blocked_by_phase" as const, allBlockReasons: ["blocked_by_phase" as const] };
    const analytics = buildShadowAnalytics(gateBlocked, null, null);
    expect(analytics.generated).toBe(false);
    expect(analytics.candidate).toBeNull();
    expect(analytics.generationLatencyMs).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-3 前半: buildCandidatePrompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-3: buildCandidatePrompt", () => {
  it("shift direction の問いが prompt に含まれる", () => {
    const shift = SHIFT_DIRECTION_TABLE[0]; // protective → less_guarded
    const prompt = buildCandidatePrompt(shift, "転職を迷っている", "慎重な性格");
    expect(prompt).toContain(shift.promptQuestion);
    expect(prompt).toContain(shift.description);
  });

  it("situation と personality が prompt に含まれる", () => {
    const shift = SHIFT_DIRECTION_TABLE[1]; // reactive → more_composed
    const prompt = buildCandidatePrompt(shift, "上司と衝突した", "衝動的な面がある");
    expect(prompt).toContain("上司と衝突した");
    expect(prompt).toContain("衝動的な面がある");
  });

  it("禁止語の制約が prompt に含まれる", () => {
    const shift = SHIFT_DIRECTION_TABLE[0];
    const prompt = buildCandidatePrompt(shift, "test", "test");
    expect(prompt).toContain("確実に");
    expect(prompt).toContain("核心");
    expect(prompt).toContain("パート");
    expect(prompt).toContain("hedge");
  });

  it("1-2文以内の制約が prompt に含まれる", () => {
    const shift = SHIFT_DIRECTION_TABLE[0];
    const prompt = buildCandidatePrompt(shift, "test", "test");
    expect(prompt).toContain("1-2文");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-4a: applyHedgeWrapper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-4a: applyHedgeWrapper", () => {
  it("alternative_part のプレフィックスが付与される", () => {
    const result = applyHedgeWrapper("警戒を緩めたら楽になるかもしれない", "alternative_part", "転職を迷っている");
    // situation.length % 3 で決定的に選択される
    const prefixes = COUNTERFACTUAL_FRAMING.alternativePartPrefixes;
    const expectedPrefix = prefixes["転職を迷っている".length % prefixes.length];
    expect(result).toContain(expectedPrefix);
    expect(result).toContain("警戒を緩めたら楽になるかもしれない");
  });

  it("other_party のプレフィックスが付与される", () => {
    const result = applyHedgeWrapper("別の受け取り方をしているかもしれない", "other_party", "上司と衝突した");
    const prefixes = COUNTERFACTUAL_FRAMING.otherPartyPrefixes;
    const expectedPrefix = prefixes["上司と衝突した".length % prefixes.length];
    expect(result).toContain(expectedPrefix);
    expect(result).toContain("別の受け取り方をしているかもしれない");
  });

  it("フォーマットは 'prefix、candidateText'", () => {
    const result = applyHedgeWrapper("テスト候補", "alternative_part", "abc");
    expect(result).toMatch(/、テスト候補$/);
  });

  it("決定的選択: 同じ situation → 同じプレフィックス", () => {
    const a = applyHedgeWrapper("候補A", "alternative_part", "固定の状況");
    const b = applyHedgeWrapper("候補B", "alternative_part", "固定の状況");
    // 同じ prefix が選ばれる
    const prefixA = a.split("、")[0];
    const prefixB = b.split("、")[0];
    expect(prefixA).toBe(prefixB);
  });

  it("異なる situation → 異なるプレフィックスになりうる", () => {
    // situation.length が mod 3 で異なる値を返す2つを使う
    const a = applyHedgeWrapper("候補", "alternative_part", "a");    // length=1, 1%3=1
    const b = applyHedgeWrapper("候補", "alternative_part", "abc");  // length=3, 3%3=0
    const prefixA = a.split("、")[0];
    const prefixB = b.split("、")[0];
    expect(prefixA).not.toBe(prefixB);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-4b: computeIntegrationDecision
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-4b: computeIntegrationDecision", () => {
  const safeSituation = "転職を迷っている";

  it("safe candidate + safe hedge → adopted", () => {
    const result = computeIntegrationDecision(
      "一歩引いてみると、楽になる可能性がある",
      "alternative_part",
      safeSituation,
    );
    expect(result.decision).toBe("adopted");
    expect(result.finalText).not.toBeNull();
    expect(result.finalText).toContain("一歩引いてみると");
    // hedge prefix が含まれている
    const prefixes = COUNTERFACTUAL_FRAMING.alternativePartPrefixes;
    const hasPrefix = prefixes.some(p => result.finalText!.includes(p));
    expect(hasPrefix).toBe(true);
    expect(result.originalViolations).toHaveLength(0);
    expect(result.hedgedViolations).toHaveLength(0);
  });

  it("unsafe candidate (prohibited phrase) → rejected", () => {
    const result = computeIntegrationDecision(
      "確実にこうすべきだ",
      "alternative_part",
      safeSituation,
    );
    expect(result.decision).toBe("rejected");
    expect(result.finalText).toBeNull();
    expect(result.originalViolations.length).toBeGreaterThan(0);
    expect(result.originalViolations[0].type).toBe("prohibited_phrase");
  });

  it("unsafe candidate (exile language) → rejected", () => {
    const result = computeIntegrationDecision(
      "本当の自分はこう感じているかもしれない",
      "alternative_part",
      safeSituation,
    );
    expect(result.decision).toBe("rejected");
    expect(result.finalText).toBeNull();
    expect(result.originalViolations.some(v => v.type === "exile_language")).toBe(true);
  });

  it("unsafe candidate (psych label) → rejected", () => {
    const result = computeIntegrationDecision(
      "プロテクターが反応しているかもしれない",
      "alternative_part",
      safeSituation,
    );
    expect(result.decision).toBe("rejected");
    expect(result.finalText).toBeNull();
    expect(result.originalViolations.some(v => v.type === "psych_label_exposed")).toBe(true);
  });

  it("unsafe candidate (too long) → rejected", () => {
    const longText = "あ".repeat(CANDIDATE_TEXT_MAX_LENGTH + 1);
    const result = computeIntegrationDecision(longText, "alternative_part", safeSituation);
    expect(result.decision).toBe("rejected");
    expect(result.finalText).toBeNull();
    expect(result.originalViolations.some(v => v.type === "too_long")).toBe(true);
  });

  it("safe candidate → hedge 後の too_long → weakened", () => {
    // hedge prefix 付与で MAX_LENGTH を超える候補を作る
    // prefix は最大約30文字程度 + 「、」で、元テキストが上限ギリギリなら超える
    const almostMax = "あ".repeat(CANDIDATE_TEXT_MAX_LENGTH - 1); // 元は safe (199 < 200)
    const result = computeIntegrationDecision(almostMax, "alternative_part", safeSituation);
    // hedge 付与で 200+ になるため weakened
    expect(result.decision).toBe("weakened");
    expect(result.finalText).toBe(almostMax); // hedge なしの元テキスト
    expect(result.hedgedViolations.some(v => v.type === "too_long")).toBe(true);
  });

  it("perspective-agnostic: other_party でも同じロジックが動く", () => {
    const result = computeIntegrationDecision(
      "別の受け取り方をしているかもしれない",
      "other_party",
      safeSituation,
    );
    expect(result.decision).toBe("adopted");
    expect(result.finalText).not.toBeNull();
    // other_party prefix が含まれる
    const prefixes = COUNTERFACTUAL_FRAMING.otherPartyPrefixes;
    const hasPrefix = prefixes.some(p => result.finalText!.includes(p));
    expect(hasPrefix).toBe(true);
  });

  it("rejected の場合 hedgedViolations は空", () => {
    const result = computeIntegrationDecision(
      "絶対にこうだ",
      "alternative_part",
      safeSituation,
    );
    expect(result.decision).toBe("rejected");
    expect(result.hedgedViolations).toHaveLength(0);
  });

  it("multiple violations → 全て originalViolations に含まれる", () => {
    // prohibited + exile + psych
    const result = computeIntegrationDecision(
      "確実に本当の自分のプロテクターが原因だ",
      "alternative_part",
      safeSituation,
    );
    expect(result.decision).toBe("rejected");
    expect(result.originalViolations.length).toBeGreaterThanOrEqual(3);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-6: buildCounterfactualPromptBlock
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-6: buildCounterfactualPromptBlock", () => {
  it("基本構造: 別の角度ヘッダ + 引用禁止 + 候補テキスト", () => {
    const block = buildCounterfactualPromptBlock(
      "警戒を緩めたら楽になるかもしれない",
      "less_guarded",
    );
    expect(block).toContain("別の角度");
    expect(block).toContain("そのまま出力しないこと");
    expect(block).toContain("引用");
    expect(block).toContain("警戒を緩めたら楽になるかもしれない");
    expect(block).toContain("less_guarded");
  });

  it("引用禁止の指示が含まれる", () => {
    const block = buildCounterfactualPromptBlock("テスト候補", "more_composed");
    expect(block).toContain("そのまま引用・コピーして出力しないこと");
    expect(block).toContain("あなた自身の言葉で再構成すること");
  });

  it("候補テキストが「」で囲まれている", () => {
    const block = buildCounterfactualPromptBlock("境界があれば断れたかもしれない", "more_boundaried");
    expect(block).toContain("「境界があれば断れたかもしれない」");
  });

  it("direction が含まれる（ログ参照用）", () => {
    const block = buildCounterfactualPromptBlock("テスト", "less_guarded");
    expect(block).toContain("less_guarded");
  });

  it("内部参照であることが明示されている", () => {
    const block = buildCounterfactualPromptBlock("テスト", "more_composed");
    expect(block).toContain("内部参照");
  });

  it("prompt block 自体が safety に違反しない", () => {
    // 全3方向で safe な候補を使って prompt block を生成し、safety チェック
    const safeCandidates: [string, "less_guarded" | "more_composed" | "more_boundaried"][] = [
      ["警戒を緩めたら楽になるかもしれない", "less_guarded"],
      ["一呼吸置いた後の反応は違うかもしれない", "more_composed"],
      ["境界を持てたら断る余地があるかもしれない", "more_boundaried"],
    ];
    for (const [text, direction] of safeCandidates) {
      const block = buildCounterfactualPromptBlock(text, direction);
      const check = validateCandidateSafety(block);
      // prompt block 自体は長いが、candidateText ではなく prompt 注入なので too_long は許容
      // 禁止表現・exile・psych が含まれていないことを確認
      const nonLengthViolations = check.violations.filter(v => v.type !== "too_long");
      expect(nonLengthViolations).toHaveLength(0);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-6: validateIntegratedOutput（送信前 Post-Check）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-6: validateIntegratedOutput", () => {
  // ── 正常系 ──

  it("安全な応答 → pass: true, violations 空", () => {
    const result = validateIntegratedOutput(
      "今は少し距離を置いてみるのもいいかもしれませんね。無理に答えを出さなくても大丈夫です。",
      "警戒を緩めたら楽になるかもしれない",
    );
    expect(result.pass).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("candidateText と無関係な応答 → pass", () => {
    const result = validateIntegratedOutput(
      "今日は少し疲れているみたいですね。ゆっくり休んでください。",
      "もう少し柔軟に考えてみると",
    );
    expect(result.pass).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  // ── candidateText 完全一致（verbatim） ──

  it("candidateText がそのまま含まれる → candidate_verbatim", () => {
    const candidate = "警戒を緩めたら楽になるかもしれない";
    const response = `あなたの気持ちはわかります。${candidate}と思います。`;
    const result = validateIntegratedOutput(response, candidate);
    expect(result.pass).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.violations.some(v => v.type === "candidate_verbatim")).toBe(true);
    expect(result.violations.find(v => v.type === "candidate_verbatim")!.detail).toBe(
      candidate.slice(0, 50),
    );
  });

  it("candidateText の部分一致では candidate_verbatim にならない", () => {
    const candidate = "警戒を緩めたら楽になるかもしれない";
    // 部分的に重なるが、candidateText 全体は含まれない
    const response = "警戒を緩めるのは難しいことですが、少しずつ進めましょう。";
    const result = validateIntegratedOutput(response, candidate);
    // candidate_verbatim は発生しない
    expect(result.violations.some(v => v.type === "candidate_verbatim")).toBe(false);
  });

  // ── 禁止表現 ──

  it("禁止表現「確実に」を含む → prohibited_phrase", () => {
    const result = validateIntegratedOutput(
      "確実にこうすべきです。迷う必要はありません。",
      "少し考え直してみると",
    );
    expect(result.pass).toBe(false);
    expect(result.violations.some(v => v.type === "prohibited_phrase" && v.detail === "確実に")).toBe(true);
  });

  it("禁止表現「間違いなく」を含む → prohibited_phrase", () => {
    const result = validateIntegratedOutput(
      "間違いなくその判断は正しいと思います。",
      "少し考え直してみると",
    );
    expect(result.pass).toBe(false);
    expect(result.violations.some(v => v.type === "prohibited_phrase" && v.detail === "間違いなく")).toBe(true);
  });

  it("禁止表現「絶対に」を含む → prohibited_phrase", () => {
    const result = validateIntegratedOutput(
      "絶対にそうだと思います。",
      "少し考え直してみると",
    );
    expect(result.pass).toBe(false);
    expect(result.violations.some(v => v.type === "prohibited_phrase" && v.detail === "絶対に")).toBe(true);
  });

  // ── Exile 接触語 ──

  it("Exile 接触語「トラウマ」を含む → exile_language", () => {
    const result = validateIntegratedOutput(
      "それはトラウマの影響かもしれません。",
      "少し考え直してみると",
    );
    expect(result.pass).toBe(false);
    expect(result.violations.some(v => v.type === "exile_language" && v.detail === "トラウマ")).toBe(true);
  });

  it("Exile 接触語「心の奥底」を含む → exile_language", () => {
    const result = validateIntegratedOutput(
      "心の奥底ではそう感じているのかもしれません。",
      "少し考え直してみると",
    );
    expect(result.pass).toBe(false);
    expect(result.violations.some(v => v.type === "exile_language" && v.detail === "心の奥底")).toBe(true);
  });

  it("Exile 接触語「本当の自分」を含む → exile_language", () => {
    const result = validateIntegratedOutput(
      "本当の自分はそう思っていないのかも。",
      "少し考え直してみると",
    );
    expect(result.pass).toBe(false);
    expect(result.violations.some(v => v.type === "exile_language" && v.detail === "本当の自分")).toBe(true);
  });

  // ── 心理学ラベル露出 ──

  it("心理学ラベル「プロテクター」を含む → psych_label_exposed", () => {
    const result = validateIntegratedOutput(
      "プロテクターがあなたを守っています。",
      "少し考え直してみると",
    );
    expect(result.pass).toBe(false);
    expect(result.violations.some(v => v.type === "psych_label_exposed" && v.detail === "プロテクター")).toBe(true);
  });

  it("心理学ラベル「IFS」を含む → psych_label_exposed", () => {
    const result = validateIntegratedOutput(
      "IFSの理論で言えば、あなたの反応は自然です。",
      "少し考え直してみると",
    );
    expect(result.pass).toBe(false);
    expect(result.violations.some(v => v.type === "psych_label_exposed" && v.detail === "IFS")).toBe(true);
  });

  it("心理学ラベル「防衛機制」を含む → psych_label_exposed", () => {
    const result = validateIntegratedOutput(
      "これは防衛機制の一種と捉えることもできます。",
      "少し考え直してみると",
    );
    expect(result.pass).toBe(false);
    expect(result.violations.some(v => v.type === "psych_label_exposed" && v.detail === "防衛機制")).toBe(true);
  });

  // ── 複数 violation ──

  it("複数の違反が同時に検出される（4種全て）", () => {
    const candidate = "別の角度から見ると";
    const response = `確実にそうです。${candidate}トラウマが原因で、プロテクターが働いています。`;
    const result = validateIntegratedOutput(response, candidate);
    expect(result.pass).toBe(false);

    const types = result.violations.map(v => v.type);
    expect(types).toContain("candidate_verbatim");
    expect(types).toContain("prohibited_phrase");
    expect(types).toContain("exile_language");
    expect(types).toContain("psych_label_exposed");
    // 少なくとも4種が検出
    expect(new Set(types).size).toBeGreaterThanOrEqual(4);
  });

  it("禁止表現が複数含まれる場合、それぞれ個別に検出", () => {
    const result = validateIntegratedOutput(
      "確実にそうですし、間違いなく正しいです。",
      "少し考え直してみると",
    );
    expect(result.pass).toBe(false);
    const prohibitedViolations = result.violations.filter(v => v.type === "prohibited_phrase");
    expect(prohibitedViolations.length).toBeGreaterThanOrEqual(2);
    const details = prohibitedViolations.map(v => v.detail);
    expect(details).toContain("確実に");
    expect(details).toContain("間違いなく");
  });

  // ── too_long は対象外 ──

  it("長い応答でも too_long は検出されない（post-check 対象外）", () => {
    const longResponse = "あ".repeat(500);
    const result = validateIntegratedOutput(longResponse, "短い候補");
    // too_long は validateCandidateSafety の対象であり、validateIntegratedOutput の対象外
    expect(result.violations.every(v => (v.type as string) !== "too_long")).toBe(true);
  });
});
