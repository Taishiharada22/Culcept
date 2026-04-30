/**
 * Morning Turn Trace Builder tests — W3 Commit 16-T
 *
 * 検証範囲（CEO 修正条件: builder は記録者であって判定者ではない）:
 *   1. 受け取った値を field 1:1 でコピーする（再構築 / 並び替え / 名前変更なし）。
 *   2. **矛盾入力でも訂正しない**（記録者責務の機械的検証）:
 *      - phase=plan_presented なのに promote.fired=true でも、そのまま記録する。
 *      - shadow.dispatched=false なのに selectResult が non-null でも記録する。
 *      - dispatched=true でも prevFocus/nextFocus が null でも記録する。
 *   3. 入力を mutate しない（pure 性）。
 *   4. 戻り値は input と異なる新規オブジェクト（shallow copy）。
 *   5. shadow / dispatch / promote / flagSnapshot の各 field がそのまま透過する。
 */

import { describe, test, expect } from "vitest";
import { buildMorningTurnTrace } from "@/lib/alter-morning/dialog/morningTurnTraceBuilder";
import type { AlterMorningFlagSnapshot } from "@/lib/alter-morning/dialog/flags";
import type { MorningTurnTrace } from "@/lib/alter-morning/types";

const NOW = "2026-04-30T00:00:00.000Z";

function mkFlagSnapshot(
  overrides: Partial<AlterMorningFlagSnapshot> = {},
): AlterMorningFlagSnapshot {
  return {
    dialogStateV2: { enabled: true, source: "env" },
    placesSearch: {
      rawEnabled: true,
      effectiveEnabled: true,
      source: "env",
      gatedByDialogStateV2: false,
    },
    allowlistChecked: false,
    evaluatedAt: NOW,
    ...overrides,
  };
}

function mkInput(
  overrides: Partial<MorningTurnTrace> = {},
): MorningTurnTrace {
  return {
    flagSnapshot: mkFlagSnapshot(),
    dialogStateAvailable: true,
    placesHandoffEligible: true,
    activeDialogPath: "dialogStateV2",
    pendingClarifySource: "derived_from_focus",
    shadow: {
      dispatched: true,
      skipReason: null,
      selectResult: {
        chosenTargetEventId: "event_1",
        canContinueFocus: true,
        reason: "continue_focus",
      },
      prevFocus: { event_id: "event_1", slot: "where", narrowStep: 0 },
      nextFocus: { event_id: "event_1", slot: "where", narrowStep: 1 },
      prevConvStatus: "clarifying",
      nextConvStatus: "narrowing",
      capturedSubKind: "anchor_alone",
      progressDelta: "advanced",
    },
    promote: {
      fired: true,
      skipReason: null,
    },
    dispatch: {
      comprehensionEventCount: 1,
      operationsExtracted: 0,
      persistedEventCountBefore: 0,
      persistedEventCountAfter: 1,
      eventsFallback: false,
    },
    responsePhase: "clarifying",
    pipeline: {
      outerAlterMode: "warm",
      morningIntentDetected: true,
      morningPipelineCalled: true,
      morningPipelineSkipReason: null,
      priorEventsMode: false,
      comprehensionProviderCalled: true,
      providerSkipReason: null,
      providerName: null,
      providerSuccess: true,
      providerFailureReason: null,
      providerLatencyMs: 120,
      rawEventCount: 1,
      schemaValidationErrors: null,
      eventsAfterNormalizationCount: 1,
      droppedEvents: null,
      targetDateExtracted: "2026-05-01",
      targetDateSource: "llm",
      persistedEventCountBefore: 0,
      persistedEventCountAfter: 1,
      pipelineStatus: "ok",
    },
    ...overrides,
  };
}

