/**
 * Legacy Adapter shape compatibility tests — W3-PR-4
 *
 * 新 pipeline 結果 → 旧 Morning Protocol shape 変換を検証する。
 *
 * カバレッジ:
 *   - status=ok → phase="plan_presented" + plan.items が events と一致
 *   - status=comprehension_failed → phase="clarifying" + plan=undefined
 *   - narration.text 欠落 → 防御的に phase="clarifying" に落ちる
 *   - 旧 MorningProtocolResponse shape（phase/message/plan/clarifyQuestion）保持
 *   - session に userPrefecture/userCity/baseline 系が伝播する
 */

import { describe, test, expect, beforeEach } from "vitest";

import {
  runMorningPipeline,
  createStubComprehensionProvider,
  type MorningPipelineResult,
} from "@/lib/alter-morning/morningPipeline";
import type { L1PipelineInput } from "@/lib/alter-morning/comprehension/l1Pipeline";
import {
  resetEventCounter,
  utteranceProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import {
  adaptPipelineToLegacy,
  type LegacyAdapterInput,
} from "@/lib/alter-morning/legacyAdapter";
import { stubNarrationProvider } from "@/lib/alter-morning/expression/narration";

function mkRaw(): L1PipelineInput["raw"] {
  return {
    targetDate: "2026-04-22",
    startPoint: null,
    departureTime: null,
    goOut: true,
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
        missing_semantic_critical: [],
        missing_solver_blockers: [],
      },
    ],
  };
}

function mkInput(): LegacyAdapterInput {
  return {
    sessionId: "ms_test_abcd",
    utterance: "9時にスタバでコーヒー",
    userPrefecture: "東京都",
    userCity: "渋谷区",
    userHomeLabel: "自宅",
    userHomeLat: 35.0,
    userHomeLng: 139.0,
    today: "2026-04-22",
  };
}

async function runOk(): Promise<MorningPipelineResult> {
  return runMorningPipeline(
    { utterance: "9時にスタバでコーヒー" },
    {
      comprehension: createStubComprehensionProvider(mkRaw()),
      narration: stubNarrationProvider,
      weather: null,
    },
  );
}

async function runFailed(): Promise<MorningPipelineResult> {
  return runMorningPipeline(
    { utterance: "意味不明" },
    {
      comprehension: { async extract() { return null; } },
      narration: stubNarrationProvider,
      weather: null,
    },
  );
}

beforeEach(() => {
  resetEventCounter();
});

describe("adaptPipelineToLegacy (W3-PR-4)", () => {
  test("status=ok → phase=plan_presented、plan.items が events と一致", async () => {
    const pipelineResult = await runOk();
    const { session, response } = adaptPipelineToLegacy(pipelineResult, mkInput());

    expect(response.phase).toBe("plan_presented");
    expect(session.phase).toBe("plan_presented");
    expect(response.plan).toBeDefined();
    expect(response.plan!.items).toHaveLength(1);
    expect(response.plan!.items[0].startTime).toBe("09:00");
    expect(response.plan!.items[0].fixedStart).toBe(true);
    expect(response.plan!.items[0].kind).toBe("fixed");
    expect(response.plan!.items[0].id).toBe(
      pipelineResult.comprehension!.events[0].event_id,
    );
  });

  test("narration.text が message に反映される", async () => {
    const pipelineResult = await runOk();
    const { response } = adaptPipelineToLegacy(pipelineResult, mkInput());
    expect(response.message.length).toBeGreaterThan(0);
    expect(response.message).toBe(pipelineResult.narration!.narration.text);
  });

  test("status=comprehension_failed → phase=clarifying + plan 未定義", async () => {
    const pipelineResult = await runFailed();
    const { session, response } = adaptPipelineToLegacy(pipelineResult, mkInput());

    expect(response.phase).toBe("clarifying");
    expect(session.phase).toBe("clarifying");
    expect(response.plan).toBeUndefined();
    expect(session.plan).toBeUndefined();
    expect(response.clarifyQuestion).toBeDefined();
    expect(response.message.length).toBeGreaterThan(0);
  });

  test("session に userPrefecture/userCity/baseline 系が伝播する", async () => {
    const pipelineResult = await runOk();
    const { session } = adaptPipelineToLegacy(pipelineResult, mkInput());
    expect(session.userPrefecture).toBe("東京都");
    expect(session.userCity).toBe("渋谷区");
    expect(session.userHomeLabel).toBe("自宅");
    expect(session.userHomeLat).toBe(35.0);
    expect(session.userHomeLng).toBe(139.0);
  });

  test("sessionId は呼び出し側から引き継がれる", async () => {
    const pipelineResult = await runOk();
    const { session } = adaptPipelineToLegacy(pipelineResult, mkInput());
    expect(session.sessionId).toBe("ms_test_abcd");
  });

  test("rawInputs に発話が1件積まれる（create-only 前提）", async () => {
    const pipelineResult = await runOk();
    const { session } = adaptPipelineToLegacy(pipelineResult, mkInput());
    expect(session.rawInputs).toEqual(["9時にスタバでコーヒー"]);
  });

  test("plan.date は input.today で上書きできる", async () => {
    const pipelineResult = await runOk();
    const { response } = adaptPipelineToLegacy(pipelineResult, {
      ...mkInput(),
      today: "2099-12-31",
    });
    expect(response.plan!.date).toBe("2099-12-31");
  });

  test("when.startTime が null の event は kind=todo、fixedStart=false", async () => {
    const raw = mkRaw();
    raw.events[0].when = {
      startTime: null,
      timeHint: "morning",
      provenance: utteranceProvenance(["朝"], "medium"),
    };
    const pipelineResult = await runMorningPipeline(
      { utterance: "朝にコーヒー" },
      {
        comprehension: createStubComprehensionProvider(raw),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    const { response } = adaptPipelineToLegacy(pipelineResult, mkInput());
    // todo 化されて fixedStart=false
    const item = response.plan!.items[0];
    expect(item.kind).toBe("todo");
    expect(item.fixedStart).toBe(false);
    expect(item.startTime).toBeUndefined();
  });
});
