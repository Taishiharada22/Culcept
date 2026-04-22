/**
 * blockingSlots — W3-PR-8 dialog-control (CEO 2026-04-22)
 *
 * 設計書: docs/alter-morning-strict-confirmation-design.md §2.8
 *
 * カバレッジ:
 *   - category_chain (chain_brand)         → blocking
 *   - undecided 語彙 (「決めてない」)        → blocking
 *   - anchor (語尾「周辺」)                  → blocking（PR-8 は無条件 blocking）
 *   - fixed proper noun                    → non-blocking
 *   - whatSharpness="vague" のみ            → non-blocking（PR-8 scope）
 *   - whenSharpness="missing"               → blocking
 *   - whenSharpness="vague" (timeHint のみ)  → blocking
 *   - 全 fixed                              → non-blocking
 *   - 複数 event で 1 件でも blocking        → aggregate true
 */
import { describe, test, expect } from "vitest";

import {
  blockingForEvent,
  hasBlockingUnresolvedSlots,
} from "@/lib/alter-morning/planning/blockingSlots";
import {
  utteranceProvenance,
  inferredProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";

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
      place_ref: "オフィス",
      placeType: "exact_proper_noun",
      provenance: utteranceProvenance(["オフィス"]),
    },
    what: {
      activity: "会議",
      activityCanonical: "会議",
      provenance: utteranceProvenance(["会議"]),
    },
    who: [],
    transport: null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
    ...overrides,
  };
}

describe("blockingForEvent (W3-PR-8)", () => {
  test("1. category_chain (placeType='chain_brand') → blocking=true", () => {
    const ev = mkEvent({
      where: {
        place_ref: "スタバ",
        placeType: "chain_brand",
        provenance: utteranceProvenance(["スタバ"]),
      },
    });
    expect(blockingForEvent(ev)).toBe(true);
  });

  test("2. undecided 語彙 (place_ref='決めてない') → blocking=true", () => {
    // 「決めてない」は whereSharpness=vague (placeType=null → vague) → blocking
    const ev = mkEvent({
      where: {
        place_ref: "決めてない",
        placeType: null,
        provenance: utteranceProvenance(["決めてない"]),
      },
    });
    expect(blockingForEvent(ev)).toBe(true);
  });

  test("3. anchor (語尾「周辺」) → blocking=true", () => {
    // CEO 2026-04-22: PR-8 段階では anchor 単独で plan 昇格させない
    const ev = mkEvent({
      where: {
        place_ref: "甲府駅周辺",
        placeType: "generic_place",
        provenance: utteranceProvenance(["甲府駅周辺"]),
      },
    });
    expect(blockingForEvent(ev)).toBe(true);
  });

  test("4. fixed proper noun (placeType='exact_proper_noun') → blocking=false", () => {
    const ev = mkEvent({
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        provenance: utteranceProvenance(["サドヤ"]),
      },
    });
    expect(blockingForEvent(ev)).toBe(false);
  });

  test("5. whatSharpness='vague' のみ → blocking=false（PR-8 scope）", () => {
    // 「仕事」「作業」等の VAGUE_ACTIVITY_SET。what vague は non-blocking
    const ev = mkEvent({
      what: {
        activity: "仕事",
        activityCanonical: "仕事",
        provenance: utteranceProvenance(["仕事"]),
      },
    });
    expect(blockingForEvent(ev)).toBe(false);
  });

  test("6. whenSharpness='missing' → blocking=true", () => {
    const ev = mkEvent({
      when: {
        startTime: null,
        timeHint: null,
        provenance: inferredProvenance(),
      },
    });
    expect(blockingForEvent(ev)).toBe(true);
  });

  test("7. whenSharpness='vague' (timeHint のみ) → blocking=true", () => {
    const ev = mkEvent({
      when: {
        startTime: null,
        timeHint: "morning",
        provenance: utteranceProvenance(["朝"]),
      },
    });
    expect(blockingForEvent(ev)).toBe(true);
  });

  test("8. 全 fixed → blocking=false", () => {
    const ev = mkEvent();
    expect(blockingForEvent(ev)).toBe(false);
  });

  test("9. whatSharpness='missing' → blocking=true", () => {
    const ev = mkEvent({
      what: {
        activity: "",
        activityCanonical: "",
        provenance: inferredProvenance(),
      },
    });
    expect(blockingForEvent(ev)).toBe(true);
  });
});

describe("hasBlockingUnresolvedSlots (plan-level)", () => {
  test("空配列 → false（items=0 禁則は別契約で扱う）", () => {
    expect(hasBlockingUnresolvedSlots([])).toBe(false);
  });

  test("全 event が非 blocking → false", () => {
    const ev1 = mkEvent({ event_id: "e1" });
    const ev2 = mkEvent({ event_id: "e2" });
    expect(hasBlockingUnresolvedSlots([ev1, ev2])).toBe(false);
  });

  test("1 件でも blocking が含まれていれば true", () => {
    const fixed = mkEvent({ event_id: "e1" });
    const blocking = mkEvent({
      event_id: "e2",
      where: {
        place_ref: "カフェ",
        placeType: "generic_place",
        provenance: utteranceProvenance(["カフェ"]),
      },
    });
    expect(hasBlockingUnresolvedSlots([fixed, blocking])).toBe(true);
  });
});
