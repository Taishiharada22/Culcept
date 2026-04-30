/**
 * reconcile trace observability tests — PR #41b-0 Commit 3
 *
 * CEO 2026-04-28 PR #41b-0 Commit 3:
 *   reconcileGapStateFromEffectiveEvents の発火フラグが trace に出ることを検証。
 *   CEO 実機テストで stuck pendingClarify bug の解消が trace で pin できる。
 *
 * 検証観点:
 *   1. 通常 turn (events fully fixed, no stale): reconcile flags 全 false / eventsFullyFixed=true
 *   2. CEO bug case (guard 補正で primary_clarify が stale): primaryClarifyDropped=true
 *   3. clarifying → plan_presented 昇格: phaseChanged=true
 *   4. dialogState.focus は本 commit では legacyAdapter wire で null 渡し
 *      (focusCleared は常に false)
 *   5. comprehension_failed: reconcile が phase を override しない
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

function mkResult(opts: {
  events: Event[];
  primaryClarify?: {
    event_id: string;
    target_slot: "when" | "where" | "what" | "transport" | "endpoint";
    kind: string;
    question?: string;
  } | null;
}): MorningPipelineResult {
  return {
    status: "ok",
    comprehension: {
      events: opts.events,
      targetDate: "today",
      startPoint: null,
      departureTime: null,
      goOut: null,
    },
    timeline: { entries: [], violations: [] },
    grounded: [],
    gapResolution: {
      actions: opts.events.map((ev) => ({
        type: "pass_through" as const,
        event_id: ev.event_id,
      })),
      primary_clarify: opts.primaryClarify
        ? {
            event_id: opts.primaryClarify.event_id,
            kind: opts.primaryClarify.kind as "specific_time",
            target_slot: opts.primaryClarify.target_slot,
            scope: {
              timeLabel: null,
              activityLabel: null,
              eventOrdinal: 1,
              sameLabelCount: 1,
            },
            question: opts.primaryClarify.question ?? "...",
          }
        : null,
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

function mkFailedResult(): MorningPipelineResult {
  return {
    status: "comprehension_failed",
    comprehension: null,
    timeline: null as unknown as MorningPipelineResult["timeline"],
    grounded: [],
    gapResolution: null,
    annotations: { body: [], weather: [], party: [] },
    narration: null,
    hints: {
      explicit_times: [],
      explicit_start_points: [],
      slot_opt_outs: [],
    },
  } as MorningPipelineResult;
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

describe("legacyAdapter reconcile trace wiring (PR #41b-0 Commit 3)", () => {
  it("[shape] reconcile field が必ず emit される (5 boolean フラグ)", () => {
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
    });
    adaptPipelineToLegacy(mkResult({ events: [ev] }), {
      sessionId: "s1",
      utterance: "9時にサドヤでコーヒー",
      priorPersistedEvents: [],
    });

    const captured = captureLog();
    expect(captured).not.toBeNull();
    const reconcile = captured!.payload.reconcile as
      | {
          phaseChanged: boolean;
          primaryClarifyDropped: boolean;
          pendingClarifyChanged: boolean;
          focusCleared: boolean;
          eventsFullyFixed: boolean;
        }
      | undefined;
    expect(reconcile).toBeDefined();
    expect(typeof reconcile!.phaseChanged).toBe("boolean");
    expect(typeof reconcile!.primaryClarifyDropped).toBe("boolean");
    expect(typeof reconcile!.pendingClarifyChanged).toBe("boolean");
    expect(typeof reconcile!.focusCleared).toBe("boolean");
    expect(typeof reconcile!.eventsFullyFixed).toBe("boolean");
  });

  it("[stale primary_clarify, event_id 一致] target slot が effectiveEvents で fixed → primaryClarifyDropped=true", () => {
    // primary_clarify が指す slot が effectiveEvents で既に fixed → reconcile が drop。
    // event_id 一致経路を試す (mergeEventFields で event_id が変わらない経路)。
    const ev = mkEvent({
      event_id: "e1",
      when: {
        startTime: "10:00",
        timeHint: null,
        provenance: utteranceProvenance(["10時"], "high"),
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
    // primary_clarify は about when (target_slot=when) — when=10:00 fixed なので stale
    adaptPipelineToLegacy(
      mkResult({
        events: [ev],
        primaryClarify: {
          event_id: "e1",
          target_slot: "when",
          kind: "specific_time",
          question: "何時頃？",
        },
      }),
      {
        sessionId: "s1",
        utterance: "10時にサドヤでコーヒー",
        priorPersistedEvents: [],
      },
    );

    const captured = captureLog();
    expect(captured).not.toBeNull();
    const reconcile = captured!.payload.reconcile as {
      phaseChanged: boolean;
      primaryClarifyDropped: boolean;
      eventsFullyFixed: boolean;
    };
    // when=10:00 (fixed) なので primary_clarify (about when) は stale → drop
    expect(reconcile.primaryClarifyDropped).toBe(true);
    // 全 slot fixed → plan_presented 昇格
    expect(reconcile.eventsFullyFixed).toBe(true);
    // originalPhase=clarifying (primary_clarify あったため) → reconciledPhase=plan_presented
    expect(reconcile.phaseChanged).toBe(true);
  });

  it("[CEO bug case, event_id remap] guard 補正後 mergeEventFields で id 変更 → 単一 event fallback で stale 判定", () => {
    // CEO 2026-04-28 観測 bug の本流:
    //   - LLM 生 events[0]={event_id:"B", when=null/morning vague}
    //   - guard fires: events[0]={turn_mode:modify, when=10:00 fixed}
    //   - mergeEventFields: matches B with prior A by position fallback → merged event_id=A
    //   - primary_clarify still points to "B" (gapResolver 出力時)
    //   - effectiveEvents has event_id="A" only
    //   - 単一 event fallback で「B が無い → 単一 event A を target」 と推定
    //   - A.when=10:00 fixed なので stale → drop
    const llmEvent = mkEvent({
      event_id: "new_evt",
      turn_mode: "create",
      when: {
        startTime: "10:00", // guard が当 turn 内で override (suggestedNewStartTime)
        timeHint: null,
        provenance: utteranceProvenance(["10時"], "high"),
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
    const priorEvent = mkEvent({
      event_id: "prior_evt", // ← merge で id=prior_evt が採用される
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
    adaptPipelineToLegacy(
      mkResult({
        events: [llmEvent],
        primaryClarify: {
          event_id: "new_evt", // pipeline は LLM 生 event_id を refer
          target_slot: "when",
          kind: "specific_time",
          question: "何時頃？",
        },
      }),
      {
        sessionId: "s1",
        utterance: "9時を10時に変更",
        priorPersistedEvents: [priorEvent],
      },
    );

    const captured = captureLog();
    expect(captured).not.toBeNull();
    const reconcile = captured!.payload.reconcile as {
      phaseChanged: boolean;
      primaryClarifyDropped: boolean;
      eventsFullyFixed: boolean;
    };
    // event_id 不一致 (new_evt vs prior_evt) でも単一 event fallback で stale 判定
    expect(reconcile.primaryClarifyDropped).toBe(true);
    expect(reconcile.eventsFullyFixed).toBe(true);
    expect(reconcile.phaseChanged).toBe(true);
  });

  it("[no stale] 通常 turn (primary_clarify=null, events fully fixed) → 全フラグ false", () => {
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
    });
    adaptPipelineToLegacy(mkResult({ events: [ev], primaryClarify: null }), {
      sessionId: "s1",
      utterance: "9時にサドヤでコーヒー",
      priorPersistedEvents: [],
    });

    const captured = captureLog();
    const reconcile = captured!.payload.reconcile as {
      phaseChanged: boolean;
      primaryClarifyDropped: boolean;
      eventsFullyFixed: boolean;
      focusCleared: boolean;
    };
    expect(reconcile.primaryClarifyDropped).toBe(false);
    expect(reconcile.phaseChanged).toBe(false); // originalPhase=plan_presented も plan_presented
    expect(reconcile.eventsFullyFixed).toBe(true);
    expect(reconcile.focusCleared).toBe(false); // priorDialogState=null
  });

  it("[failure preserve] comprehension_failed → reconcile が phase を override しない", () => {
    const priorEv = mkEvent({
      event_id: "prior",
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
    // production env で safe degrade させる (items=0 禁則回避: prior あるので items>0)
    const { response } = adaptPipelineToLegacy(mkFailedResult(), {
      sessionId: "s1",
      utterance: "...",
      priorPersistedEvents: [priorEv],
    });
    expect(response.phase).toBe("clarifying"); // failure → clarifying preserved

    const captured = captureLog();
    const reconcile = captured!.payload.reconcile as {
      phaseChanged: boolean;
      eventsFullyFixed: boolean;
    };
    // events は fully fixed (prior が fixed) だが comprehensionOk=false なので
    // phase は clarifying のまま preserved (phaseChanged=false の想定だが
    // 元 originalPhase=clarifying と reconciledPhase=clarifying は一致する)
    expect(reconcile.eventsFullyFixed).toBe(true);
    expect(reconcile.phaseChanged).toBe(false);
  });
});
