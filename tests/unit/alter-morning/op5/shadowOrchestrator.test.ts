/**
 * OP-5.1 shadowOrchestrator.test.ts — pure orchestrator の test
 *
 * 検証カテゴリ:
 *   1. 空入力 → factory 空起動 + dispatcher 結果空
 *   2. travel edge utterance → travelEdges に envelope 1 件
 *   3. day-origin utterance → journeyOrigin に envelope
 *   4. day-end utterance → journeyEnd に envelope
 *   5. 共存 (= 1 utterance で 3 type 全部 emit)
 *   6. dispatcher 結果が pass through される
 *   7. meta.factoriesInvoked / durationMs
 *   8. context-driven factory (= history / location / UI)
 *   9. PlanState 不書き込み invariant
 *   10. pure (= input mutate なし、 deterministic)
 */

import { describe, it, expect } from "vitest";
import {
  runShadowOrchestrator,
  type ShadowOrchestratorInput,
} from "@/lib/alter-morning/op5/shadowOrchestrator";
import type { MorningPlan } from "@/lib/alter-morning/types";
import type { HomeAnchor } from "@/lib/alter-morning/planning/transportContext";
import type { JourneyAnchorState } from "@/lib/alter-morning/journey/anchorState";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makePlan(
  date: string,
  journeyOrigin: JourneyAnchorState,
  journeyEnd: JourneyAnchorState,
): MorningPlan {
  return {
    date,
    items: [],
    dayConditions: {} as MorningPlan["dayConditions"],
    createdAt: "2026-05-06T00:00:00.000Z",
    confirmed: false,
    status: "provisional",
    journeyOrigin,
    journeyEnd,
  };
}