describe("buildMorningTurnTrace — 1:1 コピー検証", () => {
  test("正常入力: field 全てがそのまま透過する", () => {
    const input = mkInput();
    const trace = buildMorningTurnTrace(input);
    expect(trace).toEqual(input);
  });

  test("flagSnapshot は深い構造ごとそのまま埋まる", () => {
    const fs = mkFlagSnapshot({
      dialogStateV2: { enabled: false, source: "default_off" },
      placesSearch: {
        rawEnabled: true,
        effectiveEnabled: false,
        source: "env",
        gatedByDialogStateV2: true,
      },
    });
    const trace = buildMorningTurnTrace(mkInput({ flagSnapshot: fs }));
    expect(trace.flagSnapshot).toEqual(fs);
  });

  test("dispatch=null も維持される（dispatch が走らなかった turn の表現）", () => {
    const trace = buildMorningTurnTrace(mkInput({ dispatch: null }));
    expect(trace.dispatch).toBeNull();
  });

  test("dispatch 内の個別 field が null も維持される（取れない値を 0 偽装しない）", () => {
    // CEO 修正条件: 「実際に存在しない値は 0 で偽装しない、取れないなら null」
    const trace = buildMorningTurnTrace(
      mkInput({
        dispatch: {
          comprehensionEventCount: 2,
          operationsExtracted: null, // wave3-pr8 で route 直接保持しない場合
          persistedEventCountBefore: null, // dispatch 前の値を route が取れない場合
          persistedEventCountAfter: 3,
          eventsFallback: null, // PR-50 概念、wave3-pr8 未実装の場合
        },
      }),
    );
    expect(trace.dispatch?.comprehensionEventCount).toBe(2);
    expect(trace.dispatch?.operationsExtracted).toBeNull();
    expect(trace.dispatch?.persistedEventCountBefore).toBeNull();
    expect(trace.dispatch?.persistedEventCountAfter).toBe(3);
    expect(trace.dispatch?.eventsFallback).toBeNull();
  });

  test("shadow.prevFocus / nextFocus が null も維持される", () => {
    const trace = buildMorningTurnTrace(
      mkInput({
        shadow: {
          dispatched: true,
          skipReason: null,
          selectResult: null,
          prevFocus: null,
          nextFocus: null,
          prevConvStatus: null,
          nextConvStatus: null,
          capturedSubKind: null,
          progressDelta: null,
        },
      }),
    );
    expect(trace.shadow.prevFocus).toBeNull();
    expect(trace.shadow.nextFocus).toBeNull();
    expect(trace.shadow.prevConvStatus).toBeNull();
    expect(trace.shadow.nextConvStatus).toBeNull();
    expect(trace.shadow.capturedSubKind).toBeNull();
    expect(trace.shadow.progressDelta).toBeNull();
  });
});

describe("buildMorningTurnTrace — 記録者責務（矛盾入力で訂正しない）", () => {
  // CEO 修正条件: builder は判定者にならない。
  // 矛盾値を入れても builder が訂正・補完しないことを構造的に検証する。

  test("phase=plan_presented + promote.fired=true でも訂正されない", () => {
    // 本来 promote は phase=clarifying でしか発火しないはず。
    // しかし builder は判定者ではないので、矛盾を訂正せずそのまま記録する。
    const trace = buildMorningTurnTrace(
      mkInput({
        responsePhase: "plan_presented",
        promote: { fired: true, skipReason: null },
      }),
    );
    expect(trace.responsePhase).toBe("plan_presented");
    expect(trace.promote.fired).toBe(true);  // 訂正されず true のまま
    expect(trace.promote.skipReason).toBeNull();
  });

  test("shadow.dispatched=false + selectResult が non-null でも訂正されない", () => {
    // 本来 dispatched=false なら selectResult は null のはず。
    // builder は矛盾を訂正しない。
    const trace = buildMorningTurnTrace(
      mkInput({
        shadow: {
          dispatched: false,
          skipReason: "flag_off",
          selectResult: {
            chosenTargetEventId: "event_X",
            canContinueFocus: true,
            reason: "continue_focus",
          },
          prevFocus: null,
          nextFocus: null,
          prevConvStatus: null,
          nextConvStatus: null,
          capturedSubKind: null,
          progressDelta: null,
        },
      }),
    );
    expect(trace.shadow.dispatched).toBe(false);
    expect(trace.shadow.selectResult).not.toBeNull();
    expect(trace.shadow.selectResult?.chosenTargetEventId).toBe("event_X");
  });

  test("flag.placesSearch.effectiveEnabled=true + dialogStateV2.enabled=false の矛盾も訂正されない", () => {
    // AND gate 違反だが、builder は flag の整合性検証を行わない。
    // 整合性は evaluateAlterMorningFlags の責務（snapshot 評価時に保証）。
    const fs = mkFlagSnapshot({
      dialogStateV2: { enabled: false, source: "env" },
      placesSearch: {
        rawEnabled: true,
        effectiveEnabled: true, // 矛盾値: ds=false なのに effective=true
        source: "env",
        gatedByDialogStateV2: false, // 矛盾値: ds=false ∧ raw=true なのに gated=false
      },
    });
    const trace = buildMorningTurnTrace(mkInput({ flagSnapshot: fs }));
    expect(trace.flagSnapshot.placesSearch.effectiveEnabled).toBe(true);
    expect(trace.flagSnapshot.placesSearch.gatedByDialogStateV2).toBe(false);
  });

  test("activeDialogPath=dialogStateV2 + promote.fired=false でも訂正されない", () => {
    // 本来 dialogStateV2 path = promote 発火が条件のはず。
    // しかし builder は判定しない。caller (route.ts) の責務。
    const trace = buildMorningTurnTrace(
      mkInput({
        activeDialogPath: "dialogStateV2",
        promote: { fired: false, skipReason: "phase_not_clarifying" },
      }),
    );
    expect(trace.activeDialogPath).toBe("dialogStateV2");
    expect(trace.promote.fired).toBe(false);
  });
});

