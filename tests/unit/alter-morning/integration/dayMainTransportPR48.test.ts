/**
 * PR-48 dayMainTransport 永続化 — integration tests (CEO 2026-04-29)
 *
 * CEO 成功条件:
 *   1. 一度「電車」 と答えたら、その日の default transport として保持
 *   2. 次の予定追加時に毎回移動手段を聞かない
 *   3. 「車に変更」「徒歩に変更」 と言ったら dayMainTransport が上書き
 *   4. travelSegments / travel items が新しい transport で再生成
 *   5. session / persisted state / plan.dayConditions の整合
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { adaptPipelineToLegacy } from "@/lib/alter-morning/legacyAdapter";
import type { MorningPipelineResult } from "@/lib/alter-morning/morningPipeline";
import {
  type Event,
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

function mkEvent(overrides: Partial<Event>): Event {
  const base: Event = {
    event_id: "evt_x",
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: null,
      timeHint: null,
      provenance: inferredProvenance(),
    },
    where: {
      place_ref: null,
      placeType: null,
      coordinates: null,
      provenance: inferredProvenance(),
    },
    what: {
      activity: "",
      activityCanonical: "",
      provenance: inferredProvenance(),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
  return { ...base, ...overrides } as Event;
}

function mkResult(events: Event[]): MorningPipelineResult {
  return {
    status: "ok",
    comprehension: {
      events,
      targetDate: "today",
      startPoint: null,
      departureTime: null,
      goOut: null,
    },
    timeline: { entries: [], violations: [] },
    grounded: [],
    gapResolution: {
      actions: events.map((ev) => ({
        type: "pass_through" as const,
        event_id: ev.event_id,
      })),
      primary_clarify: null,
    },
    annotations: { body: [], weather: [], party: [] },
    narration: null,
    hints: {
      explicit_times: [],
      explicit_start_points: [],
      slot_opt_outs: [],
    },
  };
}

let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubEnv("VERCEL_ENV", "preview");
});

afterEach(() => {
  consoleSpy.mockRestore();
  vi.unstubAllEnvs();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO 成功条件 1: 一度「電車」 と答えたら保持
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PR-48 [CEO 1]: 一度確定した transport が dayMainTransport に保持される", () => {
  it("Turn 1 「電車で行く」 → session.dayMainTransport='電車'", () => {
    const ev = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
      transport: "電車",
    });
    const { session } = adaptPipelineToLegacy(mkResult([ev]), {
      sessionId: "s1",
      utterance: "9時にサドヤでコーヒー、電車で行く",
      priorPersistedEvents: [],
    });
    expect(session.dayMainTransport).toBe("電車");
  });

  it("Turn 2 (新規予定追加、transport 言及なし) → priorDayMainTransport='電車' を継承", () => {
    const priorEv = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
      transport: "電車",
    });
    // 新規追加 event (transport=null)
    const newEv = mkEvent({
      event_id: "e2",
      turn_mode: "append",
      when: {
        startTime: "12:00",
        timeHint: null,
        provenance: utteranceProvenance(["12時"], "high"),
      },
      where: {
        place_ref: "新宿",
        placeType: null,
        coordinates: null,
        provenance: utteranceProvenance(["新宿"], "high"),
      },
      what: {
        activity: "ランチ",
        activityCanonical: "ランチ",
        provenance: utteranceProvenance(["ランチ"], "high"),
      },
      // transport: null  ← 言及なし
    });
    const { session } = adaptPipelineToLegacy(mkResult([newEv]), {
      sessionId: "s1",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [priorEv],
      // PR-48: prior turn の dayMainTransport を継承
      priorDayMainTransport: "電車",
    });
    // session.dayMainTransport は引き続き "電車"
    expect(session.dayMainTransport).toBe("電車");
    // 全 events に transport が auto-inject されている
    expect(session.persistedEvents).toBeDefined();
    for (const ev of session.persistedEvents!) {
      expect(ev.transport).toBe("電車");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO 成功条件 3: modify で上書き
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PR-48 [CEO 3]: 「車に変更」 で dayMainTransport が上書き", () => {
  it("priorDayMainTransport='電車' + 「車に変更」 modify → dayMainTransport='車'", () => {
    const priorEv = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
      transport: "電車",
    });
    // LLM が modify event を出した想定 (PR-47 detector で 「車に変更」 patterns が
    // suggestedTransport='車' として guard で event.transport を override する)
    const modifyEv = mkEvent({
      event_id: "evt_modify",
      turn_mode: "modify",
      target_ref: "今日の予定",
      transport: "車",
    });
    const { session } = adaptPipelineToLegacy(mkResult([modifyEv]), {
      sessionId: "s1",
      utterance: "車に変更",
      priorPersistedEvents: [priorEv],
      priorDayMainTransport: "電車",
    });
    // session.dayMainTransport は "車" に override
    expect(session.dayMainTransport).toBe("車");
    // events も transport="車" になっている
    expect(session.persistedEvents).toBeDefined();
    expect(session.persistedEvents![0].transport).toBe("車");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO 成功条件 4: travelSegments / dayConditions 整合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PR-48 [CEO 4]: plan.dayConditions.mainTransport が dayMainTransport と整合", () => {
  it("dayMainTransport='電車' → plan.dayConditions.mainTransport='train' (vc 形)", () => {
    const ev = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.66, lng: 138.57 },
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
      transport: "電車",
    });
    const { response, session } = adaptPipelineToLegacy(mkResult([ev]), {
      sessionId: "s1",
      utterance: "9時にサドヤでコーヒー、電車で行く",
      priorPersistedEvents: [],
    });
    expect(session.dayMainTransport).toBe("電車");
    expect(response.plan?.dayConditions.mainTransport).toBe("train");
  });

  it("dayMainTransport='徒歩' → plan.dayConditions.mainTransport='walk'", () => {
    const ev = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.66, lng: 138.57 },
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
      transport: "徒歩",
    });
    const { response, session } = adaptPipelineToLegacy(mkResult([ev]), {
      sessionId: "s1",
      utterance: "9時にサドヤでコーヒー、徒歩",
      priorPersistedEvents: [],
    });
    expect(session.dayMainTransport).toBe("徒歩");
    expect(response.plan?.dayConditions.mainTransport).toBe("walk");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 補完: prior 不在で events も transport なし → null
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PR-48 [edge]: transport 未確定", () => {
  it("priorDayMainTransport なし + events.transport=null → session.dayMainTransport=null", () => {
    const ev = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
      // transport 言及なし
    });
    const { session } = adaptPipelineToLegacy(mkResult([ev]), {
      sessionId: "s1",
      utterance: "9時にサドヤでコーヒー",
      priorPersistedEvents: [],
    });
    expect(session.dayMainTransport).toBeNull();
  });
});
