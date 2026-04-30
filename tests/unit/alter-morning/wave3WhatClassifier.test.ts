/**
 * wave3WhatClassifier — W3-PR-7 Commit 1
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-pr7-design.md §4.4
 *
 * 責務確認:
 *   - 具体的活動 → FIXED
 *   - 空文字 → ASK (missing_activity)
 *   - VAGUE_ACTIVITY_SET → ASK (vague_activity)
 */
import { describe, test, expect } from "vitest";

import {
  utteranceProvenance,
  inferredProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";

import { classifyWhatSlot } from "@/lib/alter-morning/planning/whatClassifier";

function mkEvent(id: string, activity: string, canonical?: string): Event {
  return {
    event_id: id,
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: { startTime: null, timeHint: null, provenance: inferredProvenance() },
    where: { place_ref: null, placeType: null, provenance: inferredProvenance() },
    what: {
      activity,
      activityCanonical: canonical ?? activity,
      provenance: activity ? utteranceProvenance([activity]) : inferredProvenance(),
    },
    who: [],
    transport: null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
}

describe("classifyWhatSlot", () => {
  test("具体的活動 → FIXED", () => {
    const ev = mkEvent("e1", "ランチ");
    const res = classifyWhatSlot(ev, { events: [ev], index: 0 });
    expect(res.kind).toBe("fixed");
    if (res.kind === "fixed") expect(res.reason).toBe("specific_activity");
  });

  test("空文字 activity → ASK/missing_activity", () => {
    const ev = mkEvent("e1", "");
    const res = classifyWhatSlot(ev, { events: [ev], index: 0 });
    expect(res.kind).toBe("ask");
    if (res.kind === "ask") expect(res.reason).toBe("missing_activity");
  });

  test("汎用語（仕事） → ASK/vague_activity", () => {
    const ev = mkEvent("e1", "仕事");
    const res = classifyWhatSlot(ev, { events: [ev], index: 0 });
    expect(res.kind).toBe("ask");
    if (res.kind === "ask") expect(res.reason).toBe("vague_activity");
  });

  test("作業 / 用事 / 予定 / もろもろ / 雑務 / タスク も vague_activity", () => {
    for (const a of ["作業", "用事", "予定", "もろもろ", "雑務", "タスク"]) {
      const ev = mkEvent("e1", a);
      const res = classifyWhatSlot(ev, { events: [ev], index: 0 });
      expect(res.kind).toBe("ask");
      if (res.kind === "ask") expect(res.reason).toBe("vague_activity");
    }
  });

  test("canonical が vague 側に寄ると vague 扱い", () => {
    const ev = mkEvent("e1", "ちょこっと仕事", "仕事");
    const res = classifyWhatSlot(ev, { events: [ev], index: 0 });
    expect(res.kind).toBe("ask");
    if (res.kind === "ask") expect(res.reason).toBe("vague_activity");
  });
});
