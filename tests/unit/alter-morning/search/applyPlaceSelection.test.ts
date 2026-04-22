/**
 * applyPlaceSelection — W3-PR-9 Commit 5a-1 unit tests
 *
 * 検証観点:
 *   1. happy path: target event.where が candidate で上書きされる
 *   2. 非 target event は参照そのまま（=== 等価）
 *   3. target_ref が見つからない場合 events は参照そのまま、applied=false
 *   4. provenance は tool/high にリセット
 *   5. missing_semantic_critical から "where" が除去される
 *   6. 他の missing（when/what）は保持
 *   7. 非破壊: 入力 events は変更されない
 */

import { describe, expect, it } from "vitest";
import { applyPlaceSelection } from "@/lib/alter-morning/search/applyPlaceSelection";
import type { NormalizedPlaceCandidate } from "@/lib/alter-morning/search/normalizedPlace";
import type {
  Event,
  SemanticCriticalSlot,
} from "@/lib/alter-morning/comprehension/eventSchema";
import {
  inferredProvenance,
  utteranceProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

function mkEvent(
  event_id: string,
  opts: {
    place_ref?: string | null;
    missing?: SemanticCriticalSlot[];
  } = {},
): Event {
  return {
    event_id,
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: "10:00",
      timeHint: null,
      provenance: utteranceProvenance(["10時"], "high"),
    },
    where: {
      place_ref: opts.place_ref ?? null,
      placeType: null,
      provenance: inferredProvenance("low"),
    },
    what: {
      activity: "コーヒー",
      activityCanonical: "coffee",
      provenance: utteranceProvenance(["コーヒー"], "high"),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: opts.missing ?? [],
    missing_solver_blockers: [],
  };
}

function mkCandidate(id: string): NormalizedPlaceCandidate {
  return {
    placeId: id,
    displayName: `スターバックス ${id} 店`,
    address: "山梨県甲府市駅前1-1",
    coordinates: { lat: 35.664, lng: 138.569 },
    distanceFromAnchor: 320,
    category: "cafe",
    chainToken: "starbucks",
    rawRef: { provider: "google_places", placeId: id },
  };
}

describe("applyPlaceSelection", () => {
  it("target event の where を candidate で上書きする", () => {
    const events = [mkEvent("event_1", { place_ref: "スタバ" })];
    const candidate = mkCandidate("p123");

    const result = applyPlaceSelection({
      events,
      targetEventId: "event_1",
      candidate,
    });

    expect(result.applied).toBe(true);
    expect(result.events[0].where.place_ref).toBe("スターバックス p123 店");
    expect(result.events[0].where.placeType).toBe("exact_proper_noun");
    expect(result.events[0].where.coordinates).toEqual({
      lat: 35.664,
      lng: 138.569,
    });
  });

  it("provenance は tool/high にリセットされる", () => {
    const events = [mkEvent("event_1", { place_ref: "スタバ" })];
    const candidate = mkCandidate("p1");

    const result = applyPlaceSelection({
      events,
      targetEventId: "event_1",
      candidate,
    });

    const prov = result.events[0].where.provenance;
    expect(prov.source_type).toBe("tool");
    expect(prov.provenance_confidence).toBe("high");
    expect(prov.from_utterance).toBe(false);
    expect(prov.source_span).toEqual([]);
  });

  it("missing_semantic_critical から where を除去する", () => {
    const events = [
      mkEvent("event_1", { missing: ["where", "when"] as SemanticCriticalSlot[] }),
    ];

    const result = applyPlaceSelection({
      events,
      targetEventId: "event_1",
      candidate: mkCandidate("p1"),
    });

    expect(result.events[0].missing_semantic_critical).toEqual(["when"]);
  });

  it("where 以外の missing は保持される", () => {
    const events = [
      mkEvent("event_1", { missing: ["when", "what"] as SemanticCriticalSlot[] }),
    ];

    const result = applyPlaceSelection({
      events,
      targetEventId: "event_1",
      candidate: mkCandidate("p1"),
    });

    expect(result.events[0].missing_semantic_critical).toEqual(["when", "what"]);
  });

  it("非 target event は参照そのまま（=== 等価）", () => {
    const e1 = mkEvent("event_1", { place_ref: "スタバ" });
    const e2 = mkEvent("event_2", { place_ref: "マック" });
    const events = [e1, e2];

    const result = applyPlaceSelection({
      events,
      targetEventId: "event_1",
      candidate: mkCandidate("p1"),
    });

    expect(result.events[0]).not.toBe(e1);
    expect(result.events[1]).toBe(e2);
  });

  it("target_ref が見つからない場合 events は入力と同一参照、applied=false", () => {
    const events = [mkEvent("event_1")];
    const result = applyPlaceSelection({
      events,
      targetEventId: "event_999",
      candidate: mkCandidate("p1"),
    });

    expect(result.applied).toBe(false);
    expect(result.events).toBe(events);
  });

  it("非破壊: 入力 events 配列は変更されない", () => {
    const events = [mkEvent("event_1", { place_ref: "元の場所" })];
    const snapshot = JSON.parse(JSON.stringify(events));

    applyPlaceSelection({
      events,
      targetEventId: "event_1",
      candidate: mkCandidate("p1"),
    });

    expect(events).toEqual(snapshot);
    expect(events[0].where.place_ref).toBe("元の場所");
  });

  it("空 events 配列は applied=false で同一参照を返す", () => {
    const events: Event[] = [];
    const result = applyPlaceSelection({
      events,
      targetEventId: "event_1",
      candidate: mkCandidate("p1"),
    });

    expect(result.applied).toBe(false);
    expect(result.events).toBe(events);
  });
});
