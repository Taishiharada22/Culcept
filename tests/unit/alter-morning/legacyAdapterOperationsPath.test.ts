/**
 * legacyAdapter — operations 経路 vs events 経路 分岐 (PR-50 Commit 4)
 *
 * 検証範囲:
 *   - comprehension.fallbackToEvents=false + acceptedOperations 非空
 *     → operationDispatcher 経路で effectiveEvents 構築
 *   - 上記以外 → 既存 dispatchEventMerge 経路 (regression baseline)
 *   - どちらの経路でも reconcileGapStateFromEffectiveEvents は同じ contract で動く
 *   - operations 経路で append が priorPersistedEvents を上書きしない
 *   - operations 経路で modify が prior に when patch を当てる
 */

import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  runMorningPipeline,
  createStubComprehensionProvider,
} from "@/lib/alter-morning/morningPipeline";
import { adaptPipelineToLegacy } from "@/lib/alter-morning/legacyAdapter";
import {
  resetEventCounter,
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { L1PipelineInput } from "@/lib/alter-morning/comprehension/l1Pipeline";
import type { PlanOperation } from "@/lib/alter-morning/comprehension/planOperation";
import type { PendingClarify } from "@/lib/alter-morning/types";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  resetEventCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkPriorEvent(overrides?: Partial<Event>): Event {
  return {
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
      place_ref: "サドヤ",
      placeType: "exact_proper_noun",
      provenance: utteranceProvenance(["サドヤ"], "high"),
    },
    what: {
      activity: "コーヒー",
      activityCanonical: "コーヒー",
      provenance: utteranceProvenance(["コーヒー"], "high"),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
    ...overrides,
  };
}

function mkRaw(
  overrides?: Partial<L1PipelineInput["raw"]>,
): L1PipelineInput["raw"] {
  return {
    targetDate: "2026-04-30",
    startPoint: null,
    departureTime: null,
    goOut: true,
    operations: [],
    events: [],
    ...overrides,
  };
}

function mkAppendOp(): PlanOperation {
  return {
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
}

function mkPendingWhere(): PendingClarify {
  return {
    event_id: "event_1",
    slot: "where",
    kind: "where_center",
    scope: { timeLabel: "9時", activityLabel: "コーヒー", eventOrdinal: 1 },
    question: "どのあたり？",
    askedAt: new Date().toISOString(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("legacyAdapter: operations path vs events path 分岐 (PR-50 Commit 4)", () => {
  it("operations 経路 (fallbackToEvents=false + append op): prior 不変、新 event 追加", async () => {
    const prior = mkPriorEvent();
    const raw = mkRaw({
      operations: [mkAppendOp()],
      events: [],
    });
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "12時に新宿でランチ",
        priorPlanForContext: [prior],
      },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    // pipeline で fallbackToEvents=false が立つ (validation 通過 + length>0)
    expect(pipelineResult.comprehension!.fallbackToEvents).toBe(false);
    expect(pipelineResult.comprehension!.acceptedOperations).toHaveLength(1);

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "test-session",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [prior],
    });

    // operationDispatcher 経路で effectiveEvents = prior + 新 append
    const persistedAfter = adapted.session.persistedEvents ?? [];
    expect(persistedAfter).toHaveLength(2);
    // prior は完全保持 (上書きされていない)
    expect(persistedAfter[0].event_id).toBe("event_1");
    expect(persistedAfter[0].where.place_ref).toBe("サドヤ");
    expect(persistedAfter[0].when.startTime).toBe("09:00");
    // append は新 event_id (event_2) で追加
    expect(persistedAfter[1].event_id).toBe("event_2");
    expect(persistedAfter[1].where.place_ref).toBe("新宿");
    expect(persistedAfter[1].what.activity).toBe("ランチ");
  });

  it("operations 経路 (modify): prior の when.startTime を patch、where/what 不変", async () => {
    const prior = mkPriorEvent();
    const modifyOp: PlanOperation = {
      type: "modify",
      targetRef: "9時の予定",
      patch: { when: { startTime: "10:00", endTime: null, timeHint: null } },
    };
    const raw = mkRaw({
      operations: [modifyOp],
      events: [],
    });
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "9時を10時に変更",
        priorPlanForContext: [prior],
      },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    expect(pipelineResult.comprehension!.fallbackToEvents).toBe(false);

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "test-session",
      utterance: "9時を10時に変更",
      priorPersistedEvents: [prior],
    });

    const persistedAfter = adapted.session.persistedEvents ?? [];
    expect(persistedAfter).toHaveLength(1);
    expect(persistedAfter[0].event_id).toBe("event_1");
    // when.startTime のみ更新
    expect(persistedAfter[0].when.startTime).toBe("10:00");
    // where / what は prior 維持 (PR-46 contract)
    expect(persistedAfter[0].where.place_ref).toBe("サドヤ");
    expect(persistedAfter[0].what.activity).toBe("コーヒー");
  });

  it("events 経路 (fallbackToEvents=true): 既存 dispatchEventMerge を通る (regression baseline)", async () => {
    // prior の event_id を非衝突形式 ("event_prior") にして、stub raw の
    // event_id 採番 (event_1 等) と衝突しないようにする。
    const prior = mkPriorEvent({ event_id: "event_prior" });
    // operations 空 → fallbackToEvents=true → events[] 経路
    const raw = mkRaw({
      operations: [],
      events: [
        {
          turn_mode: "create",
          change_scope: null,
          target_ref: null,
          target_ref_confidence: null,
          certainty: "asserted",
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
          missing_semantic_critical: [],
          missing_solver_blockers: [],
        },
      ],
    });
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "12時に新宿でランチ",
        priorPlanForContext: [prior],
      },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    expect(pipelineResult.comprehension!.fallbackToEvents).toBe(true);

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "test-session",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [prior],
    });

    // events 経路で dispatchEventMerge が走る → 既存挙動と同じ effectiveEvents
    //   event_prior と event_1 は同一性判定 (event_id / time+place) で不一致
    //   → 新 event は kept_as_new で追加される
    const persistedAfter = adapted.session.persistedEvents ?? [];
    expect(persistedAfter.length).toBeGreaterThanOrEqual(2);
    // prior 保持
    expect(persistedAfter[0].event_id).toBe("event_prior");
    expect(persistedAfter[0].where.place_ref).toBe("サドヤ");
    // events 経路は新 event を turn_mode="create" で kept_as_new
    const newEvent = persistedAfter.find(
      (e) => e.where.place_ref === "新宿",
    );
    expect(newEvent).toBeDefined();
  });

  it("operations 経路 (answer secondary path): pendingClarify 渡されると bind 動作", async () => {
    const prior = mkPriorEvent({
      where: {
        place_ref: null,
        placeType: null,
        provenance: utteranceProvenance([], "low"),
      },
      missing_semantic_critical: ["where"],
    });
    const answerOp: PlanOperation = {
      type: "answer",
      slot: "where",
      value: "池袋",
    };
    const raw = mkRaw({
      operations: [answerOp],
      events: [],
    });
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "池袋",
        priorPlanForContext: [prior],
        priorPendingClarify: mkPendingWhere(),
      },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    // validation で answer が accept される (pendingClarify あり + slot 一致)
    expect(pipelineResult.comprehension!.fallbackToEvents).toBe(false);
    expect(pipelineResult.comprehension!.acceptedOperations).toHaveLength(1);

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "test-session",
      utterance: "池袋",
      priorPersistedEvents: [prior],
      priorPendingClarify: mkPendingWhere(),
    });

    // operationDispatcher 経路で bindAnswerToSlot が走る → where が「池袋」 に
    const persistedAfter = adapted.session.persistedEvents ?? [];
    expect(persistedAfter).toHaveLength(1);
    expect(persistedAfter[0].where.place_ref).toBe("池袋");
  });

  it("operations 経路 (answer): pendingClarify=null + answer op → validation reject → events 経路 fallback", async () => {
    const prior = mkPriorEvent();
    const answerOp: PlanOperation = {
      type: "answer",
      slot: "where",
      value: "池袋",
    };
    const raw = mkRaw({
      operations: [answerOp],
      events: [],
    });
    // pendingClarify を渡さない → validation で answer_no_pending_clarify reject
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const pipelineResult = await runMorningPipeline(
        {
          utterance: "池袋",
          priorPlanForContext: [prior],
        },
        { comprehension: createStubComprehensionProvider(raw), weather: null },
      );

      expect(pipelineResult.comprehension!.fallbackToEvents).toBe(true);
      expect(pipelineResult.comprehension!.operationRejections).toHaveLength(1);
      expect(pipelineResult.comprehension!.operationRejections![0].reason).toBe(
        "answer_no_pending_clarify",
      );

      const adapted = adaptPipelineToLegacy(pipelineResult, {
        sessionId: "test-session",
        utterance: "池袋",
        priorPersistedEvents: [prior],
      });

      // events 経路 fallback で events 空 → effectiveEvents = prior のまま
      const persistedAfter = adapted.session.persistedEvents ?? [];
      expect(persistedAfter).toHaveLength(1);
      expect(persistedAfter[0].where.place_ref).toBe("サドヤ"); // prior 維持
    } finally {
      warn.mockRestore();
    }
  });
});
