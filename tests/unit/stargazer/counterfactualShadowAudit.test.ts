/**
 * P4-5.5: Shadow 監査テスト
 *
 * P4-6（live integration）に進む前に、shadow パイプラインの安全性を検証する。
 *
 * 5つの監査項目:
 *   1. Gate 漏れ — Phase/Trust/safety の全組み合わせで不正通過がないか
 *   2. Safety 分布 — 現実的な候補テキストで violation 分布を確認
 *   3. Integration Decision 分布 — adopted/weakened/rejected の分布が妥当か
 *   4. Latency — (実LLM監査で確認。このファイルでは pure function のみ)
 *   5. Gate 漏れ（詳細） — dignity/rupture/abuse/exile/rejection 各条件
 */

import { describe, it, expect } from "vitest";
import {
  isCounterfactualAllowed,
  validateCandidateSafety,
  computeIntegrationDecision,
  applyHedgeWrapper,
  CANDIDATE_TEXT_MAX_LENGTH,
  COUNTERFACTUAL_FRAMING,
  type CounterfactualPartsContext,
  type CounterfactualGateResult,
} from "@/lib/stargazer/counterfactualSimulation";
import type { HdmPhase } from "@/lib/stargazer/hdmPhase";
import type { TrustLevel } from "@/lib/stargazer/alterUnderstanding";

// ── helpers ──

const VALID_PARTS_CTX: CounterfactualPartsContext = {
  dominantPart: "protective",
  signalCount: 3,
};