describe("buildMorningTurnTrace — pure 性", () => {
  test("入力を mutate しない", () => {
    const input = mkInput();
    const inputClone = JSON.parse(JSON.stringify(input));
    buildMorningTurnTrace(input);
    expect(input).toEqual(inputClone);
  });

  test("戻り値は入力とは別オブジェクト（top-level shallow copy）", () => {
    const input = mkInput();
    const trace = buildMorningTurnTrace(input);
    expect(trace).not.toBe(input);
    // shadow / promote は内部で再構築されるため別参照
    expect(trace.shadow).not.toBe(input.shadow);
    expect(trace.promote).not.toBe(input.promote);
  });

  test("同 input で 2 回呼んでも結果が等価（決定論）", () => {
    const input = mkInput();
    const a = buildMorningTurnTrace(input);
    const b = buildMorningTurnTrace(input);
    expect(a).toEqual(b);
  });
});

describe("buildMorningTurnTrace — 全 activeDialogPath / pendingClarifySource enum", () => {
  test("activeDialogPath=legacyPendingClarify", () => {
    const trace = buildMorningTurnTrace(
      mkInput({ activeDialogPath: "legacyPendingClarify" }),
    );
    expect(trace.activeDialogPath).toBe("legacyPendingClarify");
  });

  test("activeDialogPath=hybrid_promote_skipped", () => {
    const trace = buildMorningTurnTrace(
      mkInput({ activeDialogPath: "hybrid_promote_skipped" }),
    );
    expect(trace.activeDialogPath).toBe("hybrid_promote_skipped");
  });

  test("pendingClarifySource=legacy_persisted", () => {
    const trace = buildMorningTurnTrace(
      mkInput({ pendingClarifySource: "legacy_persisted" }),
    );
    expect(trace.pendingClarifySource).toBe("legacy_persisted");
  });

  test("pendingClarifySource=null", () => {
    const trace = buildMorningTurnTrace(
      mkInput({ pendingClarifySource: "null" }),
    );
    expect(trace.pendingClarifySource).toBe("null");
  });
});

