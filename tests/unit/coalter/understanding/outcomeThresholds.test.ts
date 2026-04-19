/**
 * [CEO lock 2026-04-20 M0-3 #3] outcome 判定の境界値を 1 本 1 本固定する。
 *
 * judgeOutcome の閾値:
 *   FAILED_CONFIDENCE_FLOOR           = 0.20
 *   DEGRADED_CONFIDENCE_FLOOR         = 0.50
 *   DEGRADED_MISSING_DOMAINS_CEIL     = 4
 *
 * 閾値を動かしたら必ず本ファイルも更新すること。
 */

import { describe, it, expect } from "vitest";
import {
  judgeOutcome,
  OUTCOME_THRESHOLDS,
  type OutcomeJudgeInput,
} from "@/lib/coalter/understanding/index";
import type { SourceCoverage } from "@/lib/coalter/understanding/types";

const FULL_SC: SourceCoverage = {
  a: { stargazerCount: 5, alterCount: 5, behavioralCount: 3 },
  b: { stargazerCount: 4, alterCount: 5, behavioralCount: 2 },
};

const ZERO_SC: SourceCoverage = {
  a: { stargazerCount: 0, alterCount: 0, behavioralCount: 0 },
  b: { stargazerCount: 0, alterCount: 0, behavioralCount: 0 },
};

function mk(
  overrides: Partial<OutcomeJudgeInput> = {},
): OutcomeJudgeInput {
  return {
    confidence: 0.8,
    missingDomains: [],
    sourceCoverage: FULL_SC,
    ...overrides,
  };
}

describe("outcome 判定閾値（CEO lock M0-3 #3）", () => {
  it("定数が設計書と一致", () => {
    expect(OUTCOME_THRESHOLDS.FAILED_CONFIDENCE_FLOOR).toBe(0.2);
    expect(OUTCOME_THRESHOLDS.DEGRADED_CONFIDENCE_FLOOR).toBe(0.5);
    expect(OUTCOME_THRESHOLDS.DEGRADED_MISSING_DOMAINS_CEIL).toBe(4);
  });

  // ── failed ────────────────────────────────────────────────────────
  describe("failed", () => {
    it("source_coverage 全カテゴリ 0 → failed", () => {
      expect(judgeOutcome(mk({ sourceCoverage: ZERO_SC, confidence: 0.9 }))).toBe("failed");
    });

    it("confidence = 0.19 → failed（境界直下）", () => {
      expect(judgeOutcome(mk({ confidence: 0.19 }))).toBe("failed");
    });

    it("confidence = 0.00 → failed", () => {
      expect(judgeOutcome(mk({ confidence: 0 }))).toBe("failed");
    });
  });

  // ── degraded ──────────────────────────────────────────────────────
  describe("degraded", () => {
    it("confidence = 0.20 → degraded（failed 境界の直上）", () => {
      expect(judgeOutcome(mk({ confidence: 0.2 }))).toBe("degraded");
    });

    it("confidence = 0.49 → degraded（success 境界直下）", () => {
      expect(judgeOutcome(mk({ confidence: 0.49 }))).toBe("degraded");
    });

    it("missing_domains = 4 本 → degraded（境界）", () => {
      expect(
        judgeOutcome(
          mk({
            confidence: 0.8,
            missingDomains: [
              "personA.stargazer",
              "personA.alter",
              "personB.stargazer",
              "personB.alter",
            ],
          }),
        ),
      ).toBe("degraded");
    });

    it("missing_domains = 6 本でも confidence 高ければ degraded（failed にはならない）", () => {
      expect(
        judgeOutcome(
          mk({
            confidence: 0.8,
            missingDomains: [
              "personA.stargazer",
              "personA.alter",
              "personA.behavioral",
              "personB.stargazer",
              "personB.alter",
              "personB.behavioral",
            ],
          }),
        ),
      ).toBe("degraded");
    });
  });

  // ── success ───────────────────────────────────────────────────────
  describe("success", () => {
    it("confidence = 0.50 + missing 3 本 → success（境界）", () => {
      expect(
        judgeOutcome(
          mk({
            confidence: 0.5,
            missingDomains: ["personA.context", "personB.context", "relationship.sharedHistory"],
          }),
        ),
      ).toBe("success");
    });

    it("confidence = 0.99 + missing 0 本 → success", () => {
      expect(judgeOutcome(mk({ confidence: 0.99, missingDomains: [] }))).toBe("success");
    });
  });

  // ── cross-boundary matrix ─────────────────────────────────────────
  describe("交差表", () => {
    const rows: Array<[number, number, "failed" | "degraded" | "success"]> = [
      [0.0, 0, "failed"],
      [0.19, 0, "failed"],
      [0.2, 0, "degraded"],
      [0.49, 0, "degraded"],
      [0.5, 0, "success"],
      [0.5, 3, "success"],
      [0.5, 4, "degraded"], // 4 本で degraded（境界）
      [0.8, 4, "degraded"],
      [0.8, 3, "success"],
      [1.0, 0, "success"],
    ];
    for (const [conf, missing, expected] of rows) {
      it(`confidence=${conf}, missing=${missing} → ${expected}`, () => {
        const missingDomains = Array(missing).fill("personA.stargazer") as OutcomeJudgeInput["missingDomains"];
        expect(
          judgeOutcome({
            confidence: conf,
            missingDomains,
            sourceCoverage: FULL_SC,
          }),
        ).toBe(expected);
      });
    }
  });
});
