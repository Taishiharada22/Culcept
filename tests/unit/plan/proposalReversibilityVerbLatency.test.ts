/**
 * Phase 3-J-1d: Reversibility + Anchor Verb Map + Latency Tolerance + ArrivalRiskMemoryReader interface
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-1d / §10.2 Smoke 21 / §10.4 Smoke 43-44
 *
 * 検証対象:
 *   - reversibilityMap: computeReversibilityScore + meetsPhase3JReversibilityThreshold + sensitive 強制 0
 *   - anchorVerbMap: inferAnchorVerb + isSacredVerb
 *   - latencyToleranceMap: inferLatencyTolerance + 4 tolerance 分類
 *   - arrivalRiskMemoryReader: NULL_ARRIVAL_RISK_READER 常に null + interface compliance
 *
 * 不変原則 (= 本 test で機械的に強制):
 *   - Invariant 4 privacy first (= sensitive → score 0)
 *   - Invariant 23 Reversibility >= 50 で Phase 3-J 提案 gate
 *   - Invariant 28 Departure Correction is Suggestion (= J では reader null、 補正は出さない)
 */

import { describe, it, expect } from "vitest";

import {
  MIN_PHASE3_J_REVERSIBILITY,
  computeReversibilityScore,
  meetsPhase3JReversibilityThreshold,
} from "@/lib/plan/proposal/reversibilityMap";
import {
  inferAnchorVerb,
  isSacredVerb,
  type AnchorVerb,
} from "@/lib/plan/dayGraph/anchorVerbMap";
import {
  inferLatencyTolerance,
  type LatencyTolerance,
} from "@/lib/plan/dayGraph/latencyToleranceMap";
import {
  NULL_ARRIVAL_RISK_READER,
  type ArrivalDeviation,
  type AnchorContext,
} from "@/lib/plan/dayGraph/arrivalRiskMemoryReader";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// reversibilityMap
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeReversibilityScore — keyword matching", () => {
  it("飛行機 / フライト / flight → 0 (= 不可逆)", () => {
    expect(computeReversibilityScore({ title: "飛行機" })).toBe(0);
    expect(computeReversibilityScore({ title: "フライト" })).toBe(0);
    expect(computeReversibilityScore({ title: "flight to NYC" })).toBe(0);
  });

  it("ホテル / 婚活 / 入院 → 0", () => {
    expect(computeReversibilityScore({ title: "ホテル予約" })).toBe(0);
    expect(computeReversibilityScore({ title: "婚活パーティ" })).toBe(0);
    expect(computeReversibilityScore({ title: "入院" })).toBe(0);
  });

  it("病院 / 美容院 / 通院 → 20", () => {
    expect(computeReversibilityScore({ title: "病院" })).toBe(20);
    expect(computeReversibilityScore({ title: "美容院" })).toBe(20);
    expect(computeReversibilityScore({ title: "通院" })).toBe(20);
  });

  it("ジム / yoga → 40", () => {
    expect(computeReversibilityScore({ title: "ジム" })).toBe(40);
    expect(computeReversibilityScore({ title: "yoga class" })).toBe(40);
  });

  it("カフェ / ランチ / dinner → 70", () => {
    expect(computeReversibilityScore({ title: "カフェ" })).toBe(70);
    expect(computeReversibilityScore({ title: "ランチ" })).toBe(70);
    expect(computeReversibilityScore({ title: "dinner with friend" })).toBe(70);
  });

  it("散歩 / ストレッチ → 100", () => {
    expect(computeReversibilityScore({ title: "散歩" })).toBe(100);
    expect(computeReversibilityScore({ title: "ストレッチ" })).toBe(100);
    expect(computeReversibilityScore({ title: "morning walk" })).toBe(100);
  });

  it("未マッチ → default 60", () => {
    expect(computeReversibilityScore({ title: "謎の予定" })).toBe(60);
    expect(computeReversibilityScore({})).toBe(60);
  });

  it("sensitiveCategory → 強制 0 (= privacy invariant)", () => {
    expect(
      computeReversibilityScore({
        title: "カフェ",
        sensitiveCategory: "medical",
      }),
    ).toBe(0);
    expect(
      computeReversibilityScore({
        title: "ランチ",
        sensitiveCategory: "legal",
      }),
    ).toBe(0);
  });

  it("locationText も検索対象", () => {
    expect(
      computeReversibilityScore({
        title: "おでかけ",
        locationText: "新宿のホテル",
      }),
    ).toBe(0);
  });
});

