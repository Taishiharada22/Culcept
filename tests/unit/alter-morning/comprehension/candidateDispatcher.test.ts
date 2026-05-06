/**
 * candidateDispatcher (OP-4) — pure dispatcher unit test
 *
 * 検証観点:
 *   1. 空入力 + valid actualToday → setTargetDate に system_default、 他 null
 *   2. 空入力 + invalid actualToday → 全 null + systemDefault null
 *   3. set_target_date 単一 / 複数 priority / tie-break 各段階
 *   4. invalid_target_date reject (= LLM "tomorrow" / "today" / 空 / 不正日付)
 *   5. valid 0 件 + actualToday valid → system_default 採用
 *   6. valid 1 件以上 → system_default 生成しない
 *   7. journey origin / end の reducePerField (= priority + confidence + source 順)
 *   8. resolve_place_candidate(slot=where) → unhandled_slot_for_op4
 *   9. add_travel_edge は **input order 保持、 priority sort / merge / dedupe しない**
 *  10. add_travel_edge を含む候補で selectedJourneyOrigin null
 *  11. segmentOrigin / segmentDestination が journeyOrigin / journeyEnd payload に流れない
 *  12. dispatcher が pure (= input mutate なし、 deterministic)
 */

import { describe, it, expect } from "vitest";
import {
  dispatchCandidates,
  type DispatchInput,
  type RejectReason,
} from "@/lib/alter-morning/comprehension/candidateDispatcher";
import type {
  PlanOperationCandidate,
  SetTargetDateOperationCandidate,
  AddTravelEdgeOperationCandidate,
  SetJourneyOriginOperationCandidate,
  SetJourneyEndOperationCandidate,
  ResolvePlaceCandidateOperationCandidate,
} from "@/lib/alter-morning/comprehension/planOperationCandidate";
import type {
  OperationEnvelope,
  OperationSource,
  OperationConfidence,
} from "@/lib/alter-morning/comprehension/operationEnvelope";
import type { Provenance } from "@/lib/alter-morning/comprehension/eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const UTTERANCE_PROV: Provenance = {
  source_type: "utterance",
  source_span: [],
  provenance_confidence: "high",
  from_utterance: true,
};

const INFERRED_PROV: Provenance = {
  source_type: "inferred",
  source_span: [],
  provenance_confidence: "low",
  from_utterance: false,
};

function makeTargetDate(
  date: string,
  source: OperationSource = "llm_explicit",
  priority = 700,
  confidence: OperationConfidence = "high",
): OperationEnvelope<SetTargetDateOperationCandidate> {
  return {
    type: "set_target_date",
    payload: { date },
    source,
    priority,
    confidence,
    provenance: source === "llm_explicit" ? UTTERANCE_PROV : INFERRED_PROV,
  };
}

function makeTravelEdge(
  origin: string,
  destination: string,
  time: string,
  source: OperationSource = "llm_explicit",
  priority = 700,
): OperationEnvelope<AddTravelEdgeOperationCandidate> {
  return {
    type: "add_travel_edge",
    payload: {
      segmentOrigin: { label: origin, classification: "public_poi_proper_noun" },
      segmentDestination: { label: destination, classification: "public_poi_proper_noun" },
      segmentDepartureTime: time,
      matchedSpan: `${origin}から${destination}へ`,
    },
    source,
    priority,
    confidence: "high",
    provenance: UTTERANCE_PROV,
  };
}

function makeJourneyOrigin(
  label: string | null,
  source: OperationSource = "llm_explicit",
  priority = 700,
  confidence: OperationConfidence = "high",
): OperationEnvelope<SetJourneyOriginOperationCandidate> {
  return {
    type: "set_journey_origin",
    payload:
      label === null
        ? { kind: "unknown", reason: "no_baseline" }
        : {
            kind: "known_label_only",
            label,
            source: "user_declared",
          },
    source,
    priority,
    confidence,
    provenance: UTTERANCE_PROV,
  };
}

function makeJourneyEnd(
  label: string | null,
  source: OperationSource = "llm_explicit",
  priority = 700,
): OperationEnvelope<SetJourneyEndOperationCandidate> {
  return {
    type: "set_journey_end",
    payload:
      label === null
        ? { kind: "unknown", reason: "no_endpoint_signal" }
        : {
            kind: "known_label_only",
            label,
            source: "user_explicit_endpoint",
          },
    source,
    priority,
    confidence: "high",
    provenance: UTTERANCE_PROV,
  };
}

