/**
 * post-candidate-selection action routing — 通貫検証 (CEO 2026-04-30)
 *
 * 目的:
 *   候補選択 → 「電車」/「ミーティング」/「9時を10時に」/「12時に新宿でランチ」 と
 *   入力した時、PR40-49 + PR-50 の既存資産 (bindAnswerToSlot / deterministicOperationSynth /
 *   operationDispatcher / dispatchEventMerge) で正しく event_1 が patch される
 *   (kept_as_new で event 増殖しない) ことを確認する。
 *
 * 構造:
 *   Turn 1: 「明日の9時に渋谷のスタバ」 → comprehension → persistedEvents=[event_1]
 *   Selection: candidate tap → applyPlaceSelection で event_1.where 確定 +
 *              transportV2 ON で pendingClarify={slot:"transport"}
 *   Turn 2:  「電車」 → Branch A bindAnswerToSlot(transport) → event_1.transport=電車
 *   Turn 3:  「ミーティング」 → Branch A bindAnswerToSlot(what) → event_1.what
 *   Turn 4:  「9時を10時に変更」 → deterministic synth → modify → event_1.when
 *   Turn 5:  「12時に新宿でランチ」 → LLM append → 新 event 追加
 */

import { describe, expect, test, beforeEach, vi } from "vitest";

import {
  runMorningPipeline,
  createStubComprehensionProvider,
  type MorningPipelineResult,
} from "@/lib/alter-morning/morningPipeline";
import { adaptPipelineToLegacy } from "@/lib/alter-morning/legacyAdapter";
import {
  resetEventCounter,
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { L1PipelineInput } from "@/lib/alter-morning/comprehension/l1Pipeline";
import type { PlanOperation } from "@/lib/alter-morning/comprehension/planOperation";
import { stubNarrationProvider } from "@/lib/alter-morning/expression/narration";
import { bindAnswerToSlot } from "@/lib/alter-morning/comprehension/answerBinder";
import { applyPlaceSelection } from "@/lib/alter-morning/search/applyPlaceSelection";
import type { PendingClarify } from "@/lib/alter-morning/types";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  resetEventCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Turn 1 fixture: chain_brand 「渋谷のスタバ」 — placeType=chain_brand
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function turn1Raw(): L1PipelineInput["raw"] {
  return {
    targetDate: "2026-05-01",
    startPoint: null,
    departureTime: null,
    goOut: true,
    operations: [],
    events: [
      {
        turn_mode: "create",
        change_scope: null,
        target_ref: null,
        target_ref_confidence: null,
        certainty: "asserted",
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "渋谷のスタバ",
          placeType: "chain_brand",
          provenance: utteranceProvenance(["渋谷のスタバ"], "high"),
        },
        what: {
          activity: null,
          activityCanonical: null,
          provenance: utteranceProvenance([], "low"),
        },
        who: [],
        transport: null,
        missing_semantic_critical: ["what"],
        missing_solver_blockers: [],
      },
    ],
  };
}

const baseInput = {
  sessionId: "ms_test_post_selection",
  userPrefecture: "東京都",
  userCity: "渋谷区",
  userHomeLabel: "自宅",
  userHomeLat: 35.0,
  userHomeLng: 139.0,
  today: "2026-05-01",
};