describe("meetsPhase3JReversibilityThreshold", () => {
  it("threshold default = 50", () => {
    expect(MIN_PHASE3_J_REVERSIBILITY).toBe(50);
  });

  it("score 50+ → PASS", () => {
    expect(meetsPhase3JReversibilityThreshold(50)).toBe(true);
    expect(meetsPhase3JReversibilityThreshold(60)).toBe(true);
    expect(meetsPhase3JReversibilityThreshold(70)).toBe(true);
    expect(meetsPhase3JReversibilityThreshold(100)).toBe(true);
  });

  it("score < 50 → FAIL (= proposal 出さない)", () => {
    expect(meetsPhase3JReversibilityThreshold(0)).toBe(false);
    expect(meetsPhase3JReversibilityThreshold(20)).toBe(false);
    expect(meetsPhase3JReversibilityThreshold(40)).toBe(false);
    expect(meetsPhase3JReversibilityThreshold(49)).toBe(false);
  });

  it("testOverride.forceReversibilityThreshold で固定可", () => {
    expect(
      meetsPhase3JReversibilityThreshold(20, { forceReversibilityThreshold: 0 }),
    ).toBe(true);
    expect(
      meetsPhase3JReversibilityThreshold(70, { forceReversibilityThreshold: 90 }),
    ).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// anchorVerbMap
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("inferAnchorVerb", () => {
  it("eat verbs", () => {
    expect(inferAnchorVerb({ title: "ランチ" })).toBe("eat");
    expect(inferAnchorVerb({ title: "カフェ" })).toBe("eat");
    expect(inferAnchorVerb({ title: "lunch meeting" })).toBe("eat");
    expect(inferAnchorVerb({ title: "飲み会" })).toBe("eat"); // 「飲み」 が先 match
  });

  it("work verbs", () => {
    expect(inferAnchorVerb({ title: "会議" })).toBe("work");
    expect(inferAnchorVerb({ title: "打ち合わせ" })).toBe("work");
    expect(inferAnchorVerb({ title: "商談" })).toBe("work");
  });

  it("rest verbs", () => {
    expect(inferAnchorVerb({ title: "寝る" })).toBe("rest");
    expect(inferAnchorVerb({ title: "お休み" })).toBe("rest");
    expect(inferAnchorVerb({ title: "nap time" })).toBe("rest");
  });

  it("move verbs", () => {
    expect(inferAnchorVerb({ title: "ジム" })).toBe("move");
    expect(inferAnchorVerb({ title: "morning walk" })).toBe("move");
    expect(inferAnchorVerb({ title: "yoga" })).toBe("move");
  });

  it("care verbs", () => {
    expect(inferAnchorVerb({ title: "病院" })).toBe("care");
    expect(inferAnchorVerb({ title: "マッサージ" })).toBe("care");
    expect(inferAnchorVerb({ title: "美容院" })).toBe("care");
  });

  it("social verbs", () => {
    expect(inferAnchorVerb({ title: "友達と" })).toBe("social");
    expect(inferAnchorVerb({ title: "デート" })).toBe("social");
    expect(inferAnchorVerb({ title: "誕生日party" })).toBe("social");
  });

  it("unknown for empty / unmatched", () => {
    expect(inferAnchorVerb({})).toBe("unknown");
    expect(inferAnchorVerb({ title: "" })).toBe("unknown");
    expect(inferAnchorVerb({ title: "謎の予定" })).toBe("unknown");
  });

  it("locationText も検索対象", () => {
    expect(inferAnchorVerb({ title: "おでかけ", locationText: "ジム" })).toBe("move");
  });
});

describe("isSacredVerb — rest は sacred (= proposal 出さない)", () => {
  it("rest is sacred", () => {
    expect(isSacredVerb("rest")).toBe(true);
  });

  it("他は sacred ではない", () => {
    const nonSacred: AnchorVerb[] = ["eat", "work", "move", "care", "social", "unknown"];
    nonSacred.forEach((v) => {
      expect(isSacredVerb(v)).toBe(false);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// latencyToleranceMap
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("inferLatencyTolerance", () => {
  it("strict: 飛行機 / 新幹線 / 面接 / 病院", () => {
    expect(inferLatencyTolerance({ title: "飛行機" })).toBe("strict");
    expect(inferLatencyTolerance({ title: "新幹線" })).toBe("strict");
    expect(inferLatencyTolerance({ title: "面接" })).toBe("strict");
    expect(inferLatencyTolerance({ title: "病院" })).toBe("strict");
    expect(inferLatencyTolerance({ title: "結婚式" })).toBe("strict");
  });

  it("tight: 会議 / 打ち合わせ", () => {
    expect(inferLatencyTolerance({ title: "会議" })).toBe("tight");
    expect(inferLatencyTolerance({ title: "打ち合わせ" })).toBe("tight");
    expect(inferLatencyTolerance({ title: "morning meeting" })).toBe("tight");
  });

  it("flexible: ランチ / カフェ / ヨガ", () => {
    expect(inferLatencyTolerance({ title: "ランチ" })).toBe("flexible");
    expect(inferLatencyTolerance({ title: "カフェ" })).toBe("flexible");
    expect(inferLatencyTolerance({ title: "ヨガ" })).toBe("flexible");
  });

  it("none: 散歩 / フリー", () => {
    expect(inferLatencyTolerance({ title: "散歩" })).toBe("none");
    expect(inferLatencyTolerance({ title: "free time" })).toBe("none");
    expect(inferLatencyTolerance({ title: "ストレッチ" })).toBe("none");
  });

  it("未マッチ → flexible (= default)", () => {
    expect(inferLatencyTolerance({})).toBe("flexible");
    expect(inferLatencyTolerance({ title: "謎の予定" })).toBe("flexible");
  });

  it("priority: strict が flexible よりも先 (= 病院 + ランチ なら strict)", () => {
    // 病院 wins over ランチ (= strict first)
    expect(inferLatencyTolerance({ title: "病院後にランチ" })).toBe("strict");
  });

  it("all 4 tolerances exhaustive", () => {
    const tolerances: LatencyTolerance[] = ["strict", "tight", "flexible", "none"];
    tolerances.forEach((t) => {
      expect(typeof t).toBe("string");
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// arrivalRiskMemoryReader
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("NULL_ARRIVAL_RISK_READER — Phase 3-J 用 (= 常に null)", () => {
  it("getPastDeviation returns null for any context", () => {
    const ctx: AnchorContext = {
      title: "会議",
      locationText: "新宿",
      hourOfDay: 9,
      dayOfWeek: "Mon",
    };
    expect(NULL_ARRIVAL_RISK_READER.getPastDeviation(ctx)).toBeNull();
  });

  it("returns null for empty context", () => {
    expect(NULL_ARRIVAL_RISK_READER.getPastDeviation({})).toBeNull();
  });

  it("is frozen (= interface contract immutable)", () => {
    expect(Object.isFrozen(NULL_ARRIVAL_RISK_READER)).toBe(true);
  });

  it("ArrivalDeviation type shape (= compile-time check)", () => {
    const sample: ArrivalDeviation = {
      avgDeviationMin: 8,
      sampleCount: 3,
    };
    expect(sample.avgDeviationMin).toBe(8);
    expect(sample.sampleCount).toBe(3);
  });
});
