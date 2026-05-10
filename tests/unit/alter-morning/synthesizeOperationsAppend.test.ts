/**
 * synthesizeOperations — PR A integration tests (Commit 5)
 *
 * 確認:
 *   - allowDeterministicAppend === true で detectAppendPattern が hit → append op
 *   - LLM が同じ append op を出していても deterministic_append_overrides_llm で 1 件に絞る (二重発火防止)
 *   - allowDeterministicAppend が省略 / false → append 不発 (安全側 default false)
 */

import { describe, it, expect } from "vitest";
import { synthesizeOperations } from "@/lib/alter-morning/comprehension/deterministicOperationSynth";
import {
  type Event,
  utteranceProvenance,
  toolProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { PlanOperation } from "@/lib/alter-morning/comprehension/planOperation";

function mkPriorEvent(): Event {
  return {
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
      place_ref: "スターバックス渋谷ストリーム店",
      placeType: "exact_proper_noun",
      coordinates: { lat: 35.658, lng: 139.701 },
      provenance: toolProvenance("high"),
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
}

describe("synthesizeOperations — deterministic_append integration (PR A Commit 5)", () => {
  it("allowDeterministicAppend=true + LLM 空 → deterministic_append, 1 op", () => {
    const result = synthesizeOperations({
      utterance: "12時に新宿でランチ",
      priorEvents: [mkPriorEvent()],
      llmOperations: [],
      allowDeterministicAppend: true,
    });
    expect(result.synthesisSource).toBe("deterministic_append");
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe("append");
    if (result.operations[0].type === "append") {
      expect(result.operations[0].eventDraft.where.place_ref).toBe("新宿");
      expect(result.operations[0].eventDraft.what.activity).toBe("ランチ");
    }
  });

  it("allowDeterministicAppend=true + LLM が同 append 出力 → deterministic_append_overrides_llm, 1 op (二重発火防止)", () => {
    const llmAppend: PlanOperation = {
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
    const result = synthesizeOperations({
      utterance: "12時に新宿でランチ",
      priorEvents: [mkPriorEvent()],
      llmOperations: [llmAppend],
      allowDeterministicAppend: true,
    });
    expect(result.synthesisSource).toBe("deterministic_append_overrides_llm");
    // LLM 破棄、deterministic 1 件のみ
    expect(result.operations).toHaveLength(1);
  });

  it("allowDeterministicAppend 省略 (default false) → append 不発、LLM がいれば LLM、無ければ none", () => {
    const result = synthesizeOperations({
      utterance: "12時に新宿でランチ",
      priorEvents: [mkPriorEvent()],
      llmOperations: [],
      // allowDeterministicAppend 省略
    });
    expect(result.synthesisSource).toBe("none");
    expect(result.operations).toHaveLength(0);
  });

  it("allowDeterministicAppend=false → append 不発 (誤爆防止)", () => {
    const result = synthesizeOperations({
      utterance: "12時に新宿でランチ",
      priorEvents: [mkPriorEvent()],
      llmOperations: [],
      allowDeterministicAppend: false,
    });
    expect(result.synthesisSource).toBe("none");
  });

  it("allowDeterministicAppend=true + 「電車」 → time-change/transport-only path 優先 (deterministic, modify)", () => {
    const result = synthesizeOperations({
      utterance: "電車",
      priorEvents: [mkPriorEvent()],
      llmOperations: [],
      allowDeterministicAppend: true,
    });
    // detectDeterministicPatterns (transport-only) が先 hit
    expect(result.synthesisSource).toBe("deterministic");
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe("modify");
  });

  it("allowDeterministicAppend=true + 複数時刻 → deterministic_append 不発 (LLM 委任)", () => {
    const result = synthesizeOperations({
      utterance: "12時に新宿でランチ、15時に渋谷で打ち合わせ",
      priorEvents: [mkPriorEvent()],
      llmOperations: [],
      allowDeterministicAppend: true,
    });
    // detectAppendPattern が単一時刻条件で reject、LLM も空 → none
    expect(result.synthesisSource).toBe("none");
  });

  it("allowDeterministicAppend=true + priorPendingClarify あり → defensive で append 不発", () => {
    const result = synthesizeOperations({
      utterance: "12時に新宿でランチ",
      priorEvents: [mkPriorEvent()],
      llmOperations: [],
      allowDeterministicAppend: true,
      priorPendingClarify: {
        event_id: "event_1",
        slot: "transport",
        kind: "transport",
        scope: { timeLabel: "09:00", activityLabel: null, eventOrdinal: 1 },
        question: "?",
        askedAt: new Date().toISOString(),
      },
    });
    expect(result.synthesisSource).toBe("none");
  });
});