function makeResolvePlace(
  slot: "origin" | "end" | "where",
  label: string,
  source: OperationSource = "ui_action",
  priority = 1000,
): OperationEnvelope<ResolvePlaceCandidateOperationCandidate> {
  return {
    type: "resolve_place_candidate",
    payload: { slot, label },
    source,
    priority,
    confidence: "high",
    provenance: UTTERANCE_PROV,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 空入力
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCandidates (OP-4) — 空入力", () => {
  it("空 candidates + valid actualToday → systemDefault 生成", () => {
    const result = dispatchCandidates({
      candidates: [],
      actualToday: "2026-05-06",
    });
    expect(result.selectedTargetDateCandidate).not.toBeNull();
    expect(result.selectedTargetDateCandidate?.source).toBe("system_default");
    expect(result.selectedTargetDateCandidate?.priority).toBe(100);
    expect(result.selectedTargetDateCandidate?.payload.date).toBe("2026-05-06");
    expect(result.systemDefaultGenerated).not.toBeNull();
    expect(result.selectedJourneyOriginCandidate).toBeNull();
    expect(result.selectedJourneyEndCandidate).toBeNull();
    expect(result.selectedTravelEdgeCandidates).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("空 candidates + invalid actualToday ('today') → 全 null", () => {
    const result = dispatchCandidates({
      candidates: [],
      actualToday: "today",
    });
    expect(result.selectedTargetDateCandidate).toBeNull();
    expect(result.systemDefaultGenerated).toBeNull();
  });

  it("空 candidates + invalid actualToday (空文字) → 全 null", () => {
    const result = dispatchCandidates({
      candidates: [],
      actualToday: "",
    });
    expect(result.selectedTargetDateCandidate).toBeNull();
    expect(result.systemDefaultGenerated).toBeNull();
  });

  it("空 candidates + invalid actualToday ('2026-02-30' = 存在しない日) → 全 null", () => {
    const result = dispatchCandidates({
      candidates: [],
      actualToday: "2026-02-30",
    });
    expect(result.selectedTargetDateCandidate).toBeNull();
    expect(result.systemDefaultGenerated).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. set_target_date payload.date 検証 (= 修正 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCandidates (OP-4) — payload.date YYYY-MM-DD 検証", () => {
  it('LLM が "tomorrow" を出した envelope → invalid_target_date で reject', () => {
    const llmTomorrow = makeTargetDate("tomorrow", "llm_explicit", 700);
    const result = dispatchCandidates({
      candidates: [llmTomorrow],
      actualToday: "2026-05-06",
    });
    expect(result.selectedTargetDateCandidate?.source).toBe("system_default");
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].envelope).toBe(llmTomorrow);
    expect(result.rejected[0].reason).toBe("invalid_target_date");
  });

  it('LLM が "today" を出した envelope → invalid_target_date で reject', () => {
    const llmToday = makeTargetDate("today", "llm_explicit", 700);
    const result = dispatchCandidates({
      candidates: [llmToday],
      actualToday: "2026-05-06",
    });
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe("invalid_target_date");
  });

  it("LLM が空文字を出した envelope → invalid_target_date", () => {
    const llmEmpty = makeTargetDate("", "llm_explicit", 700);
    const result = dispatchCandidates({
      candidates: [llmEmpty],
      actualToday: "2026-05-06",
    });
    expect(result.rejected[0].reason).toBe("invalid_target_date");
  });

  it("LLM が '2026-02-30' (= 存在しない日付) → invalid_target_date", () => {
    const llmBadDate = makeTargetDate("2026-02-30", "llm_explicit", 700);
    const result = dispatchCandidates({
      candidates: [llmBadDate],
      actualToday: "2026-05-06",
    });
    expect(result.rejected[0].reason).toBe("invalid_target_date");
  });

  it("LLM 'tomorrow' (invalid) + regex '2026-05-06' (valid) → regex 採用、 LLM rejected", () => {
    const llmTomorrow = makeTargetDate("tomorrow", "llm_explicit", 700);
    const regexValid = makeTargetDate("2026-05-06", "regex_deterministic", 600);
    const result = dispatchCandidates({
      candidates: [llmTomorrow, regexValid],
      actualToday: "2026-05-07",
    });
    expect(result.selectedTargetDateCandidate?.source).toBe("regex_deterministic");
    expect(result.selectedTargetDateCandidate?.payload.date).toBe("2026-05-06");
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].envelope).toBe(llmTomorrow);
    expect(result.rejected[0].reason).toBe("invalid_target_date");
  });

  it("LLM 'tomorrow' (invalid) のみ + actualToday valid → system_default 採用", () => {
    const llmTomorrow = makeTargetDate("tomorrow", "llm_explicit", 700);
    const result = dispatchCandidates({
      candidates: [llmTomorrow],
      actualToday: "2026-05-06",
    });
    expect(result.selectedTargetDateCandidate?.source).toBe("system_default");
    expect(result.selectedTargetDateCandidate?.payload.date).toBe("2026-05-06");
    expect(result.systemDefaultGenerated?.payload.date).toBe("2026-05-06");
  });

  it("LLM 'tomorrow' (invalid) のみ + actualToday 'today' (invalid) → null", () => {
    const llmTomorrow = makeTargetDate("tomorrow", "llm_explicit", 700);
    const result = dispatchCandidates({
      candidates: [llmTomorrow],
      actualToday: "today",
    });
    expect(result.selectedTargetDateCandidate).toBeNull();
    expect(result.systemDefaultGenerated).toBeNull();
    expect(result.rejected[0].reason).toBe("invalid_target_date");
  });

  it("valid candidate ≥ 1 件 → system_default 生成しない", () => {
    const llmValid = makeTargetDate("2026-05-10", "llm_explicit", 700);
    const result = dispatchCandidates({
      candidates: [llmValid],
      actualToday: "2026-05-06",
    });
    expect(result.systemDefaultGenerated).toBeNull();
    expect(result.selectedTargetDateCandidate).toBe(llmValid);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. tie-break (= priority / confidence / source / stable order)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCandidates (OP-4) — tie-break 4 段階", () => {
  it("priority 異なる → 高 priority 採用、 低 priority は lower_priority", () => {
    const high = makeTargetDate("2026-05-06", "llm_explicit", 700, "high");
    const low = makeTargetDate("2026-05-07", "regex_deterministic", 600, "high");
    const result = dispatchCandidates({
      candidates: [low, high],
      actualToday: "2026-05-08",
    });
    expect(result.selectedTargetDateCandidate).toBe(high);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].envelope).toBe(low);
    expect(result.rejected[0].reason).toBe("lower_priority");
  });

  it("priority 同値 + confidence 異なる → high confidence 採用", () => {
    const highConf = makeTargetDate("2026-05-06", "llm_explicit", 500, "high");
    const medConf = makeTargetDate("2026-05-07", "llm_explicit", 500, "medium");
    const result = dispatchCandidates({
      candidates: [medConf, highConf],
      actualToday: "2026-05-08",
    });
    expect(result.selectedTargetDateCandidate).toBe(highConf);
    expect(result.rejected[0].reason).toBe("lower_confidence");
  });

  it("priority + confidence 同値 + source 異なる → source 順", () => {
    // ui_action (1) > llm_explicit (3) で勝ち
    const ui = makeJourneyOrigin("自宅", "ui_action", 1000, "high");
    const llm = makeJourneyOrigin("ホテル", "llm_explicit", 1000, "high");
    const result = dispatchCandidates({
      candidates: [llm, ui],
      actualToday: "2026-05-06",
    });
    expect(result.selectedJourneyOriginCandidate).toBe(ui);
    const llmReject = result.rejected.find((r) => r.envelope === llm);
    expect(llmReject?.reason).toBe("source_tie_break_loser");
  });

  it("priority + confidence + source 同値 → input 順 (= stable order)", () => {
    const first = makeJourneyOrigin("自宅", "llm_explicit", 700, "high");
    const second = makeJourneyOrigin("ホテル", "llm_explicit", 700, "high");
    const result = dispatchCandidates({
      candidates: [first, second],
      actualToday: "2026-05-06",
    });
    expect(result.selectedJourneyOriginCandidate).toBe(first);
    expect(result.rejected.find((r) => r.envelope === second)?.reason).toBe(
      "stable_order_loser",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. journey origin / end + resolve_place_candidate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCandidates (OP-4) — journey origin / end / resolve_place_candidate", () => {
  it("set_journey_origin と resolve_place_candidate(slot=origin) が同じ field reduce", () => {
    const llmOrigin = makeJourneyOrigin("自宅", "llm_explicit", 700);
    const uiOrigin = makeResolvePlace("origin", "東京駅丸の内口", "ui_action", 1000);
    const result = dispatchCandidates({
      candidates: [llmOrigin, uiOrigin],
      actualToday: "2026-05-06",
    });
    expect(result.selectedJourneyOriginCandidate).toBe(uiOrigin);
    expect(result.rejected.find((r) => r.envelope === llmOrigin)?.reason).toBe(
      "lower_priority",
    );
  });

  it("resolve_place_candidate(slot=end) は journeyEnd に流れる", () => {
    const uiEnd = makeResolvePlace("end", "ホテル", "ui_action", 1000);
    const result = dispatchCandidates({
      candidates: [uiEnd],
      actualToday: "2026-05-06",
    });
    expect(result.selectedJourneyEndCandidate).toBe(uiEnd);
  });

  it("resolve_place_candidate(slot=where) は unhandled_slot_for_op4 で reject", () => {
    const uiWhere = makeResolvePlace("where", "渋谷スクランブル", "ui_action", 1000);
    const result = dispatchCandidates({
      candidates: [uiWhere],
      actualToday: "2026-05-06",
    });
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].envelope).toBe(uiWhere);
    expect(result.rejected[0].reason).toBe("unhandled_slot_for_op4");
    expect(result.selectedJourneyOriginCandidate).toBeNull();
    expect(result.selectedJourneyEndCandidate).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. add_travel_edge: input order 保持、 sort / merge / dedupe しない (= 修正 2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCandidates (OP-4) — add_travel_edge input order 保持", () => {
  it("複数 travel edge が input order で保持される", () => {
    const morning = makeTravelEdge("自宅", "東京駅", "08:00", "llm_explicit", 700);
    const noon = makeTravelEdge("東京駅", "渋谷", "12:00", "llm_explicit", 700);
    const evening = makeTravelEdge("渋谷", "新宿", "18:00", "llm_explicit", 700);
    const result = dispatchCandidates({
      candidates: [morning, noon, evening],
      actualToday: "2026-05-06",
    });
    expect(result.selectedTravelEdgeCandidates).toEqual([morning, noon, evening]);
  });

  it("priority 異なっても sort しない (= input order 保持)", () => {
    const lowPriEarly = makeTravelEdge("自宅", "東京駅", "08:00", "regex_deterministic", 500);
    const highPriLate = makeTravelEdge("渋谷", "新宿", "18:00", "llm_explicit", 700);
    const result = dispatchCandidates({
      candidates: [lowPriEarly, highPriLate],
      actualToday: "2026-05-06",
    });
    // 元 input 順を保持 (= 朝の edge が先)
    expect(result.selectedTravelEdgeCandidates).toEqual([lowPriEarly, highPriLate]);
  });

  it("同じ segmentOrigin / Destination の重複 edge も dedupe しない", () => {
    const dup1 = makeTravelEdge("東京駅", "渋谷", "08:00", "llm_explicit", 700);
    const dup2 = makeTravelEdge("東京駅", "渋谷", "08:00", "regex_deterministic", 600);
    const result = dispatchCandidates({
      candidates: [dup1, dup2],
      actualToday: "2026-05-06",
    });
    expect(result.selectedTravelEdgeCandidates).toHaveLength(2);
    expect(result.selectedTravelEdgeCandidates).toEqual([dup1, dup2]);
  });

  it("travel edge は rejected に入らない (= 全候補保持)", () => {
    const e1 = makeTravelEdge("A", "B", "08:00", "llm_explicit", 700);
    const e2 = makeTravelEdge("B", "C", "12:00", "llm_explicit", 700);
    const result = dispatchCandidates({
      candidates: [e1, e2],
      actualToday: "2026-05-06",
    });
    const travelRejects = result.rejected.filter(
      (r) => r.envelope.type === "add_travel_edge",
    );
    expect(travelRejects).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. add_travel_edge と journeyOrigin / journeyEnd の構造的分離 (= PR #75 不変条件)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCandidates (OP-4) — segmentOrigin → journeyOrigin 不変条件", () => {
  it("add_travel_edge のみ → selectedJourneyOrigin null (= segmentOrigin が昇格しない)", () => {
    const edge = makeTravelEdge("東京駅", "渋谷", "08:00");
    const result = dispatchCandidates({
      candidates: [edge],
      actualToday: "2026-05-06",
    });
    expect(result.selectedJourneyOriginCandidate).toBeNull();
    expect(result.selectedJourneyEndCandidate).toBeNull();
    expect(result.selectedTravelEdgeCandidates).toEqual([edge]);
  });

  it("add_travel_edge の segmentOrigin label が selectedJourneyOriginCandidate に流れない", () => {
    const edge = makeTravelEdge("東京駅", "渋谷", "08:00");
    const result = dispatchCandidates({
      candidates: [edge],
      actualToday: "2026-05-06",
    });
    expect(result.selectedJourneyOriginCandidate).toBeNull();
    // 念のため travel edge は travel として返る
    expect(result.selectedTravelEdgeCandidates[0].payload.segmentOrigin.label).toBe(
      "東京駅",
    );
  });

  it("add_travel_edge + set_journey_origin 混在 → 各 field に正しく振り分け", () => {
    const edge = makeTravelEdge("東京駅", "渋谷", "08:00");
    const explicitOrigin = makeJourneyOrigin("自宅", "llm_explicit", 700);
    const result = dispatchCandidates({
      candidates: [edge, explicitOrigin],
      actualToday: "2026-05-06",
    });
    expect(result.selectedJourneyOriginCandidate).toBe(explicitOrigin);
    expect(result.selectedTravelEdgeCandidates).toEqual([edge]);
  });

  it("add_travel_edge の segmentDestination が journeyEnd に流れない", () => {
    const edge = makeTravelEdge("東京駅", "渋谷", "08:00");
    const result = dispatchCandidates({
      candidates: [edge],
      actualToday: "2026-05-06",
    });
    expect(result.selectedJourneyEndCandidate).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. pure function 検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCandidates (OP-4) — pure function", () => {
  it("input mutate しない", () => {
    const candidates: OperationEnvelope<PlanOperationCandidate>[] = [
      makeTargetDate("2026-05-06", "llm_explicit", 700),
      makeTravelEdge("A", "B", "08:00"),
      makeJourneyOrigin("自宅"),
    ];
    const input: DispatchInput = {
      candidates,
      actualToday: "2026-05-06",
    };
    const snapshot = JSON.stringify(input);
    dispatchCandidates(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("同じ input で同じ output (= deterministic)", () => {
    const input: DispatchInput = {
      candidates: [
        makeTargetDate("2026-05-06", "llm_explicit", 700),
        makeJourneyOrigin("自宅", "llm_explicit", 700),
      ],
      actualToday: "2026-05-06",
    };
    const r1 = dispatchCandidates(input);
    const r2 = dispatchCandidates(input);
    expect(r1).toEqual(r2);
  });

  it("採用 envelope の reference は input 由来 (= dispatcher が新規生成しない)", () => {
    const td = makeTargetDate("2026-05-06", "llm_explicit", 700);
    const result = dispatchCandidates({
      candidates: [td],
      actualToday: "2026-05-07",
    });
    expect(result.selectedTargetDateCandidate).toBe(td);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. 採用 envelope の provenance / trace は pass-through
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCandidates (OP-4) — provenance / trace pass-through", () => {
  it("採用 envelope の provenance は元 envelope の値そのまま", () => {
    const td = makeTargetDate("2026-05-06", "llm_explicit", 700);
    const result = dispatchCandidates({
      candidates: [td],
      actualToday: "2026-05-07",
    });
    expect(result.selectedTargetDateCandidate?.provenance).toBe(td.provenance);
  });

  it("system_default の provenance は inferred", () => {
    const result = dispatchCandidates({
      candidates: [],
      actualToday: "2026-05-06",
    });
    expect(result.selectedTargetDateCandidate?.provenance.source_type).toBe("inferred");
    expect(result.selectedTargetDateCandidate?.provenance.from_utterance).toBe(false);
  });

  it("system_default の trace.ruleId === 'systemDefault'", () => {
    const result = dispatchCandidates({
      candidates: [],
      actualToday: "2026-05-06",
    });
    expect(result.selectedTargetDateCandidate?.trace?.ruleId).toBe("systemDefault");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. RejectReason union 値検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCandidates (OP-4) — RejectReason union 6 種", () => {
  it("RejectReason は 6 種のみ", () => {
    const reasons: RejectReason[] = [
      "lower_priority",
      "lower_confidence",
      "source_tie_break_loser",
      "stable_order_loser",
      "unhandled_slot_for_op4",
      "invalid_target_date",
    ];
    expect(reasons).toHaveLength(6);
  });
});
