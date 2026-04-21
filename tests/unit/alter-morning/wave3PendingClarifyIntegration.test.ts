/**
 * PendingClarify × answerBinder × priorEvents pipeline — W3-PR-7 Commit 2
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-pr7-design.md §3.4, §4.2, §5
 *
 * Integration:
 *   turn1:
 *     utterance="朝カフェで買い物" → pipeline 実行 → phase=clarifying
 *                                → pendingClarify.slot=when(specific_time)
 *   turn2:
 *     priorPendingClarify + priorEvents + answer="12時"
 *     → bindAnswerToSlot で when.startTime="12:00"
 *     → runMorningPipeline({priorEvents: bound}) で LLM をスキップ
 *     → 全 fixed に至れば phase=plan_presented
 */
import { describe, test, expect } from "vitest";

import {
  inferredProvenance,
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import {
  runMorningPipeline,
  createStubComprehensionProvider,
} from "@/lib/alter-morning/morningPipeline";
import { bindAnswerToSlot } from "@/lib/alter-morning/comprehension/answerBinder";
import {
  adaptPipelineToLegacy,
  buildPendingClarifyFromResolution,
} from "@/lib/alter-morning/legacyAdapter";
import type { PendingClarify } from "@/lib/alter-morning/types";

function mkEvent(overrides: Partial<Event> = {}): Event {
  return {
    event_id: "e1",
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: { startTime: null, timeHint: null, provenance: inferredProvenance() },
    where: {
      place_ref: "渋谷のカフェ",
      placeType: "exact_proper_noun",
      provenance: utteranceProvenance(["渋谷のカフェ"]),
    },
    what: {
      activity: "買い物",
      activityCanonical: "買い物",
      provenance: utteranceProvenance(["買い物"]),
    },
    who: [],
    transport: null,
    missing_semantic_critical: ["when"],
    missing_solver_blockers: [],
    ...overrides,
  };
}

describe("Integration: pendingClarify → answerBinder → priorEvents pipeline", () => {
  test("turn1: when missing → clarifying + pendingClarify.slot=when", async () => {
    const seedEvent = mkEvent();
    const provider = createStubComprehensionProvider({
      targetDate: "2026-04-22",
      events: [
        {
          turn_mode: "create",
          change_scope: null,
          target_ref: null,
          target_ref_confidence: null,
          certainty: "asserted",
          when: seedEvent.when,
          where: seedEvent.where,
          what: seedEvent.what,
          who: [],
          transport: null,
          missing_semantic_critical: ["when"],
          missing_solver_blockers: [],
        },
      ],
      startPoint: null,
      departureTime: null,
      goOut: null,
    });

    const result = await runMorningPipeline(
      { utterance: "渋谷のカフェで買い物" },
      { comprehension: provider, weather: null },
    );
    expect(result.status).toBe("ok");
    // primary_clarify が立つ（When missing）
    expect(result.gapResolution?.primary_clarify).not.toBeNull();

    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "ms_test",
      utterance: "渋谷のカフェで買い物",
    });
    expect(adapted.session.phase).toBe("clarifying");
    expect(adapted.session.pendingClarify).not.toBeNull();
    expect(adapted.session.pendingClarify!.slot).toBe("when");
    expect(adapted.session.persistedEvents?.length).toBe(1);
    expect(adapted.session.persistedEvents![0].when.startTime).toBeNull();
  });

  test("turn2: bind answer=「12時」 → priorEvents pipeline → plan_presented", async () => {
    // turn1 結果を模した pending + events
    const turn1Events = [mkEvent()];
    const primaryClarify = {
      event_id: "e1",
      kind: "specific_time" as const,
      target_slot: "when" as const,
      hint: "買い物",
      question: "何時頃？",
    };
    const pending: PendingClarify = buildPendingClarifyFromResolution(
      primaryClarify,
      turn1Events,
      0,
    )!;
    expect(pending.slot).toBe("when");

    // bind
    const bindResult = bindAnswerToSlot(turn1Events, pending, "12時");
    expect(bindResult.bound).toBe(true);
    if (!bindResult.bound) return;
    expect(bindResult.events[0].when.startTime).toBe("12:00");

    // priorEvents pipeline — provider は呼ばれない
    const result = await runMorningPipeline(
      { utterance: "12時", priorEvents: bindResult.events },
      {
        comprehension: {
          async extract() {
            throw new Error("LLM should not be called in priorEvents mode");
          },
        },
        weather: null,
      },
    );
    expect(result.status).toBe("ok");
    expect(result.comprehension?.events[0].when.startTime).toBe("12:00");
    // When fixed, Where fixed (exact_proper_noun), What fixed (買い物) → plan_presented
    expect(result.gapResolution?.primary_clarify).toBeNull();

    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "ms_test",
      utterance: "12時",
      priorRawInputs: ["渋谷のカフェで買い物"],
      priorPendingClarify: null,
    });
    expect(adapted.session.phase).toBe("plan_presented");
    expect(adapted.session.pendingClarify).toBeNull();
    expect(adapted.session.rawInputs).toEqual(["渋谷のカフェで買い物", "12時"]);
  });

  test("semantic_miss: answer=「おなかすいた」 → bound=false, pending 維持想定", () => {
    const turn1Events = [mkEvent()];
    const pending: PendingClarify = buildPendingClarifyFromResolution(
      {
        event_id: "e1",
        kind: "specific_time",
        target_slot: "when",
        hint: undefined,
        question: "何時？",
      },
      turn1Events,
      0,
    )!;
    const bindResult = bindAnswerToSlot(turn1Events, pending, "おなかすいた");
    expect(bindResult.bound).toBe(false);
    if (!bindResult.bound) {
      expect(bindResult.reason).toBe("semantic_miss");
    }
  });
});