describe("buildMorningTurnTrace — pipeline field (Commit 16.1-T)", () => {
  test("pipeline=null も維持される (pipeline trace 取得しなかった turn)", () => {
    const trace = buildMorningTurnTrace(mkInput({ pipeline: null }));
    expect(trace.pipeline).toBeNull();
  });

  test("pipeline 全 field が transparent にコピーされる", () => {
    const input = mkInput();
    const trace = buildMorningTurnTrace(input);
    expect(trace.pipeline).toEqual(input.pipeline);
  });

  test("Case A: morningPipeline 未呼び出し (Stargazer 経路)", () => {
    // 期待 trace: morning pipeline がそもそも呼ばれていない
    const trace = buildMorningTurnTrace(
      mkInput({
        pipeline: {
          outerAlterMode: "warm",
          morningIntentDetected: false,
          morningPipelineCalled: false,
          morningPipelineSkipReason: "not_morning_intent",
          priorEventsMode: null,
          comprehensionProviderCalled: null,
          providerSkipReason: null,
          providerName: null,
          providerSuccess: null,
          providerFailureReason: null,
          providerLatencyMs: null,
          rawEventCount: null,
          schemaValidationErrors: null,
          eventsAfterNormalizationCount: null,
          droppedEvents: null,
          targetDateExtracted: null,
          targetDateSource: null,
          persistedEventCountBefore: null,
          persistedEventCountAfter: null,
          pipelineStatus: null,
        },
      }),
    );
    expect(trace.pipeline?.morningPipelineCalled).toBe(false);
    expect(trace.pipeline?.morningPipelineSkipReason).toBe("not_morning_intent");
    expect(trace.pipeline?.comprehensionProviderCalled).toBeNull();
  });

  test("Case B: pipeline 呼ばれたが provider 未呼び出し", () => {
    const trace = buildMorningTurnTrace(
      mkInput({
        pipeline: {
          outerAlterMode: "warm",
          morningIntentDetected: true,
          morningPipelineCalled: true,
          morningPipelineSkipReason: null,
          priorEventsMode: true,
          comprehensionProviderCalled: false,
          providerSkipReason: "prior_events_mode",
          providerName: null,
          providerSuccess: null,
          providerFailureReason: null,
          providerLatencyMs: null,
          rawEventCount: 0,
          schemaValidationErrors: null,
          eventsAfterNormalizationCount: 0,
          droppedEvents: null,
          targetDateExtracted: "2026-05-01",
          targetDateSource: "fallback",
          persistedEventCountBefore: 0,
          persistedEventCountAfter: 0,
          pipelineStatus: "ok",
        },
      }),
    );
    expect(trace.pipeline?.priorEventsMode).toBe(true);
    expect(trace.pipeline?.comprehensionProviderCalled).toBe(false);
    expect(trace.pipeline?.providerSkipReason).toBe("prior_events_mode");
  });

  test("Case C: provider 呼ばれたが raw events=0", () => {
    const trace = buildMorningTurnTrace(
      mkInput({
        pipeline: {
          outerAlterMode: "warm",
          morningIntentDetected: true,
          morningPipelineCalled: true,
          morningPipelineSkipReason: null,
          priorEventsMode: false,
          comprehensionProviderCalled: true,
          providerSkipReason: null,
          providerName: null,
          providerSuccess: true,
          providerFailureReason: null,
          providerLatencyMs: 350,
          rawEventCount: 0,
          schemaValidationErrors: null,
          eventsAfterNormalizationCount: 0,
          droppedEvents: null,
          targetDateExtracted: "2026-05-01",
          targetDateSource: "llm",
          persistedEventCountBefore: 0,
          persistedEventCountAfter: 0,
          pipelineStatus: "ok",
        },
      }),
    );
    expect(trace.pipeline?.providerSuccess).toBe(true);
    expect(trace.pipeline?.rawEventCount).toBe(0);
    expect(trace.pipeline?.eventsAfterNormalizationCount).toBe(0);
  });

  test("Case D: raw events>0 だが normalization で 0 になった (drop)", () => {
    const trace = buildMorningTurnTrace(
      mkInput({
        pipeline: {
          outerAlterMode: "warm",
          morningIntentDetected: true,
          morningPipelineCalled: true,
          morningPipelineSkipReason: null,
          priorEventsMode: false,
          comprehensionProviderCalled: true,
          providerSkipReason: null,
          providerName: null,
          providerSuccess: true,
          providerFailureReason: null,
          providerLatencyMs: 280,
          rawEventCount: 2,
          schemaValidationErrors: ["invalid_when_format", "missing_where"],
          eventsAfterNormalizationCount: 0,
          droppedEvents: [
            { reason: "invalid_when_format", spanHint: null },
            { reason: "missing_where", spanHint: null },
          ],
          targetDateExtracted: "2026-05-01",
          targetDateSource: "llm",
          persistedEventCountBefore: 0,
          persistedEventCountAfter: 0,
          pipelineStatus: "ok",
        },
      }),
    );
    expect(trace.pipeline?.rawEventCount).toBe(2);
    expect(trace.pipeline?.eventsAfterNormalizationCount).toBe(0);
    expect(trace.pipeline?.droppedEvents).toHaveLength(2);
  });

  test("provider null 返却 (comprehension_failed)", () => {
    const trace = buildMorningTurnTrace(
      mkInput({
        pipeline: {
          outerAlterMode: "warm",
          morningIntentDetected: true,
          morningPipelineCalled: true,
          morningPipelineSkipReason: null,
          priorEventsMode: false,
          comprehensionProviderCalled: true,
          providerSkipReason: null,
          providerName: null,
          providerSuccess: false,
          providerFailureReason: null,
          providerLatencyMs: 8500,
          rawEventCount: null,
          schemaValidationErrors: null,
          eventsAfterNormalizationCount: 0,
          droppedEvents: null,
          targetDateExtracted: null,
          targetDateSource: null,
          persistedEventCountBefore: 0,
          persistedEventCountAfter: 0,
          pipelineStatus: "comprehension_failed",
        },
      }),
    );
    expect(trace.pipeline?.providerSuccess).toBe(false);
    expect(trace.pipeline?.rawEventCount).toBeNull();
    expect(trace.pipeline?.pipelineStatus).toBe("comprehension_failed");
  });
});

describe("buildMorningTurnTrace — promote skipReason 全 case", () => {
  const skipReasons = [
    "phase_not_clarifying",
    "derived_null",
    "empty_question",
    "flag_off",
    "no_dialog_state",
  ];

  for (const reason of skipReasons) {
    test(`promote.skipReason="${reason}" がそのまま記録される`, () => {
      const trace = buildMorningTurnTrace(
        mkInput({
          promote: { fired: false, skipReason: reason },
        }),
      );
      expect(trace.promote.fired).toBe(false);
      expect(trace.promote.skipReason).toBe(reason);
    });
  }
});
