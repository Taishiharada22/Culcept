/**
 * [CEO lock 2026-04-20 M0-6B]
 *
 * internal-pair export の匿名化 assert。
 *   - JSON.stringify 結果に禁止 key token が現れない
 *   - 違反があれば assertAnonymized が throw する
 *   - pairHash が安定（入力順に依存しない）
 *
 * 本テストは shadow 実行 (実 API 呼出) を行わない。純粋な serialize 検査のみ。
 */

import { describe, expect, it } from "vitest";
import {
  assertAnonymized,
  computePairHash,
  findAnonymizationViolations,
  type InternalPairCase,
  type InternalPairExportV1,
} from "@/lib/coalter/understanding/__testkit__/internalPairSchema";

function makeCase(caseId: string): InternalPairCase {
  return {
    caseId,
    compressedInput: {
      energyLevel: "mid",
      conversationArc: "opening",
      caringIntensity: { a: 0.5, b: 0.4 },
      implicitMood: "柔らかな気配",
      fatigueSignal: "none",
      celebrationSignal: false,
      renLeaning: { a: false, b: false },
      calendarDensity: { a: "light", b: "medium" },
      unspokenDesires: ["ゆっくり歩きたい"],
      completeness: {
        personA: { stargazer: 0.5, alter: 0.5, behavioral: 0.5, context: 0.5 },
        personB: { stargazer: 0.5, alter: 0.5, behavioral: 0.5, context: 0.5 },
        relationship: 0.5,
        conversation: 0.5,
        environmental: 0.5,
      },
    },
    ruleSnapshot: {
      mode: "maintain",
      energyBudget: "mid",
      timeBudget: "limited",
      confidence: 0.6,
      latentNeedsCount: 2,
    },
  };
}

function makeDoc(cases: InternalPairCase[]): InternalPairExportV1 {
  return {
    schemaVersion: "coalter.internal_pair.v1",
    pairHash: "a".repeat(16),
    extractedAt: "2026-04-20T12:00:00Z",
    sessionCount: cases.length,
    cases,
  };
}

describe("InternalPairExportV1 anonymization", () => {
  it("clean doc が assertAnonymized を PASS する", () => {
    const doc = makeDoc([makeCase("case-001"), makeCase("case-002")]);
    expect(() => assertAnonymized(doc)).not.toThrow();
    expect(findAnonymizationViolations(doc)).toEqual([]);
  });

  it("serialize に userId / displayName / email / body / narratives が含まれない", () => {
    const doc = makeDoc([makeCase("case-001")]);
    const s = JSON.stringify(doc);
    expect(s.includes('"userId"')).toBe(false);
    expect(s.includes('"displayName"')).toBe(false);
    expect(s.includes('"email"')).toBe(false);
    expect(s.includes('"body"')).toBe(false);
    expect(s.includes('"recentNarratives"')).toBe(false);
    expect(s.includes('"sharedHistory"')).toBe(false);
  });

  it("追加メタに email を紛れ込ませると assertAnonymized が throw する", () => {
    const doc = makeDoc([makeCase("case-001")]);
    // 違反シミュレーション: 型を抜けて email を潜り込ませる
    (doc as unknown as Record<string, unknown>).email = "leak@example.com";
    expect(() => assertAnonymized(doc)).toThrow(/anonymization violation/);
  });

  it("case 側に body を紛れ込ませても検出する", () => {
    const c = makeCase("case-001");
    (c as unknown as Record<string, unknown>).body = "生テキスト";
    const doc = makeDoc([c]);
    expect(() => assertAnonymized(doc)).toThrow(/anonymization violation/);
  });
});

describe("computePairHash", () => {
  it("16 hex chars を返す", () => {
    const h = computePairHash("user_a", "user_b", "pepper-1");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("(A, B) と (B, A) で同じ hash を返す（入力順非依存）", () => {
    const h1 = computePairHash("user_a", "user_b", "pepper-1");
    const h2 = computePairHash("user_b", "user_a", "pepper-1");
    expect(h1).toBe(h2);
  });

  it("pepper が違えば hash が変わる", () => {
    const h1 = computePairHash("user_a", "user_b", "pepper-1");
    const h2 = computePairHash("user_a", "user_b", "pepper-2");
    expect(h1).not.toBe(h2);
  });
});
