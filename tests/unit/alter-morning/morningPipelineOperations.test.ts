/**
 * morningPipeline — operations 経路の wiring (PR-50 Commit 3)
 *
 * 検証範囲:
 *   - LLM raw output に operations が含まれた場合、ComprehensionResult に
 *     伝搬される (operations / acceptedOperations / fallbackToEvents /
 *     operationRejections)
 *   - validation 結果による fallback signal の決定:
 *     - operations 空 → fallbackToEvents=true
 *     - 全 accept → fallbackToEvents=false
 *     - 1+ reject → fallbackToEvents=true (全部捨てて events[] fallback)
 *   - priorEvents bypass モード (answerBinder 経路) では operations: [] が
 *     入り、fallbackToEvents=true (= events 経路) になる
 *
 * scope 外 (Commit 4 で実装):
 *   - operation-driven dispatch (effectiveEvents 構築)
 *   - priorPendingClarify を MorningPipelineInput から渡す
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

import {
  runMorningPipeline,
  createStubComprehensionProvider,
} from "@/lib/alter-morning/morningPipeline";
import {
  resetEventCounter,
  utteranceProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { L1PipelineInput } from "@/lib/alter-morning/comprehension/l1Pipeline";
import type { Event } from "@/lib/alter-morning/comprehension/eventSchema";
import type { PlanOperation } from "@/lib/alter-morning/comprehension/planOperation";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  resetEventCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixture builders
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkSeedEvent(): Event {
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
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
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
    ...overrides,
  };
}

const validAppendOp: PlanOperation = {
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

const validNoopOp: PlanOperation = {
  type: "noop",
  reason: "acknowledgement",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PR-50 Commit 3: operations wiring (morningPipeline)", () => {
  test("operations 空 → fallbackToEvents=true、ComprehensionResult に signal が立つ", async () => {
    const raw = mkRaw({ operations: [] });
    const result = await runMorningPipeline(
      { utterance: "12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    expect(result.status).toBe("ok");
    expect(result.comprehension).not.toBeNull();
    expect(result.comprehension!.fallbackToEvents).toBe(true);
    expect(result.comprehension!.operations).toEqual([]);
    expect(result.comprehension!.acceptedOperations).toEqual([]);
    expect(result.comprehension!.operationRejections).toEqual([]);
  });

  test("operations 全 accept (noop) → fallbackToEvents=false、acceptedOperations に伝搬", async () => {
    const raw = mkRaw({ operations: [validNoopOp] });
    const result = await runMorningPipeline(
      { utterance: "ありがとう" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    expect(result.status).toBe("ok");
    expect(result.comprehension!.fallbackToEvents).toBe(false);
    expect(result.comprehension!.operations).toEqual([validNoopOp]);
    expect(result.comprehension!.acceptedOperations).toEqual([validNoopOp]);
    expect(result.comprehension!.operationRejections).toEqual([]);
  });

  test("append + noop 全 accept → fallbackToEvents=false", async () => {
    const raw = mkRaw({ operations: [validAppendOp, validNoopOp] });
    const result = await runMorningPipeline(
      { utterance: "12時に新宿でランチ、ありがとう" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    expect(result.comprehension!.fallbackToEvents).toBe(false);
    expect(result.comprehension!.acceptedOperations).toHaveLength(2);
    expect(result.comprehension!.operationRejections).toEqual([]);
  });

  test("modify with no prior + no priorPlanForContext → reject → fallbackToEvents=true", async () => {
    const modifyOp: PlanOperation = {
      type: "modify",
      targetRef: "9時の予定",
      patch: { when: { startTime: "10:00", endTime: null, timeHint: null } },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const raw = mkRaw({ operations: [modifyOp] });
      const result = await runMorningPipeline(
        { utterance: "9時を10時に変更" },
        { comprehension: createStubComprehensionProvider(raw), weather: null },
      );

      // priorPlanForContext 空 → priorEvents.length===0 → modify_target_unresolved
      expect(result.comprehension!.fallbackToEvents).toBe(true);
      expect(result.comprehension!.acceptedOperations).toEqual([]);
      expect(result.comprehension!.operationRejections).toHaveLength(1);
      expect(result.comprehension!.operationRejections![0].reason).toBe(
        "modify_target_unresolved",
      );
      // warn log fired
      expect(warn).toHaveBeenCalledWith(
        "[alter-morning/morningPipeline] operations rejected, falling back to events[]",
        expect.objectContaining({ reasons: ["modify_target_unresolved"] }),
      );
    } finally {
      warn.mockRestore();
    }
  });

  test("modify with priorPlanForContext (1 件) → single_event_fallback で accept", async () => {
    const modifyOp: PlanOperation = {
      type: "modify",
      targetRef: "9時の予定",
      patch: { when: { startTime: "10:00", endTime: null, timeHint: null } },
    };
    const seed = mkSeedEvent();
    const raw = mkRaw({ operations: [modifyOp] });
    const result = await runMorningPipeline(
      {
        utterance: "9時を10時に変更",
        priorPlanForContext: [seed],
      },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    expect(result.comprehension!.fallbackToEvents).toBe(false);
    expect(result.comprehension!.acceptedOperations).toHaveLength(1);
    expect(result.comprehension!.operationRejections).toEqual([]);
  });

  test("answer without priorPendingClarify → reject (Commit 4 で wire 予定)", async () => {
    const answerOp: PlanOperation = {
      type: "answer",
      slot: "where",
      value: "池袋",
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const raw = mkRaw({ operations: [answerOp] });
      const result = await runMorningPipeline(
        { utterance: "池袋" },
        { comprehension: createStubComprehensionProvider(raw), weather: null },
      );

      // priorPendingClarify=null (Commit 3 段階の制約) → answer_no_pending_clarify
      expect(result.comprehension!.fallbackToEvents).toBe(true);
      expect(result.comprehension!.operationRejections).toHaveLength(1);
      expect(result.comprehension!.operationRejections![0].reason).toBe(
        "answer_no_pending_clarify",
      );
    } finally {
      warn.mockRestore();
    }
  });

  test("priorEvents bypass (answerBinder 経路) → operations: []、fallbackToEvents=true", async () => {
    const seed = mkSeedEvent();
    const result = await runMorningPipeline(
      {
        utterance: "test",
        priorEvents: [seed],
      },
      // bypass モードでは comprehension provider は呼ばれないが型上必要
      {
        comprehension: createStubComprehensionProvider(mkRaw()),
        weather: null,
      },
    );

    expect(result.status).toBe("ok");
    expect(result.comprehension!.fallbackToEvents).toBe(true);
    expect(result.comprehension!.operations).toEqual([]);
    expect(result.comprehension!.acceptedOperations).toEqual([]);
    expect(result.comprehension!.operationRejections).toEqual([]);
  });

  test("既存 events 経路は operations 拡張前と同じ挙動 (regression baseline)", async () => {
    // operations: [] (= LLM が出さない / 自信なし) でも events[] 経路が機能する
    const raw = mkRaw({ operations: [] });
    const result = await runMorningPipeline(
      { utterance: "12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    expect(result.status).toBe("ok");
    expect(result.comprehension!.events).toHaveLength(1);
    expect(result.comprehension!.events[0].where.place_ref).toBe("新宿");
    expect(result.timeline).not.toBeNull();
    expect(result.grounded).toHaveLength(1);
    // fallbackToEvents=true で events 経路を後段が選択
    expect(result.comprehension!.fallbackToEvents).toBe(true);
  });
});
