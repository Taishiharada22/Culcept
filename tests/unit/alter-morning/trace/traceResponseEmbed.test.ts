/**
 * trace response embedding (PR #41a Commit 6)
 *
 * CEO 2026-04-28: Vercel function logs に届かない CEO のために、
 *   trace を response の `_debug.trace` field に乗せて browser DevTools から
 *   観測可能にする。
 *
 * 検証観点:
 *   1. emitTurnTrace が emit 時 payload を return する (caller が response に乗せる材料)
 *   2. emit 不能 (env gate) の時は null を return
 *   3. legacyAdapter.adaptPipelineToLegacy の output に lastTraceSnapshot が乗る
 *   4. production env では lastTraceSnapshot が undefined (=> response にも乗らない)
 *   5. verbose extension は二重 gate を通った時のみ payload に merge される
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  emitTurnTrace,
  type TurnTraceSnapshot,
} from "@/lib/alter-morning/trace/turnTrace";
import { adaptPipelineToLegacy } from "@/lib/alter-morning/legacyAdapter";
import type { MorningPipelineResult } from "@/lib/alter-morning/morningPipeline";
import {
  type Event,
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

function baseSnapshot(): TurnTraceSnapshot {
  return {
    sessionId: "ms_test",
    turnIndex: 1,
    caller: "legacy_adapter",
    utteranceLength: 5,
    hasUtterance: true,
    currentEventCount: 0,
    priorEventCount: 0,
    mergedEventCount: 0,
    mergedEvents: [],
    primaryClarifyKind: null,
    primaryClarifyEventId: null,
    pendingClarifySlot: null,
    pendingClarifyKind: null,
    pendingClarifyEventId: null,
  };
}

let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  consoleSpy.mockRestore();
  vi.unstubAllEnvs();
});

describe("emitTurnTrace return value (PR #41a Commit 6)", () => {
  it("emit 成功時 payload を return", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const snap = baseSnapshot();
    const result = emitTurnTrace(snap);
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("ms_test");
    expect(result!.turnIndex).toBe(1);
  });

  it("[CRITICAL] production env では null return (response に乗らない)", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const result = emitTurnTrace(baseSnapshot());
    expect(result).toBeNull();
  });

  it("development env でも emit + return", () => {
    vi.stubEnv("VERCEL_ENV", "development");
    const result = emitTurnTrace(baseSnapshot());
    expect(result).not.toBeNull();
  });

  it("verbose flag 有り → payload に verbose extension が merge される", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("ALTER_MORNING_TRACE_VERBOSE", "true");
    const result = emitTurnTrace(baseSnapshot(), {
      utterance: "test utterance",
      mergedEventContent: [],
      pendingClarifyQuestion: null,
    });
    expect(result).not.toBeNull();
    expect(result!.verbose).toBeDefined();
    expect(result!.verbose!.utterance).toBe("test utterance");
  });

  it("verbose flag 無し → verbose extension は merge されない", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    // verbose flag 未設定
    const result = emitTurnTrace(baseSnapshot(), {
      utterance: "secret",
      mergedEventContent: [],
      pendingClarifyQuestion: null,
    });
    expect(result).not.toBeNull();
    expect(result!.verbose).toBeUndefined(); // verbose 含まれない
  });
});

describe("legacyAdapter.lastTraceSnapshot return field", () => {
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
          type: "pass_through",
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

  function mkEvent(overrides: Partial<Event>): Event {
    const base: Event = {
      event_id: "evt_x",
      turn_mode: "create",
      target_ref: null,
      target_ref_confidence: null,
      change_scope: null,
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
      certainty: "asserted",
      missing_semantic_critical: [],
      missing_solver_blockers: [],
    };
    return { ...base, ...overrides } as Event;
  }

  it("preview env → adaptPipelineToLegacy の output に lastTraceSnapshot が含まれる", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const result = adaptPipelineToLegacy(mkResult([mkEvent({ event_id: "e1" })]), {
      sessionId: "s1",
      utterance: "test",
    });
    expect(result.lastTraceSnapshot).toBeDefined();
    expect(result.lastTraceSnapshot!.sessionId).toBe("s1");
    expect(result.lastTraceSnapshot!.caller).toBe("legacy_adapter");
  });

  it("[CRITICAL] production env → lastTraceSnapshot field 不在 (response にも乗らない)", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const result = adaptPipelineToLegacy(mkResult([mkEvent({ event_id: "e1" })]), {
      sessionId: "s1",
      utterance: "test",
    });
    expect(result.lastTraceSnapshot).toBeUndefined();
    // conditional spread で field 自体が含まれない
    expect("lastTraceSnapshot" in result).toBe(false);
  });

  it("preview + verbose env → lastTraceSnapshot.verbose が populated", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("ALTER_MORNING_TRACE_VERBOSE", "true");
    const result = adaptPipelineToLegacy(
      mkResult([mkEvent({ event_id: "e1" })]),
      {
        sessionId: "s1",
        utterance: "9時に渋谷のスタバ",
      },
    );
    expect(result.lastTraceSnapshot).toBeDefined();
    expect(result.lastTraceSnapshot!.verbose).toBeDefined();
    expect(result.lastTraceSnapshot!.verbose!.utterance).toBe(
      "9時に渋谷のスタバ",
    );
  });

  it("modify event → lastTraceSnapshot.modifyResolutions が記録 (Commit 6 で観測可能)", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const priorEv = mkEvent({
      event_id: "prior_morning",
      when: {
        startTime: null,
        timeHint: "morning",
        provenance: utteranceProvenance(["朝"], "high"),
      },
    });
    const modifyEv = mkEvent({
      event_id: "new_modify",
      turn_mode: "modify",
      target_ref: "朝の予定",
    });
    const result = adaptPipelineToLegacy(mkResult([modifyEv]), {
      sessionId: "s1",
      utterance: "朝の予定を10時に変える",
      priorPersistedEvents: [priorEv],
    });
    expect(result.lastTraceSnapshot).toBeDefined();
    expect(result.lastTraceSnapshot!.modifyResolutions).toBeDefined();
    expect(result.lastTraceSnapshot!.modifyResolutions!).toHaveLength(1);
    expect(
      result.lastTraceSnapshot!.modifyResolutions![0].resolved.target_event_id,
    ).toBe("prior_morning");
    expect(
      result.lastTraceSnapshot!.modifyResolutions![0].resolved.strategy,
    ).toBe("time_bucket");
  });
});