describe("post-candidate-selection action routing", () => {
  test("Turn 1: 渋谷のスタバ → event_1 が persisted、where=chain_brand", async () => {
    const pipelineResult = await runMorningPipeline(
      { utterance: "明日の9時に渋谷のスタバ" },
      {
        comprehension: createStubComprehensionProvider(turn1Raw()),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    const adapted = adaptPipelineToLegacy(pipelineResult, {
      ...baseInput,
      utterance: "明日の9時に渋谷のスタバ",
    });
    expect(adapted.session.persistedEvents).toBeDefined();
    expect(adapted.session.persistedEvents).toHaveLength(1);
    expect(adapted.session.persistedEvents![0].where.place_ref).toBe(
      "渋谷のスタバ",
    );
    expect(adapted.session.persistedEvents![0].where.placeType).toBe(
      "chain_brand",
    );
  });

  test("Selection: applyPlaceSelection で event_1.where 確定 (exact_proper_noun + coords)", () => {
    // Turn 1 の後の event_1 を再現
    const event1: Event = {
      event_id: "event_1",
      turn_mode: "create",
      target_ref: null,
      target_ref_confidence: null,
      change_scope: null,
      certainty: "asserted",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "渋谷のスタバ",
        placeType: "chain_brand",
        provenance: utteranceProvenance(["渋谷のスタバ"], "high"),
      },
      what: {
        activity: null,
        activityCanonical: null,
        provenance: utteranceProvenance([], "low"),
      },
      who: [],
      transport: null,
      missing_semantic_critical: ["where", "what"],
      missing_solver_blockers: [],
    };
    const result = applyPlaceSelection({
      events: [event1],
      targetEventId: "event_1",
      candidate: {
        placeId: "ChIJxxx",
        displayName: "スターバックス渋谷店",
        address: "東京都渋谷区道玄坂2-29-5",
        coordinates: { lat: 35.658, lng: 139.701 },
        distanceFromAnchor: 100,
        category: "cafe",
        chainToken: "スターバックス",
      },
    });
    expect(result.applied).toBe(true);
    expect(result.events[0].where.placeType).toBe("exact_proper_noun");
    expect(result.events[0].where.coordinates).toEqual({
      lat: 35.658,
      lng: 139.701,
    });
    expect(result.events[0].where.place_ref).toBe("スターバックス渋谷店");
    expect(result.events[0].missing_semantic_critical).not.toContain("where");
  });

  test("Turn 2: 電車 + pending=transport → bindAnswerToSlot で event_1.transport patch", async () => {
    // Selection 後の event_1 (where confirmed, transport=null)
    const event1AfterSelection: Event = {
      event_id: "event_1",
      turn_mode: "create",
      target_ref: null,
      target_ref_confidence: null,
      change_scope: null,
      certainty: "asserted",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "スターバックス渋谷店",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.658, lng: 139.701 },
        provenance: utteranceProvenance(["渋谷のスタバ"], "high"),
      },
      what: {
        activity: null,
        activityCanonical: null,
        provenance: utteranceProvenance([], "low"),
      },
      who: [],
      transport: null,
      missing_semantic_critical: ["what"],
      missing_solver_blockers: [],
    };
    // selection route が立てる pendingClarify (transportV2 ON)
    const pending: PendingClarify = {
      event_id: "event_1",
      slot: "transport",
      kind: "transport",
      scope: { timeLabel: "09:00", activityLabel: null, eventOrdinal: 1 },
      question: "移動手段は何にする？",
      askedAt: new Date().toISOString(),
    };
    // Branch A: bindAnswerToSlot
    const bindResult = bindAnswerToSlot(
      [event1AfterSelection],
      pending,
      "電車",
    );
    expect(bindResult.bound).toBe(true);
    if (!bindResult.bound) throw new Error("must bound");
    expect(bindResult.boundSlot).toBe("transport");
    expect(bindResult.events[0].transport).toBe("電車");
    expect(bindResult.events[0].where.place_ref).toBe("スターバックス渋谷店"); // unchanged
    expect(bindResult.events).toHaveLength(1); // event 増えない
  });

  test("Turn 2 通貫: pipeline (priorEvents=bound) → adapter で event 増えない", async () => {
    // CEO 2026-05-01 fix: live preview の operations.append 経路により
    //   persistedEvents[0].turn_mode は "append" になる (operationDispatcher の
    //   eventDraftToEvent が hardcode)。fixture を実機と整合させる。
    const event1Bound: Event = {
      event_id: "event_1",
      turn_mode: "append",
      target_ref: null,
      target_ref_confidence: null,
      change_scope: null,
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "スターバックス渋谷店",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.658, lng: 139.701 },
        provenance: utteranceProvenance(["渋谷のスタバ"], "high"),
      },
      what: {
        activity: null,
        activityCanonical: null,
        provenance: utteranceProvenance([], "low"),
      },
      who: [],
      transport: "電車",
      certainty: "asserted",
      missing_semantic_critical: ["what"],
      missing_solver_blockers: [],
    };
    const priorPersisted: Event[] = [
      { ...event1Bound, transport: null }, // selection 後 (transport=null)
    ];
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "電車",
        priorEvents: [event1Bound], // bind 後の events を bypass で渡す
      },
      {
        comprehension: createStubComprehensionProvider(turn1Raw()), // bypass で呼ばれない
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    const adapted = adaptPipelineToLegacy(pipelineResult, {
      ...baseInput,
      utterance: "電車",
      priorPersistedEvents: priorPersisted,
      priorPendingClarify: null,
      priorRawInputs: ["明日の9時に渋谷のスタバ"],
    });
    expect(adapted.session.persistedEvents).toHaveLength(1);
    expect(adapted.session.persistedEvents![0].transport).toBe("電車");
    expect(adapted.session.persistedEvents![0].where.placeType).toBe(
      "exact_proper_noun",
    );
  });

  test("Turn 4: 9時を10時に変更 → deterministic synth → modify → event_1.when 更新", async () => {
    // live 整合: turn_mode="append" (operations path 由来)
    const event1: Event = {
      event_id: "event_1",
      turn_mode: "append",
      target_ref: null,
      target_ref_confidence: null,
      change_scope: null,
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "スターバックス渋谷店",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.658, lng: 139.701 },
        provenance: utteranceProvenance([], "high"),
      },
      what: {
        activity: "ミーティング",
        activityCanonical: "ミーティング",
        provenance: utteranceProvenance(["ミーティング"], "high"),
      },
      who: [],
      transport: "電車",
      certainty: "asserted",
      missing_semantic_critical: [],
      missing_solver_blockers: [],
    };
    // LLM が誤って append を出しても deterministic が override する想定
    const llmRawNoise: L1PipelineInput["raw"] = {
      targetDate: "2026-05-01",
      startPoint: null,
      departureTime: null,
      goOut: true,
      operations: [
        {
          type: "append",
          eventDraft: {
            when: {
              startTime: "10:00",
              timeHint: null,
              provenance: utteranceProvenance(["10時"], "high"),
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
            certainty: "asserted",
          },
        },
      ],
      events: [],
    };
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "9時を10時に変更",
        priorPlanForContext: [event1],
      },
      {
        comprehension: createStubComprehensionProvider(llmRawNoise),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    const adapted = adaptPipelineToLegacy(pipelineResult, {
      ...baseInput,
      utterance: "9時を10時に変更",
      priorPersistedEvents: [event1],
      priorPendingClarify: null,
      priorRawInputs: ["前回の発話"],
    });
    expect(pipelineResult.comprehension?.operationsSynthesisSource).toBe(
      "deterministic_overrides_llm",
    );
    expect(adapted.session.persistedEvents).toHaveLength(1);
    expect(adapted.session.persistedEvents![0].when.startTime).toBe("10:00");
    expect(adapted.session.persistedEvents![0].where.place_ref).toBe(
      "スターバックス渋谷店",
    );
  });

  test("Turn 3: ミーティング + pending=what → bindAnswerToSlot で event_1.what patch", () => {
    // Turn 2 の後の event_1 (transport bound、what=null missing)
    const event1AfterTransport: Event = {
      event_id: "event_1",
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
        place_ref: "スターバックス渋谷店",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.658, lng: 139.701 },
        provenance: utteranceProvenance([], "high"),
      },
      what: {
        activity: null,
        activityCanonical: null,
        provenance: utteranceProvenance([], "low"),
      },
      who: [],
      transport: "電車",
      certainty: "asserted",
      missing_semantic_critical: ["what"],
      missing_solver_blockers: [],
    };
    // pending what (Turn 2 後に gapResolver が立てる想定)
    const pendingWhat: PendingClarify = {
      event_id: "event_1",
      slot: "what",
      kind: "activity",
      scope: { timeLabel: "09:00", activityLabel: null, eventOrdinal: 1 },
      question: "9時に何する？",
      askedAt: new Date().toISOString(),
    };
    const bindResult = bindAnswerToSlot(
      [event1AfterTransport],
      pendingWhat,
      "ミーティング",
    );
    expect(bindResult.bound).toBe(true);
    if (!bindResult.bound) throw new Error("must bound");
    expect(bindResult.boundSlot).toBe("what");
    expect(bindResult.events[0].what.activity).toBe("ミーティング");
    expect(bindResult.events[0].transport).toBe("電車"); // unchanged
    expect(bindResult.events[0].where.place_ref).toBe("スターバックス渋谷店"); // unchanged
    expect(bindResult.events).toHaveLength(1); // event 増えない
  });

  test("Turn 5: 12時に新宿でランチ → LLM append → 新 event 追加", async () => {
    // live 整合: turn_mode="append" (operations path 由来)
    const event1: Event = {
      event_id: "event_1",
      turn_mode: "append",
      target_ref: null,
      target_ref_confidence: null,
      change_scope: null,
      when: {
        startTime: "10:00",
        timeHint: null,
        provenance: utteranceProvenance(["10時"], "high"),
      },
      where: {
        place_ref: "スターバックス渋谷店",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.658, lng: 139.701 },
        provenance: utteranceProvenance([], "high"),
      },
      what: {
        activity: "ミーティング",
        activityCanonical: "ミーティング",
        provenance: utteranceProvenance(["ミーティング"], "high"),
      },
      who: [],
      transport: "電車",
      certainty: "asserted",
      missing_semantic_critical: [],
      missing_solver_blockers: [],
    };
    const appendOp: PlanOperation = {
      type: "append",
      eventDraft: {
        when: {
          startTime: "12:00",
          timeHint: null,
          provenance: utteranceProvenance(["12時"], "high"),
        },
        where: {
          place_ref: "新宿",
          placeType: "generic_place",
          provenance: utteranceProvenance(["新宿"], "high"),
        },
        what: {
          activity: "ランチ",
          activityCanonical: "ランチ",
          provenance: utteranceProvenance(["ランチ"], "high"),
        },
        who: [],
        transport: null,
        certainty: "asserted",
      },
    };
    const llmRaw: L1PipelineInput["raw"] = {
      targetDate: "2026-05-01",
      startPoint: null,
      departureTime: null,
      goOut: true,
      operations: [appendOp],
      events: [],
    };
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "12時に新宿でランチ",
        priorPlanForContext: [event1],
      },
      {
        comprehension: createStubComprehensionProvider(llmRaw),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    const adapted = adaptPipelineToLegacy(pipelineResult, {
      ...baseInput,
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [event1],
      priorPendingClarify: null,
      priorRawInputs: ["前回の発話"],
    });
    expect(adapted.session.persistedEvents).toHaveLength(2);
    expect(adapted.session.persistedEvents![0].event_id).toBe("event_1");
    expect(adapted.session.persistedEvents![0].when.startTime).toBe("10:00");
    expect(adapted.session.persistedEvents![1].when.startTime).toBe("12:00");
    expect(adapted.session.persistedEvents![1].where.place_ref).toBe("新宿");
    expect(adapted.session.persistedEvents![1].what.activity).toBe("ランチ");
  });
});
