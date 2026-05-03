/**
 * fromToTravelEdgeReconciler unit tests (= CEO/GPT 2026-05-03 PR #75)
 *
 * Coverage:
 *   - extract: 4 構文 / temporal strip / classifyLabel gate / 時刻抽出
 *   - reconcile: X 削除 / Y 削除 / Y 残す / pass-through (edge null)
 *   - 3 CEO test cases (= 崩壊 / 別予定併存 / 移動なし)
 */

import { describe, it, expect } from "vitest";
import {
  extractFromToTravelEdge,
  reconcileEventsWithTravelEdge,
} from "@/lib/alter-morning/comprehension/fromToTravelEdgeReconciler";
import type { Event } from "@/lib/alter-morning/comprehension/eventSchema";
import {
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkEvent(
  id: string,
  where: string,
  startTime: string | null,
  activity: string,
  activityProvenance: "utterance" | "inferred" = "inferred",
  activityConfidence: "high" | "medium" | "low" = "low",
): Event {
  return {
    event_id: id,
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime,
      timeHint: null,
      provenance:
        startTime != null
          ? utteranceProvenance([startTime + "時"], "high")
          : inferredProvenance(),
    } as Event["when"],
    where: {
      place_ref: where,
      placeType: "exact_proper_noun",
      provenance: utteranceProvenance([where], "high"),
    } as Event["where"],
    what: {
      activity,
      activityCanonical: activity,
      provenance:
        activityProvenance === "utterance"
          ? utteranceProvenance([activity], activityConfidence)
          : inferredProvenance(),
    } as Event["what"],
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extract: positive (= 4 構文)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[extract Positive] 4 構文", () => {
  it("「東京駅から渋谷へ」 → { 東京駅, 渋谷 }", () => {
    const r = extractFromToTravelEdge("東京駅から渋谷へ");
    expect(r?.segmentOrigin.label).toBe("東京駅");
    expect(r?.segmentDestination.label).toBe("渋谷");
    expect(r?.segmentDepartureTime).toBeUndefined();
  });

  it("「明日8時東京駅から渋谷へ」 → { ..., departureTime: 08:00 }", () => {
    const r = extractFromToTravelEdge("明日8時東京駅から渋谷へ");
    expect(r?.segmentOrigin.label).toBe("東京駅");
    expect(r?.segmentDestination.label).toBe("渋谷");
    expect(r?.segmentDepartureTime).toBe("08:00");
  });

  it("「明日 8 時東京駅から渋谷へ」 → { ..., departureTime: 08:00 } (= 半角 space)", () => {
    const r = extractFromToTravelEdge("明日 8 時東京駅から渋谷へ");
    expect(r?.segmentOrigin.label).toBe("東京駅");
    expect(r?.segmentDestination.label).toBe("渋谷");
    expect(r?.segmentDepartureTime).toBe("08:00");
  });

  it("「東京駅から渋谷に行く」 → success (= 構文 1: に変種)", () => {
    const r = extractFromToTravelEdge("東京駅から渋谷に行く");
    expect(r?.segmentOrigin.label).toBe("東京駅");
    expect(r?.segmentDestination.label).toBe("渋谷");
  });

  it("「東京駅から渋谷まで」 → success (= 構文 1: まで変種)", () => {
    const r = extractFromToTravelEdge("東京駅から渋谷まで");
    expect(r?.segmentOrigin.label).toBe("東京駅");
    expect(r?.segmentDestination.label).toBe("渋谷");
  });

  it("「東京駅を出て渋谷へ」 → success (= 構文 2)", () => {
    const r = extractFromToTravelEdge("東京駅を出て渋谷へ");
    expect(r?.segmentOrigin.label).toBe("東京駅");
    expect(r?.segmentDestination.label).toBe("渋谷");
  });

  it("「東京駅発で渋谷へ」 → success (= 構文 3)", () => {
    const r = extractFromToTravelEdge("東京駅発で渋谷へ");
    expect(r?.segmentOrigin.label).toBe("東京駅");
    expect(r?.segmentDestination.label).toBe("渋谷");
  });

  it("「Shibuya Stream から東京駅へ」 → success (= internal space)", () => {
    const r = extractFromToTravelEdge("Shibuya Stream から東京駅へ");
    expect(r?.segmentOrigin.label).toBe("Shibuya Stream");
    expect(r?.segmentDestination.label).toBe("東京駅");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extract: negative
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[extract Negative]", () => {
  it("「これから渋谷へ」 → null (= 「これ」 ambiguous)", () => {
    expect(extractFromToTravelEdge("これから渋谷へ")).toBeNull();
  });

  it("「明日から会議」 → null (= temporal strip → empty)", () => {
    expect(extractFromToTravelEdge("明日から会議")).toBeNull();
  });

  it("「8時から会議」 → null (= temporal strip → empty)", () => {
    expect(extractFromToTravelEdge("8時から会議")).toBeNull();
  });

  it("「東京駅でランチ」 → null (= 「から」 不在)", () => {
    expect(extractFromToTravelEdge("東京駅でランチ")).toBeNull();
  });

  it("「東京駅から東京駅へ」 → null (= 同一 label)", () => {
    expect(extractFromToTravelEdge("東京駅から東京駅へ")).toBeNull();
  });

  it("「父の家から渋谷へ」 → null (= origin private_semantic、 reject)", () => {
    expect(extractFromToTravelEdge("父の家から渋谷へ")).toBeNull();
  });

  it("「東京駅からあそこへ」 → null (= destination ambiguous、 reject)", () => {
    expect(extractFromToTravelEdge("東京駅からあそこへ")).toBeNull();
  });

  it("空文字 → null", () => {
    expect(extractFromToTravelEdge("")).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// reconcile: CEO 3 test cases (= 必須)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[reconcile CEO Case 1] 崩壊ケース 「明日8時東京駅から渋谷へ」", () => {
  it("両 event 削除、 deletedEventIds 2 件返却", () => {
    const events = [
      mkEvent("event_1", "渋谷", "08:00", "", "inferred", "low"),
      mkEvent("event_2", "東京駅", null, "", "inferred", "low"),
    ];
    const edge = extractFromToTravelEdge("明日8時東京駅から渋谷へ");
    expect(edge).not.toBeNull();
    const r = reconcileEventsWithTravelEdge(events, edge);
    expect(r.events).toHaveLength(0);
    expect(r.deletedEventIds.sort()).toEqual(["event_1", "event_2"]);
  });

  it("activity が「移動」 / 「予定」 inferred の場合も削除", () => {
    const events = [
      mkEvent("event_1", "渋谷", "08:00", "移動", "inferred", "low"),
      mkEvent("event_2", "東京駅", null, "出発", "inferred", "low"),
    ];
    const edge = extractFromToTravelEdge("明日8時東京駅から渋谷へ");
    const r = reconcileEventsWithTravelEdge(events, edge);
    expect(r.events).toHaveLength(0);
  });
});

describe("[reconcile CEO Case 2] 別予定併存 「8時東京駅から渋谷へ、9時に渋谷で会議」", () => {
  it("travel 由来 events 削除、 別時刻 + activity 明示の event は残す", () => {
    const events = [
      mkEvent("event_1", "渋谷", "08:00", "移動", "inferred", "low"),
      mkEvent("event_2", "東京駅", null, "", "inferred", "low"),
      mkEvent("event_3", "渋谷", "09:00", "会議", "utterance", "high"),
    ];
    const edge = extractFromToTravelEdge("8時東京駅から渋谷へ");
    const r = reconcileEventsWithTravelEdge(events, edge);
    expect(r.events).toHaveLength(1);
    expect(r.events[0].event_id).toBe("event_3");
    expect(r.events[0].when.startTime).toBe("09:00");
    expect(r.events[0].what.activity).toBe("会議");
    expect(r.deletedEventIds.sort()).toEqual(["event_1", "event_2"]);
  });
});

describe("[reconcile CEO Case 3] 移動なし 「8時渋谷で会議」", () => {
  it("edge null → events 完全 pass-through (= byte-diff zero)", () => {
    const events = [
      mkEvent("event_1", "渋谷", "08:00", "会議", "utterance", "high"),
    ];
    const edge = extractFromToTravelEdge("8時渋谷で会議");
    expect(edge).toBeNull();
    const r = reconcileEventsWithTravelEdge(events, edge);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toBe(events[0]); // = 同一参照 (= mutate なし)
    expect(r.deletedEventIds).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// reconcile: invariants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[reconcile invariants]", () => {
  it("Y event の activity が 明示で startTime も異なる → 残す", () => {
    const events = [
      mkEvent("event_1", "渋谷", "10:00", "ランチ", "utterance", "high"),
    ];
    const edge = extractFromToTravelEdge("8時東京駅から渋谷へ");
    const r = reconcileEventsWithTravelEdge(events, edge);
    expect(r.events).toHaveLength(1);
    expect(r.events[0].when.startTime).toBe("10:00");
    expect(r.events[0].what.activity).toBe("ランチ");
  });

  it("Y event の startTime が departureTime と異なる → 残す (= activity inferred でも別予定)", () => {
    const events = [
      mkEvent("event_1", "渋谷", "10:00", "", "inferred", "low"),
    ];
    const edge = extractFromToTravelEdge("8時東京駅から渋谷へ");
    const r = reconcileEventsWithTravelEdge(events, edge);
    // startTime != departureTime なので削除しない
    expect(r.events).toHaveLength(1);
  });

  it("入力 events を mutate しない (= pure)", () => {
    const events = [
      mkEvent("event_1", "渋谷", "08:00", "", "inferred", "low"),
      mkEvent("event_2", "東京駅", null, "", "inferred", "low"),
    ];
    const before = JSON.stringify(events);
    const edge = extractFromToTravelEdge("明日8時東京駅から渋谷へ");
    reconcileEventsWithTravelEdge(events, edge);
    expect(JSON.stringify(events)).toBe(before);
  });

  it("edge null → events / deletedEventIds 完全 pass-through", () => {
    const events = [
      mkEvent("event_1", "渋谷", "08:00", "会議", "utterance", "high"),
    ];
    const r = reconcileEventsWithTravelEdge(events, null);
    expect(r.events).toEqual(events);
    expect(r.deletedEventIds).toEqual([]);
  });
});
