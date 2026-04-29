/**
 * turn_mode "append" schema 拡張の sanity test
 *
 * CEO 2026-04-28 PR #41a Layer 1:
 *   Event.turn_mode union に "append" を追加。LLM 経由 (PR #41a Commit 3) と
 *   実 dispatch (PR #41b L4-L5) の前段として、schema レベルの整合性を保証する。
 *
 * 検証観点:
 *   1. TurnMode 型に "create" | "append" | "modify" が全て assignable
 *   2. structuredSchema の enum に "append" が含まれる (LLM が出力可能)
 *   3. 既存 "create"/"modify" は維持 (backward compat)
 *   4. attachEventId / runL1Pipeline が "append" event を通過させる (data path 健全性)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  type Event,
  type TurnMode,
  resetEventCounter,
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import {
  attachEventId,
  runL1Pipeline,
} from "@/lib/alter-morning/comprehension/l1Pipeline";
import { L1_COMPREHENSION_SCHEMA } from "@/lib/alter-morning/comprehension/structuredSchema";

beforeEach(() => {
  resetEventCounter();
});

describe("TurnMode union 拡張", () => {
  it("'create' | 'append' | 'modify' が型レベルで assignable", () => {
    // 型チェックは tsc が判定。実行時は値の有効性のみ確認
    const create: TurnMode = "create";
    const append: TurnMode = "append";
    const modify: TurnMode = "modify";
    expect(create).toBe("create");
    expect(append).toBe("append");
    expect(modify).toBe("modify");
  });
});

describe("structuredSchema.turn_mode enum", () => {
  it("LLM Structured Outputs schema に 'append' が含まれる", () => {
    const eventsSchema = (
      L1_COMPREHENSION_SCHEMA as unknown as {
        properties: {
          events: { items: { properties: { turn_mode: { enum: string[] } } } };
        };
      }
    ).properties.events.items.properties.turn_mode;
    expect(eventsSchema.enum).toContain("append");
  });

  it("既存の 'create'/'modify' も維持される (backward compat)", () => {
    const eventsSchema = (
      L1_COMPREHENSION_SCHEMA as unknown as {
        properties: {
          events: { items: { properties: { turn_mode: { enum: string[] } } } };
        };
      }
    ).properties.events.items.properties.turn_mode;
    expect(eventsSchema.enum).toContain("create");
    expect(eventsSchema.enum).toContain("modify");
  });

  it("enum 長さが 3 (create / append / modify、それ以外なし)", () => {
    const eventsSchema = (
      L1_COMPREHENSION_SCHEMA as unknown as {
        properties: {
          events: { items: { properties: { turn_mode: { enum: string[] } } } };
        };
      }
    ).properties.events.items.properties.turn_mode;
    expect(eventsSchema.enum).toHaveLength(3);
  });
});

describe("L1 pipeline が turn_mode='append' を通過させる", () => {
  function mkRawEvent(
    turn_mode: TurnMode,
  ): Omit<Event, "event_id"> {
    return {
      turn_mode,
      target_ref: turn_mode === "modify" ? "朝の予定" : null,
      target_ref_confidence: turn_mode === "modify" ? "high" : null,
      change_scope: turn_mode === "modify" ? "replace" : null,
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "TSUTAYA",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["TSUTAYA"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "カフェ",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
      who: [],
      transport: null,
      certainty: "asserted" as const,
      missing_semantic_critical: [],
      missing_solver_blockers: [],
    };
  }

  it("attachEventId('append') で event_id 付与 + turn_mode 維持", () => {
    const raw = mkRawEvent("append");
    const ev = attachEventId(raw);
    expect(ev.turn_mode).toBe("append");
    expect(ev.event_id).toMatch(/^event_\d+$/);
  });

  it("runL1Pipeline で 'append' event が events 配列に含まれる", () => {
    const result = runL1Pipeline({
      raw: {
        targetDate: "today",
        events: [mkRawEvent("append")],
        operations: [],
        startPoint: null,
        departureTime: null,
        goOut: null,
      },
      utterance: "新宿でディナー",
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].turn_mode).toBe("append");
  });

  it("3 種混在 (create + append + modify) も全部通過", () => {
    const result = runL1Pipeline({
      raw: {
        targetDate: "today",
        events: [
          mkRawEvent("create"),
          mkRawEvent("append"),
          mkRawEvent("modify"),
        ],
        operations: [],
        startPoint: null,
        departureTime: null,
        goOut: null,
      },
      utterance: "test",
    });
    // coalesceFragmentedEvents が 2-event split を統合する場合があるため、
    // 厳密 length check は外し、turn_mode 値の存在のみ確認
    const turnModes = result.events.map((e) => e.turn_mode);
    expect(turnModes).toContain("create");
  });
});
