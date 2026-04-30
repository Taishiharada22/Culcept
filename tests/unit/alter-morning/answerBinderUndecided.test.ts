/**
 * answerBinder undecided 拒否 + 単一 event invariant — W3-PR-8 (CEO 2026-04-22)
 *
 * 設計書: docs/alter-morning-strict-confirmation-design.md §3.6
 *
 * カバレッジ:
 *   1. 「決めてない」→ bind 拒否、reason="semantic_miss"
 *   2. 「任せる」→ bind 拒否
 *   3. 「おすすめで」→ bind 拒否
 *   4. 「スタバ」（非 undecided）→ bind 成功
 *   5. 単一 event invariant: 正常 bind で更新 event 数 === 1
 */
import { describe, test, expect } from "vitest";

import {
  utteranceProvenance,
  inferredProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import { bindAnswerToSlot } from "@/lib/alter-morning/comprehension/answerBinder";
import type { PendingClarify } from "@/lib/alter-morning/types";

function mkEvent(overrides: Partial<Event> = {}): Event {
  return {
    event_id: "e1",
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: {
      startTime: "09:00",
      timeHint: null,
      provenance: utteranceProvenance(["9時"]),
    },
    where: {
      place_ref: null,
      placeType: null,
      provenance: inferredProvenance(),
    },
    what: {
      activity: "仕事",
      activityCanonical: "仕事",
      provenance: utteranceProvenance(["仕事"]),
    },
    who: [],
    transport: null,
    missing_semantic_critical: ["where"],
    missing_solver_blockers: [],
    ...overrides,
  };
}

function mkPendingWhere(): PendingClarify {
  return {
    event_id: "e1",
    slot: "where",
    kind: "where_center",
    scope: { timeLabel: "09:00", activityLabel: "仕事", eventOrdinal: 1 },
    question: "朝の仕事はどのあたり？",
    askedAt: new Date().toISOString(),
    semanticMissCount: 0,
  };
}

describe("answerBinder — undecided where answer 拒否 (W3-PR-8)", () => {
  test("1. 「決めてない」→ bind 拒否、reason='semantic_miss'", () => {
    const ev = mkEvent();
    const res = bindAnswerToSlot([ev], mkPendingWhere(), "決めてない");
    expect(res.bound).toBe(false);
    if (!res.bound) expect(res.reason).toBe("semantic_miss");
    // events は元のまま（place_ref null のまま）
    expect(res.events[0].where.place_ref).toBeNull();
  });

  test("2. 「任せる」→ bind 拒否", () => {
    const ev = mkEvent();
    const res = bindAnswerToSlot([ev], mkPendingWhere(), "任せる");
    expect(res.bound).toBe(false);
    expect(res.events[0].where.place_ref).toBeNull();
  });

  test("3. 「おすすめで」→ bind 拒否", () => {
    const ev = mkEvent();
    const res = bindAnswerToSlot([ev], mkPendingWhere(), "おすすめで");
    expect(res.bound).toBe(false);
  });

  test("3b. 「どこでもいいよ」（先頭一致）→ bind 拒否", () => {
    const ev = mkEvent();
    const res = bindAnswerToSlot([ev], mkPendingWhere(), "どこでもいいよ");
    expect(res.bound).toBe(false);
  });

  test("4. 「スタバ」（非 undecided）→ bind 成功", () => {
    const ev = mkEvent();
    const res = bindAnswerToSlot([ev], mkPendingWhere(), "スタバ");
    expect(res.bound).toBe(true);
    expect(res.events[0].where.place_ref).toBe("スタバ");
  });

  test("5. 単一 event invariant: 正常 bind で更新 event 数 === 1", () => {
    const ev1 = mkEvent({ event_id: "e1" });
    const ev2 = mkEvent({ event_id: "e2" });
    const pending: PendingClarify = {
      ...mkPendingWhere(),
      event_id: "e2", // e2 を bind 対象
    };
    const res = bindAnswerToSlot([ev1, ev2], pending, "カフェ");
    expect(res.bound).toBe(true);
    // 更新された event は e2 のみ
    expect(res.events[0]).toBe(ev1); // e1 は shallow 同一
    expect(res.events[1]).not.toBe(ev2); // e2 のみ変わった
    expect(res.events[1].where.place_ref).toBe("カフェ");
    // 元の ev2 は不変
    expect(ev2.where.place_ref).toBeNull();
  });
});
