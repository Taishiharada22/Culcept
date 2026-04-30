/**
 * priorContext を LLM prompt に流す pipeline 検証
 *
 * CEO 2026-04-28 PR #41a Layer 2:
 *   prior plan context を LLM に context として渡し、turn_mode を 3-way 判別可能にする。
 *
 * 検証観点:
 *   1. ComprehensionProvider.extract が priorContext optional 引数を受け取る
 *   2. runMorningPipeline が priorPlanForContext を簡略化形で provider に渡す
 *   3. priorPlanForContext === undefined → 既存挙動 (create-only)
 *   4. priorEvents (answerBinder) と priorPlanForContext は排他（priorEvents 優先で LLM skip）
 *   5. SYSTEM_PROMPT が turn_mode 3-way 判別ルールを含む
 *   6. duplicate 防止: 「prior は再抽出禁止」の文言が prompt に含まれる
 */

import { describe, it, expect } from "vitest";
import { runMorningPipeline } from "@/lib/alter-morning/morningPipeline";
import type {
  ComprehensionProvider,
  PriorEventContext,
} from "@/lib/alter-morning/morningPipeline";
import {
  type Event,
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

// 既存 LLM provider が import 不能 (server-only) なので、test では prompt 構築の
// 別 path を試す。SYSTEM_PROMPT の文字列検証は別 unit (生 import なら可) で行う。

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

describe("ComprehensionProvider.extract — priorContext optional 引数", () => {
  it("priorContext 未指定でも provider が呼べる (backward compat)", async () => {
    const provider: ComprehensionProvider = {
      async extract(_utterance, _hints, priorContext) {
        // priorContext は undefined であるべき
        expect(priorContext).toBeUndefined();
        return {
          targetDate: "today",
          events: [],
          startPoint: null,
          departureTime: null,
          goOut: null,
        };
      },
    };
    const result = await runMorningPipeline(
      { utterance: "test" },
      { comprehension: provider, weather: null },
    );
    expect(result.status).toBe("ok");
  });

  it("priorPlanForContext 渡される → provider が priorContext (簡略化形) を受け取る", async () => {
    const captured: PriorEventContext[] | undefined = [];
    let captureRef: PriorEventContext[] | undefined;
    const provider: ComprehensionProvider = {
      async extract(_utterance, _hints, priorContext) {
        captureRef = priorContext;
        return {
          targetDate: "today",
          events: [],
          startPoint: null,
          departureTime: null,
          goOut: null,
        };
      },
    };
    void captured;

    const priorEv = mkEvent({
      event_id: "evt_1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "TSUTAYA",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["TSUTAYA"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "カフェ",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
    });

    await runMorningPipeline(
      {
        utterance: "新宿でディナー",
        priorPlanForContext: [priorEv],
      },
      { comprehension: provider, weather: null },
    );

    // priorContext が渡されていることを確認
    expect(captureRef).toBeDefined();
    expect(captureRef).toHaveLength(1);
    expect(captureRef![0]).toEqual({
      event_id: "evt_1",
      startTime: "09:00",
      place_ref: "TSUTAYA",
      activity: "コーヒー",
    });
  });

  it("priorPlanForContext 空配列 → priorContext は undefined (簡略化形 0 件は context 無し扱い)", async () => {
    let captureRef: PriorEventContext[] | undefined = undefined;
    let called = false;
    const provider: ComprehensionProvider = {
      async extract(_utterance, _hints, priorContext) {
        called = true;
        captureRef = priorContext;
        return {
          targetDate: "today",
          events: [],
          startPoint: null,
          departureTime: null,
          goOut: null,
        };
      },
    };
    await runMorningPipeline(
      { utterance: "test", priorPlanForContext: [] },
      { comprehension: provider, weather: null },
    );
    expect(called).toBe(true);
    expect(captureRef).toBeUndefined();
  });

  it("priorEvents (answerBinder) 渡される → LLM 呼ばれない (provider 未呼び出し)", async () => {
    let called = false;
    const provider: ComprehensionProvider = {
      async extract() {
        called = true;
        return null;
      },
    };
    const priorEv = mkEvent({ event_id: "evt_1" });
    const result = await runMorningPipeline(
      {
        utterance: "電車",
        priorEvents: [priorEv],
      },
      { comprehension: provider, weather: null },
    );
    expect(called).toBe(false); // LLM skip (answerBinder mode)
    expect(result.status).toBe("ok");
  });

  it("priorEvents + priorPlanForContext 両指定 → priorEvents が優先 (LLM skip、context は無視)", async () => {
    let called = false;
    const provider: ComprehensionProvider = {
      async extract() {
        called = true;
        return null;
      },
    };
    const priorEv = mkEvent({ event_id: "evt_1" });
    await runMorningPipeline(
      {
        utterance: "test",
        priorEvents: [priorEv],
        priorPlanForContext: [priorEv],
      },
      { comprehension: provider, weather: null },
    );
    // priorEvents 優先で LLM 呼ばれない
    expect(called).toBe(false);
  });

  it("priorContext は coordinates / who 名 を含まない (PII 配慮の簡略化形)", async () => {
    let captureRef: PriorEventContext[] | undefined = undefined;
    const provider: ComprehensionProvider = {
      async extract(_utterance, _hints, priorContext) {
        captureRef = priorContext;
        return {
          targetDate: "today",
          events: [],
          startPoint: null,
          departureTime: null,
          goOut: null,
        };
      },
    };
    const priorEv = mkEvent({
      event_id: "evt_1",
      who: ["田中太郎", "佐藤花子"],
      transport: "電車",
      where: {
        place_ref: "TSUTAYA",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.6587, lng: 139.6997 },
        provenance: inferredProvenance(),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "カフェ",
        provenance: inferredProvenance(),
      },
    });
    await runMorningPipeline(
      { utterance: "x", priorPlanForContext: [priorEv] },
      { comprehension: provider, weather: null },
    );

    expect(captureRef).toBeDefined();
    const ctx = captureRef![0] as PriorEventContext;
    // 含まれる field
    expect(ctx).toHaveProperty("event_id");
    expect(ctx).toHaveProperty("startTime");
    expect(ctx).toHaveProperty("place_ref");
    expect(ctx).toHaveProperty("activity");
    // 含まれない field (PII 配慮)
    expect(ctx).not.toHaveProperty("coordinates");
    expect(ctx).not.toHaveProperty("who");
    expect(ctx).not.toHaveProperty("transport");
    expect(ctx).not.toHaveProperty("provenance");
  });
});