function baseInput(
  override: Partial<ShadowOrchestratorInput> = {},
): ShadowOrchestratorInput {
  return {
    utterance: "",
    actualToday: "2026-05-06",
    ...override,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 空入力 → 全 factory 起動 + 全 candidate 空 + dispatcher 結果空
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shadowOrchestrator (OP-5.1) — 空入力", () => {
  it("空 utterance + 全 context null → 全 emittedCandidates 空", () => {
    const result = runShadowOrchestrator(baseInput());
    expect(result.emittedCandidates.targetDate).toEqual([]);
    expect(result.emittedCandidates.journeyOrigin).toEqual([]);
    expect(result.emittedCandidates.journeyEnd).toEqual([]);
    expect(result.emittedCandidates.travelEdges).toEqual([]);
  });

  it("空 utterance + actualToday → dispatcher の system_default 採用", () => {
    const result = runShadowOrchestrator(baseInput({ actualToday: "2026-05-06" }));
    // 全 source unknown + actualToday valid → system_default 生成
    expect(result.dispatchResult.selectedTargetDateCandidate).not.toBeNull();
    expect(result.dispatchResult.selectedTargetDateCandidate?.payload.date).toBe(
      "2026-05-06",
    );
    expect(result.dispatchResult.systemDefaultGenerated).not.toBeNull();
  });

  it("空 utterance → factoriesInvoked 9 件", () => {
    const result = runShadowOrchestrator(baseInput());
    expect(result.meta.factoriesInvoked).toEqual([
      "regexTargetDate",
      "llmComprehensionTargetDate",
      "historyPriorPlan",
      "historyPreviousDay",
      "locationAnchor",
      "uiOriginAnswer",
      "travelEdgeFromTo",
      "explicitDayOrigin",
      "explicitDayEnd",
    ]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. travel edge utterance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shadowOrchestrator (OP-5.1) — travel edge utterance", () => {
  it("「東京駅から渋谷へ」 → travelEdges 1 件 emit", () => {
    const result = runShadowOrchestrator(
      baseInput({ utterance: "東京駅から渋谷へ" }),
    );
    expect(result.emittedCandidates.travelEdges).toHaveLength(1);
    const edge = result.emittedCandidates.travelEdges[0];
    expect(edge.type).toBe("add_travel_edge");
    expect(edge.payload.segmentOrigin.label).toBe("東京駅");
    expect(edge.payload.segmentDestination.label).toBe("渋谷");
  });

  it("travel edge utterance → journeyOrigin / journeyEnd には emit しない", () => {
    const result = runShadowOrchestrator(
      baseInput({ utterance: "東京駅から渋谷へ" }),
    );
    expect(result.emittedCandidates.journeyOrigin).toEqual([]);
    expect(result.emittedCandidates.journeyEnd).toEqual([]);
  });

  it("dispatcher が travel edge を input order 保持で pass する", () => {
    const result = runShadowOrchestrator(
      baseInput({ utterance: "東京駅から渋谷へ" }),
    );
    expect(result.dispatchResult.selectedTravelEdgeCandidates).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. day-origin utterance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shadowOrchestrator (OP-5.1) — day-origin utterance", () => {
  it("「自宅から始める」 → journeyOrigin に envelope 1 件", () => {
    const result = runShadowOrchestrator(
      baseInput({ utterance: "自宅から始める" }),
    );
    expect(result.emittedCandidates.journeyOrigin).toHaveLength(1);
    const env = result.emittedCandidates.journeyOrigin[0];
    expect(env.type).toBe("set_journey_origin");
  });

  it("dispatcher が day-origin を採用", () => {
    const result = runShadowOrchestrator(
      baseInput({ utterance: "自宅から始める" }),
    );
    expect(result.dispatchResult.selectedJourneyOriginCandidate).not.toBeNull();
    expect(
      result.dispatchResult.selectedJourneyOriginCandidate?.type,
    ).toBe("set_journey_origin");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. day-end utterance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shadowOrchestrator (OP-5.1) — day-end utterance", () => {
  it("「最後は自宅に帰る」 → journeyEnd に envelope 1 件", () => {
    const result = runShadowOrchestrator(
      baseInput({ utterance: "最後は自宅に帰る" }),
    );
    expect(result.emittedCandidates.journeyEnd).toHaveLength(1);
    const env = result.emittedCandidates.journeyEnd[0];
    expect(env.type).toBe("set_journey_end");
  });

  it("「ホテルで泊まる」 → journeyEnd 採用", () => {
    const result = runShadowOrchestrator(
      baseInput({ utterance: "ホテルで泊まる" }),
    );
    expect(result.dispatchResult.selectedJourneyEndCandidate).not.toBeNull();
    expect(result.dispatchResult.selectedJourneyEndCandidate?.type).toBe(
      "set_journey_end",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. 共存 (= 1 utterance で 3 type emit + targetDate)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shadowOrchestrator (OP-5.1) — 同 utterance 共存", () => {
  it("「自宅から始めて、 東京駅から渋谷へ、 夜はホテルで泊まる」 → 3 type emit", () => {
    const result = runShadowOrchestrator(
      baseInput({
        utterance: "自宅から始めて、東京駅から渋谷へ、夜はホテルで泊まる",
      }),
    );
    expect(result.emittedCandidates.journeyOrigin).toHaveLength(1);
    expect(result.emittedCandidates.travelEdges).toHaveLength(1);
    expect(result.emittedCandidates.journeyEnd).toHaveLength(1);

    expect(result.dispatchResult.selectedJourneyOriginCandidate).not.toBeNull();
    expect(result.dispatchResult.selectedJourneyEndCandidate).not.toBeNull();
    expect(result.dispatchResult.selectedTravelEdgeCandidates).toHaveLength(1);
  });

  it("「明日は自宅から始める」 → targetDate + day-origin 共存", () => {
    const result = runShadowOrchestrator(
      baseInput({ utterance: "明日は自宅から始める" }),
    );
    // regex targetDate factory が 「明日」 を捉える
    expect(result.emittedCandidates.targetDate.length).toBeGreaterThan(0);
    expect(result.emittedCandidates.journeyOrigin).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. context-driven factory (= history / location / UI)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shadowOrchestrator (OP-5.1) — context-driven factories", () => {
  it("homeAnchor 提供 → location factory が emit", () => {
    const homeAnchor: HomeAnchor = {
      lat: 35.6812,
      lng: 139.7671,
      label: "自宅",
      source: "registered_home",
    };
    const result = runShadowOrchestrator(baseInput({ homeAnchor }));
    // location factory は journeyOrigin に envelope を出す (= priority 100)
    expect(result.emittedCandidates.journeyOrigin.length).toBeGreaterThan(0);
  });

  it("priorPlan + samePlanDate=true → priorPlan factory が journeyOrigin に emit", () => {
    const plan = makePlan(
      "2026-05-06",
      {
        kind: "known_exact",
        label: "自宅",
        lat: 35.0,
        lng: 139.0,
        source: "user_declared",
      },
      {
        kind: "known_exact",
        label: "ホテル",
        lat: 35.1,
        lng: 139.1,
        source: "user_explicit_endpoint",
      },
    );
    const result = runShadowOrchestrator(
      baseInput({ priorPlan: plan, samePlanDate: true }),
    );
    // priorPlan factory は **journeyOrigin のみ** に envelope を出す
    // (= 既存設計、 set_journey_origin 専用 factory)
    expect(result.emittedCandidates.journeyOrigin.length).toBeGreaterThan(0);
  });

  it("UI clarify origin answer → uiOriginAnswer factory が resolve_place_candidate emit", () => {
    const result = runShadowOrchestrator(
      baseInput({
        clarifyAnswer: "自宅",
        clarifySlot: "origin",
        isOriginClarifyActive: true,
      }),
    );
    expect(result.emittedCandidates.journeyOrigin.length).toBeGreaterThan(0);
    const env = result.emittedCandidates.journeyOrigin[0];
    expect(env.type).toBe("resolve_place_candidate");
  });

  it("LLM targetDate + provenance → LLM factory が emit", () => {
    const result = runShadowOrchestrator(
      baseInput({
        llmTargetDate: "2026-05-07",
        llmTargetDateProvenance: {
          source_type: "utterance",
          source_span: ["明日"],
          provenance_confidence: "high",
          from_utterance: true,
        },
      }),
    );
    expect(result.emittedCandidates.targetDate.length).toBeGreaterThan(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. dispatcher pass-through
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shadowOrchestrator (OP-5.1) — dispatcher pass-through", () => {
  it("dispatchResult が DispatchResult shape を持つ", () => {
    const result = runShadowOrchestrator(baseInput());
    expect(result.dispatchResult).toHaveProperty(
      "selectedTargetDateCandidate",
    );
    expect(result.dispatchResult).toHaveProperty(
      "selectedJourneyOriginCandidate",
    );
    expect(result.dispatchResult).toHaveProperty(
      "selectedJourneyEndCandidate",
    );
    expect(result.dispatchResult).toHaveProperty(
      "selectedTravelEdgeCandidates",
    );
    expect(result.dispatchResult).toHaveProperty("systemDefaultGenerated");
    expect(result.dispatchResult).toHaveProperty("rejected");
    expect(Array.isArray(result.dispatchResult.rejected)).toBe(true);
  });

  it("rejected には dispatcher の reason が記録される", () => {
    // 「ホテルから東京駅へ」 + 「途中で会議室に集合」 のような場合の rejected
    // OP-5.1 では rejected の詳細検証は scope 外、 array 存在のみ確認
    const result = runShadowOrchestrator(
      baseInput({ utterance: "東京駅から渋谷へ" }),
    );
    expect(Array.isArray(result.dispatchResult.rejected)).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. meta
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shadowOrchestrator (OP-5.1) — meta", () => {
  it("factoriesInvoked 9 件 (= 全 factory 起動)", () => {
    const result = runShadowOrchestrator(baseInput());
    expect(result.meta.factoriesInvoked).toHaveLength(9);
  });

  it("durationMs は数値 0 以上", () => {
    const result = runShadowOrchestrator(baseInput());
    expect(typeof result.meta.durationMs).toBe("number");
    expect(result.meta.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("factoriesInvoked は readonly array (= 起動順固定)", () => {
    const result = runShadowOrchestrator(baseInput());
    // 起動順は orchestrator 内で固定。 OP-5 telemetry / debug 用。
    expect(result.meta.factoriesInvoked[0]).toBe("regexTargetDate");
    expect(
      result.meta.factoriesInvoked[result.meta.factoriesInvoked.length - 1],
    ).toBe("explicitDayEnd");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. 【CEO 重要規律】 PlanState 不書き込み + side effect なし
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shadowOrchestrator (OP-5.1) — 【CEO 重要規律】 PlanState 不書き込み", () => {
  it("【invariant】 result に PlanState や MorningPlan が含まれない", () => {
    const result = runShadowOrchestrator(
      baseInput({ utterance: "自宅から始めて、東京駅から渋谷へ" }),
    );
    // result の top-level keys は明示的に 3 つだけ
    expect(Object.keys(result).sort()).toEqual([
      "dispatchResult",
      "emittedCandidates",
      "meta",
    ]);
  });

  it("【invariant】 result に MorningPlan / journeyOrigin / journeyEnd top-level field なし", () => {
    const result = runShadowOrchestrator(baseInput());
    const top = result as unknown as Record<string, unknown>;
    expect(top.morningPlan).toBeUndefined();
    expect(top.plan).toBeUndefined();
    expect(top.planState).toBeUndefined();
    expect(top.journeyOrigin).toBeUndefined();
    expect(top.journeyEnd).toBeUndefined();
  });

  it("【invariant】 input MorningPlan を mutate しない", () => {
    const plan = makePlan(
      "2026-05-06",
      {
        kind: "known_exact",
        label: "自宅",
        lat: 35.0,
        lng: 139.0,
        source: "user_declared",
      },
      {
        kind: "known_exact",
        label: "ホテル",
        lat: 35.1,
        lng: 139.1,
        source: "user_explicit_endpoint",
      },
    );
    const snapshot = JSON.stringify(plan);
    runShadowOrchestrator(baseInput({ priorPlan: plan, samePlanDate: true }));
    expect(JSON.stringify(plan)).toBe(snapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. pure (= input mutate なし、 deterministic)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shadowOrchestrator (OP-5.1) — pure", () => {
  it("input を mutate しない (= 全 field)", () => {
    const input = baseInput({
      utterance: "自宅から始める",
      sourceTurnIndex: 1,
      llmTargetDate: "2026-05-06",
      clarifyAnswer: "test",
    });
    const snapshot = JSON.stringify(input);
    runShadowOrchestrator(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("同じ input で 2 回実行 → emittedCandidates / dispatchResult が一致 (= durationMs 除く)", () => {
    const input = baseInput({ utterance: "自宅から始めて、東京駅から渋谷へ" });
    const r1 = runShadowOrchestrator(input);
    const r2 = runShadowOrchestrator(input);
    expect(r1.emittedCandidates).toEqual(r2.emittedCandidates);
    expect(r1.dispatchResult).toEqual(r2.dispatchResult);
    expect(r1.meta.factoriesInvoked).toEqual(r2.meta.factoriesInvoked);
  });

  it("regex global state を残さない (= 連続呼び出しで同 result)", () => {
    runShadowOrchestrator(baseInput({ utterance: "東京駅から渋谷へ" }));
    const r = runShadowOrchestrator(
      baseInput({ utterance: "ホテルから新宿へ" }),
    );
    expect(r.emittedCandidates.travelEdges).toHaveLength(1);
    expect(r.emittedCandidates.travelEdges[0].payload.segmentOrigin.label).toBe(
      "ホテル",
    );
    expect(
      r.emittedCandidates.travelEdges[0].payload.segmentDestination.label,
    ).toBe("新宿");
  });
});
