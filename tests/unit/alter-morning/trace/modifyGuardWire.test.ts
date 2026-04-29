/**
 * applyDeterministicModifyIntent + legacyAdapter wire integration tests
 *
 * CEO 2026-04-28 PR #41a Commit 10:
 *   guard が legacyAdapter で発火することを end-to-end (mock LLM) で検証する。
 *
 * 検証観点 (CEO merge 条件):
 *   1. mergedEvents[0].turn_mode === "modify" (guard 補正後)
 *   2. target_ref_present === true
 *   3. modifyResolutions[0].resolved.target_event_id === <prior event id>
 *   4. modifyResolutions[0].resolved.confidence === "high" (explicit hour strategy)
 *   5. modifyCandidate === true (guard 発火フラグ)
 *
 *   さらに:
 *   - LLM が直接 modify を出した場合: guard no-op、modifyCandidate=false
 *   - utterance pattern 該当しない: guard no-op
 *   - prior 空: guard no-op
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  applyDeterministicModifyIntent,
  detectModifyIntent,
} from "@/lib/alter-morning/comprehension/modifyIntentDetector";
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
// applyDeterministicModifyIntent unit tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyDeterministicModifyIntent — 補正 logic", () => {
  it("[ROOT CAUSE] LLM='create' + '9時を10時に変更' + prior 1 件 → 補正発火", () => {
    const llmEvent = mkEvent({
      event_id: "new_evt",
      turn_mode: "create",
      when: {
        startTime: "10:00",
        timeHint: null,
        provenance: utteranceProvenance(["10時"], "high"),
      },
    });
    const priorEvent = mkEvent({
      event_id: "prior_evt",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
    });
    const result = applyDeterministicModifyIntent({
      events: [llmEvent],
      priorPersistedEvents: [priorEvent],
      utterance: "9時を10時に変更",
    });

    expect(result.modifyCandidate).toBe(true);
    expect(result.reason).toBe("applied");
    expect(result.events).toHaveLength(1);
    expect(result.events[0].turn_mode).toBe("modify");
    expect(result.events[0].target_ref).toBe("9時の予定");
    expect(result.events[0].target_ref_confidence).toBe("medium");
    expect(result.events[0].change_scope).toBe("patch");
    // suggestedNewStartTime override
    expect(result.events[0].when.startTime).toBe("10:00");
  });

  it("LLM='modify' (LLM が既に判定) → no-op (already_modify)", () => {
    const llmEvent = mkEvent({
      event_id: "new_evt",
      turn_mode: "modify",
      target_ref: "朝の予定",
    });
    const result = applyDeterministicModifyIntent({
      events: [llmEvent],
      priorPersistedEvents: [mkEvent({ event_id: "prior" })],
      utterance: "9時を10時に変更",
    });
    expect(result.modifyCandidate).toBe(false);
    expect(result.reason).toBe("already_modify");
    // events 不変
    expect(result.events[0].turn_mode).toBe("modify");
    expect(result.events[0].target_ref).toBe("朝の予定"); // LLM の値維持
  });

  it("LLM='append' (新規予定追加) → no-op", () => {
    const llmEvent = mkEvent({
      event_id: "new_evt",
      turn_mode: "append",
    });
    const result = applyDeterministicModifyIntent({
      events: [llmEvent],
      priorPersistedEvents: [mkEvent({ event_id: "prior" })],
      utterance: "9時を10時に変更",
    });
    expect(result.modifyCandidate).toBe(false);
    expect(result.events[0].turn_mode).toBe("append");
  });

  it("prior 空 → no-op (no_prior)", () => {
    const result = applyDeterministicModifyIntent({
      events: [mkEvent({ turn_mode: "create" })],
      priorPersistedEvents: [],
      utterance: "9時を10時に変更",
    });
    expect(result.modifyCandidate).toBe(false);
    expect(result.reason).toBe("no_prior");
  });

  it("events 複数 → no-op (events_count_mismatch)", () => {
    const result = applyDeterministicModifyIntent({
      events: [
        mkEvent({ event_id: "e1", turn_mode: "create" }),
        mkEvent({ event_id: "e2", turn_mode: "create" }),
      ],
      priorPersistedEvents: [mkEvent({ event_id: "prior" })],
      utterance: "9時を10時に変更",
    });
    expect(result.modifyCandidate).toBe(false);
    expect(result.reason).toBe("events_count_mismatch");
  });

  it("utterance に modify intent なし → no-op (no_intent)", () => {
    const result = applyDeterministicModifyIntent({
      events: [mkEvent({ turn_mode: "create" })],
      priorPersistedEvents: [mkEvent({ event_id: "prior" })],
      utterance: "明日9時に渋谷のスタバ",
    });
    expect(result.modifyCandidate).toBe(false);
    expect(result.reason).toBe("no_intent");
  });

  it("priorPersistedEvents.length === 1 + change keyword のみ → fallback target_ref='最初の予定'", () => {
    const result = applyDeterministicModifyIntent({
      events: [mkEvent({ turn_mode: "create" })],
      priorPersistedEvents: [mkEvent({ event_id: "prior" })],
      utterance: "予定を変更したい", // time-shift pattern なし、change keyword のみ
    });
    expect(result.modifyCandidate).toBe(true);
    expect(result.events[0].target_ref).toBe("最初の予定");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// legacyAdapter integration tests (CEO merge 条件)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("legacyAdapter integration — CEO merge 条件", () => {
  function captureLog(): { payload: Record<string, unknown> } | null {
    const calls = consoleSpy.mock.calls.filter(
      (c: unknown[]) => c[0] === "[alter-morning:trace]",
    );
    if (calls.length === 0) return null;
    const lastCall = calls[calls.length - 1];
    const payload = JSON.parse(lastCall[1] as string) as Record<string, unknown>;
    return { payload };
  }

  it("[CEO MERGE 条件] '9時を10時に変更' + prior 09:00 event → trace で modify + target_event_id + high confidence", () => {
    const priorEvent = mkEvent({
      event_id: "prior_9am",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "スターバックス TSUTAYA 渋谷店",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.6587, lng: 139.6997 },
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "カフェ",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
    });
    // LLM が turn_mode='create' を出した想定 (本 PR の最大 worst case)
    const llmEvent = mkEvent({
      event_id: "new_evt",
      turn_mode: "create",
      when: {
        startTime: "10:00",
        timeHint: null,
        provenance: utteranceProvenance(["10時"], "high"),
      },
    });

    const out = adaptPipelineToLegacy(mkResult([llmEvent]), {
      sessionId: "s_test",
      utterance: "9時を10時に変更",
      priorPersistedEvents: [priorEvent],
    });

    const captured = captureLog();
    expect(captured).not.toBeNull();
    const trace = captured!.payload as Record<string, unknown>;

    // CEO 2026-04-29 PR #41b-1a: modify が apply された後の状態を観測
    //   旧 (PR #41a): mergedEvents[0].turn_mode="modify" + target_ref_present=true
    //                 (modify がそのまま mergedEvents に残った)
    //   新 (PR #41b-1a): applyModifyPatch で prior に統合、turn_mode は prior の "create" 維持
    //                    target_ref は解決後 clear (null)
    //                    when.startTime は 10:00 に override (CEO Case 1)
    const mergedEvents = trace.mergedEvents as Array<{
      event_id: string;
      turn_mode: string;
      target_ref_present: boolean;
    }>;
    expect(mergedEvents).toHaveLength(1);
    expect(mergedEvents[0].event_id).toBe("prior_9am"); // prior id 維持
    expect(mergedEvents[0].turn_mode).toBe("create"); // prior turn_mode 維持 (apply 後)
    expect(mergedEvents[0].target_ref_present).toBe(false); // 解決後 clear

    // CEO Case 1 真因 fix: prior の startTime が 10:00 に更新されている
    expect(out.session.persistedEvents).toBeDefined();
    expect(out.session.persistedEvents![0].when.startTime).toBe("10:00");

    // CEO merge 条件 3 + 4: modifyResolutions[].resolved.target_event_id + confidence high
    //   (PR #41a の audit trace、PR #41b-1a でも保持)
    const modifyResolutions = trace.modifyResolutions as Array<{
      resolved: { target_event_id: string | null; confidence: string | null; strategy: string };
    }>;
    expect(modifyResolutions).toBeDefined();
    expect(modifyResolutions).toHaveLength(1);
    expect(modifyResolutions[0].resolved.target_event_id).toBe("prior_9am");
    expect(modifyResolutions[0].resolved.confidence).toBe("high");
    expect(modifyResolutions[0].resolved.strategy).toBe("time_bucket");

    // 観測条件: modifyCandidate=true (guard 発火を観測可能)
    expect(trace.modifyCandidate).toBe(true);
    expect(trace.modifyCandidateReason).toBe("applied");
  });

  it("LLM が直接 modify を出した場合 → guard no-op、modifyResolutions そのまま", () => {
    const priorEvent = mkEvent({
      event_id: "prior_9am",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
    });
    const llmEvent = mkEvent({
      event_id: "new_evt",
      turn_mode: "modify", // LLM 直接 modify
      target_ref: "9時の予定",
      change_scope: "patch",
    });

    adaptPipelineToLegacy(mkResult([llmEvent]), {
      sessionId: "s_test",
      utterance: "9時を10時に変更",
      priorPersistedEvents: [priorEvent],
    });

    const captured = captureLog();
    const trace = captured!.payload as Record<string, unknown>;

    // guard no-op
    expect(trace.modifyCandidate).toBe(false);
    expect(trace.modifyCandidateReason).toBe("already_modify");

    // それでも modifyResolutions は populated (LLM 自身が modify を出したから)
    const modifyResolutions = trace.modifyResolutions as Array<{
      resolved: { target_event_id: string | null };
    }>;
    expect(modifyResolutions).toHaveLength(1);
    expect(modifyResolutions[0].resolved.target_event_id).toBe("prior_9am");
  });

  it("modify intent なし発話 ('明日9時に渋谷のスタバ') → guard no-op", () => {
    const llmEvent = mkEvent({ turn_mode: "create" });
    adaptPipelineToLegacy(mkResult([llmEvent]), {
      sessionId: "s_test",
      utterance: "明日9時に渋谷のスタバ",
      priorPersistedEvents: [], // prior 空でも no-op が出る (no_prior)
    });
    const captured = captureLog();
    const trace = captured!.payload as Record<string, unknown>;
    expect(trace.modifyCandidate).toBe(false);
    expect(trace.modifyCandidateReason).toBe("no_intent");
  });

  it("prior 空 + modify intent → guard no-op (no_prior)", () => {
    const llmEvent = mkEvent({ turn_mode: "create" });
    adaptPipelineToLegacy(mkResult([llmEvent]), {
      sessionId: "s_test",
      utterance: "9時を10時に変更",
      priorPersistedEvents: [],
    });
    const captured = captureLog();
    const trace = captured!.payload as Record<string, unknown>;
    expect(trace.modifyCandidate).toBe(false);
    expect(trace.modifyCandidateReason).toBe("no_prior");
  });
});
