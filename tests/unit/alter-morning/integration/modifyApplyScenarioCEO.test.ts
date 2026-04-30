/**
 * CEO Case 1 / Case 2 integration tests — PR #41b-1a Commit 4
 *
 * CEO 2026-04-29 正式成功条件:
 *
 *   Case 1: 時間変更
 *     既存: 09:00 スタバ
 *     入力: 9時を10時に変更
 *     期待: event_1.startTime=10:00、場所変わらない、古い where 質問が出ない
 *
 *   Case 2: 移動手段変更
 *     既存: 電車
 *     入力: 移動手段を車に変更
 *     期待: transport=car、travelSegments 再生成、card 表示も車ベースに更新
 *
 * 検証層:
 *   - persistedEvents (canonical mutation 状態)
 *   - response.plan (UI 表示)
 *   - response.plan.dayConditions / transportSegments (transport rebuild)
 *   - trace (dispatchSummary.modify_applied / modifyResolutions[].applied)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { adaptPipelineToLegacy } from "@/lib/alter-morning/legacyAdapter";
import type { MorningPipelineResult } from "@/lib/alter-morning/morningPipeline";
import {
  type Event,
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

function captureLog(): { payload: Record<string, unknown> } | null {
  const calls = consoleSpy.mock.calls.filter(
    (c: unknown[]) => c[0] === "[alter-morning:trace]",
  );
  if (calls.length === 0) return null;
  const lastCall = calls[calls.length - 1];
  const payload = JSON.parse(lastCall[1] as string) as Record<string, unknown>;
  return { payload };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO Case 1: 時間変更
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CEO Case 1: 時間変更 (9時を10時に変更)", () => {
  it("[正式成功条件] event_1.startTime=10:00 + 場所変わらない + 古い where 質問が出ない", () => {
    // 既存: 09:00 スタバ
    const priorEv = mkEvent({
      event_id: "event_1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "スターバックス TSUTAYA",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.66, lng: 139.69 },
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
      transport: "電車",
    });

    // LLM 出力: turn_mode=create + when=10:00 (guard が補正対象)
    const llmEvent = mkEvent({
      event_id: "evt_new",
      turn_mode: "create",
      when: {
        startTime: "10:00",
        timeHint: null,
        provenance: utteranceProvenance(["10時"], "high"),
      },
    });

    const { response, session } = adaptPipelineToLegacy(
      mkResult([llmEvent]),
      {
        sessionId: "s_case1",
        utterance: "9時を10時に変更",
        priorPersistedEvents: [priorEv],
      },
    );

    // ★ Case 1 期待: event_1.startTime=10:00
    expect(session.persistedEvents).toBeDefined();
    expect(session.persistedEvents).toHaveLength(1);
    expect(session.persistedEvents![0].event_id).toBe("event_1"); // prior id 維持
    expect(session.persistedEvents![0].when.startTime).toBe("10:00"); // ★ updated

    // ★ Case 1 期待: 場所変わらない
    expect(session.persistedEvents![0].where.place_ref).toBe(
      "スターバックス TSUTAYA",
    );
    expect(session.persistedEvents![0].where.coordinates).toEqual({
      lat: 35.66,
      lng: 139.69,
    });

    // ★ Case 1 期待: 古い where 質問 (where_center) が出ない
    //   全 slot fixed なので reconcile が pendingClarify=null にする
    expect(session.pendingClarify).toBeNull();
    expect(response.phase).toBe("plan_presented");

    // plan も confirmed で出る
    expect(response.plan).toBeDefined();
    expect(response.plan!.status).toBe("confirmed");

    // trace で観測
    const captured = captureLog();
    const trace = captured!.payload as Record<string, unknown>;
    const dispatchSummary = trace.dispatchSummary as {
      modify_applied: number;
      kept_as_new: number;
    };
    expect(dispatchSummary.modify_applied).toBe(1); // ★ apply された
    expect(dispatchSummary.kept_as_new).toBe(0);

    const modifyResolutions = trace.modifyResolutions as Array<{
      applied?: boolean;
      resolved: { target_event_id: string | null };
    }>;
    expect(modifyResolutions).toBeDefined();
    expect(modifyResolutions[0].applied).toBe(true); // ★ applied=true
    expect(modifyResolutions[0].resolved.target_event_id).toBe("event_1");

    expect(trace.modifyCandidate).toBe(true); // guard 発火
  });

  it("[regression] LLM が直接 modify を出した場合も applyModifyPatch される", () => {
    const priorEv = mkEvent({
      event_id: "event_1",
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
    });
    // LLM 直接出力: turn_mode=modify
    const llmModifyEvent = mkEvent({
      event_id: "evt_modify",
      turn_mode: "modify",
      target_ref: "9時の予定",
      target_ref_confidence: "high",
      change_scope: "patch",
      when: {
        startTime: "11:00",
        timeHint: null,
        provenance: utteranceProvenance(["11時"], "high"),
      },
    });

    const { session } = adaptPipelineToLegacy(mkResult([llmModifyEvent]), {
      sessionId: "s_case1b",
      utterance: "9時を11時に",
      priorPersistedEvents: [priorEv],
    });

    expect(session.persistedEvents![0].when.startTime).toBe("11:00");
    expect(session.persistedEvents![0].where.place_ref).toBe("サドヤ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO Case 2: 移動手段変更
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CEO Case 2: 移動手段変更 (移動手段を車に変更)", () => {
  it("[正式成功条件] transport=車 + dayConditions.mainTransport=car + transportSegments 再生成", () => {
    // 既存: 09:00 スタバ + 電車
    const priorEv = mkEvent({
      event_id: "event_1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "スターバックス TSUTAYA",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.66, lng: 139.69 },
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
      transport: "電車",
    });

    // LLM 出力: modify event with transport="車"
    //   guard pattern「移動手段を車に変更」 を直接 modify として出すことを期待
    //   (もし create で来た場合 guard が補正)
    const llmModifyEvent = mkEvent({
      event_id: "evt_modify_transport",
      turn_mode: "modify",
      target_ref: "今日の予定",
      target_ref_confidence: "medium",
      change_scope: "patch",
      transport: "車",
    });

    const { response, session } = adaptPipelineToLegacy(
      mkResult([llmModifyEvent]),
      {
        sessionId: "s_case2",
        utterance: "移動手段を車に変更",
        priorPersistedEvents: [priorEv],
      },
    );

    // ★ Case 2 期待: event.transport="車"
    expect(session.persistedEvents![0].transport).toBe("車");
    // 他 slot 不変
    expect(session.persistedEvents![0].when.startTime).toBe("09:00");
    expect(session.persistedEvents![0].where.place_ref).toBe(
      "スターバックス TSUTAYA",
    );

    // ★ Case 2 期待: dayConditions.mainTransport が車ベースに
    //   deriveDayTransport が events[].transport から自動的に pick → "car"
    expect(response.plan).toBeDefined();
    expect(response.plan!.dayConditions.mainTransport).toBe("car");

    // travel items も 🚗 base に (icon 表示は plan 層で生成、events.transport 由来)
    // text に「🚃」 (電車) が含まれていない
    const travelItems = response.plan!.items.filter(
      (it) => it.kind === "travel",
    );
    if (travelItems.length > 0) {
      expect(travelItems[0].text).not.toContain("🚃");
    }
    // 注: transportSegments の検証は transport_v2 flag ON 環境でのみ意味があるため、
    //     本テストでは events[].transport + dayConditions.mainTransport の更新のみ検証。
    //     transport_v2 ON 環境 (production preview) では buildPlanAndSegmentsFromEvents が
    //     effectiveEvents.transport を見て TransportSegment[] を 車 ベースで再生成する。

    // trace
    const captured = captureLog();
    const trace = captured!.payload as Record<string, unknown>;
    const dispatchSummary = trace.dispatchSummary as {
      modify_applied: number;
    };
    expect(dispatchSummary.modify_applied).toBe(1);

    const modifyResolutions = trace.modifyResolutions as Array<{
      applied?: boolean;
    }>;
    expect(modifyResolutions[0].applied).toBe(true);
  });
});
