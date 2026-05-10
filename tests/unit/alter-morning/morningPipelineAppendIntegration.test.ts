/**
 * morningPipeline — deterministic append integration tests (PR A Commit 6)
 *
 * Goal:
 *   morningPipeline で priorDialogState から 5 条件 active context check を行い、
 *   stable context (5 条件すべて clear) なら allowDeterministicAppend=true、
 *   さもなくば false を synthesizeOperations に渡すことを実証する。
 *
 * 実機合格条件 (CEO/GPT 2026-05-02):
 *   - T24: stable context で「12時に新宿でランチ」 → deterministic_append 発火 (= GPT (1) 必須証明)
 *   - T21-T23, T25: 各 active context では allow=false → append 抑制
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  runMorningPipeline,
  createStubComprehensionProvider,
} from "@/lib/alter-morning/morningPipeline";
import {
  resetEventCounter,
  utteranceProvenance,
  toolProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import { stubNarrationProvider } from "@/lib/alter-morning/expression/narration";
import type { L1PipelineInput } from "@/lib/alter-morning/comprehension/l1Pipeline";
import type { DialogState } from "@/lib/alter-morning/dialog/types";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  resetEventCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

function mkStableDialogState(): DialogState {
  return {
    version: 1,
    focus: null,
    conversationStatus: "stable",
    capturedHistory: [],
    semanticMissStreak: 0,
    providerFailureStreak: 0,
    lastGoodPlan: null,
    searchQueryDraft: {
      anchorRegion: null,
      categoryToken: null,
      chainToken: null,
      readyForHandoff: false,
    },
    activePresentation: null,
    parkedPresentations: [],
    lastFailedSearch: null,
    zeroCandidateMissCount: 0,
  };
}

// LLM provider stub: events 空 / operations 空を返す (LLM 揺らぎ再現)
function emptyComprehensionProvider() {
  return createStubComprehensionProvider({
    targetDate: "2026-05-02",
    startPoint: null,
    departureTime: null,
    goOut: true,
    operations: [],
    events: [],
  } as L1PipelineInput["raw"]);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("morningPipeline — deterministic append integration (PR A Commit 6)", () => {
  it("T24 [GPT 必須証明]: stable context で「12時に新宿でランチ」 → deterministic_append 発火", async () => {
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "12時に新宿でランチ",
        priorPlanForContext: [mkPriorEvent()],
        priorPendingClarify: null,
        priorDialogState: mkStableDialogState(),
      },
      {
        comprehension: emptyComprehensionProvider(), // LLM 空
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    expect(pipelineResult.comprehension?.operationsSynthesisSource).toBe(
      "deterministic_append",
    );
    expect(pipelineResult.comprehension?.operations).toHaveLength(1);
    expect(pipelineResult.comprehension?.operations?.[0]?.type).toBe("append");
    if (pipelineResult.comprehension?.operations?.[0]?.type === "append") {
      const draft = pipelineResult.comprehension.operations[0].eventDraft;
      expect(draft.when.startTime).toBe("12:00");
      expect(draft.where.place_ref).toBe("新宿");
      expect(draft.what.activity).toBe("ランチ");
    }
  });

  it("T21: activePresentation あり → allow=false → append 不発", async () => {
    const ds = mkStableDialogState();
    ds.activePresentation = {
      targetEventId: "event_99",
      queryFingerprint: "fp_old",
      candidates: [],
      presentedAtTurn: 1,
    };
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "12時に新宿でランチ",
        priorPlanForContext: [mkPriorEvent()],
        priorPendingClarify: null,
        priorDialogState: ds,
      },
      {
        comprehension: emptyComprehensionProvider(),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    expect(pipelineResult.comprehension?.operationsSynthesisSource).toBe(
      "none",
    );
  });

  it("T22: conversationStatus=search_handoff_blocking → allow=false → 不発", async () => {
    const ds = mkStableDialogState();
    ds.conversationStatus = "search_handoff_blocking";
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "12時に新宿でランチ",
        priorPlanForContext: [mkPriorEvent()],
        priorPendingClarify: null,
        priorDialogState: ds,
      },
      {
        comprehension: emptyComprehensionProvider(),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    expect(pipelineResult.comprehension?.operationsSynthesisSource).toBe(
      "none",
    );
  });

  it("T23: conversationStatus=search_candidates_presented → allow=false → 不発", async () => {
    const ds = mkStableDialogState();
    ds.conversationStatus = "search_candidates_presented";
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "12時に新宿でランチ",
        priorPlanForContext: [mkPriorEvent()],
        priorPendingClarify: null,
        priorDialogState: ds,
      },
      {
        comprehension: emptyComprehensionProvider(),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    expect(pipelineResult.comprehension?.operationsSynthesisSource).toBe(
      "none",
    );
  });

  it("T25: where focus narrowStep<3 (場所未解決の場所回答待ち) → allow=false → 不発", async () => {
    const ds = mkStableDialogState();
    ds.focus = { event_id: "event_1", slot: "where", narrowStep: 2 };
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "12時に新宿でランチ",
        priorPlanForContext: [mkPriorEvent()],
        priorPendingClarify: null,
        priorDialogState: ds,
      },
      {
        comprehension: emptyComprehensionProvider(),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    expect(pipelineResult.comprehension?.operationsSynthesisSource).toBe(
      "none",
    );
  });

  it("priorDialogState=null (caller 未対応) → safe default false → 不発 (既存 test fixture 互換)", async () => {
    // 設計判断 (CEO/GPT 整合 + 既存 test 不破壊):
    //   priorDialogState=null は「caller が dialogState を渡していない」 = context 不明と扱い、
    //   safe default false に倒す。実機 route.ts は常に rawMorningSession?.dialogState を渡すため、
    //   実機で null になるのは新規 session のみ。新規 session 1 turn 目は priorEvents=[] で
    //   detectAppendPattern が発火しない (priorEvents.length === 0 で early return) ため、
    //   本判定で false にしても実機挙動矛盾なし。
    //   既存 unit test (priorDialogState を渡さない fixture) の互換性も維持される。
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "12時に新宿でランチ",
        priorPlanForContext: [mkPriorEvent()],
        priorPendingClarify: null,
        priorDialogState: null,
      },
      {
        comprehension: emptyComprehensionProvider(),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    expect(pipelineResult.comprehension?.operationsSynthesisSource).toBe(
      "none",
    );
  });

  it("focus=where + narrowStep=3 (selection 完了 = stable equivalent) → allow=true → 発火", async () => {
    const ds = mkStableDialogState();
    ds.focus = { event_id: "event_1", slot: "where", narrowStep: 3 };
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "12時に新宿でランチ",
        priorPlanForContext: [mkPriorEvent()],
        priorPendingClarify: null,
        priorDialogState: ds,
      },
      {
        comprehension: emptyComprehensionProvider(),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    expect(pipelineResult.comprehension?.operationsSynthesisSource).toBe(
      "deterministic_append",
    );
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PR A Commit 7+8 negative integration: 情報損失防止
  //   stable context (allow=true) でも、utterance 側の detector が
  //   who/duration/transport/date を含む場合は deterministic_append が不発で
  //   "none" になることを実証する。
  //
  //   LLM stub も空返しのため synthesisSource="none" となる (LLM 経路は別 PR)。
  //   Plan B 保証範囲: 「拾わない」 ことのみ保証、LLM 経路の event 化は scope 外。
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("T_neg1 [PR A Commit 7]: stable + 「12時に新宿で高橋とランチ」 → none (人名連結 「と」 で抑制)", async () => {
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "12時に新宿で高橋とランチ",
        priorPlanForContext: [mkPriorEvent()],
        priorPendingClarify: null,
        priorDialogState: mkStableDialogState(),
      },
      {
        comprehension: emptyComprehensionProvider(),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    expect(pipelineResult.comprehension?.operationsSynthesisSource).toBe(
      "none",
    );
  });

  it("T_neg2 [PR A Commit 7]: stable + 「12時に新宿で30分だけランチ」 → none (duration で抑制)", async () => {
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "12時に新宿で30分だけランチ",
        priorPlanForContext: [mkPriorEvent()],
        priorPendingClarify: null,
        priorDialogState: mkStableDialogState(),
      },
      {
        comprehension: emptyComprehensionProvider(),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    expect(pipelineResult.comprehension?.operationsSynthesisSource).toBe(
      "none",
    );
  });

  it("T_neg3 [PR A Commit 7]: stable + 「12時に電車で新宿に行ってランチ」 → none (transport で抑制)", async () => {
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "12時に電車で新宿に行ってランチ",
        priorPlanForContext: [mkPriorEvent()],
        priorPendingClarify: null,
        priorDialogState: mkStableDialogState(),
      },
      {
        comprehension: emptyComprehensionProvider(),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    expect(pipelineResult.comprehension?.operationsSynthesisSource).toBe(
      "none",
    );
  });

  it("T_neg4 [PR A Commit 8]: stable + 「明日12時に新宿でランチ」 → none (date prefix で抑制)", async () => {
    const pipelineResult = await runMorningPipeline(
      {
        utterance: "明日12時に新宿でランチ",
        priorPlanForContext: [mkPriorEvent()],
        priorPendingClarify: null,
        priorDialogState: mkStableDialogState(),
      },
      {
        comprehension: emptyComprehensionProvider(),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    expect(pipelineResult.comprehension?.operationsSynthesisSource).toBe(
      "none",
    );
  });
});
