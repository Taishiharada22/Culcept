/**
 * R1-5 Procedural Memory（pure）— M2 read mapper + procedural adapter（M1 accept ＋ M2 user-approve）。
 *   M2 enum validation・procedural は採用/承認のみ（dismiss/later 除外）・provenance/userConfirmed の source 別・非断定。
 */
import { describe, it, expect } from "vitest";
import {
  prmReviewDecisionRowToRead,
  prmReviewDecisionRowsToReads,
  type PrmReviewDecisionReadRow,
  type ReviewDecisionRead,
} from "@/lib/plan/reality/learning/prm-review-decision-read";
import {
  learningEventsToProceduralMemory,
  reviewDecisionsToProceduralMemory,
  buildProceduralMemory,
} from "@/lib/plan/reality/learning/memory-procedural-adapter";
import { memoryObservationHasViolation } from "@/lib/plan/reality/learning/memory-model";
import type { PrmLearningEventReadRow } from "@/lib/plan/reality/learning/prm-learning-event-read";

function m2row(over: Partial<PrmReviewDecisionReadRow> = {}): PrmReviewDecisionReadRow {
  return {
    decision: "approve",
    reviewer: "user",
    source_dimension: "band",
    source_value: "evening",
    dominant_action: "dismiss",
    favored_hypothesis: "not_now",
    still_possible: ["not_selected"],
    evidence_count: 6,
    counter_count: 1,
    certainty: "tentative",
    ...over,
  };
}
function m1row(over: Partial<PrmLearningEventReadRow> = {}): PrmLearningEventReadRow {
  return {
    handle: "h1",
    action: "accept",
    desired_date: "2026-05-12",
    band: "morning",
    confidence_band: "medium",
    duration_min: 60,
    source_kind: "seed_explicit",
    acted_at: "2026-05-12T10:00:00Z",
    ...over,
  };
}
function read(over: Partial<ReviewDecisionRead> = {}): ReviewDecisionRead {
  return {
    decision: "approve",
    reviewer: "user",
    contextDimension: "band",
    contextValue: "evening",
    dominantAction: "dismiss",
    favoredHypothesis: "not_now",
    stillPossible: ["not_selected"],
    evidenceCount: 6,
    counterCount: 1,
    certainty: "tentative",
    ...over,
  };
}

describe("R1-5 prmReviewDecisionRowToRead — M2 read mapper", () => {
  it("正常 row → clean read model（context 写し・raw なし）", () => {
    const r = prmReviewDecisionRowToRead(m2row());
    expect(r).not.toBeNull();
    expect(r!.decision).toBe("approve");
    expect(r!.reviewer).toBe("user");
    expect(r!.contextDimension).toBe("band");
    expect(r!.contextValue).toBe("evening");
    expect(r!.dominantAction).toBe("dismiss");
    expect(r!.certainty).toBe("tentative");
    expect(r!.stillPossible).toEqual(["not_selected"]);
  });
  it("不正 enum は null（decision/reviewer/dominant_action/certainty）", () => {
    expect(prmReviewDecisionRowToRead(m2row({ decision: "bogus" }))).toBeNull();
    expect(prmReviewDecisionRowToRead(m2row({ reviewer: "bogus" }))).toBeNull();
    expect(prmReviewDecisionRowToRead(m2row({ dominant_action: "bogus" }))).toBeNull();
    expect(prmReviewDecisionRowToRead(m2row({ certainty: "high" }))).toBeNull(); // high は構造的に来ない
  });
  it("still_possible null → []", () => {
    expect(prmReviewDecisionRowToRead(m2row({ still_possible: null }))!.stillPossible).toEqual([]);
  });
  it("複数 row（不正は skip）", () => {
    const reads = prmReviewDecisionRowsToReads([m2row(), m2row({ decision: "bogus" }), m2row({ reviewer: "operator" })]);
    expect(reads).toHaveLength(2);
  });
});