function gateCall(
  phase: HdmPhase,
  trust: TrustLevel,
  opts: {
    dignity?: boolean;
    rupture?: boolean;
    abuse?: boolean;
    exile?: boolean;
    rejection?: boolean;
    parts?: CounterfactualPartsContext | null;
  } = {},
): CounterfactualGateResult {
  return isCounterfactualAllowed(
    phase,
    trust,
    opts.dignity ?? false,
    opts.rupture ?? false,
    "alternative_part",
    null,
    opts.abuse ?? false,
    opts.exile ?? false,
    opts.rejection ?? false,
    "parts" in opts ? opts.parts ?? null : VALID_PARTS_CTX,
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 監査項目 1: Gate 漏れ — Phase × Trust 網羅
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-5.5 Gate Leak Audit: Phase × Trust matrix", () => {
  const phases: HdmPhase[] = [0, 1, 2, 3, 4, 5];
  const trusts: TrustLevel[] = [0, 1, 2, 3, 4];

  for (const phase of phases) {
    for (const trust of trusts) {
      const shouldAllow = phase >= 4 && trust >= 3;
      it(`Phase=${phase}, Trust=${trust} → ${shouldAllow ? "ALLOW" : "BLOCK"}`, () => {
        const result = gateCall(phase, trust);
        expect(result.allowed).toBe(shouldAllow);
        if (!shouldAllow) {
          expect(result.reason).not.toBeNull();
          if (phase < 4) {
            expect(result.allBlockReasons).toContain("blocked_by_phase");
          }
          if (trust < 3) {
            expect(result.allBlockReasons).toContain("blocked_by_trust");
          }
        }
      });
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 監査項目 1b: Gate 漏れ — 安全条件の絶対性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-5.5 Gate Leak Audit: Safety overrides", () => {
  // Phase 5 + Trust 5（最高条件）でも安全条件が1つでもあればブロック
  const safetyConditions = [
    { name: "dignity_risk", opts: { dignity: true } },
    { name: "rupture_active", opts: { rupture: true } },
    { name: "abuse_context", opts: { abuse: true } },
    { name: "exile_proximity", opts: { exile: true } },
    { name: "user_rejection", opts: { rejection: true } },
  ] as const;

  for (const { name, opts } of safetyConditions) {
    it(`Phase=5, Trust=4 + ${name} → BLOCK`, () => {
      const result = gateCall(5, 4, opts);
      expect(result.allowed).toBe(false);
      expect(result.reason).not.toBeNull();
    });
  }

  it("全安全条件を同時に設定 → BLOCK (abuse が最優先)", () => {
    const result = gateCall(5, 4, {
      dignity: true,
      rupture: true,
      abuse: true,
      exile: true,
      rejection: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("blocked_by_abuse_context");
    expect(result.allBlockReasons.length).toBe(5);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 監査項目 1c: Gate 漏れ — Parts 証拠不足
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-5.5 Gate Leak Audit: Parts evidence", () => {
  it("partsContext = null → BLOCK", () => {
    const result = gateCall(5, 4, { parts: null });
    expect(result.allowed).toBe(false);
    expect(result.allBlockReasons).toContain("blocked_by_parts_unclear");
  });

  it("dominantPart = unclear → BLOCK", () => {
    const result = gateCall(5, 4, { parts: { dominantPart: "unclear", signalCount: 5 } });
    expect(result.allowed).toBe(false);
    expect(result.allBlockReasons).toContain("blocked_by_parts_unclear");
  });

  it("signalCount = 0 → BLOCK", () => {
    const result = gateCall(5, 4, { parts: { dominantPart: "protective", signalCount: 0 } });
    expect(result.allowed).toBe(false);
    expect(result.allBlockReasons).toContain("blocked_by_parts_low_signals");
  });

  it("signalCount = 1 → BLOCK", () => {
    const result = gateCall(5, 4, { parts: { dominantPart: "reactive", signalCount: 1 } });
    expect(result.allowed).toBe(false);
    expect(result.allBlockReasons).toContain("blocked_by_parts_low_signals");
  });

  it("signalCount = 2, dominantPart = reactive → ALLOW", () => {
    const result = gateCall(5, 4, { parts: { dominantPart: "reactive", signalCount: 2 } });
    expect(result.allowed).toBe(true);
  });

  it("balanced + signalCount >= 2 → ALLOW（balanced は gate を通る）", () => {
    const result = gateCall(4, 3, { parts: { dominantPart: "balanced", signalCount: 3 } });
    expect(result.allowed).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 監査項目 2: Safety 分布 — 現実的な候補テキスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-5.5 Safety Audit: Realistic candidate texts", () => {
  // 良質な候補（safe であるべき）
  const safeCandidates = [
    "警戒を少し緩めたら、相手の意図をもう少し受け取れるかもしれない",
    "一呼吸置いた後でも、この不満は残る可能性がある",
    "もう少し境界を持てたら、断ることもできたかもしれない",
    "別の角度では、相手は単に忙しかっただけという見え方もある",
    "この反応の奥に、何か大切にしたいものがあるのかもしれない",
    "落ち着いた状態なら、違う言い方を選べた可能性がある",
  ];

  // 危険な候補（rejected であるべき）
  const unsafeCandidates = [
    "確実にあなたは間違っています",
    "本当の自分は、もっと弱い人間なのです",
    "あなたのプロテクターが過剰に反応しています",
    "核心は、あなたが愛情を受け取ることを恐れていることです",
    "トラウマが原因で、あなたは人を信じられないのです",
    "エグザイルが表面化しているので、IFSの観点から分析すると...",
    "間違いなく相手はこう思っている。あなたの本心は怒りです",
    "絶対にこの選択が正しい。抑圧された感情を解放すべきだ",
  ];

  // 境界線候補（safety 検証の判断力を確認）
  const borderlineCandidates = [
    { text: "可能性として、少し余裕を持てるかもしれない", expectSafe: true },
    { text: "心の奥底では、こう感じているのかもしれない", expectSafe: false }, // exile: 心の奥底
    { text: "防衛機制が働いているのかもしれない", expectSafe: false }, // psych: 防衛機制
    { text: "隠された本音があるのかもしれない", expectSafe: false }, // exile: 隠された
  ];

  describe("良質な候補 → safe", () => {
    for (const text of safeCandidates) {
      it(`"${text.slice(0, 30)}..." → safe`, () => {
        const result = validateCandidateSafety(text);
        expect(result.safe).toBe(true);
        expect(result.violations).toHaveLength(0);
      });
    }
  });

  describe("危険な候補 → unsafe", () => {
    for (const text of unsafeCandidates) {
      it(`"${text.slice(0, 30)}..." → unsafe`, () => {
        const result = validateCandidateSafety(text);
        expect(result.safe).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });
    }
  });

  describe("境界線候補", () => {
    for (const { text, expectSafe } of borderlineCandidates) {
      it(`"${text.slice(0, 30)}..." → ${expectSafe ? "safe" : "unsafe"}`, () => {
        const result = validateCandidateSafety(text);
        expect(result.safe).toBe(expectSafe);
      });
    }
  });

  // Violation 内訳の網羅確認
  it("violation type が全4種カバーされている", () => {
    const types = new Set<string>();
    const allTexts = [
      ...unsafeCandidates,
      ...borderlineCandidates.filter(c => !c.expectSafe).map(c => c.text),
      "あ".repeat(CANDIDATE_TEXT_MAX_LENGTH + 1), // too_long
    ];
    for (const text of allTexts) {
      const result = validateCandidateSafety(text);
      for (const v of result.violations) {
        types.add(v.type);
      }
    }
    expect(types).toContain("prohibited_phrase");
    expect(types).toContain("exile_language");
    expect(types).toContain("psych_label_exposed");
    expect(types).toContain("too_long");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 監査項目 3: Integration Decision 分布
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-5.5 Integration Decision Audit", () => {
  const situation = "転職を迷っている";

  // 良質候補 → adopted
  const adoptableCandidates = [
    "警戒を緩めたら、別の選択肢が見えてくるかもしれない",
    "落ち着いた後なら、違う判断をした可能性もある",
    "少し距離を置いたら、状況が違って見えるかもしれない",
  ];

  // 危険候補 → rejected
  const rejectableCandidates = [
    "確実にこの仕事は向いていない",
    "本当の自分は自由を求めている",
    "あなたのプロテクターが転職を阻んでいる",
  ];

  describe("良質候補 → adopted", () => {
    for (const text of adoptableCandidates) {
      it(`"${text.slice(0, 25)}..." → adopted`, () => {
        const result = computeIntegrationDecision(text, "alternative_part", situation);
        expect(result.decision).toBe("adopted");
        expect(result.finalText).not.toBeNull();
        // hedge prefix が含まれている
        const prefixes = COUNTERFACTUAL_FRAMING.alternativePartPrefixes;
        const hasPrefix = prefixes.some(p => result.finalText!.includes(p));
        expect(hasPrefix).toBe(true);
      });
    }
  });

  describe("危険候補 → rejected", () => {
    for (const text of rejectableCandidates) {
      it(`"${text.slice(0, 25)}..." → rejected`, () => {
        const result = computeIntegrationDecision(text, "alternative_part", situation);
        expect(result.decision).toBe("rejected");
        expect(result.finalText).toBeNull();
      });
    }
  });

  it("weakened ケース: 長さギリギリ候補 + hedge で超過", () => {
    // 199文字（safe）+ hedge prefix（~15-20文字）= 200+ → hedge 後 too_long → weakened
    const almostMax = "あ".repeat(CANDIDATE_TEXT_MAX_LENGTH - 1);
    const result = computeIntegrationDecision(almostMax, "alternative_part", situation);
    expect(result.decision).toBe("weakened");
    expect(result.finalText).toBe(almostMax); // hedge なしの元テキスト
  });

  // 分布の偏り検出: 全候補で分布を集計
  it("分布サマリ: adopted が過半数、rejected が存在、weakened は稀", () => {
    const all = [...adoptableCandidates, ...rejectableCandidates];
    const counts = { adopted: 0, weakened: 0, rejected: 0 };
    for (const text of all) {
      const result = computeIntegrationDecision(text, "alternative_part", situation);
      counts[result.decision]++;
    }
    // 良質3 + 危険3 = 6。良質→adopted, 危険→rejected が期待値
    expect(counts.adopted).toBeGreaterThanOrEqual(3);
    expect(counts.rejected).toBeGreaterThanOrEqual(3);
    // adopted だらけ（gate/safety が甘い）ではないことを確認
    expect(counts.rejected).toBeGreaterThan(0);
    // rejected だらけ（生成が荒い）ではないことを確認
    expect(counts.adopted).toBeGreaterThan(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 監査項目 5: hedge wrapper の安全性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P4-5.5 Hedge Wrapper Safety Audit", () => {
  it("全 alternativePartPrefixes が safe（禁止表現を含まない）", () => {
    for (const prefix of COUNTERFACTUAL_FRAMING.alternativePartPrefixes) {
      const check = validateCandidateSafety(prefix);
      expect(check.safe).toBe(true);
    }
  });

  it("全 otherPartyPrefixes が safe", () => {
    for (const prefix of COUNTERFACTUAL_FRAMING.otherPartyPrefixes) {
      const check = validateCandidateSafety(prefix);
      expect(check.safe).toBe(true);
    }
  });

  it("hedge 後に禁止表現が注入されないことを確認（代表候補3件）", () => {
    const candidates = [
      "少し余裕があれば違う反応ができたかもしれない",
      "一呼吸置いた後の自分なら別の選択もあり得る",
      "境界をもう少し持てたら楽になる可能性がある",
    ];
    for (const text of candidates) {
      for (const perspective of ["alternative_part", "other_party"] as const) {
        const hedged = applyHedgeWrapper(text, perspective, "テスト状況");
        const check = validateCandidateSafety(hedged);
        expect(check.safe).toBe(true);
      }
    }
  });
});
