/**
 * deterministicOperationSynth — PR-50 Commit 7
 *
 * 検証範囲:
 *   - utterance pattern detector (時刻変更 / transport-only)
 *   - deterministic > LLM 優先 (utterance hit すれば LLM operations を上書き)
 *   - false positive 防止 (「電車で行く」「9時の予定」 等で hit しない)
 *
 * Layer 2 (LLM operations inspector) は Commit 8 で追加するため本ファイルでは未検証。
 */

import { describe, expect, it } from "vitest";

import {
  synthesizeOperations,
  detectDeterministicPatterns,
  inspectAndTransformLlmOperations,
} from "@/lib/alter-morning/comprehension/deterministicOperationSynth";
import {
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { PlanOperation } from "@/lib/alter-morning/comprehension/planOperation";

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
      place_ref: "スタバ",
      placeType: "exact_proper_noun",
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// detectDeterministicPatterns: 時刻変更 pattern
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectDeterministicPatterns: 時刻変更", () => {
  const prior = [mkPriorEvent()];

  it("「9時を10時に変更」 → modify with patch.when.startTime=10:00", () => {
    const ops = detectDeterministicPatterns("9時を10時に変更", prior);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("modify");
    if (ops[0].type === "modify") {
      expect(ops[0].targetRef).toBe("9時の予定");
      expect(ops[0].patch.when?.startTime).toBe("10:00");
    }
  });

  it("「9時を10時に」 (変更語省略) でも hit", () => {
    const ops = detectDeterministicPatterns("9時を10時に", prior);
    expect(ops).toHaveLength(1);
  });

  it("「9時を10時にして」 でも hit", () => {
    const ops = detectDeterministicPatterns("9時を10時にして", prior);
    expect(ops).toHaveLength(1);
  });

  it("「9:00を10:30に変更」 (HH:MM 形式) → patch.startTime=10:30", () => {
    const ops = detectDeterministicPatterns("9:00を10:30に変更", prior);
    expect(ops).toHaveLength(1);
    if (ops[0].type === "modify") {
      expect(ops[0].targetRef).toBe("09:00の予定");
      expect(ops[0].patch.when?.startTime).toBe("10:30");
    }
  });

  it("「9時 → 10時」 (矢印) でも hit", () => {
    const ops = detectDeterministicPatterns("9時 → 10時", prior);
    expect(ops).toHaveLength(1);
  });

  it("false positive: 「9時から10時まで」 (期間) は hit しない", () => {
    const ops = detectDeterministicPatterns("9時から10時まで", prior);
    expect(ops).toHaveLength(0);
  });

  it("false positive: 「9時の予定」 (参照のみ) は hit しない", () => {
    const ops = detectDeterministicPatterns("9時の予定", prior);
    expect(ops).toHaveLength(0);
  });

  it("false positive: 「10時にして」 (from 不明) は hit しない", () => {
    const ops = detectDeterministicPatterns("10時にして", prior);
    expect(ops).toHaveLength(0);
  });

  it("false positive: 25時 等の不正 hour は hit しない", () => {
    const ops = detectDeterministicPatterns("25時を10時に変更", prior);
    expect(ops).toHaveLength(0);
  });

  it("priorEvents 空 → hit しない (modify 対象なし)", () => {
    const ops = detectDeterministicPatterns("9時を10時に変更", []);
    expect(ops).toHaveLength(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// detectDeterministicPatterns: transport-only pattern
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectDeterministicPatterns: transport-only", () => {
  const prior = [mkPriorEvent()];

  it("「電車」 単独 → modify with patch.transport=電車", () => {
    const ops = detectDeterministicPatterns("電車", prior);
    expect(ops).toHaveLength(1);
    if (ops[0].type === "modify") {
      expect(ops[0].targetRef).toBe("今日の予定");
      expect(ops[0].patch.transport).toBe("電車");
    }
  });

  it.each([
    ["徒歩", "徒歩"],
    ["車", "車"],
    ["バス", "バス"],
    ["自転車", "自転車"],
    ["タクシー", "車"], // parseTransport は タクシー → 車 に正規化
  ])("「%s」 → patch.transport=%s", (input, expected) => {
    const ops = detectDeterministicPatterns(input, prior);
    expect(ops).toHaveLength(1);
    if (ops[0].type === "modify") {
      expect(ops[0].patch.transport).toBe(expected);
    }
  });

  it("「電車で」 (助詞付き) → hit", () => {
    const ops = detectDeterministicPatterns("電車で", prior);
    expect(ops).toHaveLength(1);
  });

  it("「電車に変更」 → hit", () => {
    const ops = detectDeterministicPatterns("電車に変更", prior);
    expect(ops).toHaveLength(1);
  });

  it("false positive: 「電車で行く」 (動詞含む) は hit しない", () => {
    const ops = detectDeterministicPatterns("電車で行く", prior);
    expect(ops).toHaveLength(0);
  });

  it("false positive: 「9時に電車」 (時刻含む) は hit しない", () => {
    const ops = detectDeterministicPatterns("9時に電車", prior);
    expect(ops).toHaveLength(0);
  });

  it("priorEvents 空 → hit しない", () => {
    const ops = detectDeterministicPatterns("電車", []);
    expect(ops).toHaveLength(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// synthesizeOperations: 優先順位
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("synthesizeOperations: priority", () => {
  const prior = [mkPriorEvent()];

  it("utterance pattern hit + LLM ops 空 → synthesisSource=deterministic", () => {
    const result = synthesizeOperations({
      utterance: "9時を10時に変更",
      priorEvents: prior,
      llmOperations: [],
    });
    expect(result.synthesisSource).toBe("deterministic");
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe("modify");
  });

  it("utterance pattern hit + LLM ops あり → deterministic_overrides_llm (LLM 上書き)", () => {
    const llmAppend = mkAppendOp();
    const result = synthesizeOperations({
      utterance: "9時を10時に変更",
      priorEvents: prior,
      llmOperations: [llmAppend],
    });
    expect(result.synthesisSource).toBe("deterministic_overrides_llm");
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe("modify"); // LLM の append は破棄
  });

  it("utterance pattern なし + LLM ops あり → llm (passthrough)", () => {
    const llmAppend = mkAppendOp();
    const result = synthesizeOperations({
      utterance: "12時に新宿で武藤さんとランチ",
      priorEvents: prior,
      llmOperations: [llmAppend],
    });
    expect(result.synthesisSource).toBe("llm");
    expect(result.operations).toEqual([llmAppend]);
  });

  it("utterance pattern なし + LLM ops 空 → none", () => {
    const result = synthesizeOperations({
      utterance: "おはよう",
      priorEvents: prior,
      llmOperations: [],
    });
    expect(result.synthesisSource).toBe("none");
    expect(result.operations).toEqual([]);
  });

  it("transport-only utterance + LLM が誤って append を出した場合 → deterministic が勝つ (CEO 観測ケース)", () => {
    // 実機で観測: LLM が「電車」 を「event_1 完全コピー + transport=電車」 で append
    const badAppend: PlanOperation = {
      type: "append",
      eventDraft: {
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "スタバ",
          placeType: "exact_proper_noun",
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
        what: {
          activity: "コーヒー",
          activityCanonical: "コーヒー",
          provenance: utteranceProvenance(["コーヒー"], "high"),
        },
        who: [],
        transport: "電車",
        certainty: "asserted",
      },
    };
    const result = synthesizeOperations({
      utterance: "電車",
      priorEvents: prior,
      llmOperations: [badAppend],
    });
    // deterministic が utterance="電車" を transport modify として生成し
    // LLM の bad append を上書き
    expect(result.synthesisSource).toBe("deterministic_overrides_llm");
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe("modify");
    if (result.operations[0].type === "modify") {
      expect(result.operations[0].patch.transport).toBe("電車");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Commit 8: inspectAndTransformLlmOperations (Layer 2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("inspectAndTransformLlmOperations: transport-only duplicate append → modify transform", () => {
  function mkBadAppend(transport: string): PlanOperation {
    // CEO 観測ケースの再現: prior と when/where/what 完全一致 + transport 異なる
    return {
      type: "append",
      eventDraft: {
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "スタバ",
          placeType: "exact_proper_noun",
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
        what: {
          activity: "コーヒー",
          activityCanonical: "コーヒー",
          provenance: utteranceProvenance(["コーヒー"], "high"),
        },
        who: [],
        transport,
        certainty: "asserted",
      },
    };
  }

  it("prior と完全一致 + transport 異なる append → modify に transform", () => {
    const prior = [mkPriorEvent({ transport: null })];
    const badAppend = mkBadAppend("電車");
    const result = inspectAndTransformLlmOperations([badAppend], prior);
    expect(result.transformed).toBe(true);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe("modify");
    if (result.operations[0].type === "modify") {
      expect(result.operations[0].targetRef).toBe("9時の予定");
      expect(result.operations[0].patch.transport).toBe("電車");
    }
  });

  it("prior と完全一致 + transport が prior と同じ → passthrough (完全 duplicate は別系統)", () => {
    const prior = [mkPriorEvent({ transport: "電車" })];
    const sameAppend = mkBadAppend("電車");
    const result = inspectAndTransformLlmOperations([sameAppend], prior);
    expect(result.transformed).toBe(false);
    expect(result.operations).toEqual([sameAppend]);
  });

  it("prior と一致しない append → passthrough (新規予定として正常)", () => {
    const prior = [mkPriorEvent()];
    const newAppend: PlanOperation = {
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
        transport: "電車",
        certainty: "asserted",
      },
    };
    const result = inspectAndTransformLlmOperations([newAppend], prior);
    expect(result.transformed).toBe(false);
    expect(result.operations).toEqual([newAppend]);
  });

  it("eventDraft.transport が null → passthrough (transport patch 意図でない)", () => {
    const prior = [mkPriorEvent()];
    const noTransportAppend: PlanOperation = {
      type: "append",
      eventDraft: {
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "スタバ",
          placeType: "exact_proper_noun",
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
      },
    };
    const result = inspectAndTransformLlmOperations([noTransportAppend], prior);
    expect(result.transformed).toBe(false);
    expect(result.operations).toEqual([noTransportAppend]);
  });

  it("modify / answer / noop は transform 対象外 (passthrough)", () => {
    const prior = [mkPriorEvent()];
    const ops: PlanOperation[] = [
      {
        type: "modify",
        targetRef: "9時の予定",
        patch: { when: { startTime: "10:00", endTime: null, timeHint: null } },
      },
      { type: "answer", slot: "where", value: "池袋" },
      { type: "noop", reason: "acknowledgement" },
    ];
    const result = inspectAndTransformLlmOperations(ops, prior);
    expect(result.transformed).toBe(false);
    expect(result.operations).toEqual(ops);
  });

  it("複数 ops 混在: append (transform) + modify (passthrough)", () => {
    const prior = [mkPriorEvent({ transport: null })];
    const badAppend = mkBadAppend("徒歩");
    const otherModify: PlanOperation = {
      type: "modify",
      targetRef: "今日の予定",
      patch: { when: { startTime: "11:00", endTime: null, timeHint: null } },
    };
    const result = inspectAndTransformLlmOperations(
      [badAppend, otherModify],
      prior,
    );
    expect(result.transformed).toBe(true);
    expect(result.operations).toHaveLength(2);
    expect(result.operations[0].type).toBe("modify"); // transformed
    expect(result.operations[1]).toEqual(otherModify); // passthrough
  });

  it("synthesizeOperations から呼ぶと synthesisSource = llm_transformed", () => {
    const prior = [mkPriorEvent({ transport: null })];
    const badAppend = mkBadAppend("電車");
    const result = synthesizeOperations({
      utterance: "電車にする",  // hit はする可能性あるが test では純 LLM transform を見たい
      priorEvents: prior,
      llmOperations: [badAppend],
    });
    // utterance「電車にする」 が deterministic transport-only に hit するため
    // synthesisSource は "deterministic_overrides_llm" になる。
    // Layer 2 (llm_transformed) を直接観測するには utterance を pattern に
    // hit しない値 (e.g. 「うん」) にして LLM bad append を残す:
    expect(result.synthesisSource).toBe("deterministic_overrides_llm");
  });

  it("synthesizeOperations: utterance が pattern に hit しない場合は llm_transformed", () => {
    const prior = [mkPriorEvent({ transport: null })];
    const badAppend = mkBadAppend("電車");
    const result = synthesizeOperations({
      utterance: "うん", // pattern hit しない発話
      priorEvents: prior,
      llmOperations: [badAppend],
    });
    expect(result.synthesisSource).toBe("llm_transformed");
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe("modify");
  });
});
