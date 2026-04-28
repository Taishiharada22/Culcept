/**
 * eventToPlanItem 5W1H 写像 fidelity テスト
 *
 * CEO 2026-04-28 監査結果に基づく PR #40 拡張:
 *   G1: event.who[] → item.withWhom (Who 軸)
 *   G2: event.transport → item.transport (How 軸)
 *
 * 監査で判明した gap:
 *   eventToPlanItem は who / transport を写像していなかった。
 *   - UI (MorningPlanCard.tsx L819) は item.withWhom が来れば「👤」 render する用意あり
 *   - travel item は travelTransport を持つが、event item の transport も持てる設計
 *
 * 本テストは「LLM が抽出した Who/How が PlanItem まで届く」契約を保証する。
 *
 * Scope:
 *   - Phase 1 (G1): who → withWhom 写像
 *   - Phase 2 (G2): transport → transport 写像
 */

import { describe, it, expect } from "vitest";
import { buildPlanAndSegmentsFromEvents } from "@/lib/alter-morning/planning/planRebuild";
import {
  type Event,
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

function mkEventFull(opts: {
  id?: string;
  startTime?: string | null;
  placeRef?: string;
  coordinates?: { lat: number; lng: number } | null;
  who?: string[];
  transport?: string | null;
}): Event {
  return {
    event_id: opts.id ?? "evt_1",
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    certainty: "asserted",
    when: {
      startTime: opts.startTime ?? null,
      timeHint: null,
      provenance: opts.startTime
        ? utteranceProvenance([opts.startTime], "high")
        : inferredProvenance(),
    },
    where: {
      place_ref: opts.placeRef ?? "TSUTAYA",
      placeType: "exact_proper_noun",
      coordinates: opts.coordinates ?? null,
      provenance: utteranceProvenance([opts.placeRef ?? "TSUTAYA"], "high"),
    },
    what: {
      activity: "コーヒー",
      activityCanonical: "カフェ",
      provenance: utteranceProvenance(["コーヒー"], "high"),
    },
    who: opts.who ?? [],
    transport: opts.transport ?? null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
}

describe("G1: event.who[] → item.withWhom 写像", () => {
  it("[ROOT CAUSE] event.who=['田中'] → item.withWhom='田中'", () => {
    const events = [mkEventFull({ id: "evt_1", who: ["田中"] })];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBe("田中");
  });

  it("event.who=['田中','佐藤'] → item.withWhom='田中、佐藤' (Japanese 列挙)", () => {
    const events = [mkEventFull({ id: "evt_1", who: ["田中", "佐藤"] })];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBe("田中、佐藤");
  });

  it("event.who=['田中','佐藤','鈴木'] 3 名以上でも全員 join", () => {
    const events = [
      mkEventFull({ id: "evt_1", who: ["田中", "佐藤", "鈴木"] }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBe("田中、佐藤、鈴木");
  });

  it("event.who=[] → item に withWhom field 自体含まれない (conditional spread)", () => {
    const events = [mkEventFull({ id: "evt_1", who: [] })];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBeUndefined();
    expect("withWhom" in result.items[0]).toBe(false);
  });

  it("event.who=['', '田中', ''] 空文字を除外して残るものだけ join (defensive)", () => {
    const events = [
      mkEventFull({ id: "evt_1", who: ["", "田中", ""] }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBe("田中");
  });

  it("event.who=['  ', ' '] 空白のみは undefined (defensive)", () => {
    const events = [mkEventFull({ id: "evt_1", who: ["  ", " "] })];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBeUndefined();
  });

  it("event.who=['  田中  '] trim される", () => {
    const events = [mkEventFull({ id: "evt_1", who: ["  田中  "] })];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBe("田中");
  });

  it("複数 event でそれぞれ異なる who を持つケース", () => {
    const events = [
      mkEventFull({ id: "evt_1", who: ["田中"] }),
      mkEventFull({ id: "evt_2", who: ["佐藤", "鈴木"] }),
      mkEventFull({ id: "evt_3", who: [] }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBe("田中");
    expect(result.items[1].withWhom).toBe("佐藤、鈴木");
    expect(result.items[2].withWhom).toBeUndefined();
  });
});
