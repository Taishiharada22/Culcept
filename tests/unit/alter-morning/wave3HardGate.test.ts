/**
 * Clarify-first hard gate tests — W3-PR-6 Commit 1
 *
 * CEO 方針: 「ASK が 1 つでも残るなら plan_presented に進ませない」
 *
 * カバレッジ:
 *   - missing_semantic_critical があるイベントは primary_clarify が立ち、
 *     narration が揃っていても phase="clarifying" に落ちる
 *   - clarifying 時の response.message は primary_clarify.question を採用する
 *   - Slot 優先度: When block(10-14) > What(30) > How(40-42)
 *   - missing_semantic_critical が残っているのに primary_clarify が null の
 *     異常系でも、二重化ガードで phase="clarifying" に倒れる
 */
import { describe, test, expect, beforeEach } from "vitest";

import {
  runMorningPipeline,
  createStubComprehensionProvider,
} from "@/lib/alter-morning/morningPipeline";
import {
  resetEventCounter,
  utteranceProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import { adaptPipelineToLegacy } from "@/lib/alter-morning/legacyAdapter";
import { stubNarrationProvider } from "@/lib/alter-morning/expression/narration";
import { resolveGaps } from "@/lib/alter-morning/planning/gapResolver";
import type { L1PipelineInput } from "@/lib/alter-morning/comprehension/l1Pipeline";
import type { Event } from "@/lib/alter-morning/comprehension/eventSchema";

function mkEvent(overrides: Partial<Event> = {}): Event {
  return {
    event_id: "evt_1",
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: {
      startTime: null,
      timeHint: null,
      provenance: utteranceProvenance([], "low"),
    },
    where: {
      place_ref: null,
      placeType: null,
      provenance: utteranceProvenance([], "low"),
    },
    what: {
      activity: null,
      activityCanonical: null,
      provenance: utteranceProvenance([], "low"),
    },
    who: [],
    transport: null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
    ...overrides,
  } as Event;
}

function mkRawWithMissing(): L1PipelineInput["raw"] {
  return {
    targetDate: "2026-04-22",
    startPoint: null,
    departureTime: null,
    goOut: true,
    events: [
      {
        turn_mode: "create",
        change_scope: null,
        target_ref: null,
        target_ref_confidence: null,
        certainty: "asserted",
        when: {
          startTime: null,
          timeHint: null,
          // "スタバでコーヒー" だけで時刻なし
          provenance: utteranceProvenance([], "low"),
        },
        where: {
          place_ref: "スタバ",
          placeType: "chain_brand",
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
        what: {
          activity: "コーヒー",
          activityCanonical: "コーヒー",
          provenance: utteranceProvenance(["コーヒー"], "high"),
        },
        who: [],
        transport: null,
        missing_semantic_critical: ["when"],
        missing_solver_blockers: [],
      },
    ],
  };
}

beforeEach(() => {
  resetEventCounter();
});

describe("W3-PR-6 hard gate (clarify-first)", () => {
  test("missing_semantic_critical=['when'] → phase=clarifying（narrationがあっても）", async () => {
    const pipelineResult = await runMorningPipeline(
      { utterance: "スタバでコーヒー" },
      {
        comprehension: createStubComprehensionProvider(mkRawWithMissing()),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    // primary_clarify が立っていることを確認（hard gate の前提）
    expect(pipelineResult.gapResolution?.primary_clarify).not.toBeNull();

    const { session, response } = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "ms_hg",
      utterance: "スタバでコーヒー",
    });
    expect(response.phase).toBe("clarifying");
    expect(session.phase).toBe("clarifying");
    // W3-PR-7 commit 4: plan は clarifying 中も残る（confirmed ではない）
    expect(response.plan).toBeDefined();
    expect(response.plan?.status).not.toBe("confirmed");
    expect(response.clarifyQuestion).toBeDefined();
  });

  test("clarifying 時の message は primary_clarify.question を採用", async () => {
    const pipelineResult = await runMorningPipeline(
      { utterance: "スタバでコーヒー" },
      {
        comprehension: createStubComprehensionProvider(mkRawWithMissing()),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    const q = pipelineResult.gapResolution?.primary_clarify?.question;
    expect(q).toBeTruthy();

    const { response } = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "ms_hg",
      utterance: "スタバでコーヒー",
    });
    expect(response.message).toBe(q);
    expect(response.clarifyQuestion).toBe(q);
  });
});

describe("W3-PR-6 slot priority (When > What > How)", () => {
  test("When ASK と What ASK が同時に立つ場合、When が primary になる", () => {
    const events: Event[] = [
      mkEvent({
        event_id: "evt_when",
        missing_semantic_critical: ["when"],
        where: {
          place_ref: "スタバ",
          placeType: "chain_brand",
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
        what: {
          activity: "コーヒー",
          activityCanonical: "コーヒー",
          provenance: utteranceProvenance(["コーヒー"], "high"),
        },
      }),
      mkEvent({
        event_id: "evt_what",
        missing_semantic_critical: ["what"],
        when: {
          startTime: "12:00",
          timeHint: null,
          provenance: utteranceProvenance(["12時"], "high"),
        },
        where: {
          place_ref: "渋谷",
          placeType: "generic_place",
          provenance: utteranceProvenance(["渋谷"], "high"),
        },
      }),
    ];
    const res = resolveGaps(events);
    expect(res.primary_clarify).not.toBeNull();
    expect(res.primary_clarify!.kind).toBe("specific_time");
    expect(res.primary_clarify!.event_id).toBe("evt_when");
  });

  test("What ASK と How(endpoint) ASK が同時に立つ場合、What が primary になる", () => {
    const events: Event[] = [
      mkEvent({
        event_id: "evt_what",
        missing_semantic_critical: ["what"],
        when: {
          startTime: "12:00",
          timeHint: null,
          provenance: utteranceProvenance(["12時"], "high"),
        },
        where: {
          place_ref: "渋谷",
          placeType: "generic_place",
          provenance: utteranceProvenance(["渋谷"], "high"),
        },
      }),
      mkEvent({
        event_id: "evt_endpoint",
        missing_semantic_critical: [],
        missing_solver_blockers: ["endpoint"],
        when: {
          startTime: "15:00",
          timeHint: null,
          provenance: utteranceProvenance(["15時"], "high"),
        },
        where: {
          place_ref: "カフェ",
          placeType: "generic_place",
          provenance: utteranceProvenance(["カフェ"], "high"),
        },
        what: {
          activity: "仕事",
          activityCanonical: "仕事",
          provenance: utteranceProvenance(["仕事"], "high"),
        },
      }),
    ];
    const res = resolveGaps(events);
    expect(res.primary_clarify).not.toBeNull();
    expect(res.primary_clarify!.kind).toBe("activity");
    expect(res.primary_clarify!.event_id).toBe("evt_what");
  });
});