describe("R1-5 learningEventsToProceduralMemory — M1 accept のみ", () => {
  it("accept のみ手順化（dismiss/later は除外）", () => {
    const items = learningEventsToProceduralMemory([
      m1row({ action: "accept", band: "morning" }),
      m1row({ action: "dismiss", band: "morning" }),
      m1row({ action: "later", band: "evening" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].context).toEqual({ dimension: "band", value: "morning" });
    expect(items[0].observation).toContain("取り入れる進め方");
  });
  it("同一 band の accept を occurrence count へ collapse・provenance=M1・userConfirmed=false", () => {
    const items = learningEventsToProceduralMemory([
      m1row({ band: "morning" }),
      m1row({ band: "morning", desired_date: "2026-05-20" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].evidenceCount).toBe(2);
    expect(items[0].certainty).toBe("tentative");
    expect(items[0].counterCount).toBe(0);
    expect(items[0].source).toBe("prm_learning_event");
    expect(items[0].userConfirmed).toBe(false); // in-flow 採用（review でない）
    expect(items[0].kind).toBe("procedural");
  });
  it("accept なし → 空", () => {
    expect(learningEventsToProceduralMemory([m1row({ action: "dismiss" }), m1row({ action: "later" })])).toEqual([]);
  });
});

describe("R1-5 reviewDecisionsToProceduralMemory — M2 user-approve のみ", () => {
  it("reviewer=user ∧ decision=approve のみ（operator/reject/defer 除外）", () => {
    const items = reviewDecisionsToProceduralMemory([
      read({ reviewer: "user", decision: "approve" }),
      read({ reviewer: "operator", decision: "approve" }), // operator → 除外
      read({ reviewer: "user", decision: "reject" }), // reject → 除外
      read({ reviewer: "user", decision: "defer" }), // defer → 除外
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe("prm_review_decision");
    expect(items[0].userConfirmed).toBe(true); // 本人 review 承認＝confirm
  });
  it("dominant_action → 進め方の動詞・context は M2 の dimension/value を使う", () => {
    expect(reviewDecisionsToProceduralMemory([read({ dominantAction: "accept" })])[0].observation).toContain("取り入れる進め方");
    expect(reviewDecisionsToProceduralMemory([read({ dominantAction: "dismiss" })])[0].observation).toContain("見送る進め方");
    expect(reviewDecisionsToProceduralMemory([read({ dominantAction: "later" })])[0].observation).toContain("後回しにする進め方");
    const dur = reviewDecisionsToProceduralMemory([read({ contextDimension: "durationBucket", contextValue: "long" })])[0];
    expect(dur.observation).toContain("時間のかかる予定");
    expect(dur.context).toEqual({ dimension: "durationBucket", value: "long" });
  });
  it("evidence/counter/certainty は read を保持（M1 と違い counter あり得る）", () => {
    const m = reviewDecisionsToProceduralMemory([read({ evidenceCount: 9, counterCount: 2 })])[0];
    expect(m.evidenceCount).toBe(9);
    expect(m.counterCount).toBe(2);
  });
});

describe("R1-5 buildProceduralMemory — M1 ＋ M2 合成", () => {
  it("両 source を共存させる（merge せず別 evidence）", () => {
    const items = buildProceduralMemory({
      learningEvents: [m1row({ band: "morning" })],
      reviewDecisions: [read({ contextValue: "evening" })],
    });
    expect(items).toHaveLength(2);
    expect(items.map((m) => m.source).sort()).toEqual(["prm_learning_event", "prm_review_decision"]);
  });
  it("入力欠落は空配列扱い", () => {
    expect(buildProceduralMemory({})).toEqual([]);
    expect(buildProceduralMemory({ learningEvents: [m1row()] })).toHaveLength(1);
  });
  it("全 item は kind=procedural・非断定・trait 語なし", () => {
    const items = buildProceduralMemory({
      learningEvents: [m1row({ band: "morning" }), m1row({ band: "evening" })],
      reviewDecisions: [read(), read({ dominantAction: "accept", contextValue: "morning" })],
    });
    for (const m of items) {
      expect(m.kind).toBe("procedural");
      expect(memoryObservationHasViolation(m.observation)).toBe(false);
      expect(m.observation).toContain("進め方");
    }
  });
});
